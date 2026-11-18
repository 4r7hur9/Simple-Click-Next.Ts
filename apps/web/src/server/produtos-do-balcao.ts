/**
 * Os produtos que o dono pode pôr no pedido manual (T-704).
 *
 * É O CATÁLOGO DA VITRINE, e de propósito: o balcão vende o que o site vende,
 * pelo preço que o site cobra. Rascunho, produto apagado e seção oculta não
 * aparecem aqui porque não aparecem lá — e a API confere de novo ao confirmar,
 * lendo o catálogo do mesmo jeito (AC-708).
 *
 * Esta primeira leitura é só o catálogo leve. As escolhas e variações são
 * carregadas quando o lojista seleciona um produto.
 */
import { buscarCatalogo } from "./vitrine.ts";

/** O produto como a montagem do pedido o recebe. */
export interface ProdutoDoBalcao {
  readonly id: string;
  readonly nome: string;
  readonly precoCentavos: number | null;
  readonly imagem: string | null;
  readonly disponivel: boolean;
}

export type LeituraDoBalcao =
  | { readonly estado: "ok"; readonly produtos: readonly ProdutoDoBalcao[] }
  | { readonly estado: "indisponivel"; readonly motivo: string };

/**
 * Quanto o balcão espera cada resposta da API.
 *
 * A espera maior que a da vitrine mantém a lista disponível quando a API está
 * iniciando ou ocupada. O detalhe tem sua própria indicação de carregamento.
 */
export const ESPERA_DO_BALCAO_EM_MS = 8_000;

/**
 * Lê só o catálogo leve. O detalhe de cada produto é carregado sob demanda.
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
      // Substitui a espera padrão da vitrine para o catálogo do balcão.
      signal: AbortSignal.timeout(ESPERA_DO_BALCAO_EM_MS),
    } as RequestInit)) as typeof fetch;
  const catalogo = await buscarCatalogo(apelidoDaLoja, {}, buscar);
  if (catalogo.estado === "nao-encontrada") {
    return { estado: "indisponivel", motivo: "a loja não foi encontrada" };
  }
  if (catalogo.estado === "indisponivel") {
    return { estado: "indisponivel", motivo: catalogo.motivo };
  }

  const produtos = [
    ...new Map(
      [
        ...catalogo.catalogo.destaques,
        ...catalogo.catalogo.secoes.flatMap((secao) => secao.produtos),
      ].map((produto) => [produto.id, produto]),
    ).values(),
  ].map((produto): ProdutoDoBalcao => ({
    id: produto.id,
    nome: produto.nome,
    precoCentavos: produto.precoCentavos,
    imagem: produto.imagem,
    disponivel: produto.disponivel,
  }));
  produtos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return { estado: "ok", produtos };
}
