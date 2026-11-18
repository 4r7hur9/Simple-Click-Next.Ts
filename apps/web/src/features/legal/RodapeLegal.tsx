"use client";

import "@simpleclick/ui/styles/legal.css";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BotaoPreferenciasDeCookies } from "./BotaoPreferenciasDeCookies.tsx";
import { caminhoSemBarra } from "../../lib/quem-esta-logado.ts";
import { ROTAS_LEGAIS } from "./contato.ts";

/** As colunas do rodapé: só páginas que existem no aplicativo. */
const COLUNAS = [
  {
    id: "explorar",
    titulo: "Explorar",
    itens: [
      { rotulo: "Início", href: "/explorar/produtos" },
      { rotulo: "Lojas", href: "/explorar/lojas" },
      { rotulo: "Favoritos", href: "/conta/favoritos" },
      { rotulo: "Pedidos", href: "/conta/pedidos" },
    ],
  },
  {
    id: "conta",
    titulo: "Sua conta",
    itens: [
      { rotulo: "Entrar", href: "/entrar" },
      { rotulo: "Criar conta", href: "/cadastrar" },
      { rotulo: "Seus dados", href: "/conta/dados" },
    ],
  },
] as const;

/**
 * Rodapé comum do cliente, usado na loja, no explorar e na conta (a página
 * inicial e as páginas legais têm o rodapé da marca). O link "Preferências de
 * cookies" reabre o aviso.
 *
 * Card #128: as colunas do Stitch (marca, Explorar, Sua conta, Para lojistas)
 * e a linha de baixo com os links legais. Continua só com o que existe
 * (Q-10506): nada de cupom, carteira, fidelidade, central de ajuda, "Entrega
 * Flash", "Suporte 24h", CNPJ nem razão social de exemplo. Segue o tema da
 * página (claro ou escuro) pelos tokens.
 */
export function RodapeLegal() {
  const caminho = usePathname();
  // A TV da loja é tela cheia de cardápio: sem rodapé (a mesma regra do topo
  // e da barra inferior).
  if (caminhoSemBarra(caminho)) return null;
  return (
    <footer className="sc-rodape-legal">
      <div className="sc-rodape-legal__colunas">
        <div className="sc-rodape-legal__marca-bloco">
          <p className="sc-rodape-legal__logo" aria-hidden="true">
            Simple<span>Click</span>
          </p>
          <p className="sc-rodape-legal__sobre">
            Lojas do seu bairro num lugar só. Você vê o preço que a loja
            publicou e pede direto para quem vende.
          </p>
        </div>
        {COLUNAS.map((coluna) => (
          <nav
            key={coluna.id}
            className="sc-rodape-legal__coluna"
            aria-labelledby={`sc-rodape-${coluna.id}`}
          >
            <h2
              id={`sc-rodape-${coluna.id}`}
              className="sc-rodape-legal__titulo"
            >
              {coluna.titulo}
            </h2>
            <ul>
              {coluna.itens.map((item) => (
                <li key={item.href}>
                  <Link className="sc-rodape-legal__link" href={item.href}>
                    {item.rotulo}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <div className="sc-rodape-legal__coluna">
          <h2 className="sc-rodape-legal__titulo">Para lojistas</h2>
          <p className="sc-rodape-legal__sobre">
            Monte a loja do seu negócio e venda para o bairro.
          </p>
          <Link className="sc-rodape-legal__convite" href="/vender">
            Conhecer o SimpleClick para lojas
          </Link>
        </div>
      </div>
      <div className="sc-rodape-legal__base">
        <p className="sc-rodape-legal__marca">© SimpleClick</p>
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
      </div>
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
