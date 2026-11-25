import type { ReactNode } from "react";
import { SeloDaAdministracao } from "@simpleclick/ui";

interface PropriedadesDaCascaDaAdministracao {
  readonly children: ReactNode;
  readonly titulo: string;
  readonly descricao: string;
  readonly identificadorDoTitulo: string;
}

/**
 * Moldura das telas de entrada da administração (card #11).
 *
 * Sempre escura (`data-tema="escuro"`, de propósito: é a entrada, não o
 * painel da administração, que segue o tema da pessoa) e sóbria: um cartão
 * só, em vidro líquido, com o selo "Administração SimpleClick". Sem a
 * conversa de "uma conta só para tudo", sem cadastro e sem "Quero vender".
 * O título da tela é o `h1`.
 */
export function CascaDaAdministracao({
  children,
  titulo,
  descricao,
  identificadorDoTitulo,
}: PropriedadesDaCascaDaAdministracao) {
  return (
    <main className="sc-entrada-admin" data-tema="escuro">
      <section
        className="sc-entrada-admin__cartao sc-vidro sc-vidro--forte"
        aria-labelledby={identificadorDoTitulo}
      >
        <header className="sc-entrada-admin__cabecalho">
          <SeloDaAdministracao />
          <h1 id={identificadorDoTitulo} className="sc-entrada-admin__titulo">
            {titulo}
          </h1>
          <p className="sc-entrada-admin__descricao">{descricao}</p>
        </header>
        {children}
      </section>
    </main>
  );
}
