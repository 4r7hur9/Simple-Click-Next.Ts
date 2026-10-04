/**
 * Os produtos que o dono pode pôr no pedido manual (T-704).
 *
 * É O CATÁLOGO DA VITRINE, e de propósito: o balcão vende o que o site vende,
 * pelo preço que o site cobra. Rascunho, produto apagado e seção oculta não
 * aparecem aqui porque não aparecem lá — e a API confere de novo ao confirmar,
 * lendo o catálogo do mesmo jeito (AC-708).
 *
 * Cada produto vem com os grupos e as variações da página do produto, que é o
 * que a montagem precisa para dizer "falta escolher o molho" antes de o dono
 * tocar em confirmar.
 */
import type { GrupoNaTela, VariacaoNaTela } from "../lib/produto.ts";
import { buscarProduto } from "./produto.ts";
import { buscarCatalogo } from "./vitrine.ts";

/** O produto como a montagem do pedido o recebe. */
export interface ProdutoDoBalcao {
  readonly id: string;
  readonly nome: string;
  readonly precoCentavos: number | null;
  readonly disponivel: boolean;
  readonly grupos: readonly GrupoNaTela[];
  readonly variacoes: readonly VariacaoNaTela[];
}

export type LeituraDoBalcao =
  | { readonly estado: "ok"; readonly produtos: readonly ProdutoDoBalcao[] }
  | { readonly estado: "indisponivel"; readonly motivo: string };

/**
 * Quanto o balcão espera cada resposta da API.
 *
 * MAIS QUE A VITRINE, e de propósito. A vitrine desiste em dois segundos
 * (`api-client.ts`) porque tem cópia guardada e o cliente pode voltar depois.
 * O balcão não guarda nada, pede o catálogo e o detalhe de TODOS os produtos de
 * uma vez, e o dono está com o cliente no telefone: esperar uns segundos a mais
 * é melhor que a tela de erro. Com dois segundos, um servidor recém-iniciado ou
 * ocupado com outra tela derrubava o catálogo inteiro — e um detalhe que
 * passasse do prazo sumia da lista calado.
 */
export const ESPERA_DO_BALCAO_EM_MS = 8_000;

/**
 * Lê o catálogo da loja e o detalhe de cada produto dele.
 *
 * SEM CACHE: a vitrine pode servir a cópia de alguns segundos atrás, o balcão
 * não. O dono que acabou de cadastrar o produto novo e já quer lançá-lo no
 * pedido do telefone precisa vê-lo aqui na hora.
 */
export async function produtosDoBalcao(
  apelidoDaLoja: string,
  buscarNaRede: typeof fetch = fetch,
): Promise<LeituraDoBalcao> {
  const buscar = ((endereco: RequestInfo | URL, opcoes?: RequestInit) =>
    buscarNaRede(endereco, {
      ...opcoes,
      next: { revalidate: 0 },
      // Substitui a espera da vitrine que `buscarCatalogo` e `buscarProduto`
      // põem em cada pedido.
      signal: AbortSignal.timeout(ESPERA_DO_BALCAO_EM_MS),
    } as RequestInit)) as typeof fetch;
  const catalogo = await buscarCatalogo(apelidoDaLoja, {}, buscar);
  if (catalogo.estado === "nao-encontrada") {
    return { estado: "indisponivel", motivo: "a loja não foi encontrada" };
  }
  if (catalogo.estado === "indisponivel") {
    return { estado: "indisponivel", motivo: catalogo.motivo };
  }

  const ids = [
    ...new Set(
      [
        ...catalogo.catalogo.destaques,
        ...catalogo.catalogo.secoes.flatMap((secao) => secao.produtos),
      ].map((produto) => produto.id),
    ),
  ];

  const detalhes = await Promise.all(
    ids.map((id) => buscarProduto(id, { apelidoDaLoja, buscar })),
  );

  const produtos: ProdutoDoBalcao[] = [];
  for (const detalhe of detalhes) {
    if (detalhe.estado !== "encontrado") continue;
    const { produto } = detalhe;
    produtos.push({
      id: produto.id,
      nome: produto.nome,
      precoCentavos: produto.precoCentavos,
      disponivel: produto.disponivel,
      grupos: produto.grupos,
      variacoes: produto.variacoes,
    });
  }
  produtos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return { estado: "ok", produtos };
}
