/**
 * Os quatro números de mercado em cartões 3D (tela 1 da seção #taxas).
 *
 * O SERVIDOR ENTREGA O CARTÃO PRONTO E PLANO DE LER: número final, rótulo,
 * detalhe, mini-gráfico e a fonte. A profundidade é CSS (landing-dados.css):
 * cada cartão é uma pilha de camadas em `preserve-3d` (sombra colorida longe,
 * placa com borda luminosa, conteúdo e número mais perto). Os quatro têm o
 * mesmo tamanho, ficam lado a lado e com o texto centrado, na mesma ordem
 * (ícone, número, rótulo, detalhe, mini-gráfico, fonte), para as linhas
 * baterem; cada um tem a sua cor de acento, sem fundo cheio. O MovimentoDosCartoes só soma a
 * inclinação que segue o mouse (ou o toque e o giroscópio), o brilho e a
 * contagem do número quando a tela aparece. Com movimento reduzido, nada disso
 * liga e o cartão fica plano.
 *
 * O mini-gráfico é enfeite para o leitor de tela (o número e o detalhe já
 * dizem tudo); a fonte é uma legenda pequena no pé do cartão, sem sublinhado.
 */
import {
  CalendarClock,
  Link2,
  MessageCircle,
  Percent,
  Smartphone,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { TABELA_DO_IFOOD, emReais } from "../custo-do-aplicativo.ts";
import {
  CANAIS_DO_DELIVERY,
  COMPRAS_NO_CELULAR,
  FONTES_DA_PROVA,
  type FonteDeProva,
  type NumeroDeProva,
} from "./conteudo-de-prova.ts";
import { MovimentoDosCartoes } from "./MovimentoDosCartoes.tsx";

export type PedacoDoNumero =
  | { readonly tipo: "texto"; readonly texto: string }
  | { readonly tipo: "numero"; readonly texto: string; readonly valor: number; readonly casas: number };

/**
 * Separa "R$ 110 a R$ 150" em texto e números, para a contagem animar cada
 * número e manter o resto parado. "1.800" e "3,2" contam como um número só.
 */
export function pedacosDoNumero(texto: string): PedacoDoNumero[] {
  const pedacos: PedacoDoNumero[] = [];
  let resto = 0;
  for (const achado of texto.matchAll(/\d+(?:\.\d{3})*(?:,\d+)?/g)) {
    const inicio = achado.index ?? 0;
    if (inicio > resto) pedacos.push({ tipo: "texto", texto: texto.slice(resto, inicio) });
    const numero = achado[0];
    const casas = numero.includes(",") ? (numero.split(",")[1]?.length ?? 0) : 0;
    pedacos.push({
      tipo: "numero",
      texto: numero,
      valor: Number(numero.replace(/\./g, "").replace(",", ".")),
      casas,
    });
    resto = inicio + numero.length;
  }
  if (resto < texto.length) pedacos.push({ tipo: "texto", texto: texto.slice(resto) });
  return pedacos;
}

type Acento = "limao" | "ambar" | "verde" | "aco";

interface DesenhoDoCartao {
  readonly icone: LucideIcon;
  readonly acento: Acento;
  readonly mini: ReactNode;
}

const PORCENTO = (fracao: number) => `${Math.round(fracao * 100)}%`;

/** De cada R$ 100: o que o iFood leva em cada plano. */
function MiniComissao() {
  return (
    <div className="sc-dado3d__mini-barras">
      {(["basico", "entrega"] as const).map((plano) => {
        const { comissao } = TABELA_DO_IFOOD[plano];
        return (
          <span className="sc-dado3d__mini-linha" key={plano}>
            <span>{plano === "basico" ? "Básico" : "Entrega"}</span>
            <span className="sc-dado3d__mini-trilho">
              <span style={{ "--parte": comissao } as CSSProperties} />
            </span>
            <strong>{PORCENTO(comissao)}</strong>
          </span>
        );
      })}
      <span className="sc-dado3d__mini-legenda">de cada R$&nbsp;100 em pedido</span>
    </div>
  );
}

/** A mensalidade somando mês a mês, no plano mais caro. */
function MiniMensalidade() {
  const { mensalidade } = TABELA_DO_IFOOD.entrega;
  return (
    <div className="sc-dado3d__mini-colunas">
      <span className="sc-dado3d__mini-grade">
        {Array.from({ length: 12 }, (_, mes) => (
          <span key={mes} style={{ "--parte": (mes + 1) / 12 } as CSSProperties} />
        ))}
      </span>
      <span className="sc-dado3d__mini-legenda">
        até {emReais(mensalidade * 12)} no ano
      </span>
    </div>
  );
}

/** Uma rosca pequena com a parte do canal. */
function MiniRosca({ parte, legenda }: { parte: number; legenda: string }) {
  return (
    <div className="sc-dado3d__mini-rosca">
      <svg focusable="false" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="15" pathLength={100} />
        <circle cx="20" cy="20" r="15" pathLength={100} strokeDasharray={`${parte} ${100 - parte}`} />
      </svg>
      <span className="sc-dado3d__mini-legenda">{legenda}</span>
    </div>
  );
}

/** Uma barra de 100 com a parte acesa. */
function MiniParte({ parte, legenda }: { parte: number; legenda: string }) {
  return (
    <div className="sc-dado3d__mini-parte">
      <span className="sc-dado3d__mini-trilho sc-dado3d__mini-trilho--grosso">
        <span style={{ "--parte": parte / 100 } as CSSProperties} />
      </span>
      <span className="sc-dado3d__mini-legenda">{legenda}</span>
    </div>
  );
}

const whatsapp = CANAIS_DO_DELIVERY.canais.find((c) => c.id === "whatsapp")?.parte ?? 0;

const DESENHOS: Readonly<Record<string, DesenhoDoCartao>> = {
  comissao: { icone: Percent, acento: "limao", mini: <MiniComissao /> },
  mensalidade: { icone: CalendarClock, acento: "ambar", mini: <MiniMensalidade /> },
  whatsapp: {
    icone: MessageCircle,
    acento: "verde",
    mini: <MiniRosca legenda="do delivery" parte={whatsapp} />,
  },
  celular: {
    icone: Smartphone,
    acento: "aco",
    mini: (
      <MiniParte
        legenda={`${COMPRAS_NO_CELULAR.parte} de cada 100 compras`}
        parte={COMPRAS_NO_CELULAR.parte}
      />
    ),
  },
};

const DESENHO_PADRAO: DesenhoDoCartao = { icone: TrendingUp, acento: "aco", mini: null };

/** "Fonte: iFood, Portal do Parceiro", pequeno e sem sublinhado. */
export function LegendaDaFonte({
  indice,
  fontes = FONTES_DA_PROVA,
  rotulo = "Fonte",
}: {
  indice: number;
  fontes?: readonly FonteDeProva[] | undefined;
  rotulo?: string;
}) {
  const fonte = fontes[indice - 1];
  if (!fonte) return null;
  return (
    <a
      className="sc-dados__fonte"
      href={fonte.url}
      rel="noopener noreferrer"
      target="_blank"
      title={`${fonte.nome} (${fonte.data})`}
    >
      <Link2 aria-hidden="true" size={11} strokeWidth={2.25} />
      <span>
        {rotulo}: {fonte.curto}
      </span>
      <span className="sc-prova__so-leitor"> (abre em nova aba)</span>
    </a>
  );
}

function NumeroGrande({ texto }: { texto: string }) {
  return (
    <p className="sc-dado3d__numero">
      <span aria-hidden="true">
        {pedacosDoNumero(texto).map((pedaco, i) =>
          pedaco.tipo === "texto" ? (
            <span key={i}>{pedaco.texto}</span>
          ) : (
            <span
              className="sc-dado3d__digitos"
              data-conta-ate={pedaco.valor}
              data-casas={pedaco.casas}
              key={i}
              style={{ "--digitos": pedaco.texto.length } as CSSProperties}
            >
              {pedaco.texto}
            </span>
          ),
        )}
      </span>
      <span className="sc-prova__so-leitor">{texto}</span>
    </p>
  );
}

export function CartoesDeMercado({
  numeros,
  fontes,
}: {
  numeros: readonly NumeroDeProva[];
  fontes: readonly FonteDeProva[];
}) {
  return (
    <div className="sc-dados__palco" data-cartoes-3d>
      <ul className="sc-dados__cartoes">
        {numeros.map((n) => {
          const desenho = DESENHOS[n.id] ?? DESENHO_PADRAO;
          const Icone = desenho.icone;
          return (
            <li className="sc-dado3d__vaga" data-entra-3d key={n.id}>
              <div className="sc-dado3d" data-acento={desenho.acento}>
                <span aria-hidden="true" className="sc-dado3d__sombra" />
                <span aria-hidden="true" className="sc-dado3d__placa" />
                <span aria-hidden="true" className="sc-dado3d__brilho">
                  <span className="sc-dado3d__luz" />
                </span>
                <div className="sc-dado3d__conteudo">
                  <span aria-hidden="true" className="sc-dado3d__icone">
                    <Icone size={22} strokeWidth={2} />
                  </span>
                  <NumeroGrande texto={n.numero} />
                  <p className="sc-dado3d__rotulo">{n.rotulo}</p>
                  <p className="sc-dado3d__detalhe">{n.detalhe}</p>
                  {desenho.mini ? (
                    <div aria-hidden="true" className="sc-dado3d__mini">
                      {desenho.mini}
                    </div>
                  ) : null}
                  <p className="sc-dado3d__pe">
                    <LegendaDaFonte fontes={fontes} indice={n.fonte} />
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <MovimentoDosCartoes />
    </div>
  );
}
