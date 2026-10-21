import Link from "next/link";
import type { ReactNode } from "react";

import { NavegacaoDaConfiguracao } from "../config/NavegacaoDaConfiguracao.tsx";

/**
 * A moldura das configurações do dono (AC-921).
 *
 * A navegação lista a OPERAÇÃO da loja — pagamento, entrega, horário,
 * contato, apresentação e impressão —, e nada do cadastro da plataforma. Tipo
 * de negócio, apelido, documento, contrato e funcionalidades liberadas são da
 * administração, e não têm entrada aqui. A seção cuja funcionalidade a
 * administração desligou para a loja some da navegação (AC-212).
 */
export function MolduraDaConfiguracao({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        className="text-sm font-medium text-[var(--cor-primaria)]"
        href="/painel"
      >
        ← Voltar ao painel
      </Link>
      <NavegacaoDaConfiguracao />
      {children}
    </div>
  );
}
