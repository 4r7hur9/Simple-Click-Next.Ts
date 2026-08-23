interface PropriedadesDaPagina {
  readonly searchParams: Promise<{ readonly estado?: string; readonly token?: string }>;
}

/** Tela para os resultados devolvidos pela rota de verificação da API. */
export default async function PaginaDeVerificacaoDeEmail({
  searchParams,
}: PropriedadesDaPagina) {
  const { estado, token } = await searchParams;
  const expirado = estado === "expirado";
  const verificado = estado === "verificado";

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-6 py-12">
      <section aria-live="polite" className="w-full rounded-lg border border-borda bg-superficie-alta p-6 shadow-sm">
        <h1 className="font-display text-2xl font-semibold">
          {verificado ? "E-mail verificado" : expirado ? "Este link expirou" : "Verificando seu e-mail"}
        </h1>
        {verificado ? (
          <p className="mt-3">Seu e-mail foi confirmado. Agora você já pode entrar na sua conta.</p>
        ) : expirado ? (
          <>
            <p className="mt-3">Por segurança, links de confirmação têm prazo. Enviaremos um novo link para o mesmo endereço.</p>
            <form action="/api/auth/verificar-email/reenviar" className="mt-6">
              <input name="token" type="hidden" value={token ?? ""} />
              <button className="rounded-button bg-marca px-4 py-2 font-medium text-white" type="submit">
                Reenviar e-mail de verificação
              </button>
            </form>
          </>
        ) : (
          <p className="mt-3">Aguarde enquanto confirmamos seu link. Se ele não for válido, solicite um novo e-mail de verificação.</p>
        )}
      </section>
    </main>
  );
}
