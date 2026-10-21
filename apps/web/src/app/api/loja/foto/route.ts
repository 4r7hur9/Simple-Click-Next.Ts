/**
 * Entrega ao painel os BYTES de uma foto da própria loja (card #36), para o
 * dono reabrir "Ajustar a foto" no navegador.
 *
 * Por que passar pelo site: a janela de recorte desenha a foto num `canvas`, e
 * o navegador só deixa se a foto vier da mesma origem (ou com CORS liberado). O
 * site busca a imagem no servidor e a devolve do próprio endereço.
 *
 * É uma porta estreita, de propósito: só atende dono logado e só busca onde a
 * loja guarda as fotos — a pasta pública do próprio site, o armazenamento da
 * API (disco local em desenvolvimento) e o Cloudinary. Qualquer outro endereço
 * é recusado, para a rota nunca servir de ponte para a rede interna.
 */
import { enderecoPermitido } from "../../../../lib/endereco-de-foto-permitido.ts";
import { enderecoDaApi } from "../../../../server/api-client.ts";
import { sessaoParaEncaminhar } from "../../../../server/loja-do-painel.ts";

/** Foto original de até 6 MB; folga para um recorte já pronto. */
const MAXIMO_EM_BYTES = 8 * 1024 * 1024;

export async function GET(requisicao: Request) {
  const sessao = await sessaoParaEncaminhar(requisicao);
  if (sessao instanceof Response) return sessao;

  const pedido = new URL(requisicao.url).searchParams.get("u") ?? "";
  const origemDaApi = new URL(enderecoDaApi()).origin;
  const alvo = enderecoPermitido(
    pedido,
    new URL(requisicao.url).origin,
    origemDaApi,
  );
  if (alvo === null) {
    return Response.json({ erro: "endereco_nao_permitido" }, { status: 400 });
  }

  const resposta = await fetch(alvo, { cache: "no-store" }).catch(() => null);
  if (resposta === null || !resposta.ok) {
    return Response.json({ erro: "foto_indisponivel" }, { status: 502 });
  }
  const tipo = resposta.headers.get("content-type") ?? "";
  if (!tipo.startsWith("image/")) {
    return Response.json({ erro: "nao_e_imagem" }, { status: 415 });
  }
  const bytes = await resposta.arrayBuffer();
  if (bytes.byteLength > MAXIMO_EM_BYTES) {
    return Response.json({ erro: "foto_grande_demais" }, { status: 413 });
  }
  return new Response(bytes, {
    headers: { "content-type": tipo, "cache-control": "private, no-store" },
  });
}
