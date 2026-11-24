/**
 * A landing da plataforma ("/").
 *
 * Componente de SERVIDOR: a página inteira chega pronta e legível sem script.
 * As ilhas interativas (a conta do aplicativo e os gráficos da seção de
 * mercado) também chegam desenhadas do servidor.
 *
 * A ORDEM É O ARGUMENTO, e UM PRODUTO conta a história: o hambúrguer da
 * Brasa Burger aparece no herói, entra na vitrine real, vira pedido, cai no
 * painel e dá lugar a uma autopeça da UniversoKar, em cenas tipo slide
 * (cenas/Cenas.tsx). Depois vêm as provas — números de mercado com fonte,
 * gráficos e a conta do aplicativo (secoes/DadosDeMercado), a comparação, o
 * preço ("Grátis. Sem comissão. Sem mensalidade."), o que vem incluído,
 * depoimentos de exemplo e dúvidas — e o convite final. Cada uma dessas é uma
 * tela do tamanho da janela, com o seu botão, e um gesto leva à seguinte
 * (secoes/EncaixeDasTelas).
 *
 * O MOVIMENTO É CAMADA, nunca conteúdo: tudo é HTML pronto; a narrativa
 * (NarrativaDaLanding, GSAP sob demanda) leva cada rolada à cena seguinte e
 * anima a troca. Com movimento reduzido, a rolagem é a comum e nada se move.
 */
import { NarrativaEmCenas } from "./cenas/Cenas.tsx";
import { Comecar } from "./Comecar.tsx";
import { LINK_PARA_COMECAR, LINK_PARA_ENTRAR } from "./conteudo.ts";
import { NarrativaDaLanding } from "./NarrativaDaLanding.tsx";
import { MenuCompacto } from "./MenuCompacto.tsx";
import "./mobile.css";
import { ConviteFinal } from "./secoes/ConviteFinal.tsx";
import {
  Comparar,
  DadosDeMercado,
  Depoimentos,
  EncaixeDasTelas,
  FaixaDeConfianca,
  PerguntasFrequentes,
  Recursos,
} from "./secoes/index.ts";

const SECOES_DO_MENU = [
  { href: "#como-funciona", rotulo: "Como funciona" },
  { href: "#por-dentro", rotulo: "Por dentro" },
  { href: "#taxas", rotulo: "Taxas dos apps" },
  { href: "#comparar", rotulo: "Comparar" },
  { href: "#preco", rotulo: "Preço" },
] as const;

function Topo() {
  return (
    <header className="sc-lp-topo" data-tema="escuro">
      <div className="sc-lp-topo__dentro">
        <a className="sc-lp-marca" href="/" aria-label="SimpleClick, início">
          <span className="sc-lp-marca__simbolo" aria-hidden="true">
            ✦
          </span>
          <span>simpleclick</span>
        </a>
        <nav className="sc-lp-topo__navegacao" aria-label="Seções da página">
          {SECOES_DO_MENU.map((item) => (
            <a key={item.href} href={item.href}>
              {item.rotulo}
            </a>
          ))}
        </nav>
        <div className="sc-lp-topo__acoes">
          <a className="sc-lp-topo__entrar" href={LINK_PARA_ENTRAR}>
            Entrar
          </a>
          <a className="sc-lp-topo__criar" href={LINK_PARA_COMECAR}>
            Criar loja
          </a>
          <MenuCompacto itens={SECOES_DO_MENU} />
        </div>
      </div>
      <div className="sc-lp-progresso" aria-hidden="true" />
    </header>
  );
}

/** A página inteira. */
export function LandingDoSimpleClick() {
  return (
    <div className="sc-lp" data-tema="escuro">
      <a className="sc-lp-pular" href="#conteudo">
        Pular para o conteúdo
      </a>
      <Topo />
      <main id="conteudo">
        <NarrativaEmCenas />
        <DadosDeMercado
          id="taxas"
          chamada={<Comecar rotulo="Quero meu link sem comissão" />}
        />
        <Comparar />
        <FaixaDeConfianca id="preco" />
        <Recursos />
        <Depoimentos id="depoimentos" />
        <PerguntasFrequentes id="duvidas" />
        <ConviteFinal />
      </main>
      <NarrativaDaLanding />
      <EncaixeDasTelas />
    </div>
  );
}
