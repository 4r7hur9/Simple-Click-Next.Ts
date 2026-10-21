import type { ReactNode } from "react";

/** As páginas da conta; a lateral do usuário marca a atual sozinha. */
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
  /** Qual página é (a navegação vive na lateral do usuário). */
  readonly atual?: PaginaDaMinhaConta | undefined;
  readonly children: ReactNode;
}

/**
 * A moldura das páginas da conta do cliente: o cabeçalho com o `h1`. Só arruma — cada página continua sendo
 * dona do que busca e de quem pode vê-la. O menu da conta é só a lateral do
 * usuário: aqui não há barra de abas nem logo repetidos.
 */
export function PaginaDaConta({
  titulo,
  descricao,
  children,
}: PaginaDaContaProps) {
  return (
    <main className="sc-minha-conta">
      <div className="sc-minha-conta__miolo">
        <header className="sc-minha-conta__cabecalho">
          <h1 className="sc-minha-conta__titulo">{titulo}</h1>
          <p className="sc-minha-conta__descricao">{descricao}</p>
        </header>

        {children}
      </div>
    </main>
  );
}
