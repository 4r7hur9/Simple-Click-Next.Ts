/**
 * Diagramação do cupom (AC-620): os blocos semânticos viram linhas para um
 * perfil de colunas e tabela de caracteres. As duas saídas, navegador e
 * impressora, partem destas linhas sem medir nem quebrar texto por conta própria.
 */

import {
  alinharNaLinha,
  juntarNaLinha,
  larguraNoPapel,
  normalizarParaImpressao,
  quebrarEmLinhas,
  TABELA_PADRAO,
  type TabelaDeCaracteres,
} from "./cupom-largura.ts";
import {
  ErroDoCupom,
  RECUO_DA_CONTINUACAO,
  type BlocoDePar,
  type BlocoDeTexto,
  type CupomImpresso,
  type LinhaDoCupom,
  type PerfilDeDiagramacao,
  type TamanhoDoTexto,
} from "./cupom-contrato.ts";

/** Estado de letra de uma linha de texto. */
interface Letra {
  readonly negrito: boolean;
  readonly tamanho: TamanhoDoTexto;
}

/** Linha de texto pronta, sem espaço sobrando à direita. */
function linha(texto: string, letra: Letra): LinhaDoCupom {
  return {
    tipo: "texto",
    texto: texto.replace(/ +$/, ""),
    negrito: letra.negrito,
    tamanho: letra.tamanho,
  };
}

/** Caracteres que cabem numa linha de um tamanho de letra. */
function capacidade(colunas: number, tamanho: TamanhoDoTexto): number {
  return tamanho === "duplo" ? Math.floor(colunas / 2) : colunas;
}

/** Recuo válido: inteiro, não negativo e deixando ao menos uma coluna útil. */
function recuoValido(recuo: number | undefined, capacidadeDaLinha: number) {
  const pedido = recuo ?? 0;
  if (!Number.isSafeInteger(pedido) || pedido < 0) return 0;
  return Math.min(pedido, capacidadeDaLinha - 1);
}

function diagramarTexto(
  bloco: BlocoDeTexto,
  colunas: number,
  tabela: TabelaDeCaracteres,
): LinhaDoCupom[] {
  const letra: Letra = {
    negrito: bloco.negrito ?? false,
    tamanho: bloco.tamanho ?? "normal",
  };
  const cabe = capacidade(colunas, letra.tamanho);
  const recuo = recuoValido(bloco.recuo, cabe);
  const util = cabe - recuo;
  const linhas: LinhaDoCupom[] = [];
  for (const paragrafo of bloco.texto.split("\n")) {
    const texto = normalizarParaImpressao(paragrafo, tabela);
    if (texto === "") continue;
    for (const pedaco of quebrarEmLinhas(texto, util)) {
      const posto = alinharNaLinha(
        pedaco,
        util,
        bloco.alinhamento ?? "esquerda",
      );
      linhas.push(linha(" ".repeat(recuo) + posto, letra));
    }
  }
  return linhas;
}

function diagramarPar(
  bloco: BlocoDePar,
  colunas: number,
  tabela: TabelaDeCaracteres,
): LinhaDoCupom[] {
  const letra: Letra = {
    negrito: bloco.negrito ?? false,
    tamanho: bloco.tamanho ?? "normal",
  };
  const cabe = capacidade(colunas, letra.tamanho);
  const recuo = recuoValido(bloco.recuo, cabe);
  const margem = " ".repeat(recuo);
  const util = cabe - recuo;
  const esquerda = normalizarParaImpressao(bloco.esquerda, tabela);
  const direita = normalizarParaImpressao(bloco.direita, tabela);

  const continuacao = Math.max(1, util - RECUO_DA_CONTINUACAO);
  const recuoDaContinuacao = " ".repeat(util - continuacao);

  // Valor à direita em quantas linhas precisar, sempre encostado na margem.
  const valorSozinho = () =>
    quebrarEmLinhas(direita, util).map((pedaco) =>
      linha(margem + alinharNaLinha(pedaco, util, "direita"), letra),
    );

  if (direita === "") {
    return quebrarEmLinhas(esquerda, util).map((pedaco) =>
      linha(margem + pedaco, letra),
    );
  }
  if (esquerda === "") return valorSozinho();

  const aoLadoDoValor = util - larguraNoPapel(direita) - 1;
  const primeiraPalavra = esquerda.split(" ")[0] ?? "";
  if (aoLadoDoValor >= 1 && larguraNoPapel(primeiraPalavra) <= aoLadoDoValor) {
    const [primeira = "", ...demais] = quebrarEmLinhas(
      esquerda,
      aoLadoDoValor,
      continuacao,
    );
    return [
      linha(margem + juntarNaLinha(primeira, direita, util), letra),
      ...demais.map((pedaco) =>
        linha(margem + recuoDaContinuacao + pedaco, letra),
      ),
    ];
  }

  // Nem a primeira palavra cabe ao lado do valor: o rótulo sai inteiro e o
  // valor desce para a linha de baixo, ainda na coluna da direita.
  const [primeira = "", ...demais] = quebrarEmLinhas(
    esquerda,
    util,
    continuacao,
  );
  return [
    linha(margem + primeira, letra),
    ...demais.map((pedaco) =>
      linha(margem + recuoDaContinuacao + pedaco, letra),
    ),
    ...valorSozinho(),
  ];
}

const NORMAL: Letra = { negrito: false, tamanho: "normal" };

/**
 * Diagrama o cupom para um perfil: colunas e tabela de caracteres.
 *
 * É daqui que as duas saídas partem (navegador e impressora) — e nenhuma delas
 * mede, quebra ou alinha texto por conta própria. Se a medida morasse em cada
 * saída, a coluna de valores de uma poderia andar uma casa em relação à da
 * outra, e o "mesmo cupom" deixaria de ser o mesmo.
 */
export function diagramarCupom(
  cupom: CupomImpresso,
  perfil: PerfilDeDiagramacao = {},
): LinhaDoCupom[] {
  const colunas = perfil.colunas ?? cupom.papel.colunas;
  const tabela = perfil.tabela ?? TABELA_PADRAO;
  if (!Number.isSafeInteger(colunas) || colunas < 8) {
    throw new ErroDoCupom(
      `colunas insuficientes para um cupom: ${String(colunas)}`,
    );
  }

  const linhas: LinhaDoCupom[] = [];
  for (const bloco of cupom.blocos) {
    switch (bloco.tipo) {
      case "texto":
        linhas.push(...diagramarTexto(bloco, colunas, tabela));
        break;
      case "par":
        linhas.push(...diagramarPar(bloco, colunas, tabela));
        break;
      case "separador":
        linhas.push(linha(bloco.caractere.repeat(colunas), NORMAL));
        break;
      case "espaco":
        for (let i = 0; i < bloco.linhas; i += 1)
          linhas.push(linha("", NORMAL));
        break;
      case "corte":
        linhas.push({ tipo: "corte" });
        break;
    }
  }
  return linhas;
}
