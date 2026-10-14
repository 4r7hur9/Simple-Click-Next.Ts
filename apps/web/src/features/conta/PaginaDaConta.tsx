import Link from "next/link";
import type { ReactNode } from "react";

/** As páginas da conta que aparecem na navegação. */
export type PaginaDaMinhaConta = "pedidos" | "enderecos" | "seguranca";

const PAGINAS: readonly {
  readonly chave: PaginaDaMinhaConta;
  readonly href: string;
  readonly rotulo: string;
}[] = [
  {
    chave: "pedidos",
    href: "/minha-conta/pedidos",
    rotulo: "Meus pedidos",
  },
  {
    chave: "enderecos",
    href: "/minha-conta/enderecos",
    rotulo: "Meus endereços",
  },
  {
    chave: "seguranca",
    href: "/minha-conta/seguranca",
    rotulo: "Segurança",
  },
];

export interface PaginaDaContaProps {
  readonly titulo: string;
  readonly descricao: ReactNode;
  /** Página marcada na navegação; omitida, nenhuma fica marcada. */
  readonly atual?: PaginaDaMinhaConta | undefined;
  readonly children: ReactNode;
}

/**
 * A moldura das páginas da conta do cliente: a marca, a navegação entre as
 * páginas e o cabeçalho com o `h1`. Só arruma — cada página continua sendo
 * dona do que busca e de quem pode vê-la.
 */
export function PaginaDaConta({
  titulo,
  descricao,
  atual,
  children,
}: PaginaDaContaProps) {
  return (
    <main className="sc-minha-conta">
      <div className="sc-minha-conta__miolo">
        <div className="sc-minha-conta__barra">
          <Link
            className="sc-conta__marca"
            href="/"
            aria-label="SimpleClick, início"
          >
            <span className="sc-conta__marca-simbolo" aria-hidden="true">
              ✦
            </span>
            <span>simpleclick</span>
          </Link>
          <nav className="sc-minha-conta__nav" aria-label="Minha conta">
            <ul>
              {PAGINAS.map(({ chave, href, rotulo }) => (
                <li key={chave}>
                  <Link
                    href={href}
                    aria-current={chave === atual ? "page" : undefined}
                  >
                    {rotulo}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <header className="sc-minha-conta__cabecalho">
          <p className="sc-conta__etiqueta">Minha conta</p>
          <h1 className="sc-minha-conta__titulo">{titulo}</h1>
          <p className="sc-minha-conta__descricao">{descricao}</p>
        </header>

        {children}
      </div>
    </main>
  );
}
