/**
 * Configurações da loja: ler e gravar uma seção (T-900, AC-921..AC-923).
 *
 * GRAVAR É UMA TRANSAÇÃO SÓ, e a trilha de auditoria está DENTRO dela. A ordem
 * é: ler como estava, gravar, ler como ficou, registrar a diferença. Se
 * qualquer passo falha — inclusive o registro —, o banco desfaz tudo, e a
 * loja continua com a configuração de antes (AC-923). Alteração sem registro
 * não existe: seria exatamente a troca de chave PIX que ninguém consegue
 * explicar depois (AC-922).
 *
 * QUEM VALIDA É A BORDA (`configuracoes.schema.ts`), e aqui o valor já chega
 * com o formato certo. O caso de uso não aceita "quase válido" — ele recebe o
 * que a borda aprovou, e só.
 *
 * A TRILHA NÃO GUARDA DADO PESSOAL (P-009). A chave PIX e o WhatsApp entram
 * mascarados: o histórico diz QUE a chave mudou, e de qual final para qual
 * final, sem virar um segundo lugar de onde se copia a chave de alguém. O que
 * é sensível — a chave PIX e o número que recebe o pedido, os dois caminhos
 * por onde dinheiro e cliente podem ser desviados — sai com ação própria,
 * `CONFIG_SENSIVEL_ALTERADA`, para o histórico destacar.
 */
import type { SecaoDoDono } from "@simpleclick/contracts";

import { transacaoAtual, type TransacaoDoBanco } from "../../core/db.ts";
import type { ValorDaSecao } from "./configuracoes.schema.ts";
import { normalizarConfiguracaoDeImpressao } from "./impressao-config.usecase.ts";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Quem alterou, do jeito que a sessão o identificou. */
export interface AutorDaAlteracao {
  readonly identidadeId: string;
  readonly papel: string;
}

/** Onde a alteração acontece e por quem. */
export interface ContextoDaAlteracao {
  readonly lojaId: string;
  readonly autor: AutorDaAlteracao;
}

/** Uma diferença entre o antes e o depois, campo a campo. */
export interface Diferenca {
  readonly campo: string;
  readonly antes: unknown;
  readonly depois: unknown;
}

/** Ação registrada na trilha. A sensível é a que o histórico destaca. */
export type AcaoDaTrilha = "CONFIG_ALTERADA" | "CONFIG_SENSIVEL_ALTERADA";

/** O que vai para a trilha de auditoria, já sem dado pessoal. */
export interface RegistroDaTrilha {
  readonly acao: AcaoDaTrilha;
  readonly secao: SecaoDoDono;
  /** Valor anterior de cada campo que mudou. */
  readonly antes: Readonly<Record<string, unknown>>;
  /** Valor novo de cada campo que mudou. */
  readonly depois: Readonly<Record<string, unknown>>;
  readonly camposSensiveis: readonly string[];
}

/** Grava o registro na trilha. Trocável na prova de atomicidade (AC-923). */
export type RegistradorDaTrilha = (
  registro: RegistroDaTrilha,
  contexto: ContextoDaAlteracao,
) => Promise<void>;

/** O que a gravação devolve para a borda. */
export interface ResultadoDaGravacao<S extends SecaoDoDono> {
  readonly configuracao: ValorDaSecao<S>;
  /** Os campos que de fato mudaram. Vazio quando nada mudou. */
  readonly camposAlterados: readonly string[];
  readonly sensivel: boolean;
}

/** Como uma seção é lida e gravada. */
interface DefinicaoDaSecao<S extends SecaoDoDono> {
  ler(tx: TransacaoDoBanco, lojaId: string): Promise<ValorDaSecao<S>>;
  gravar(
    tx: TransacaoDoBanco,
    lojaId: string,
    valor: ValorDaSecao<S>,
  ): Promise<void>;
  /** Prefixos de campo cuja troca é sensível (AC-922). */
  readonly sensiveis: readonly string[];
  /** Campos com dado pessoal: a trilha guarda só o final deles (P-009). */
  readonly pessoais: readonly string[];
}

// ---------------------------------------------------------------------------
// Leitura tolerante do documento guardado
// ---------------------------------------------------------------------------

function objeto(valor: unknown): Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor : null;
}

/** Centavos guardados. Nulo NÃO é zero: taxa nula é "a combinar". */
function centavos(valor: unknown): number | null {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= 0
    ? valor
    : null;
}

/** Lê "18:30" de um `time` do banco, sem passar pelo fuso da máquina. */
function horaDoBanco(valor: Date): string {
  const horas = String(valor.getUTCHours()).padStart(2, "0");
  const minutos = String(valor.getUTCMinutes()).padStart(2, "0");
  return `${horas}:${minutos}`;
}

/** Lê "2026-12-25" de uma `date` do banco. */
function dataDoBanco(valor: Date): string {
  return valor.toISOString().slice(0, 10);
}

/**
 * Exige que a linha da loja tenha sido alterada.
 *
 * `UPDATE` que não acha a linha não falha — responde "0 linhas" e segue. Sem
 * esta conferência, a tela diria "salvo" para uma configuração que nunca foi
 * gravada, e a transação seria confirmada com a trilha dizendo o contrário.
 */
function exigirLinha(afetadas: number, oQue: string): void {
  if (afetadas !== 1) {
    throw new Error(`a gravação de ${oQue} não encontrou a linha da loja`);
  }
}

/** A saudação que a loja tem antes de o dono escrever a dele. */
const SAUDACAO_DE_FABRICA = "Olá! Segue meu pedido:";

const FORMAS_CONHECIDAS = ["PIX", "CASH", "CARD_ON_DELIVERY"] as const;
type FormaConhecida = (typeof FORMAS_CONHECIDAS)[number];
const TIPOS_DE_CHAVE = [
  "CPF",
  "CNPJ",
  "TELEFONE",
  "EMAIL",
  "ALEATORIA",
] as const;
type TipoDeChave = (typeof TIPOS_DE_CHAVE)[number];

function ehForma(valor: unknown): valor is FormaConhecida {
  return (FORMAS_CONHECIDAS as readonly unknown[]).includes(valor);
}

function ehTipoDeChave(valor: unknown): valor is TipoDeChave {
  return (TIPOS_DE_CHAVE as readonly unknown[]).includes(valor);
}

// ---------------------------------------------------------------------------
// As seções
// ---------------------------------------------------------------------------

async function lerDaConfiguracao(
  tx: TransacaoDoBanco,
  lojaId: string,
): Promise<Record<string, unknown> | null> {
  return tx.storeSettings.findUnique({ where: { storeId: lojaId } });
}

const pagamento: DefinicaoDaSecao<"pagamento"> = {
  async ler(tx, lojaId) {
    const linha = await lerDaConfiguracao(tx, lojaId);
    const documento = objeto(linha?.["payment"]);
    const pix = objeto(documento["pix"]);
    const formas = Array.isArray(documento["formas"])
      ? documento["formas"].filter(ehForma)
      : [];
    const chave = texto(pix["chave"]);
    return {
      formas,
      pix:
        chave === null
          ? null
          : {
              tipo: ehTipoDeChave(pix["tipo"]) ? pix["tipo"] : "ALEATORIA",
              chave,
              titular: texto(pix["titular"]) ?? "",
            },
    };
  },
  async gravar(tx, lojaId, valor) {
    exigirLinha(
      await tx.$executeRaw`
        UPDATE app.store_settings
           SET payment = payment || ${JSON.stringify({ formas: valor.formas, pix: valor.pix })}::jsonb
         WHERE store_id = ${lojaId}::uuid`,
      "pagamento",
    );
  },
  sensiveis: ["pix"],
  pessoais: ["pix.chave"],
};

const entrega: DefinicaoDaSecao<"entrega"> = {
  async ler(tx, lojaId) {
    const loja = await tx.store.findUnique({
      where: { id: lojaId },
      select: { fulfillmentModes: true },
    });
    const linha = await lerDaConfiguracao(tx, lojaId);
    const documento = objeto(linha?.["delivery"]);
    const modos = loja?.fulfillmentModes ?? [];
    return {
      // O que a loja ACEITA mora na coluna da loja, que o resto do sistema já
      // usa; duas fontes para a mesma pergunta divergem no dia da edição.
      aceitaEntrega: modos.includes("DELIVERY"),
      aceitaRetirada: modos.includes("PICKUP"),
      taxaCentavos: centavos(documento["taxaPadraoCents"]),
      nomeDaTaxa: texto(documento["nomeDaTaxa"]),
      gratisAcimaDeCentavos: centavos(documento["gratisAcimaDeCents"]),
      minimoParaEntregaCentavos: centavos(documento["minimoEntregaCents"]),
      minimoParaRetiradaCentavos: centavos(documento["minimoRetiradaCents"]),
      prazoMinutos: centavos(documento["prazoMinutos"]),
    };
  },
  async gravar(tx, lojaId, valor) {
    const modos = [
      ...(valor.aceitaEntrega ? ["DELIVERY"] : []),
      ...(valor.aceitaRetirada ? ["PICKUP"] : []),
    ];
    exigirLinha(
      await tx.$executeRaw`
        UPDATE app.stores
           SET fulfillment_modes = ${modos}::text[]
         WHERE id = ${lojaId}::uuid`,
      "entrega",
    );
    exigirLinha(
      await tx.$executeRaw`
        UPDATE app.store_settings
           SET delivery = delivery || ${JSON.stringify({
             taxaPadraoCents: valor.taxaCentavos,
             nomeDaTaxa: valor.nomeDaTaxa,
             gratisAcimaDeCents: valor.gratisAcimaDeCentavos,
             minimoEntregaCents: valor.minimoParaEntregaCentavos,
             minimoRetiradaCents: valor.minimoParaRetiradaCentavos,
             prazoMinutos: valor.prazoMinutos,
           })}::jsonb
         WHERE store_id = ${lojaId}::uuid`,
      "entrega",
    );
  },
  sensiveis: [],
  pessoais: [],
};

const horario: DefinicaoDaSecao<"horario"> = {
  async ler(tx, lojaId) {
    const loja = await tx.store.findUnique({
      where: { id: lojaId },
      select: { openState: true, temporarilyClosedUntil: true },
    });
    const faixas = await tx.storeHour.findMany({
      where: { storeId: lojaId, isClosed: false },
      orderBy: [{ weekday: "asc" }, { opensAt: "asc" }],
      select: { weekday: true, opensAt: true, closesAt: true },
    });
    const excecoes = await tx.storeHourException.findMany({
      where: { storeId: lojaId },
      orderBy: { onDate: "asc" },
      select: {
        onDate: true,
        isClosed: true,
        opensAt: true,
        closesAt: true,
        reason: true,
      },
    });

    const porDia = new Map<number, { abre: string; fecha: string }[]>();
    for (const faixa of faixas) {
      const doDia = porDia.get(faixa.weekday) ?? [];
      doDia.push({
        abre: horaDoBanco(faixa.opensAt),
        fecha: horaDoBanco(faixa.closesAt),
      });
      porDia.set(faixa.weekday, doDia);
    }

    const ate = loja?.temporarilyClosedUntil ?? null;
    return {
      semana: [...porDia.entries()]
        .sort(([a], [b]) => a - b)
        .map(([dia, doDia]) => ({ dia, faixas: doDia })),
      fechadoAgora:
        loja?.openState === "TEMPORARILY_CLOSED" &&
        (ate === null || ate.getTime() > Date.now()),
      excecoes: excecoes.map((excecao) => ({
        data: dataDoBanco(excecao.onDate),
        fechada: excecao.isClosed,
        abre: excecao.opensAt === null ? null : horaDoBanco(excecao.opensAt),
        fecha: excecao.closesAt === null ? null : horaDoBanco(excecao.closesAt),
        motivo: texto(excecao.reason),
      })),
    };
  },
  async gravar(tx, lojaId, valor) {
    // A GRADE É REESCRITA INTEIRA, dentro da mesma transação. Editar faixa por
    // faixa exigiria identificar cada uma na tela; reescrever é o que o dono
    // vê — a semana que ele montou — e a transação garante que a vitrine
    // nunca enxerga a grade pela metade.
    await tx.$executeRaw`DELETE FROM app.store_hours WHERE store_id = ${lojaId}::uuid`;
    for (const dia of valor.semana) {
      for (const [ordem, faixa] of dia.faixas.entries()) {
        await tx.$executeRaw`
          INSERT INTO app.store_hours
            (store_id, weekday, opens_at, closes_at, sort_order)
          VALUES (${lojaId}::uuid, ${dia.dia}, ${faixa.abre}::time,
                  ${faixa.fecha}::time, ${ordem})`;
      }
    }

    await tx.$executeRaw`DELETE FROM app.store_hour_exceptions WHERE store_id = ${lojaId}::uuid`;
    for (const excecao of valor.excecoes) {
      await tx.$executeRaw`
        INSERT INTO app.store_hour_exceptions
          (store_id, on_date, is_closed, opens_at, closes_at, reason)
        VALUES (${lojaId}::uuid, ${excecao.data}::date, ${excecao.fechada},
                ${excecao.fechada ? null : excecao.abre}::time,
                ${excecao.fechada ? null : excecao.fecha}::time,
                ${excecao.motivo})`;
    }

    // "Fechar agora" não toca na grade (AC-911): é estado da loja, e ao
    // desligá-lo a loja volta ao horário que já tinha. Estado posto pela
    // administração (sempre aberta, encerrada) não é desfeito daqui.
    exigirLinha(
      await tx.$executeRaw`
        UPDATE app.stores
           SET open_state = CASE
                 WHEN ${valor.fechadoAgora}::boolean THEN 'TEMPORARILY_CLOSED'
                 WHEN open_state = 'TEMPORARILY_CLOSED' THEN 'SCHEDULE'
                 ELSE open_state
               END,
               temporarily_closed_until = CASE
                 WHEN ${valor.fechadoAgora}::boolean THEN NULL
                 WHEN open_state = 'TEMPORARILY_CLOSED' THEN NULL
                 ELSE temporarily_closed_until
               END
         WHERE id = ${lojaId}::uuid`,
      "horário",
    );
  },
  sensiveis: [],
  pessoais: [],
};

const contato: DefinicaoDaSecao<"contato"> = {
  async ler(tx, lojaId) {
    const linha = await lerDaConfiguracao(tx, lojaId);
    const documento = objeto(linha?.["whatsapp"]);
    return {
      numero: texto(documento["numero"]) ?? "",
      // Saudação AUSENTE é a de fábrica; saudação NULA é a escolha do dono de
      // começar direto pelo pedido (AC-915). Ler as duas como a de fábrica
      // devolveria a frase que ele acabou de apagar.
      saudacao:
        "saudacao" in documento
          ? texto(documento["saudacao"])
          : SAUDACAO_DE_FABRICA,
      publico: documento["publico"] === true,
    };
  },
  async gravar(tx, lojaId, valor) {
    exigirLinha(
      await tx.$executeRaw`
        UPDATE app.store_settings
           SET whatsapp = whatsapp || ${JSON.stringify({ numero: valor.numero, saudacao: valor.saudacao, publico: valor.publico })}::jsonb
         WHERE store_id = ${lojaId}::uuid`,
      "contato",
    );
  },
  // O número que RECEBE o pedido: trocá-lo desvia os clientes da loja.
  sensiveis: ["numero"],
  pessoais: ["numero"],
};

const aparencia: DefinicaoDaSecao<"aparencia"> = {
  async ler(tx, lojaId) {
    const loja = await tx.store.findUnique({
      where: { id: lojaId },
      select: { name: true },
    });
    const linha = await lerDaConfiguracao(tx, lojaId);
    const landing = objeto(linha?.["landing"]);
    const tema = objeto(linha?.["theme"]);
    return {
      // O nome de exibição é o da loja (`stores.name`): é o que a vitrine, o
      // pedido e o cupom já mostram. O apelido da URL continua da administração.
      nome: loja?.name ?? "",
      boasVindas: texto(landing["boasVindas"]),
      sobre: texto(landing["sobre"]),
      logo: texto(landing["logo"]),
      capa: texto(landing["capa"]),
      corPrimaria: texto(tema["primaria"]),
    };
  },
  async gravar(tx, lojaId, valor) {
    exigirLinha(
      await tx.$executeRaw`
        UPDATE app.stores SET name = ${valor.nome} WHERE id = ${lojaId}::uuid`,
      "apresentação",
    );
    exigirLinha(
      await tx.$executeRaw`
        UPDATE app.store_settings
           SET landing = landing || ${JSON.stringify({
             boasVindas: valor.boasVindas,
             sobre: valor.sobre,
             logo: valor.logo,
             capa: valor.capa,
           })}::jsonb,
               theme = theme || ${JSON.stringify({ primaria: valor.corPrimaria })}::jsonb
         WHERE store_id = ${lojaId}::uuid`,
      "apresentação",
    );
  },
  sensiveis: [],
  pessoais: [],
};

const impressao: DefinicaoDaSecao<"impressao"> = {
  async ler(tx, lojaId) {
    const linha = await lerDaConfiguracao(tx, lojaId);
    return normalizarConfiguracaoDeImpressao(linha?.["printing"]);
  },
  async gravar(tx, lojaId, valor) {
    // O essencial do cupom não é negociável (AC-920): a normalização o liga de
    // novo mesmo que a entrada tente desligar.
    const configuracao = normalizarConfiguracaoDeImpressao(valor);
    // A chave do automático (T-608) é opcional: quem salva sem ela — a tela
    // de antes dela, no meio de uma publicação — não desliga o automático de
    // ninguém. O valor guardado continua valendo.
    const informouAutomatico = valor.automatico !== undefined;
    exigirLinha(
      await tx.$executeRaw`
        UPDATE app.store_settings
           SET printing = ${JSON.stringify(configuracao)}::jsonb
                 || CASE WHEN ${informouAutomatico}::boolean THEN '{}'::jsonb
                         ELSE jsonb_build_object('automatico',
                                coalesce(printing -> 'automatico', 'false'::jsonb))
                    END
         WHERE store_id = ${lojaId}::uuid`,
      "impressão",
    );
  },
  sensiveis: [],
  pessoais: [],
};

/** A lista fechada de seções, cada uma com a sua leitura e gravação. */
const SECOES: { readonly [S in SecaoDoDono]: DefinicaoDaSecao<S> } = {
  pagamento,
  entrega,
  horario,
  contato,
  aparencia,
  impressao,
};

// ---------------------------------------------------------------------------
// Diferença e trilha (regras puras)
// ---------------------------------------------------------------------------

/**
 * As folhas de um documento, com o caminho de cada uma ("pix.chave").
 *
 * LISTA É FOLHA, e não é aberta: a ordem das formas de pagamento e a grade da
 * semana são UMA escolha do dono, e registrar "semana.3.faixas.1.abre" mudou
 * diria menos do que "a semana mudou, era isto e ficou aquilo".
 */
export function folhas(
  valor: unknown,
  prefixo = "",
  acumulado = new Map<string, unknown>(),
): Map<string, unknown> {
  const ehDocumento =
    typeof valor === "object" && valor !== null && !Array.isArray(valor);
  if (!ehDocumento) {
    if (prefixo !== "") acumulado.set(prefixo, valor);
    return acumulado;
  }
  for (const [chave, filho] of Object.entries(valor)) {
    folhas(filho, prefixo === "" ? chave : `${prefixo}.${chave}`, acumulado);
  }
  return acumulado;
}

/** O que mudou entre dois estados da mesma seção, campo a campo. */
export function diferencas(antes: unknown, depois: unknown): Diferenca[] {
  const deAntes = folhas(antes);
  const deDepois = folhas(depois);
  const campos = new Set([...deAntes.keys(), ...deDepois.keys()]);
  const mudaram: Diferenca[] = [];
  for (const campo of campos) {
    const anterior = deAntes.get(campo) ?? null;
    const novo = deDepois.get(campo) ?? null;
    if (JSON.stringify(anterior) !== JSON.stringify(novo)) {
      mudaram.push({ campo, antes: anterior, depois: novo });
    }
  }
  return mudaram.sort((a, b) => a.campo.localeCompare(b.campo));
}

/**
 * O valor de um dado pessoal, reduzido ao final.
 *
 * "…8909" basta para o dono reconhecer QUAL chave estava valendo, e não basta
 * para ninguém copiá-la da trilha (P-009).
 */
export function mascarar(valor: unknown): unknown {
  if (typeof valor !== "string" || valor === "") return valor;
  const final = valor.length <= 4 ? "" : valor.slice(-4);
  return `…${final}`;
}

function casaComPrefixo(campo: string, prefixos: readonly string[]): boolean {
  return prefixos.some(
    (prefixo) => campo === prefixo || campo.startsWith(`${prefixo}.`),
  );
}

/**
 * O registro da trilha para as diferenças de uma seção, ou nulo se nada mudou.
 *
 * Salvar sem mudar nada não vira linha: a trilha que registra "nada mudou" a
 * cada clique esconde a linha que importa entre cem que não importam.
 */
export function registroDaAlteracao(
  secao: SecaoDoDono,
  mudancas: readonly Diferenca[],
  regras: {
    readonly sensiveis: readonly string[];
    readonly pessoais: readonly string[];
  },
): RegistroDaTrilha | null {
  if (mudancas.length === 0) return null;

  const antes: Record<string, unknown> = {};
  const depois: Record<string, unknown> = {};
  const camposSensiveis: string[] = [];
  for (const mudanca of mudancas) {
    const pessoal = casaComPrefixo(mudanca.campo, regras.pessoais);
    antes[mudanca.campo] = pessoal ? mascarar(mudanca.antes) : mudanca.antes;
    depois[mudanca.campo] = pessoal ? mascarar(mudanca.depois) : mudanca.depois;
    if (casaComPrefixo(mudanca.campo, regras.sensiveis)) {
      camposSensiveis.push(mudanca.campo);
    }
  }

  return {
    acao:
      camposSensiveis.length > 0
        ? "CONFIG_SENSIVEL_ALTERADA"
        : "CONFIG_ALTERADA",
    secao,
    antes,
    depois,
    camposSensiveis,
  };
}

/** As regras de trilha de uma seção: o que é sensível e o que é pessoal. */
export function regrasDaTrilha(secao: SecaoDoDono): {
  readonly sensiveis: readonly string[];
  readonly pessoais: readonly string[];
} {
  const { sensiveis, pessoais } = SECOES[secao];
  return { sensiveis, pessoais };
}

const FORMATO_DE_IDENTIDADE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Grava o registro na trilha, na transação corrente.
 *
 * O autor vai como identidade quando a sessão carrega uma identidade de
 * verdade. A sessão do ambiente local ainda usa um nome fixo, que não é linha
 * de `identities`; nesse caso a trilha guarda o papel e o nome da sessão no
 * registro, em vez de recusar a gravação por uma chave estrangeira.
 */
export const registrarNaTrilha: RegistradorDaTrilha = async (
  registro,
  contexto,
) => {
  const tx = transacaoAtual();
  const identidade = FORMATO_DE_IDENTIDADE.test(contexto.autor.identidadeId)
    ? contexto.autor.identidadeId
    : null;
  const depois = {
    campos: registro.depois,
    sensivel: registro.camposSensiveis.length > 0,
    camposSensiveis: registro.camposSensiveis,
    ...(identidade === null ? { sessao: contexto.autor.identidadeId } : {}),
  };

  await tx.$executeRaw`
    INSERT INTO app.audit_log
      (store_id, actor_id, actor_role, action, entity, entity_id,
       before_data, after_data)
    VALUES (${contexto.lojaId}::uuid, ${identidade}::uuid,
            ${contexto.autor.papel}, ${registro.acao}, 'store_settings',
            ${registro.secao}, ${JSON.stringify({ campos: registro.antes })}::jsonb,
            ${JSON.stringify(depois)}::jsonb)`;
};

// ---------------------------------------------------------------------------
// Casos de uso
// ---------------------------------------------------------------------------

/** Lê uma seção da loja do contexto, como o painel do dono a mostra. */
export async function lerConfiguracao<S extends SecaoDoDono>(
  secao: S,
  lojaId: string,
): Promise<ValorDaSecao<S>> {
  const definicao = SECOES[secao] as DefinicaoDaSecao<S>;
  return definicao.ler(transacaoAtual(), lojaId);
}

/**
 * Grava uma seção já validada e registra a alteração na trilha.
 *
 * Tudo na transação corrente: quem chama abre UMA transação para o pedido
 * inteiro, e é ela que garante que nada fica pela metade.
 */
export async function salvarConfiguracao<S extends SecaoDoDono>(
  secao: S,
  valor: ValorDaSecao<S>,
  contexto: ContextoDaAlteracao,
  registrar: RegistradorDaTrilha = registrarNaTrilha,
): Promise<ResultadoDaGravacao<S>> {
  const tx = transacaoAtual();
  const definicao = SECOES[secao] as DefinicaoDaSecao<S>;

  const antes = await definicao.ler(tx, contexto.lojaId);
  await definicao.gravar(tx, contexto.lojaId, valor);
  const depois = await definicao.ler(tx, contexto.lojaId);

  const mudancas = diferencas(antes, depois);
  const registro = registroDaAlteracao(secao, mudancas, definicao);
  if (registro !== null) await registrar(registro, contexto);

  return {
    configuracao: depois,
    camposAlterados: mudancas.map((mudanca) => mudanca.campo),
    sensivel: (registro?.camposSensiveis.length ?? 0) > 0,
  };
}
