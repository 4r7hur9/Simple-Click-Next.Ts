"use client";

/**
 * Estado "erro" que o P-011 exige. Duas regras vivem aqui:
 *
 * - a mensagem do erro não vai para a tela nem para o registro do navegador,
 *   porque texto de erro interno vaza detalhe do sistema e às vezes dado
 *   pessoal (P-009, AC-024);
 * - o que aparece é o código de referência que o Next gera, que é o que o
 *   suporte usa para achar o erro correspondente no servidor.
 */
export default function ErroDaTela({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      role="alert"
      className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-3 p-6"
    >
      <h1 className="text-2xl font-semibold">Algo deu errado</h1>
      <p>Não conseguimos carregar esta tela. Tente de novo em instantes.</p>
      {error.digest ? <p>Código de referência: {error.digest}</p> : null}
      <button type="button" onClick={reset} className="underline">
        Tentar de novo
      </button>
    </main>
  );
}
