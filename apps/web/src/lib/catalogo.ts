/**
 * O vocabulário do catálogo na tela.
 *
 * MORA EM `lib` POR CAUSA DA TABELA DE FRONTEIRAS. Quem MONTA estes valores é
 * `src/server/catalogo-na-tela.ts`, que pode alcançar `packages/core` e por
 * isso é quem escreve preço; quem os DESENHA é `src/features/vitrine/`, que
 * não pode alcançar o servidor. As duas camadas alcançam `web-lib`, e é por
 * isso que a forma é declarada aqui uma vez só.
 *
 * A alternativa seria cada lado declarar a sua cópia, como a apresentação da
 * loja faz — o que funciona enquanto as duas forem iguais e falha em silêncio
 * no dia em que uma ganhar um campo. Aqui um campo novo aparece nos dois lados
 * ou não compila.
 */

/** Um produto, como o cartão da vitrine o mostra. */
export interface ProdutoNaTela {
  readonly id: string;
  readonly apelido: string;
  readonly nome: string;
  readonly chamada: string | null;
  /** Já escrito como dinheiro. Nulo quando o preço depende de variação. */
  readonly preco: string | null;
  /** O preço "de", quando há promoção. */
  readonly precoAnterior: string | null;
  readonly imagem: string | null;
  readonly disponivel: boolean;
  /** Para onde o cartão leva. */
  readonly link: string;
}

/** Uma seção da vitrine, na ordem que o dono definiu. */
export interface SecaoNaTela {
  readonly id: string;
  readonly apelido: string;
  readonly nome: string;
  readonly produtos: readonly ProdutoNaTela[];
}

/** Uma aba do filtro de categoria. */
export interface AbaDeCategoria {
  readonly nome: string;
  readonly link: string;
  /** A aba escolhida agora. É ela que recebe `aria-current` na tela. */
  readonly emVigor: boolean;
}

/** O catálogo inteiro, pronto para desenhar. */
export interface CatalogoNaTela {
  /** Já filtradas: quando há categoria escolhida, vem só ela. */
  readonly secoes: readonly SecaoNaTela[];
  readonly destaques: readonly ProdutoNaTela[];
  readonly abas: readonly AbaDeCategoria[];
  /** O nome da categoria escolhida, para a tela dizer qual filtro está valendo. */
  readonly filtroEmVigor: string | null;
  /** Para onde vai quem quer ver tudo de novo. */
  readonly linkDeTodas: string;
  /** A loja não publicou produto nenhum — que é diferente de filtro sem acerto. */
  readonly lojaSemCatalogo: boolean;
  /** A categoria pedida no endereço não existe nesta loja. */
  readonly filtroSemAcerto: boolean;
}

/** O nome do parâmetro no endereço. É o que a pessoa lê na barra do navegador. */
export const PARAMETRO_DA_CATEGORIA = "categoria";

/** O rótulo da aba que desfaz o filtro. */
export const ROTULO_DE_TODAS = "Todas";
