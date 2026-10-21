"use client";

import "@simpleclick/ui/styles/legal.css";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BotaoPreferenciasDeCookies } from "./BotaoPreferenciasDeCookies.tsx";
import { ROTAS_LEGAIS } from "./contato.ts";

/**
 * Rodapé comum com os links legais, usado na loja, no explorar, na página
 * inicial e na conta. O link "Preferências de cookies" reabre o aviso.
 */
export function RodapeLegal() {
  const caminho = usePathname();
  // A TV da loja é tela cheia de cardápio: sem rodapé.
  if (caminho !== null && /\/tv\/?$/.test(caminho)) return null;
  return (
    <footer className="sc-rodape-legal" data-tema="escuro">
      <nav className="sc-rodape-legal__nav" aria-label="Informações legais">
        <ul>
          {ROTAS_LEGAIS.map((item) => (
            <li key={item.rota}>
              <Link className="sc-rodape-legal__link" href={item.rota}>
                {item.rotulo}
              </Link>
            </li>
          ))}
          <li>
            <BotaoPreferenciasDeCookies />
          </li>
        </ul>
      </nav>
      <p className="sc-rodape-legal__marca">© SimpleClick</p>
    </footer>
  );
}

/** Frase das telas de entrar e cadastrar (o registro do aceite é de outro card). */
export function AoContinuarVoceConcorda() {
  return (
    <p className="sc-conta__legal">
      Ao continuar você concorda com os{" "}
      <Link href="/termos-de-uso">Termos de Uso</Link> e a{" "}
      <Link href="/politica-de-privacidade">Política de Privacidade</Link>.
    </p>
  );
}
