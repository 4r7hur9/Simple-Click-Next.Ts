import Link from "next/link";
import type { ReactNode } from "react";

import { NAVEGACAO_DA_CONFIGURACAO } from "../../../../features/config/secoes.ts";

/**
 * A moldura das configurações do dono (AC-921).
 *
 * A navegação lista a OPERAÇÃO da loja — pagamento, entrega, horário,
 * contato, apresentação e impressão —, e nada do cadastro da plataforma. Tipo
 * de negócio, apelido, documento, contrato e funcionalidades liberadas são da
 * administração, e não têm entrada aqui.
 */
export default function LayoutDaConfiguracao({
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
      <nav
        className="mt-6 flex flex-wrap gap-2"
        aria-label="Configurações da loja"
      >
        {NAVEGACAO_DA_CONFIGURACAO.map((item) => (
          <Link
            key={item.secao}
            className="sc-botao sc-botao--fantasma"
            href={item.href}
          >
            {item.rotulo}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
