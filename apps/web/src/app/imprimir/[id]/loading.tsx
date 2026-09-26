import { Carregando } from "@simpleclick/ui";

import "./cupom.css";

/**
 * Enquanto a API emite a via e devolve o cupom (P-011). Esta página já depende
 * de script para abrir a janela de impressão, então a espera anunciada aqui não
 * tira nada de quem a usa — diferente da vitrine, que precisa funcionar sem
 * script e por isso não tem arquivo de espera.
 */
export default function EsperaDoCupom() {
  return (
    <main className="sc-cupom-pagina">
      <Carregando rotulo="Preparando o cupom…" />
    </main>
  );
}
