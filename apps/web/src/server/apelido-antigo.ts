/**
 * O link antigo da loja leva ao endereço novo (AC-208).
 *
 * O proxy chama `redirecionarApelidoAntigo` antes de reescrever qualquer
 * caminho: se o apelido do endereço é o ANTIGO de uma loja no ar, a pessoa é
 * mandada ao mesmo lugar no endereço novo — `/loja/pastel-da-joi/produto/1`
 * vira `/loja/pastelaria-joi/produto/1`, com a mesma consulta.
 *
 * REDIRECIONAMENTO TEMPORÁRIO (307), e não permanente, de propósito: o
 * navegador guarda o permanente para sempre, e se a administração um dia
 * devolver a loja ao apelido antigo, quem já tinha guardado o redirecionamento
 * entraria num laço entre os dois endereços.
 *
 * NÃO AUTORIZA NADA e não trava a loja: qualquer falha ao perguntar à API vira
 * "segue como veio" — no pior caso a pessoa vê a página de loja indisponível,
 * que é o que ela veria sem este passo.
 */

import { NextResponse, type NextRequest } from "next/server";

import {
  apelidoDoCaminho,
  caminhoComApelidoNovo,
  LembrancaDeApelidos,
} from "../lib/apelido-antigo.ts";
import { enderecoDaApi, ESPERA_MAXIMA_EM_MS } from "./api-client.ts";

/** Pergunta à API qual é o apelido atual da loja que usava este. */
export type ConsultaDoApelidoAtual = (
  apelido: string,
) => Promise<string | null | undefined>;

/**
 * A pergunta de verdade. `null` quando a API diz que não é antigo de loja no
 * ar; `undefined` quando não deu para saber (rede, API fora) — e aí nada é
 * lembrado, para a próxima requisição tentar de novo.
 */
export async function buscarApelidoAtual(
  apelido: string,
  buscar: typeof fetch = fetch,
): Promise<string | null | undefined> {
  try {
    const resposta = await buscar(
      `${enderecoDaApi()}/v1/vitrine/${encodeURIComponent(apelido)}/endereco-atual`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(ESPERA_MAXIMA_EM_MS),
        headers: { accept: "application/json" },
      },
    );
    if (resposta.status === 404) return null;
    if (!resposta.ok) return undefined;
    const corpo = (await resposta.json()) as { apelido?: unknown };
    return typeof corpo.apelido === "string" ? corpo.apelido : undefined;
  } catch {
    return undefined;
  }
}

const LEMBRANCA = new LembrancaDeApelidos();

/**
 * O redirecionamento para o endereço novo, ou `null` para seguir como veio.
 *
 * `consultar` e `lembranca` entram por parâmetro para a prova responder sem
 * rede e sem depender do que outra prova deixou lembrado.
 */
export async function redirecionarApelidoAntigo(
  requisicao: NextRequest,
  consultar: ConsultaDoApelidoAtual = buscarApelidoAtual,
  lembranca: LembrancaDeApelidos = LEMBRANCA,
  agora: () => number = Date.now,
): Promise<NextResponse | null> {
  const destino = requisicao.nextUrl.clone();
  if (destino.pathname.startsWith("/api/")) return null;

  const apelido = apelidoDoCaminho(destino.pathname);
  if (apelido === null) return null;

  let atual = lembranca.consultar(apelido, agora());
  if (atual === undefined) {
    atual = await consultar(apelido);
    if (atual === undefined) return null;
    lembranca.lembrar(apelido, atual, agora());
  }
  if (atual === null || atual === apelido) return null;

  destino.pathname = caminhoComApelidoNovo(destino.pathname, apelido, atual);
  return NextResponse.redirect(destino, 307);
}
