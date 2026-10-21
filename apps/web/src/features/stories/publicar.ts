/**
 * O envio do Story (card #84): link do botão e consulta da rota
 * `POST /api/loja/midia/stories` (o corpo é o arquivo cru).
 *
 * O Story só aceita UM link, um caminho do próprio site. Sem produto marcado o
 * botão leva à loja; com produto marcado (etiqueta de produto) leva à página
 * do produto. O produto marcado também fica como etiqueta na imagem.
 */
import type { ProdutoMarcado } from "./documento.ts";

export const MAXIMO_DA_LEGENDA = 200;

export type DestinoDoBotao = "loja" | "produto" | "nenhum";

export function caminhoDaLoja(apelido: string): string {
  return `/loja/${encodeURIComponent(apelido)}`;
}

export function caminhoDoProduto(apelido: string, produtoId: string): string {
  return `${caminhoDaLoja(apelido)}/produto/${encodeURIComponent(produtoId)}`;
}

export function linkDoStory(
  apelido: string,
  destino: DestinoDoBotao,
  produto: ProdutoMarcado | null,
): string | null {
  if (destino === "produto" && produto !== null) {
    return caminhoDoProduto(apelido, produto.id);
  }
  if (destino === "loja") return caminhoDaLoja(apelido);
  return null;
}

export interface DadosDoEnvio {
  readonly legenda: string;
  readonly link: string | null;
  readonly duracaoSegundos: number | null;
}

export function enderecoDoEnvio(dados: DadosDoEnvio): string {
  const consulta = new URLSearchParams();
  if (dados.legenda.trim() !== "") consulta.set("legenda", dados.legenda.trim());
  if (dados.link !== null) consulta.set("link", dados.link);
  if (dados.duracaoSegundos !== null) {
    consulta.set(
      "duracaoSegundos",
      String(Math.round(dados.duracaoSegundos * 10) / 10),
    );
  }
  const texto = consulta.toString();
  return `/api/loja/midia/stories${texto === "" ? "" : `?${texto}`}`;
}

/** O nome do arquivo não importa para a API; serve só para o `File`. */
export function nomeDoArquivo(tipo: string): string {
  if (tipo.includes("webp")) return "story.webp";
  if (tipo.includes("jpeg")) return "story.jpg";
  if (tipo.includes("mp4")) return "story.mp4";
  if (tipo.includes("webm")) return "story.webm";
  return "story";
}
