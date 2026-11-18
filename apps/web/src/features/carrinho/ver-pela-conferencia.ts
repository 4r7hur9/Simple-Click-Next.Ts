/**
 * Como a sacola lê o carrinho: pela conferência da API, que é quem sabe nome e
 * preço de agora (P-006). Nenhuma conta de preço é feita aqui.
 *
 * DUAS CAMADAS, porque a barra e a coluna precisam de coisas diferentes:
 *
 * - `lerResumoDaSacola`: a contagem e o total, que a barra do celular mostra.
 *   Uma conferência só, sem buscar produto nenhum.
 * - `verPelaConferencia`: as linhas inteiras (variação, adicionais, foto), que
 *   só a coluna e o diálogo mostram. A conferência vem primeiro: com a sacola
 *   vazia, nada mais é chamado.
 *
 * Os produtos vêm de uma ação de servidor, uma por produto. O cache por id
 * (guardado por quem chama, num ref) evita repetir essas N ações a cada mudança
 * de quantidade.
 */
import {
  conferirCarrinho,
  verItensDoCarrinho,
} from "../../lib/carrinho-do-navegador.ts";
import { contarItensDaSacola } from "../../lib/contagem-da-sacola.ts";
import { escreverDinheiro, type ProdutoNaTela } from "../../lib/produto.ts";

import { avisoDoAtacado, faixaQueValeu } from "./atacado-na-linha.ts";
import type { CarrinhoNaTela, FotoNaLinha, ItemNaTela } from "./useCarrinho.ts";

/** Busca o produto no servidor (variação, opções com preço, descrição, foto). */
export type CarregarProduto = (id: string) => Promise<ProdutoNaTela | null>;

/** Os produtos já buscados, por id. Nulo guarda "não deu": não insiste. */
export type CacheDeProdutos = Map<string, ProdutoNaTela | null>;

/** A contagem e o total que a barra mostra. */
export interface ResumoDaSacola {
  readonly contagem: number;
  /** Já escrito ("R$ 32,00"); nulo quando a conferência não respondeu. */
  readonly total: string | null;
}

/** A descrição curta: a chamada, ou a descrição do produto. */
function descricaoCurta(produto: ProdutoNaTela | undefined): string | null {
  return produto?.chamada ?? produto?.descricao ?? null;
}

function fotoDe(produto: ProdutoNaTela | undefined): FotoNaLinha | null {
  const imagem = produto?.imagens[0];
  if (imagem === undefined) return null;
  return {
    url: imagem.url,
    texto: imagem.texto,
    largura: imagem.largura,
    altura: imagem.altura,
  };
}

/**
 * Nulo quando a API não respondeu: a tela mantém o que já mostrava.
 *
 * A contagem chega primeiro, e o total depois (é outra chamada). `aoSaberAContagem`
 * deixa a tela mostrar a contagem na hora, sem esperar a conferência.
 */
export async function lerResumoDaSacola(
  apelidoDaLoja: string,
  aoSaberAContagem?: (contagem: number) => void,
): Promise<ResumoDaSacola | null> {
  const contagem = await contarItensDaSacola(apelidoDaLoja);
  if (contagem === null) return null;
  aoSaberAContagem?.(contagem);
  if (contagem === 0) return { contagem: 0, total: null };
  const conferencia = await conferirCarrinho(apelidoDaLoja);
  return {
    contagem,
    total:
      conferencia.estado === "conferido"
        ? escreverDinheiro(conferencia.conferencia.subtotalCentavos)
        : null,
  };
}

/**
 * Lê o carrinho pela conferência e junta o que a tela mostra de cada item.
 *
 * TRÊS FONTES, CADA UMA COM O QUE SÓ ELA SABE: a conferência dá nome, preço
 * unitário, subtotal da linha e o total; o carrinho da sessão dá a variação,
 * as opções e a observação; o produto dá o NOME da variação, o acréscimo de
 * cada opção, a descrição e a foto. Se o carrinho ou o produto não
 * responderem, o item aparece com o que se tem, e o total continua o da
 * conferência.
 */
export async function verPelaConferencia(
  apelidoDaLoja: string,
  carregarProduto?: CarregarProduto,
  cache: CacheDeProdutos = new Map(),
): Promise<CarrinhoNaTela> {
  const resultado = await conferirCarrinho(apelidoDaLoja);
  if (resultado.estado !== "conferido") throw new Error(resultado.motivo);

  const { itens, subtotalCentavos } = resultado.conferencia;
  if (itens.length === 0) {
    // "VAZIA" SÓ COM A SACOLA CONFIRMANDO (card #132): se a leitura da sacola
    // guardada falhou, não dá para afirmar que ela está vazia. Dizer que está
    // faria a pessoa achar que perdeu o que montou; o erro, com "Tentar de
    // novo", é a verdade. Uma leitura a mais só neste caso, que é barato.
    const guardados = await verItensDoCarrinho(apelidoDaLoja);
    if (guardados === null) throw new Error("a sacola não respondeu");
    return {
      itens: [],
      totalDeItens: 0,
      total: escreverDinheiro(subtotalCentavos),
    };
  }

  const guardados = await verItensDoCarrinho(apelidoDaLoja);
  const doCarrinho = new Map((guardados ?? []).map((item) => [item.id, item]));

  if (carregarProduto) {
    const faltam = [
      ...new Set(
        itens.map((item) => item.produtoId).filter((id) => !cache.has(id)),
      ),
    ];
    const achados = await Promise.all(
      faltam.map((id) => carregarProduto(id).catch(() => null)),
    );
    faltam.forEach((id, indice) => cache.set(id, achados[indice] ?? null));
  }

  return {
    itens: itens.map((item): ItemNaTela => {
      const guardado = doCarrinho.get(item.itemId);
      const produto = cache.get(item.produtoId) ?? undefined;
      // A variação só vale ser dita quando o produto tem mais de uma: "Padrão"
      // ao lado do refrigerante é ruído.
      const variacao =
        produto && produto.variacoes.length > 1 && guardado?.variacaoId
          ? (produto.variacoes.find((v) => v.id === guardado.variacaoId)
              ?.nome ?? null)
          : null;
      return {
        id: item.itemId,
        nome: item.nome,
        variacao,
        quantidade: item.quantidade,
        precoUnitario: escreverDinheiro(item.precoUnitarioCentavos),
        totalDaLinha: escreverDinheiro(item.totalDaLinhaCentavos),
        // O atacado, como a conferência calculou (card #57): o varejo riscado,
        // a faixa que valeu e quantas peças faltam para a próxima.
        precoDeVarejo:
          item.varejoUnitarioCentavos === undefined ||
          item.varejoUnitarioCentavos === null
            ? null
            : escreverDinheiro(item.varejoUnitarioCentavos),
        avisoDoAtacado: avisoDoAtacado(item.atacado ?? null),
        faixaDoAtacado: faixaQueValeu(item.atacado ?? null),
        observacao: guardado?.observacao ?? null,
        descricao: descricaoCurta(produto),
        foto: fotoDe(produto),
        opcoes: (guardado?.opcoes ?? []).map((opcao) => {
          const grupo = produto?.grupos.find((g) => g.nome === opcao.grupoNome);
          const daLoja = grupo?.opcoes.find((o) => o.nome === opcao.opcaoNome);
          return {
            grupoNome: opcao.grupoNome,
            opcaoNome: opcao.opcaoNome,
            quantidade: opcao.quantidade,
            acrescimo: daLoja?.acrescimo ?? null,
          };
        }),
      };
    }),
    totalDeItens: itens.reduce((soma, item) => soma + item.quantidade, 0),
    total: escreverDinheiro(subtotalCentavos),
  };
}
