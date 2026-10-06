/**
 * A impressão automática como o painel a consome (T-608 — AC-622, AC-624,
 * AC-626).
 *
 * A tela fala com as rotas do próprio site, que levam a sessão do dono à API;
 * o que volta é conferido pelo MESMO esquema do contrato que a API usa para
 * responder (`packages/contracts/src/impressao.ts`). Resposta fora do contrato
 * vira erro aqui, e a tela diz que não conseguiu conferir — em vez de mostrar
 * um estado que ninguém prometeu.
 */
import {
  esquemaDoCodigoDePareamento,
  esquemaDoEstadoDaImpressaoAutomatica,
  esquemaDosTrabalhosPendentes,
  type CodigoDePareamentoNoContrato,
  type EstadoDaImpressaoAutomaticaNoContrato,
  type TrabalhoPendenteNoContrato,
} from "@simpleclick/contracts";

export type EstadoDaImpressaoAutomatica = EstadoDaImpressaoAutomaticaNoContrato;
export type TrabalhoPendente = TrabalhoPendenteNoContrato;
export type CodigoDePareamento = CodigoDePareamentoNoContrato;

/** Onde a tela pergunta o estado do agente. */
export const ENDERECO_DO_ESTADO_DA_IMPRESSAO = "/api/painel/impressao/estado";
/** Onde a tela pergunta os cupons que esperam o agente. */
export const ENDERECO_DOS_PENDENTES = "/api/painel/impressao/pendentes";
/** Onde a tela pede um código de pareamento novo. */
export const ENDERECO_DO_PAREAMENTO = "/api/painel/impressao/pareamento";

/** Uma leitura da impressão automática, pronta para a tela decidir o estado. */
export type LeituraDaImpressaoAutomatica =
  | {
      readonly estado: "ok";
      readonly impressao: EstadoDaImpressaoAutomatica;
      readonly pendentes: readonly TrabalhoPendente[];
    }
  | { readonly estado: "erro" };

/** Leitor da impressão automática. Entra por parâmetro para a prova. */
export type BuscarImpressaoAutomatica =
  () => Promise<LeituraDaImpressaoAutomatica>;

async function lerJson(
  buscar: typeof fetch,
  endereco: string,
  init?: RequestInit,
): Promise<unknown> {
  const resposta = await buscar(endereco, {
    cache: "no-store",
    ...init,
    headers: { accept: "application/json", ...init?.headers },
  });
  if (!resposta.ok) throw new Error(`${endereco} respondeu ${resposta.status}`);
  return resposta.json();
}

/**
 * Lê o estado do agente e os pendentes. Nunca lança: queda de rede e resposta
 * estranha viram `erro`, e a tela tenta de novo na próxima volta.
 */
export async function buscarImpressaoAutomatica(
  buscar: typeof fetch = fetch,
): Promise<LeituraDaImpressaoAutomatica> {
  try {
    const [estado, pendentes] = await Promise.all([
      lerJson(buscar, ENDERECO_DO_ESTADO_DA_IMPRESSAO),
      lerJson(buscar, ENDERECO_DOS_PENDENTES),
    ]);
    return {
      estado: "ok",
      impressao: esquemaDoEstadoDaImpressaoAutomatica.parse(estado),
      pendentes: esquemaDosTrabalhosPendentes.parse(pendentes).trabalhos,
    };
  } catch {
    return { estado: "erro" };
  }
}

/** Pede um código de pareamento novo; o anterior deixa de valer. */
export async function pedirCodigoDePareamento(
  buscar: typeof fetch = fetch,
): Promise<CodigoDePareamento | null> {
  try {
    return esquemaDoCodigoDePareamento.parse(
      await lerJson(buscar, ENDERECO_DO_PAREAMENTO, { method: "POST" }),
    );
  } catch {
    return null;
  }
}

const FORMATO_DE_HORARIO = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

/** Um instante do contrato no relógio do computador da loja ("21:42"). */
export function escreverHorarioDaImpressao(instante: string): string {
  return FORMATO_DE_HORARIO.format(new Date(instante));
}

/** O que cada estado de um cupom pendente quer dizer para o dono. */
export function rotuloDoPendente(estado: TrabalhoPendente["estado"]): string {
  switch (estado) {
    case "QUEUED":
      return "Aguardando o agente";
    case "LEASED":
      return "Com o agente agora";
    case "FAILED":
      return "Falhou, vai tentar de novo";
    case "DEAD":
      return "Não saiu: imprima por clique";
  }
}
