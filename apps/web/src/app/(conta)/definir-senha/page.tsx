import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Definir nova senha | SimpleClick",
};

export default async function PaginaDeDefinicaoDeSenha({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Defina uma nova senha</h1>
        <p>Escolha uma senha forte para voltar a acessar sua conta.</p>
      </div>
      <form
        action="/api/auth/definir-senha"
        method="post"
        className="space-y-4"
      >
        <input name="token" type="hidden" value={token ?? ""} />
        <label className="block space-y-1" htmlFor="senha">
          <span>Nova senha</span>
          <input
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded border p-3"
            id="senha"
            name="senha"
            type="password"
          />
        </label>
        <label className="block space-y-1" htmlFor="confirmacao">
          <span>Confirme a nova senha</span>
          <input
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded border p-3"
            id="confirmacao"
            name="confirmacao"
            type="password"
          />
        </label>
        <button
          className="w-full rounded bg-black p-3 text-white"
          type="submit"
        >
          Salvar nova senha
        </button>
      </form>
    </main>
  );
}
