// Moldura comum a cada seção da vitrine do design system: título ligado por
// aria-labelledby, para o axe e o leitor de tela acharem cada bloco (AC-016).
import type { ReactNode } from "react";

/** Seção com título e descrição; o `id` nomeia a região para a árvore de acessibilidade. */
export function Secao({
  id,
  titulo,
  descricao,
  children,
}: {
  id: string;
  titulo: string;
  descricao: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold" id={id}>
          {titulo}
        </h2>
        <p className="text-sm">{descricao}</p>
      </div>
      {children}
    </section>
  );
}
