/**
 * O cupom da impressão por clique, pedido à API e diagramado para a tela
 * (T-606 — AC-617, AC-618).
 *
 * A API é a fonte do conteúdo e do número da via; aqui só se DIAGRAMA, com a
 * mesma função que alimenta a saída da impressora (`diagramarCupom`, em
 * `packages/core`). É isso que faz o papel do navegador e o do agente de
 * impressão serem o mesmo cupom: nenhum dos dois mede, quebra ou alinha texto
 * por conta própria.
 */

import {
  AREA_IMPRESSA_EM_MM,
  diagramarCupom,
  lerCupomImpresso,
  TABELA_PADRAO,
  type CupomImpresso,
  type LarguraDoPapel,
  type LinhaDoCupom,
} from "@simpleclick/core";

import { enderecoDaApi } from "./api-client.ts";
import { enderecoDoSite } from "./endereco-do-site.ts";
import { lerTokenDeAcessoDoCookie } from "./session-cookie.ts";

/**
 * A loja do painel. É a mesma escolha das outras rotas do painel nesta fase:
 * a loja vem do ambiente até o login de produção dizer de qual loja é o dono.
 */
const APELIDO_DA_LOJA =
  process.env.NEXT_PUBLIC_DEV_STORE_SLUG ?? "pastelaria-da-vila";

/**
 * Largura de cada caractere, em fração do tamanho da letra, usada para
 * calcular a letra. As fontes monoespaçadas da folha avançam entre 0,55
 * (Consolas) e 0,602 (Lucida Console, DejaVu Sans Mono): medir com 0,6 fez a
 * linha de 32 colunas passar 0,16 mm da área impressa no navegador de verdade.
 * Com 0,62, a fonte mais larga da lista ainda sobra folga — nenhuma linha
 * encosta na borda que a cabeça de impressão não alcança.
 */
export const AVANCO_DA_LETRA = 0.62;

/** Altura da linha, em fração do tamanho da letra. */
export const ALTURA_DA_LINHA = 1.25;

/** Respiro de papel antes da primeira e depois da última linha, em mm. */
export const MARGEM_VERTICAL_EM_MM = 4;

/**
 * Folga no fim do papel, em mm. Cada navegador arredonda a altura da linha do
 * seu jeito; sem folga, a última linha poderia cair numa segunda página — um
 * pedaço de cupom cortado sozinho. Três milímetros de papel em branco custam
 * menos que isso.
 */
export const FOLGA_EM_MM = 3;

/** O cupom pronto para virar papel no navegador. */
export interface FolhaDoCupom {
  /** Largura do papel na impressora: é o tamanho da página impressa. */
  readonly larguraMm: LarguraDoPapel;
  /** Largura que a cabeça de impressão alcança: é a largura do texto. */
  readonly areaImpressaMm: number;
  readonly colunas: number;
  /**
   * Tamanho da letra que põe `colunas` caracteres na área impressa para uma
   * fonte monoespaçada de avanço `AVANCO_DA_LETRA`. Fonte de avanço menor
   * ocupa menos; nenhuma linha passa da área.
   */
  readonly letraMm: number;
  /** Altura do papel que este cupom ocupa — uma página só, sem sobra. */
  readonly alturaMm: number;
  readonly via: number;
  readonly linhas: readonly LinhaDoCupom[];
}

/** O que a página de impressão recebe. */
export type CupomParaImprimir =
  | { readonly estado: "pronto"; readonly folha: FolhaDoCupom }
  | { readonly estado: "sem-sessao" }
  | { readonly estado: "nao-encontrado" }
  | { readonly estado: "indisponivel" };

/** Arredonda para cima em décimos de milímetro — papel a menos corta texto. */
function emDecimos(milimetros: number): number {
  return Math.ceil(milimetros * 10) / 10;
}

/**
 * Diagrama o cupom para o navegador (AC-618).
 *
 * Função pura, e exportada, porque é aqui que a largura configurada vira
 * medida de página: colunas, tamanho da letra e altura do papel.
 */
export function folhaDoCupom(cupom: CupomImpresso): FolhaDoCupom {
  const { larguraMm, colunas } = cupom.papel;
  const areaImpressaMm = AREA_IMPRESSA_EM_MM[larguraMm];
  const letraMm = areaImpressaMm / colunas / AVANCO_DA_LETRA;
  const linhas = diagramarCupom(cupom, { colunas, tabela: TABELA_PADRAO });

  const alturaDasLinhas = linhas.reduce((soma, linha) => {
    if (linha.tipo === "corte") return soma;
    const fator = linha.tamanho === "duplo" ? 2 : 1;
    return soma + letraMm * ALTURA_DA_LINHA * fator;
  }, 0);

  return {
    larguraMm,
    areaImpressaMm,
    colunas,
    letraMm,
    alturaMm: emDecimos(
      alturaDasLinhas + 2 * MARGEM_VERTICAL_EM_MM + FOLGA_EM_MM,
    ),
    via: cupom.via,
    linhas,
  };
}

/**
 * Pede à API uma via do cupom e devolve a folha pronta.
 *
 * Cada chamada EMITE uma via (AC-621): é por isso que a página chama esta
 * função uma vez por abertura, e nunca em pré-carregamento. Sem sessão, nem
 * chega a perguntar — e a resposta que a página mostra é "entre de novo".
 *
 * `buscar` entra por parâmetro para o teste responder sem rede.
 */
export async function emitirCupomParaImprimir(
  pedidoId: string,
  cabecalhoCookie: string | null,
  buscar: typeof fetch = fetch,
): Promise<CupomParaImprimir> {
  const token = lerTokenDeAcessoDoCookie(cabecalhoCookie);
  if (token === undefined) return { estado: "sem-sessao" };

  let resposta: Response;
  try {
    resposta = await buscar(
      `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(APELIDO_DA_LOJA)}/pedidos/${encodeURIComponent(pedidoId)}/cupom`,
      {
        method: "POST",
        cache: "no-store",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
          // Emitir via muda estado, e a API só aceita mudança de estado vinda
          // de origem da lista fechada (AC-125..AC-128): a do próprio site.
          origin: new URL(enderecoDoSite()).origin,
        },
      },
    );
  } catch {
    return { estado: "indisponivel" };
  }

  if (resposta.status === 401 || resposta.status === 403) {
    return { estado: "sem-sessao" };
  }
  if (resposta.status === 404) return { estado: "nao-encontrado" };
  if (!resposta.ok) return { estado: "indisponivel" };

  let corpo: unknown;
  try {
    corpo = await resposta.json();
  } catch {
    return { estado: "indisponivel" };
  }
  const cupom = lerCupomImpresso(
    typeof corpo === "object" && corpo !== null && "cupom" in corpo
      ? corpo.cupom
      : null,
  );
  // Cupom fora do contrato não é impresso: imprimir errado é pior que não
  // imprimir, e a tela diz que a impressão está indisponível.
  if (cupom === null) return { estado: "indisponivel" };
  return { estado: "pronto", folha: folhaDoCupom(cupom) };
}
