/**
 * O convite final: a página fecha como a primeira tela abria.
 *
 * A composição é a do herói antigo da landing: fundo preto com a luz
 * verde-limão, o ✦ do SimpleClick grande e em 3D atrás dos aparelhos (ele
 * gira com a rolagem), o MacBook com o quadro de pedidos, o iPad com o resumo
 * da loja e o iPhone aberto na vitrine da Brasa Burger, e os balõezinhos de
 * pedido flutuando em volta ("Pedido #2014 · Confirmado").
 *
 * Tudo que se move é decorativo (`aria-hidden`) e é CSS: o ✦ é uma pilha de
 * camadas recortadas em `preserve-3d` (volume de verdade, sem canvas), os aparelhos
 * são os de cenas/Aparelhos.tsx e o iPad é desenhado aqui. O script
 * (MovimentoDoConvite) só arma a entrada e passa a posição do mouse e da
 * rolagem para o CSS. Sem script ou com movimento reduzido, a seção chega
 * pronta e parada.
 */
import { BellRing, Check } from "lucide-react";
import type { CSSProperties } from "react";

import { Celular, Notebook } from "../cenas/Aparelhos.tsx";
import { Comecar } from "../Comecar.tsx";
import { HEROI, LINK_PARA_ENTRAR } from "../conteudo.ts";
import { TELAS_DO_APP } from "../telas-do-app.ts";
import { MovimentoDoConvite } from "./MovimentoDoConvite.tsx";

import "./convite-final.css";

/** O ✦ do SimpleClick: quatro pontas de lados curvos. */
const PONTAS = "M50 0C53 35 65 47 100 50C65 53 53 65 50 100C47 65 35 53 0 50C35 47 47 35 50 0Z";

/** Quantas camadas fazem a espessura do ✦ (a face vai por cima delas). */
const CAMADAS_DA_ESTRELA = 14;

/**
 * O ✦ em 3D: camadas iguais empilhadas em profundidade (`translateZ`), as de
 * trás mais escuras, e a face na frente com luz de estúdio. Girado, mostra a
 * espessura de verdade.
 */
function EstrelaEmVolume({ className }: { readonly className: string }) {
  return (
    <div className={`sc-lp-convite__estrela ${className}`}>
      {Array.from({ length: CAMADAS_DA_ESTRELA }, (_, i) => (
        <span
          key={i}
          className="sc-lp-convite__estrela-camada"
          style={{ "--i": CAMADAS_DA_ESTRELA - i } as CSSProperties}
        />
      ))}
      <span className="sc-lp-convite__estrela-face" />
    </div>
  );
}

/** O ✦ pequeno, num quadrado verde: o ícone dos balões (é o do app). */
function IconeDoApp() {
  return (
    <span className="sc-lp-convite__icone">
      <svg viewBox="0 0 100 100" focusable="false">
        <path d={PONTAS} />
      </svg>
    </span>
  );
}

/** Um balão de pedido, inclinado em 3D, flutuando. */
function Balao({
  titulo,
  detalhe,
  className,
}: {
  readonly titulo: string;
  readonly detalhe: string;
  readonly className: string;
}) {
  return (
    <div className={`sc-lp-convite__camada sc-lp-convite__balao-vaga ${className}`} data-profundidade="3">
      <div className="sc-lp-convite__flutua sc-lp-convite__flutua--balao">
        <div className="sc-lp-convite__balao">
          <IconeDoApp />
          <span className="sc-lp-convite__balao-texto">
            <strong>{titulo}</strong>
            <span>{detalhe}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Um iPad Pro deitado, de bordas finas, com uma tela real do painel. */
function Tablet() {
  const medidas = TELAS_DO_APP["painel-metricas"];
  const base = "/landing/app/painel-metricas";
  const sizes = "(min-width: 1024px) 18rem, 48vw";
  const srcSet = (formato: "avif" | "webp") =>
    medidas.larguras
      .map((largura) => `${base}${largura === medidas.padrao ? "" : `-${largura}`}.${formato} ${largura}w`)
      .join(", ");
  return (
    <div className="sc-lp-convite__ipad">
      <div className="sc-lp-convite__ipad-vidro">
        <span className="sc-lp-convite__ipad-camera" />
        <picture className="sc-lp-convite__ipad-tela">
          <source type="image/avif" srcSet={srcSet("avif")} sizes={sizes} />
          <img
            src={`${base}.webp`}
            srcSet={srcSet("webp")}
            sizes={sizes}
            alt=""
            width={medidas.largura}
            height={medidas.altura}
            loading="lazy"
            decoding="async"
          />
        </picture>
      </div>
    </div>
  );
}

/** Pontinhos de luz que sobem devagar no fundo (posição e ritmo de cada um). */
const POEIRA = [
  { x: 8, y: 72, atraso: 0 },
  { x: 18, y: 30, atraso: 2.1 },
  { x: 33, y: 86, atraso: 4.4 },
  { x: 46, y: 18, atraso: 1.2 },
  { x: 58, y: 64, atraso: 3.3 },
  { x: 71, y: 12, atraso: 5.2 },
  { x: 83, y: 80, atraso: 0.8 },
  { x: 94, y: 40, atraso: 2.7 },
] as const;

export function ConviteFinal() {
  return (
    <section className="sc-lp-convite" id="comecar" data-tema="escuro" data-convite="" aria-labelledby="lp-convite">
      <div className="sc-lp-convite__fundo" aria-hidden="true">
        <span className="sc-lp-convite__luz" />
        <span className="sc-lp-convite__pontos" />
        {POEIRA.map((grao) => (
          <span
            key={`${grao.x}-${grao.y}`}
            className="sc-lp-convite__poeira"
            style={{ "--x": `${grao.x}%`, "--y": `${grao.y}%`, "--atraso": `${grao.atraso}s` } as CSSProperties}
          />
        ))}
      </div>

      <div className="sc-lp-convite__dentro">
        <div className="sc-lp-convite__texto">
          <h2 className="sc-lp-convite__titulo" id="lp-convite">
            Sua loja no{"\u00a0"}ar <mark className="sc-lp-convite__hoje">hoje</mark>.
          </h2>
          <p className="sc-lp-convite__apoio">
            Cadastre os primeiros produtos, copie o link e mande para os seus
            clientes. Leva menos tempo que responder o preço no WhatsApp.
          </p>
          <div className="sc-lp-convite__acoes">
            <Comecar rotulo="Criar minha loja grátis" />
            <a className="sc-lp-botao sc-lp-botao--fantasma" href={LINK_PARA_ENTRAR}>
              Já tenho conta
            </a>
          </div>
          <ul className="sc-lp-convite__garantias">
            {HEROI.garantias.map((garantia) => (
              <li key={garantia}>
                <Check aria-hidden="true" size={16} strokeWidth={3} /> {garantia}
              </li>
            ))}
          </ul>
        </div>

        <div className="sc-lp-convite__palco" aria-hidden="true">
          <div className="sc-lp-convite__camada sc-lp-convite__vaga-estrela" data-profundidade="1">
            <EstrelaEmVolume className="sc-lp-convite__estrela--grande" />
          </div>
          <div className="sc-lp-convite__camada sc-lp-convite__vaga-estrelinha" data-profundidade="3">
            <EstrelaEmVolume className="sc-lp-convite__estrela--pequena" />
          </div>

          <div className="sc-lp-convite__camada sc-lp-convite__vaga-notebook" data-profundidade="1">
            <div className="sc-lp-convite__flutua sc-lp-convite__flutua--devagar">
              <Notebook
                telas={[{ nome: "painel-pedidos", descricao: "Quadro de pedidos do painel da Brasa Burger." }]}
                className="sc-lp-convite__notebook"
              />
            </div>
          </div>
          <div className="sc-lp-convite__camada sc-lp-convite__vaga-ipad" data-profundidade="2">
            <div className="sc-lp-convite__flutua sc-lp-convite__flutua--meio">
              <Tablet />
            </div>
          </div>
          <div className="sc-lp-convite__camada sc-lp-convite__vaga-celular" data-profundidade="2">
            <div className="sc-lp-convite__flutua">
              <Celular telas={[{ nome: "loja", descricao: "Vitrine da Brasa Burger no SimpleClick." }]} />
            </div>
          </div>

          <Balao className="sc-lp-convite__balao--produto" titulo="Brasa Clássico" detalhe="R$ 26,90" />
          <Balao className="sc-lp-convite__balao--confirmado" titulo="Pedido #2014" detalhe="Confirmado · Pix" />
          <Balao className="sc-lp-convite__balao--entrega" titulo="Saiu para entrega" detalhe="Pedido #2009" />
          <div className="sc-lp-convite__camada sc-lp-convite__balao-vaga sc-lp-convite__balao--novo" data-profundidade="3">
            <div className="sc-lp-convite__flutua sc-lp-convite__flutua--meio">
              <span className="sc-lp-convite__pilula">
                <BellRing size={16} strokeWidth={2.25} /> Novo pedido · R$ 55,80
              </span>
            </div>
          </div>
        </div>
      </div>

      <MovimentoDoConvite />
    </section>
  );
}
