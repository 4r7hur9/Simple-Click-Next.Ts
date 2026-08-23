import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Recuperar senha | SimpleClick",
};

export default function PaginaDeRecuperacaoDeSenha() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Esqueceu sua senha?</h1>
        <p>Informe seu e-mail e enviaremos as instruções para continuar.</p>
      </div>
      <form
        action="/api/auth/recuperar-senha"
        method="post"
        className="space-y-4"
      >
        <label className="block space-y-1" htmlFor="email">
          <span>E-mail</span>
          <input
            required
            autoComplete="email"
            className="w-full rounded border p-3"
            id="email"
            name="email"
            type="email"
          />
        </label>
        <button
          className="w-full rounded bg-black p-3 text-white"
          type="submit"
        >
          Enviar instruções
        </button>
      </form>
    </main>
  );
}
