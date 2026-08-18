import { consultarIdentificacaoDaApi } from "../server/api-client";

/**
 * O sinal de vida é do momento: com pré-renderização, a página congelaria o
 * estado do dia do build e diria "no ar" com a API desligada.
 */
export const dynamic = "force-dynamic";

/**
 * Página inicial do esqueleto: existe para provar que o site sobe e responde
 * no endereço local (AC-001). A vitrine de verdade mora em `(loja)/l/[slug]`.
 *
 * Ela pergunta à API se está viva e lê a resposta pelo contrato compartilhado
 * (AC-006) — antes, o texto afirmava "ambiente no ar" sem ter conferido nada.
 */
export default async function PaginaInicial() {
  const api = await consultarIdentificacaoDaApi();

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-3 p-6">
      <h1 className="text-2xl font-semibold">SimpleClick</h1>
      <p>Nenhuma loja publicada ainda.</p>
      {api.estado === "no-ar" ? (
        <p role="status">API: {api.descricao}.</p>
      ) : (
        <p role="status">API indisponível — {api.motivo}.</p>
      )}
    </main>
  );
}
