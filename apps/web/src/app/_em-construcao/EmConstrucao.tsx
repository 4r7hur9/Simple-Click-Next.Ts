import type { ReactNode } from "react";

/**
 * A tela de uma rota que já existe no mapa do site, mas cujo conteúdo ainda
 * está sendo construído. Mantém o endereço estável (link, menu e teste podem
 * apontar para ele hoje) sem fingir que há funcionalidade.
 */
export function EmConstrucao({
  titulo,
  descricao,
  acao,
}: Readonly<{
  titulo: string;
  descricao: string;
  acao?: ReactNode;
}>) {
  return (
    <main className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-start justify-center gap-4 px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria)]">
        Em construção
      </p>
      <h1 className="text-4xl font-semibold tracking-[-0.04em]">{titulo}</h1>
      <p className="text-lg leading-8 text-[var(--cor-tinta-suave)]">
        {descricao}
      </p>
      {acao}
    </main>
  );
}
