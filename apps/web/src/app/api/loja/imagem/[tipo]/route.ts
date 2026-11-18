/**
 * Envio da logo, da capa e das fotos do tema (fundo, topo, versões do celular e
 * original) da loja para a API (AC-916, AC-918).
 *
 * Encaminha os BYTES como chegaram, com o tipo declarado pelo navegador. Quem
 * decide se é imagem é a API, pela assinatura do arquivo — o tipo declarado e
 * a extensão não provam nada. O limite daqui é só uma trava contra corpo
 * gigante; o limite que o dono lê na recusa é o da API.
 */
import { enderecoDaApi } from "../../../../../server/api-client.ts";
import { sessaoParaEncaminhar } from "../../../../../server/loja-do-painel.ts";
import { recusarOrigemDeFora } from "../../../../../server/protecao-da-conta.ts";
import { renovarVitrineDaLoja } from "../../../../../server/renovar-vitrine.ts";

const TIPOS = new Set([
  "logo",
  "capa",
  "fundo",
  "fundoCelular",
  "topo",
  "topoCelular",
  "original",
]);
/** Trava do encaminhamento: acima disto nem vale a ida à API. */
const MAXIMO_ENCAMINHADO_EM_BYTES = 8 * 1024 * 1024;

export async function PUT(
  requisicao: Request,
  contexto: { params: Promise<{ tipo: string }> },
) {
  const { tipo } = await contexto.params;
  if (!TIPOS.has(tipo)) {
    return Response.json({ erro: "nao_encontrado" }, { status: 404 });
  }

  // Card #134: o corpo é a imagem crua (não JSON); só a origem é conferida.
  const recusada = recusarOrigemDeFora(requisicao);
  if (recusada !== null) return recusada;

  const sessao = await sessaoParaEncaminhar(requisicao);
  if (sessao instanceof Response) return sessao;
  const { token } = sessao;

  const bytes = await requisicao.arrayBuffer();
  if (bytes.byteLength > MAXIMO_ENCAMINHADO_EM_BYTES) {
    return Response.json({ erro: "imagem_grande_demais" }, { status: 413 });
  }

  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(sessao.apelido)}/configuracao/aparencia/imagem/${tipo}`,
    {
      method: "PUT",
      cache: "no-store",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        origin: new URL(requisicao.url).origin,
        "content-type":
          requisicao.headers.get("content-type") ?? "application/octet-stream",
      },
      body: bytes,
    },
  );

  // A vitrine esquece a versão de antes: a imagem nova aparece ao recarregar.
  if (resposta.ok) renovarVitrineDaLoja(sessao.apelido);

  return new Response(await resposta.text(), {
    status: resposta.status,
    headers: {
      "cache-control": "no-store",
      "content-type":
        resposta.headers.get("content-type") ?? "application/json",
    },
  });
}
