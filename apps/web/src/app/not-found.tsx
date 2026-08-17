import Link from "next/link";

/**
 * Estado "não encontrado" que o P-011 exige. Nunca ecoa o endereço pedido:
 * o caminho pode carregar dado de quem navegou, e a tela oferece saída em vez
 * de deixar a pessoa num beco.
 */
export default function NaoEncontrado() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-3 p-6">
      <h1 className="text-2xl font-semibold">Página não encontrada</h1>
      <p>O endereço acessado não existe ou saiu do ar.</p>
      <Link href="/" className="underline">
        Voltar para o início
      </Link>
    </main>
  );
}
