/**
 * As seções da conta (card #111, AC-11122): a lista de onde ir dentro de
 * `/conta`, com a atual marcada e anunciada como página atual.
 *
 * Componente de servidor, sem `usePathname`: quem monta (`PaginaDaConta`) já
 * sabe qual página é. No celular, em `/conta` (`atual="inicio"`) a lista vira a
 * página inicial das seções ("Perfil" da barra inferior); nas outras páginas
 * ela é uma faixa que rola de lado. No computador é uma coluna ao lado do
 * conteúdo. Os links saem no HTML do servidor.
 */
import Link from "next/link";

import type { PaginaDaMinhaConta } from "./PaginaDaConta.tsx";

export const SECOES_DA_CONTA: readonly {
  readonly id: PaginaDaMinhaConta;
  readonly rotulo: string;
  readonly href: string;
}[] = [
  { id: "inicio", rotulo: "Visão geral", href: "/conta" },
  { id: "pedidos", rotulo: "Pedidos", href: "/conta/pedidos" },
  { id: "favoritos", rotulo: "Favoritos", href: "/conta/favoritos" },
  { id: "dados", rotulo: "Dados", href: "/conta/dados" },
  { id: "enderecos", rotulo: "Endereços", href: "/conta/enderecos" },
  { id: "seguranca", rotulo: "Segurança", href: "/conta/seguranca" },
];

export function SecoesDaConta({
  atual,
}: {
  readonly atual?: PaginaDaMinhaConta | undefined;
}) {
  return (
    <nav
      className="sc-secoes-da-conta"
      aria-label="Seções da conta"
      data-hub={atual === "inicio" ? "" : undefined}
    >
      <ul className="sc-secoes-da-conta__lista">
        {SECOES_DA_CONTA.map((secao) => (
          <li key={secao.id}>
            <Link
              href={secao.href}
              className="sc-secoes-da-conta__link"
              aria-current={atual === secao.id ? "page" : undefined}
            >
              {secao.rotulo}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
