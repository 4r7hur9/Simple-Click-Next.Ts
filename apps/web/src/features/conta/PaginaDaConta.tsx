import type { ReactNode } from "react";

export interface PaginaDaContaProps {
  readonly titulo: string;
  readonly descricao: ReactNode;
  readonly children: ReactNode;
}

/**
 * A moldura das páginas da conta do cliente: o conteúdo com o `h1`, numa
 * coluna só (card #151: a sidebar da conta saiu; Dados, Endereços e Segurança
 * estão no modal "Minha conta", aberto pelo topo). Só arruma — cada página
 * continua sendo dona do que busca e de quem pode vê-la. O topo e a barra
 * inferior são do #105 (`NavegacaoDaSessao`).
 */
export function PaginaDaConta({ titulo, descricao, children }: PaginaDaContaProps) {
  return (
    <main className="sc-minha-conta">
      <div className="sc-minha-conta__miolo">
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
