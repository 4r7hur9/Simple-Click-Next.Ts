/**
 * Página inicial do esqueleto: existe para provar que o site sobe e responde
 * no endereço local (AC-001). A vitrine de verdade mora em `(loja)/l/[slug]`.
 */
export default function PaginaInicial() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-3 p-6">
      <h1 className="text-2xl font-semibold">SimpleClick</h1>
      <p>Ambiente no ar. Nenhuma loja publicada ainda.</p>
    </main>
  );
}
