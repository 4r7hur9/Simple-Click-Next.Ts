/**
 * A composição do detalhe por ramo (AC-10905 a AC-10907).
 *
 * A loja entrega `blocos.detalheProduto`: nomes de bloco na ordem que o ramo
 * quer. Cada nome liga a um dado que a tela JÁ tem:
 *
 * - `foto`, `fotos`: a galeria;
 * - `descricao`: a descrição;
 * - `variacoes`, `grade`, `volume`: os eixos e a lista de variações;
 * - `ingredientes`: grupos `INGREDIENT`;
 * - `adicionais`, `acompanhamentos`, `complementos`: grupos `ADDON`;
 * - `especificacoes`: grupos `SPEC`.
 *
 * Bloco sem dado não aparece (`tabela_medidas` e `garantia` ainda não têm
 * cadastro). Nome desconhecido é ignorado, e `aplicacao` e `compatibilidade`
 * nunca são desenhados (P-104). A lista só ORDENA: a descrição e todos os
 * grupos de escolha continuam na tela mesmo que o ramo não os cite, porque
 * esconder um grupo obrigatório tornaria o produto impossível de comprar.
 */
import type { GrupoNaTela, ProdutoNaTela } from "../../lib/produto.ts";

const BLOCOS_DE_VARIACAO = ["variacoes", "grade", "volume"] as const;

const TIPO_POR_BLOCO: Readonly<Record<string, string>> = {
  ingredientes: "INGREDIENT",
  adicionais: "ADDON",
  acompanhamentos: "ADDON",
  complementos: "ADDON",
  especificacoes: "SPEC",
};

/** Os nomes de bloco que a tela sabe desenhar, na ordem do ramo, com dado. */
export function blocosDoDetalhe(
  lista: readonly string[] | undefined,
  produto: Pick<
    ProdutoNaTela,
    "descricao" | "grupos" | "variacoes" | "imagens" | "midias"
  >,
): readonly string[] {
  const temFoto =
    produto.imagens.length > 0 || (produto.midias?.length ?? 0) > 0;
  return (lista ?? []).filter((nome) => {
    if (nome === "foto" || nome === "fotos") return temFoto;
    if (nome === "descricao") return Boolean(produto.descricao);
    if ((BLOCOS_DE_VARIACAO as readonly string[]).includes(nome)) {
      return produto.variacoes.length > 0;
    }
    const tipo = TIPO_POR_BLOCO[nome];
    if (tipo !== undefined) {
      return produto.grupos.some(
        (grupo) => !grupo.eixoDeVariacao && grupo.tipo === tipo,
      );
    }
    return false; // desconhecido, aplicacao, compatibilidade, tabela_medidas…
  });
}

/** Uma parte do formulário de escolhas, na ordem em que aparece. */
export type SecaoDeEscolha =
  | { readonly tipo: "lista"; readonly chave: string }
  | {
      readonly tipo: "eixo";
      readonly chave: string;
      readonly grupo: GrupoNaTela;
    }
  | {
      readonly tipo: "grupo";
      readonly chave: string;
      readonly grupo: GrupoNaTela;
    };

/**
 * Ordena eixos, lista simples de variações e grupos comuns pela lista do ramo.
 *
 * Sem bloco de variação na lista, as variações vêm primeiro (como sempre
 * vieram). Grupo cujo tipo o ramo não cita vai ao fim, na ordem original. A
 * ordenação é estável.
 */
export function secoesDeEscolha(
  lista: readonly string[] | undefined,
  eixos: readonly GrupoNaTela[],
  gruposComuns: readonly GrupoNaTela[],
  temListaSimples: boolean,
): readonly SecaoDeEscolha[] {
  const nomes = lista ?? [];
  const posicaoDe = (candidatos: readonly string[]): number => {
    const indice = nomes.findIndex((nome) => candidatos.includes(nome));
    return indice === -1 ? Number.POSITIVE_INFINITY : indice;
  };

  const posicaoDaVariacao = posicaoDe(BLOCOS_DE_VARIACAO);
  // Variação sem bloco no ramo vem antes de tudo.
  const rankVariacao = Number.isFinite(posicaoDaVariacao)
    ? posicaoDaVariacao
    : -1;

  const itens: { secao: SecaoDeEscolha; rank: number }[] = [];
  if (temListaSimples) {
    itens.push({
      secao: { tipo: "lista", chave: "lista-de-variacoes" },
      rank: rankVariacao,
    });
  }
  for (const eixo of eixos) {
    itens.push({
      secao: { tipo: "eixo", chave: eixo.id, grupo: eixo },
      rank: rankVariacao,
    });
  }
  for (const grupo of gruposComuns) {
    const blocos = Object.entries(TIPO_POR_BLOCO)
      .filter(([, tipo]) => tipo === grupo.tipo)
      .map(([nome]) => nome);
    itens.push({
      secao: { tipo: "grupo", chave: grupo.id, grupo },
      rank: posicaoDe(blocos),
    });
  }

  return itens
    .map((item, ordem) => ({ ...item, ordem }))
    .sort((a, b) =>
      a.rank === b.rank ? a.ordem - b.ordem : a.rank < b.rank ? -1 : 1,
    )
    .map((item) => item.secao);
}
