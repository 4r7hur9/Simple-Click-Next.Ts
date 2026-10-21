import type { Metadata } from "next";

import { TelaDeComentarios } from "../../../../features/comentarios/TelaDeComentarios.tsx";
import { permissoesDaLoja } from "../../../../lib/permissoes.ts";
import { exigirLojaDaPagina } from "../../../../server/loja-da-pagina.ts";

export const metadata: Metadata = { title: "Comentários | SimpleClick" };

export default async function PaginaDosComentarios() {
  const { loja } = await exigirLojaDaPagina();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria)]">
        Operação
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
        Comentários
      </h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-[var(--cor-tinta-suave)]">
        O que os clientes escrevem nos seus produtos e na sua loja em Explorar.
        Nada aparece para os outros antes de você aprovar.
      </p>
      <TelaDeComentarios
        // Ligar a aprovação automática é do dono (configurações da loja).
        podeConfigurar={permissoesDaLoja(loja).has("configuracoes")}
      />
    </main>
  );
}
