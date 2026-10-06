/**
 * Pareamento do agente de impressão e a credencial dele (T-608 — AC-623).
 *
 * O agente é um programa na máquina da loja, e não uma pessoa: ele não tem
 * conta, não tem senha e nunca recebe o token do dono. Ele ganha uma
 * credencial PRÓPRIA, de escopo mínimo — reivindicar e confirmar trabalhos da
 * fila de UMA loja —, num ritual de duas pontas:
 *
 * 1. **O dono gera um código curto no painel.** Seis dígitos, validade de
 *    poucos minutos, UM aberto por loja (gerar outro substitui o anterior).
 *    O banco guarda só o resumo do código, salgado com a loja.
 * 2. **O agente manda o apelido da loja, o código e o nome da máquina.** O
 *    código certo vira um agente e uma credencial longa e aleatória, que a
 *    resposta entrega UMA vez; o banco guarda só o sha256 dela. Perdeu a
 *    credencial, pareia de novo — e o agente anterior da loja é revogado na
 *    mesma hora (uma impressora por loja, decisão de 03/10).
 *
 * Código de seis dígitos pede limite de tentativas, e aqui há dois: o do
 * banco, que fecha o código depois de `MAXIMO_DE_FALHAS_POR_CODIGO` erros e
 * vale sempre (`app.parear_agente_de_impressao`, migração 0038), e o da borda,
 * por loja e por origem, no Redis (`core/limite.ts`), que fecha a rota quando
 * o Redis cai. Quem apresenta a credencial depois é `identificarAgente`, que
 * pergunta ao banco ANTES de existir contexto de loja: é a credencial que diz
 * de qual loja o agente é.
 */
import { createHash, randomBytes, randomInt } from "node:crypto";

import { exigirContexto, exigirLojaDoContexto } from "../../core/contexto.ts";
import { transacaoAtual } from "../../core/db.ts";

// ---------------------------------------------------------------------------
// As regras do pareamento
// ---------------------------------------------------------------------------

/** Quanto tempo o código vale depois de gerado: o tempo de ir até o computador. */
export const VALIDADE_DO_CODIGO_MS = 10 * 60_000;

/** Erros que um código aguenta antes de fechar; o dono gera outro. */
export const MAXIMO_DE_FALHAS_POR_CODIGO = 5;

/** Bytes aleatórios da credencial do agente: 256 bits, impossível de adivinhar. */
export const BYTES_DA_CREDENCIAL = 32;

/**
 * Prefixo da credencial. Não protege nada; serve para quem a encontrar num
 * arquivo ou num registro saber o que ela é — e para ferramenta de varredura
 * de segredo reconhecê-la.
 */
export const PREFIXO_DA_CREDENCIAL = "sca_";

/** Formato do código de pareamento: exatamente seis dígitos. */
const FORMATO_DO_CODIGO = /^\d{6}$/;

/** Sorteia um código de seis dígitos, com zeros à esquerda ("004213"). */
export function sortearCodigoDePareamento(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Resumo do código como o banco o guarda: sha256 de "<loja>:<código>". A loja
 * no meio faz o mesmo código em lojas diferentes ter resumos diferentes.
 */
export function resumirCodigoDePareamento(
  lojaId: string,
  codigo: string,
): Buffer {
  return createHash("sha256").update(`${lojaId}:${codigo}`).digest();
}

/** Sorteia a credencial longa que o agente recebe uma vez. */
export function sortearCredencialDoAgente(): string {
  return `${PREFIXO_DA_CREDENCIAL}${randomBytes(BYTES_DA_CREDENCIAL).toString("base64url")}`;
}

/** Resumo da credencial como o banco o guarda (`print_agents.token_sha256`). */
export function resumirCredencialDoAgente(credencial: string): Buffer {
  return createHash("sha256").update(credencial).digest();
}

/**
 * A credencial tem a forma de uma credencial nossa? Recusar aqui o que nem
 * tem a forma certa poupa uma ida ao banco por requisição forjada.
 */
export function pareceCredencialDoAgente(valor: string): boolean {
  return (
    valor.startsWith(PREFIXO_DA_CREDENCIAL) &&
    /^[A-Za-z0-9_-]{43}$/.test(valor.slice(PREFIXO_DA_CREDENCIAL.length))
  );
}

// ---------------------------------------------------------------------------
// O dono gera o código
// ---------------------------------------------------------------------------

/** O código que o painel mostra ao dono. */
export interface CodigoDePareamento {
  readonly codigo: string;
  /** Até quando o código vale, em ISO 8601. */
  readonly expiraEm: string;
}

/** Ajustes da geração. O padrão é o de produção; a prova sorteia o que quer. */
export interface OpcoesDaGeracao {
  readonly validadeMs?: number;
  readonly sortear?: () => string;
}

/**
 * Gera o código de pareamento da loja do contexto e fecha o anterior.
 *
 * Roda com a equipe da loja no contexto: a política do banco só deixa a
 * equipe escrever o código da PRÓPRIA loja. Uma instrução só — inserir ou
 * substituir o código aberto — para que dois cliques ao mesmo tempo terminem
 * com UM código valendo, e não com um erro de chave repetida.
 */
export async function gerarCodigoDePareamento(
  opcoes: OpcoesDaGeracao = {},
): Promise<CodigoDePareamento> {
  const lojaId = exigirLojaDoContexto();
  const autor = exigirContexto().usuarioId ?? null;
  const codigo = (opcoes.sortear ?? sortearCodigoDePareamento)();
  if (!FORMATO_DO_CODIGO.test(codigo)) {
    throw new Error("o código de pareamento precisa ter seis dígitos");
  }
  const validadeMs = Math.max(
    1,
    Math.trunc(opcoes.validadeMs ?? VALIDADE_DO_CODIGO_MS),
  );
  const resumo = resumirCodigoDePareamento(lojaId, codigo);

  const [gerado] = await transacaoAtual().$queryRaw<{ expires_at: Date }[]>`
    INSERT INTO app.print_pairing_codes
      (store_id, code_sha256, expires_at, created_by)
    VALUES (${lojaId}::uuid, ${resumo}::bytea,
            now() + (${validadeMs}::int * interval '1 millisecond'),
            ${autor}::uuid)
    ON CONFLICT (store_id) WHERE consumed_at IS NULL
    DO UPDATE SET code_sha256 = EXCLUDED.code_sha256,
                  expires_at = EXCLUDED.expires_at,
                  failed_attempts = 0,
                  created_by = EXCLUDED.created_by,
                  created_at = now()
    RETURNING expires_at`;
  if (gerado === undefined) {
    throw new Error("o banco não devolveu o código de pareamento gerado");
  }
  return { codigo, expiraEm: gerado.expires_at.toISOString() };
}

// ---------------------------------------------------------------------------
// O agente pareia
// ---------------------------------------------------------------------------

/** Por que o pareamento não aconteceu (o banco decide; a borda não conta). */
export type MotivoDaRecusaDoPareamento =
  "sem_codigo" | "codigo_errado" | "esgotado";

/** O desfecho do pareamento. */
export type ResultadoDoPareamento =
  | {
      readonly ok: true;
      readonly credencial: string;
      readonly agente: { readonly id: string; readonly nome: string };
      readonly loja: { readonly apelido: string; readonly nome: string };
    }
  | { readonly ok: false; readonly motivo: MotivoDaRecusaDoPareamento };

/** O que o agente manda, já validado na borda. */
export interface PedidoDoAgente {
  readonly codigo: string;
  readonly nome: string;
}

/**
 * Troca o código pela credencial do agente, na loja do contexto.
 *
 * Roda com o papel da vitrine e a loja resolvida pelo apelido que o agente
 * mandou: o agente ainda não é ninguém. Toda a decisão é do banco, numa
 * função com os direitos de quem a definiu, e a tentativa errada fica GRAVADA
 * mesmo que a resposta seja recusa — é o que faz o limite do código valer.
 */
export async function parearAgente(
  pedido: PedidoDoAgente,
): Promise<ResultadoDoPareamento> {
  const lojaId = exigirLojaDoContexto();
  const tx = transacaoAtual();
  const credencial = sortearCredencialDoAgente();

  const [desfecho] = await tx.$queryRaw<
    { agente_id: string | null; desfecho: string }[]
  >`
    SELECT agente_id::text AS agente_id, desfecho
      FROM app.parear_agente_de_impressao(
             ${resumirCodigoDePareamento(lojaId, pedido.codigo)}::bytea,
             ${pedido.nome}::text,
             ${resumirCredencialDoAgente(credencial)}::bytea,
             ${MAXIMO_DE_FALHAS_POR_CODIGO}::int)`;

  if (desfecho?.desfecho !== "pareado" || desfecho.agente_id === null) {
    const motivo = desfecho?.desfecho;
    return {
      ok: false,
      motivo:
        motivo === "codigo_errado" || motivo === "esgotado"
          ? motivo
          : "sem_codigo",
    };
  }

  // A loja da vitrine: a política pública só mostra a loja ativa do contexto.
  const [loja] = await tx.$queryRaw<{ slug: string; name: string }[]>`
    SELECT slug, name FROM app.stores WHERE id = ${lojaId}::uuid`;

  return {
    ok: true,
    credencial,
    agente: { id: desfecho.agente_id, nome: pedido.nome },
    loja: { apelido: loja?.slug ?? "", nome: loja?.name ?? "" },
  };
}

// ---------------------------------------------------------------------------
// O agente se apresenta
// ---------------------------------------------------------------------------

/** Quem é o agente que apresentou a credencial, e de qual loja. */
export interface AgenteIdentificado {
  readonly agenteId: string;
  readonly lojaId: string;
}

/**
 * Identifica o agente pela credencial, sem contexto de loja: é a credencial
 * que diz a loja. Credencial desconhecida, agente revogado e loja suspensa
 * respondem nulo — a borda recusa os três do mesmo jeito.
 */
export async function identificarAgente(
  credencial: string,
): Promise<AgenteIdentificado | null> {
  if (!pareceCredencialDoAgente(credencial)) return null;
  const [linha] = await transacaoAtual().$queryRaw<
    { agente_id: string; loja_id: string }[]
  >`
    SELECT agente_id::text AS agente_id, loja_id::text AS loja_id
      FROM app.agente_pela_credencial(${resumirCredencialDoAgente(credencial)}::bytea)`;
  return linha === undefined
    ? null
    : { agenteId: linha.agente_id, lojaId: linha.loja_id };
}
