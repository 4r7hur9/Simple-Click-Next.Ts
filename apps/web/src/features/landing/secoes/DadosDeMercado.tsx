import "@simpleclick/ui/styles/landing-dados.css";

import { ArrowDown } from "lucide-react";
import type { ReactNode } from "react";

import { Comecar } from "../Comecar.tsx";
import { ContaDoAplicativo } from "../ContaDoAplicativo.tsx";
import { CartoesDeMercado } from "./CartoesDeMercado.tsx";
import {
  FONTES_DA_PROVA,
  METODOLOGIA_DOS_DADOS,
  NUMEROS_DE_MERCADO,
  type FonteDeProva,
  type NumeroDeProva,
} from "./conteudo-de-prova.ts";
import { Entrada } from "./Entrada.tsx";
import { FontesDosDados } from "./FontesDosDados.tsx";
import {
  CanaisDoDelivery,
  ComprasNoCelular,
  SobraDeCadaPedido,
} from "./Graficos.tsx";

export interface DadosDeMercadoProps {
  numeros?: readonly NumeroDeProva[] | undefined;
  fontes?: readonly FonteDeProva[] | undefined;
  id?: string | undefined;
  /** O botão que fecha o resultado da conta (a landing passa o "Começar"). */
  chamada?: ReactNode;
}

/**
 * Dados de mercado em TRÊS TELAS, cada uma do tamanho da janela (100svh menos
 * o topo) e com o seu botão:
 *
 * 1. o título e os quatro números em cartões 3D (CartoesDeMercado), do mesmo
 *    tamanho e lado a lado;
 * 2. a conta com o movimento da loja, o quanto fica de cada R$ 100 e o
 *    resultado, que termina em "No seu link: R$ 0" e no botão;
 * 3. de onde vem o faturamento do delivery, onde as pessoas compram e o
 *    convite, com a linha "Fontes e metodologia" no pé.
 *
 * Todo número tem fonte: uma legenda pequena no pé do cartão ou do gráfico, e
 * a lista inteira, com datas e a metodologia, na gaveta do pé da seção. No
 * celular cada tela empilha e cresce com o conteúdo, sem cortar nada. Estilo em
 * packages/ui/styles/landing-dados.css.
 */
export function DadosDeMercado({
  numeros = NUMEROS_DE_MERCADO,
  fontes = FONTES_DA_PROVA,
  id = "mercado",
  chamada = <Comecar rotulo="Quero meu link sem comissão" />,
}: DadosDeMercadoProps) {
  return (
    <section
      aria-labelledby={`${id}-titulo`}
      className="sc-prova sc-prova--mercado sc-dados"
      data-tema="escuro"
      id={id}
    >
      <div className="sc-dados__tela" data-tela-de-dados="numeros" id={`${id}-numeros`}>
        <Entrada className="sc-dados__dentro sc-dados__dentro--numeros">
          <header className="sc-dados__cabeca sc-dados__cabeca--com-acoes" data-entra>
            <div className="sc-dados__cabeca-texto">
              <p className="sc-prova__sobrancelha">Dados de mercado</p>
              <h2 className="sc-prova__titulo sc-dados__titulo" id={`${id}-titulo`}>
                Vender por app custa <em className="sc-prova__caro">caro</em>. Seu
                link <em className="sc-prova__nao">não</em>.
              </h2>
              <p className="sc-dados__apoio">
                O que as plataformas cobram e como as pessoas compram hoje,{" "}
                <strong>com a fonte em cada número</strong>.
              </p>
            </div>
            <div className="sc-dados__acoes">
              <Comecar rotulo="Vender sem comissão" />
              <a className="sc-lp-botao sc-lp-botao--fantasma" href={`#${id}-conta`}>
                <span>Fazer a minha conta</span>
                <ArrowDown aria-hidden="true" size={18} strokeWidth={2} />
              </a>
            </div>
          </header>

          <CartoesDeMercado fontes={fontes} numeros={numeros} />
        </Entrada>
      </div>

      <div className="sc-dados__tela" data-tela-de-dados="conta" id={`${id}-conta`}>
        <Entrada className="sc-dados__dentro">
          <header className="sc-dados__cabeca" data-entra>
            <p className="sc-prova__sobrancelha">Faça a conta</p>
            <h3 className="sc-dados__titulo sc-dados__titulo--tela">
              Quanto o app <em className="sc-prova__caro">leva</em> do seu mês
            </h3>
            <p className="sc-dados__apoio">
              Arraste as réguas e veja o que <strong>fica com você</strong>, pelas
              tabelas oficiais.
            </p>
          </header>

          <div data-entra>
            <ContaDoAplicativo chamada={chamada} comparativo={<SobraDeCadaPedido />} />
          </div>
        </Entrada>
      </div>

      <div className="sc-dados__tela" data-tela-de-dados="canais" id={`${id}-canais`}>
        <Entrada className="sc-dados__dentro">
          <header className="sc-dados__cabeca" data-entra>
            <p className="sc-prova__sobrancelha">Onde está o seu cliente</p>
            <h3 className="sc-dados__titulo sc-dados__titulo--tela">
              Ele já pede no <em className="sc-dados__verde">WhatsApp</em> e compra
              no <em className="sc-dados__verde">celular</em>
            </h3>
            <p className="sc-dados__apoio">
              Um link resolve os dois: <strong>abre no celular, sem baixar nada</strong>.
            </p>
          </header>

          <div className="sc-prova__par" data-entra>
            <CanaisDoDelivery />
            <ComprasNoCelular />
          </div>

          <div className="sc-dados__convite" data-entra>
            <p className="sc-dados__convite-texto">
              <strong>Mande o seu link no WhatsApp.</strong> O pedido chega no
              painel e o valor inteiro fica com você.
            </p>
            <Comecar rotulo="Criar minha loja grátis" />
          </div>

          <FontesDosDados fontes={fontes} metodologia={METODOLOGIA_DOS_DADOS} />
        </Entrada>
      </div>
    </section>
  );
}
