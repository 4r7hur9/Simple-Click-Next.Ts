/**
 * Fila de impressão em banco: reivindicar com prazo, confirmar, registrar
 * falha, listar o que está pendente e cancelar pelo clique (T-607 — AC-624,
 * AC-625).
 *
 * A fila é `app.print_jobs` (migração 0034), e o desenho inteiro existe para
 * uma promessa: o cupom sai UMA vez. Três peças a sustentam:
 *
 * 1. **Reivindicar trava e dá prazo.** A seleção é `FOR UPDATE SKIP LOCKED`:
 *    dois agentes da mesma loja consultando ao mesmo tempo nunca recebem o
 *    mesmo trabalho — o segundo pula a linha que o primeiro travou. Quem pega
 *    fica com a posse por um prazo; se o agente some no meio, o prazo vence e
 *    o trabalho volta a ser entregue. Nada se perde quando o agente cai
 *    (AC-624).
 * 2. **O trabalho tem identificador próprio e cupom fixo.** Na PRIMEIRA
 *    reivindicação a via é somada e os blocos são gerados e guardados; as
 *    seguintes entregam os MESMOS blocos, com o MESMO identificador. O agente
 *    anota o que já imprimiu, e a confirmação perdida na rede vira um reenvio
 *    que ele só confirma de novo — sem imprimir (AC-625) e sem somar via.
 * 3. **Confirmar é idempotente.** Confirmar duas vezes responde o mesmo, e
 *    confirmar o que o dono já imprimiu por clique responde "cancelado": o
 *    agente trata como resolvido.
 *
 * Quem chama é a borda do agente (T-608), com a loja no contexto e o papel
 * `PRINT_AGENT`; o identificador do agente vem da credencial dele e entra aqui
 * como parâmetro. Toda operação do agente começa pelo batimento
 * (`app.registrar_batimento`), que é também a segunda trava: agente revogado
 * ou de outra loja não faz nada. A lista de pendentes e o cancelamento são da
 * equipe da loja.
 */
import {
  gerarCupom,
  lerCupomImpresso,
  type CupomImpresso,
} from "@simpleclick/core";

import { exigirLojaDoContexto } from "../../core/contexto.ts";
import { transacaoAtual, type TransacaoDoBanco } from "../../core/db.ts";
import { erroDeDominio } from "../../core/erros.ts";
import { descreverErro, registrar } from "../../core/log.ts";
import {
  montarPedidoParaCupom,
  type LerConfiguracaoDoCupom,
  type PedidoGuardadoParaCupom,
} from "./pedido-para-cupom.ts";

// ---------------------------------------------------------------------------
// As regras da fila
// ---------------------------------------------------------------------------

/** Quanto tempo o agente tem para confirmar antes de o trabalho ser reenviado. */
export const PRAZO_DE_POSSE_MS = 60_000;

/** Espera depois da primeira falha; dobra a cada falha seguinte. */
export const ESPERA_INICIAL_MS = 5_000;

/**
 * Quantas entregas um trabalho recebe antes de a fila desistir dele (decisão
 * nº 21 do modelo de dados). Desistir não perde o cupom: ele fica à vista do
 * dono, que imprime por clique.
 */
export const MAXIMO_DE_TENTATIVAS = 6;

/** Quantos trabalhos uma consulta do agente leva de uma vez. */
export const TRABALHOS_POR_CONSULTA = 5;

/** Tamanho máximo do motivo de falha guardado (o banco cobra o mesmo). */
export const TAMANHO_MAXIMO_DO_MOTIVO = 500;

/** Para onde vai um trabalho cuja entrega número `tentativa` falhou. */
export type DestinoDaFalha =
  | { readonly estado: "FAILED"; readonly esperaMs: number }
  | { readonly estado: "DEAD" };

/**
 * Espera crescente: 5 s, 10 s, 20 s, 40 s, 80 s — e, na sexta falha, a fila
 * desiste (DEAD). Esperar mais a cada falha dá tempo de alguém trocar o papel
 * sem que o agente martele a impressora.
 */
export function destinoDaFalha(tentativa: number): DestinoDaFalha {
  if (tentativa >= MAXIMO_DE_TENTATIVAS) return { estado: "DEAD" };
  const ordem = Math.max(1, Math.trunc(tentativa));
  return { estado: "FAILED", esperaMs: ESPERA_INICIAL_MS * 2 ** (ordem - 1) };
}

// ---------------------------------------------------------------------------
// O que sai daqui
// ---------------------------------------------------------------------------

/** Um trabalho entregue ao agente (o contrato é `esquemaDoTrabalhoDeImpressao`). */
export interface TrabalhoEntregue {
  readonly id: string;
  readonly pedido: { readonly id: string; readonly codigo: string };
  /** Quantas vezes o trabalho foi entregue, contando esta. */
  readonly tentativa: number;
  /** Até quando a posse vale, em ISO 8601. */
  readonly prazoAte: string;
  readonly cupom: CupomImpresso;
}

/** Estados possíveis de um trabalho (migração 0034). */
export type EstadoDoTrabalho =
  "QUEUED" | "LEASED" | "PRINTED" | "FAILED" | "DEAD" | "CANCELED";

/** O que a confirmação responde. */
export interface ResultadoDaConfirmacao {
  readonly id: string;
  readonly estado: "PRINTED" | "CANCELED";
}

/** O que o registro de falha responde. */
export interface ResultadoDaFalha {
  readonly id: string;
  readonly estado: EstadoDoTrabalho;
  /** Quando o trabalho volta a ser entregue; nulo se não volta. */
  readonly proximaTentativaEm: string | null;
}

/** Um cupom que ainda não saiu pelo agente, disponível para o clique. */
export interface TrabalhoPendente {
  readonly id: string;
  readonly pedido: { readonly id: string; readonly codigo: string };
  readonly estado: "QUEUED" | "LEASED" | "FAILED" | "DEAD";
  readonly tentativas: number;
  readonly ultimoErro: string | null;
  readonly criadoEm: string;
}

/** Ajustes da reivindicação. O padrão é o de produção; teste encurta o prazo. */
export interface OpcoesDaReivindicacao {
  readonly limite?: number;
  readonly prazoDePosseMs?: number;
}

// ---------------------------------------------------------------------------
// Tradução do que o banco devolve
// ---------------------------------------------------------------------------

/** Linha de `print_jobs` do jeito que a reivindicação a devolve. */
export interface LinhaReivindicada {
  readonly id: string;
  readonly order_id: string;
  readonly order_code: string;
  readonly blocks: unknown;
  readonly attempt: number;
  readonly lease_until: Date;
  readonly created_at: Date;
}

/** O cupom do trabalho não pôde ser montado ou lido: o dado está fora do contrato. */
export class ErroDoCupomDoTrabalho extends Error {
  readonly mensagemEscritaPorNos = true as const;

  constructor(motivo: string) {
    super(motivo);
    this.name = "ErroDoCupomDoTrabalho";
  }
}

/** JSON do banco: objeto já lido, ou texto a ler. */
function comoJson(valor: unknown): unknown {
  if (typeof valor !== "string") return valor;
  try {
    return JSON.parse(valor) as unknown;
  } catch {
    return undefined;
  }
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/**
 * Monta o cupom de um trabalho com o que `app.cupom_do_trabalho` devolveu: o
 * pedido, o nome da loja, a configuração de impressão e a via JÁ SOMADA.
 *
 * O pedido passa pela MESMA tradução da impressão por clique
 * (`montarPedidoParaCupom`), então o papel que sai pelo agente é o mesmo que
 * sairia pelo navegador — muda só o número da via.
 */
export function montarCupomDoTrabalho(
  dados: unknown,
  lerConfiguracao: LerConfiguracaoDoCupom,
): CupomImpresso {
  const lidos = comoJson(dados);
  if (!ehObjeto(lidos)) {
    throw new ErroDoCupomDoTrabalho(
      "a fila não devolveu os dados do cupom deste trabalho",
    );
  }
  const via = lidos.via;
  if (typeof via !== "number" || !Number.isSafeInteger(via) || via < 1) {
    throw new ErroDoCupomDoTrabalho("a via do cupom não é um inteiro positivo");
  }
  if (typeof lidos.loja !== "string" || !ehObjeto(lidos.pedido)) {
    throw new ErroDoCupomDoTrabalho("o pedido do trabalho veio incompleto");
  }
  const configuracao = lerConfiguracao(lidos.configuracao);
  return gerarCupom(
    montarPedidoParaCupom(
      lidos.pedido as unknown as PedidoGuardadoParaCupom,
      lidos.loja,
    ),
    { larguraMm: configuracao.larguraMm, via, conteudo: configuracao.conteudo },
  );
}

/**
 * O trabalho do jeito que o agente o recebe. O cupom é o GUARDADO na linha —
 * é isso que faz o reenvio entregar exatamente o que a primeira entrega
 * entregou —, e cupom fora do contrato é recusado em vez de impresso errado.
 */
export function projetarTrabalhoEntregue(
  linha: LinhaReivindicada,
): TrabalhoEntregue {
  const cupom = lerCupomImpresso(comoJson(linha.blocks));
  if (cupom === null) {
    throw new ErroDoCupomDoTrabalho(
      "o cupom guardado no trabalho está fora do contrato versão 1",
    );
  }
  return {
    id: linha.id,
    pedido: { id: linha.order_id, codigo: linha.order_code },
    tentativa: Number(linha.attempt),
    prazoAte: linha.lease_until.toISOString(),
    cupom,
  };
}

// ---------------------------------------------------------------------------
// O agente
// ---------------------------------------------------------------------------

/**
 * O batimento do agente, que é também a segunda trava: devolve falso para
 * agente revogado, de outra loja, ou chamada fora do papel do agente — e aí
 * nada mais acontece.
 */
async function exigirAgenteValido(
  tx: TransacaoDoBanco,
  agenteId: string,
): Promise<void> {
  const [linha] = await tx.$queryRaw<{ valido: boolean }[]>`
    SELECT app.registrar_batimento(${agenteId}::uuid) AS valido`;
  if (linha?.valido !== true) {
    throw erroDeDominio("nao_autenticado", {
      motivo: "agente_revogado_ou_de_outra_loja",
      recursoId: agenteId,
    });
  }
}

/** A reivindicação em curso: a transação, quem reivindica, de qual loja. */
interface QuemReivindica {
  readonly tx: TransacaoDoBanco;
  readonly agenteId: string;
  readonly lojaId: string;
  readonly lerConfiguracao: LerConfiguracaoDoCupom;
}

/** Fila desiste do trabalho: estado final, à vista do dono. */
async function desistirDoTrabalho(
  tx: TransacaoDoBanco,
  trabalhoId: string,
  lojaId: string,
  motivo: string,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE app.print_jobs
       SET status = 'DEAD',
           lease_until = NULL,
           last_error = ${motivo.slice(0, TAMANHO_MAXIMO_DO_MOTIVO)},
           updated_at = now()
     WHERE id = ${trabalhoId}::uuid
       AND store_id = ${lojaId}::uuid`;
}

/**
 * Primeira entrega: soma a via e grava os blocos, numa subtransação.
 *
 * Se o cupom não puder ser montado — dado fora do contrato —, a subtransação é
 * desfeita (a via NÃO fica somada) e a fila desiste só deste trabalho. Sem
 * isso, um único pedido com defeito derrubaria toda reivindicação da loja, e a
 * cozinha pararia de receber cupom por causa dele.
 */
async function prepararPrimeiraEntrega(
  linha: LinhaReivindicada,
  quem: QuemReivindica,
): Promise<LinhaReivindicada | null> {
  const { tx, agenteId, lojaId, lerConfiguracao } = quem;
  await tx.$executeRaw`SAVEPOINT primeira_entrega`;
  try {
    const [dados] = await tx.$queryRaw<{ dados: unknown }[]>`
      SELECT app.cupom_do_trabalho(${linha.id}::uuid, ${agenteId}::uuid) AS dados`;
    const cupom = montarCupomDoTrabalho(dados?.dados, lerConfiguracao);
    const blocos = JSON.stringify(cupom);
    await tx.$executeRaw`
      UPDATE app.print_jobs
         SET blocks = ${blocos}::jsonb,
             updated_at = now()
       WHERE id = ${linha.id}::uuid
         AND store_id = ${lojaId}::uuid
         AND blocks IS NULL`;
    await tx.$executeRaw`RELEASE SAVEPOINT primeira_entrega`;
    return { ...linha, blocks: cupom };
  } catch (erro) {
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT primeira_entrega`;
    registrar.erro("impressao.cupom_nao_montado", {
      lojaId,
      recurso: "trabalho_de_impressao",
      recursoId: linha.id,
      erro: descreverErro(erro),
    });
    await desistirDoTrabalho(
      tx,
      linha.id,
      lojaId,
      "o cupom deste pedido não pôde ser montado; imprima por clique",
    );
    return null;
  }
}

/**
 * Entrega ao agente os trabalhos pendentes da loja, travando-os por um prazo.
 *
 * Entra: o que está na fila (QUEUED), o que falhou e já cumpriu a espera
 * (FAILED), e o que estava com algum agente cujo prazo venceu sem confirmação
 * (LEASED vencido) — esse último é o reenvio que torna a confirmação perdida
 * inofensiva. O que já esgotou as tentativas com o prazo vencido vira DEAD
 * antes, e fica para o clique.
 */
export async function reivindicarTrabalhos(
  agenteId: string,
  lerConfiguracao: LerConfiguracaoDoCupom,
  opcoes: OpcoesDaReivindicacao = {},
): Promise<TrabalhoEntregue[]> {
  const lojaId = exigirLojaDoContexto();
  const tx = transacaoAtual();
  const limite = Math.max(
    1,
    Math.trunc(opcoes.limite ?? TRABALHOS_POR_CONSULTA),
  );
  const prazoMs = Math.max(
    1,
    Math.trunc(opcoes.prazoDePosseMs ?? PRAZO_DE_POSSE_MS),
  );

  await exigirAgenteValido(tx, agenteId);

  await tx.$executeRaw`
    UPDATE app.print_jobs
       SET status = 'DEAD',
           lease_until = NULL,
           last_error = coalesce(last_error, 'o agente não confirmou dentro do prazo, e as tentativas acabaram'),
           updated_at = now()
     WHERE store_id = ${lojaId}::uuid
       AND status = 'LEASED'
       AND lease_until < now()
       AND attempt >= ${MAXIMO_DE_TENTATIVAS}`;

  // A ordem de entrega é a de chegada, decidida pelo banco: o instante dele
  // tem microssegundos, e o do JavaScript, só milissegundos.
  const reivindicadas = await tx.$queryRaw<LinhaReivindicada[]>`
    WITH candidatos AS (
      SELECT j.id
        FROM app.print_jobs j
       WHERE j.store_id = ${lojaId}::uuid
         AND j.attempt < ${MAXIMO_DE_TENTATIVAS}
         AND (   (j.status IN ('QUEUED', 'FAILED') AND j.available_at <= now())
              OR (j.status = 'LEASED' AND j.lease_until < now()))
       ORDER BY j.created_at, j.id
       LIMIT ${limite}
       FOR UPDATE SKIP LOCKED
    ),
    reivindicadas AS (
      UPDATE app.print_jobs j
         SET status = 'LEASED',
             agent_id = ${agenteId}::uuid,
             lease_until = now() + (${prazoMs}::int * interval '1 millisecond'),
             attempt = j.attempt + 1,
             updated_at = now()
        FROM candidatos c
       WHERE j.id = c.id
      RETURNING j.id::text AS id,
                j.order_id::text AS order_id,
                j.order_code,
                j.blocks,
                j.attempt::int AS attempt,
                j.lease_until,
                j.created_at,
                j.id AS ordem
    )
    SELECT id, order_id, order_code, blocks, attempt, lease_until, created_at
      FROM reivindicadas
     ORDER BY created_at, ordem`;

  const quem: QuemReivindica = { tx, agenteId, lojaId, lerConfiguracao };

  const entregues: TrabalhoEntregue[] = [];
  for (const linha of reivindicadas) {
    const pronta =
      linha.blocks === null
        ? await prepararPrimeiraEntrega(linha, quem)
        : linha;
    if (pronta === null) continue;
    try {
      entregues.push(projetarTrabalhoEntregue(pronta));
    } catch (erro) {
      registrar.erro("impressao.cupom_fora_do_contrato", {
        lojaId,
        recurso: "trabalho_de_impressao",
        recursoId: linha.id,
        erro: descreverErro(erro),
      });
      await desistirDoTrabalho(
        tx,
        linha.id,
        lojaId,
        "o cupom guardado está fora do contrato; imprima por clique",
      );
    }
  }
  return entregues;
}

/** Estado atual de um trabalho já entregue alguma vez, ou recusa. */
async function estadoDoTrabalhoEntregue(
  tx: TransacaoDoBanco,
  trabalhoId: string,
  lojaId: string,
): Promise<EstadoDoTrabalho> {
  const [linha] = await tx.$queryRaw<{ status: EstadoDoTrabalho }[]>`
    SELECT status
      FROM app.print_jobs
     WHERE id = ${trabalhoId}::uuid
       AND store_id = ${lojaId}::uuid
       AND blocks IS NOT NULL`;
  if (linha === undefined) {
    throw erroDeDominio("nao_encontrado", {
      recurso: "trabalho_de_impressao",
      recursoId: trabalhoId,
    });
  }
  return linha.status;
}

/**
 * O agente imprimiu. Idempotente: confirmar de novo o que já foi impresso
 * responde o mesmo, sem erro e sem mudar o instante da impressão.
 *
 * Aceita o trabalho que está com qualquer agente da loja, inclusive com o
 * prazo vencido ou já reenviado a outro: quem confirma diz que IMPRIMIU, e é
 * isso que o registro precisa guardar. O que o dono já imprimiu por clique
 * continua cancelado — e a resposta diz isso, para o agente dar por resolvido.
 * Trabalho que nunca foi entregue não tem o que confirmar.
 */
export async function confirmarImpressao(
  agenteId: string,
  trabalhoId: string,
): Promise<ResultadoDaConfirmacao> {
  const lojaId = exigirLojaDoContexto();
  const tx = transacaoAtual();
  await exigirAgenteValido(tx, agenteId);

  const [confirmado] = await tx.$queryRaw<{ id: string }[]>`
    UPDATE app.print_jobs
       SET status = 'PRINTED',
           printed_at = now(),
           agent_id = ${agenteId}::uuid,
           lease_until = NULL,
           updated_at = now()
     WHERE id = ${trabalhoId}::uuid
       AND store_id = ${lojaId}::uuid
       AND blocks IS NOT NULL
       AND status IN ('LEASED', 'FAILED', 'DEAD')
    RETURNING id::text AS id`;
  if (confirmado !== undefined) return { id: trabalhoId, estado: "PRINTED" };

  const estado = await estadoDoTrabalhoEntregue(tx, trabalhoId, lojaId);
  if (estado === "PRINTED" || estado === "CANCELED") {
    return { id: trabalhoId, estado };
  }
  throw erroDeDominio("conflito", {
    recurso: "trabalho_de_impressao",
    recursoId: trabalhoId,
    estado,
  });
}

/**
 * O agente não conseguiu imprimir. O trabalho volta para a fila depois da
 * espera crescente, ou a fila desiste no limite de tentativas.
 *
 * Só conta a falha de quem ESTÁ com o trabalho: se o prazo venceu e outro
 * agente o pegou, ou se ele já saiu de outro jeito, a resposta é o estado em
 * que ele ficou, sem mexer em nada.
 */
export async function registrarFalha(
  agenteId: string,
  trabalhoId: string,
  motivo: string,
): Promise<ResultadoDaFalha> {
  const lojaId = exigirLojaDoContexto();
  const tx = transacaoAtual();
  await exigirAgenteValido(tx, agenteId);

  const [comOAgente] = await tx.$queryRaw<{ attempt: number }[]>`
    SELECT attempt::int AS attempt
      FROM app.print_jobs
     WHERE id = ${trabalhoId}::uuid
       AND store_id = ${lojaId}::uuid
       AND agent_id = ${agenteId}::uuid
       AND status = 'LEASED'
     FOR UPDATE`;
  if (comOAgente === undefined) {
    const estado = await estadoDoTrabalhoEntregue(tx, trabalhoId, lojaId);
    return { id: trabalhoId, estado, proximaTentativaEm: null };
  }

  const texto = motivo.trim().slice(0, TAMANHO_MAXIMO_DO_MOTIVO) || "falha";
  const destino = destinoDaFalha(comOAgente.attempt);
  if (destino.estado === "DEAD") {
    await desistirDoTrabalho(tx, trabalhoId, lojaId, texto);
    return { id: trabalhoId, estado: "DEAD", proximaTentativaEm: null };
  }

  const [voltou] = await tx.$queryRaw<{ available_at: Date }[]>`
    UPDATE app.print_jobs
       SET status = 'FAILED',
           lease_until = NULL,
           last_error = ${texto},
           available_at = now() + (${destino.esperaMs}::int * interval '1 millisecond'),
           updated_at = now()
     WHERE id = ${trabalhoId}::uuid
       AND store_id = ${lojaId}::uuid
    RETURNING available_at`;
  return {
    id: trabalhoId,
    estado: "FAILED",
    proximaTentativaEm: voltou?.available_at.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// A equipe da loja
// ---------------------------------------------------------------------------

/**
 * Os cupons que ainda não saíram pelo agente: na fila, com algum agente, à
 * espera depois de falhar, ou desistidos. É a lista que mantém o clique como
 * saída de emergência (AC-624, AC-626) — nenhum cupom pendente some da vista.
 */
export async function listarPendentes(): Promise<TrabalhoPendente[]> {
  const lojaId = exigirLojaDoContexto();
  const linhas = await transacaoAtual().$queryRaw<
    {
      id: string;
      order_id: string;
      order_code: string;
      status: TrabalhoPendente["estado"];
      attempt: number;
      last_error: string | null;
      created_at: Date;
    }[]
  >`
    SELECT id::text AS id,
           order_id::text AS order_id,
           order_code,
           status,
           attempt::int AS attempt,
           last_error,
           created_at
      FROM app.print_jobs
     WHERE store_id = ${lojaId}::uuid
       AND status IN ('QUEUED', 'LEASED', 'FAILED', 'DEAD')
     ORDER BY created_at, id`;
  return linhas.map((linha) => ({
    id: linha.id,
    pedido: { id: linha.order_id, codigo: linha.order_code },
    estado: linha.status,
    tentativas: Number(linha.attempt),
    ultimoErro: linha.last_error,
    criadoEm: linha.created_at.toISOString(),
  }));
}

/**
 * O dono imprimiu por clique: o que esperava pelo agente não sai mais
 * (decisão de 03/10). Devolve quantos trabalhos foram cancelados.
 *
 * Chamado na MESMA transação da emissão do cupom (`cupom.usecase.ts`), então
 * ou os dois acontecem, ou nenhum.
 */
export async function cancelarTrabalhosDoPedido(
  pedidoId: string,
): Promise<number> {
  const lojaId = exigirLojaDoContexto();
  return transacaoAtual().$executeRaw`
    UPDATE app.print_jobs
       SET status = 'CANCELED',
           lease_until = NULL,
           updated_at = now()
     WHERE store_id = ${lojaId}::uuid
       AND order_id = ${pedidoId}::uuid
       AND status IN ('QUEUED', 'LEASED', 'FAILED', 'DEAD')`;
}
