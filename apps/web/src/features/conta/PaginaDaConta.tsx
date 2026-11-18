import type { ReactNode } from "react";

import { SecoesDaConta } from "./SecoesDaConta.tsx";

/** As páginas da conta; `SecoesDaConta` marca a atual. */
export type PaginaDaMinhaConta =
  | "inicio"
  | "pedidos"
  | "dados"
  | "enderecos"
  | "seguranca"
  | "favoritos";

export interface PaginaDaContaProps {
  readonly titulo: string;
  readonly descricao: ReactNode;
  /** Qual página é (marcada em `SecoesDaConta`). */
  readonly atual?: PaginaDaMinhaConta | undefined;
  readonly children: ReactNode;
}

/**
 * A moldura das páginas da conta do cliente: as seções da conta e o conteúdo
 * com o `h1`. Só arruma — cada página continua sendo dona do que busca e de
 * quem pode vê-la. O topo e a barra inferior são do #105 (`NavegacaoDaSessao`).
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
        <SecoesDaConta atual={atual} />
        <div className="sc-minha-conta__conteudo">
          <header className="sc-minha-conta__cabecalho">
            <h1 className="sc-minha-conta__titulo">{titulo}</h1>
            <p className="sc-minha-conta__descricao">{descricao}</p>
          </header>

          {children}
        </div>
      </div>
    </main>
  );
}
