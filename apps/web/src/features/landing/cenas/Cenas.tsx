/**
 * As cenas da landing: UM PRODUTO conta a história inteira.
 *
 * O hambúrguer "Brasa Clássico" aparece no herói ao lado do celular, entra na
 * vitrine real da Brasa Burger, vira pedido (produto → sacola → fechamento),
 * cai no quadro do painel e, por fim, dá lugar ao tambor de freio da
 * UniversoKar: do hambúrguer à autopeça, a mesma loja.
 *
 * COMO A ROLAGEM FUNCIONA: as sete cenas moram num PALCO só, que gruda na tela
 * (`position: sticky`) enquanto a narrativa ocupa sete alturas de tela no
 * documento. Cada cena ocupa o palco inteiro, empilhada sobre as outras; a
 * narrativa (NarrativaDaLanding) leva uma rolada à cena seguinte, como um
 * slide, e anima a troca: o texto sai e entra por linha, o aparelho desliza e
 * troca de tela, a luz do fundo muda de lugar. Depois da última cena a página
 * desliza para as seções seguintes e a rolagem volta a ser livre.
 *
 * SEM O MODO SLIDE (sem script, com movimento reduzido ou em tela baixa
 * demais) as mesmas cenas viram blocos comuns, um embaixo do outro, cada um
 * com a sua figura. O conteúdo é o mesmo nos dois modos.
 *
 * Todo texto é HTML (buscador e leitor de tela); os aparelhos são decorativos.
 *
 * O TEXTO de cada cena (etiqueta, título com destaque, apoio, detalhe) vem de
 * conteudo.ts e é montado pelas peças de TextoDaCena.tsx (estilo em
 * tipografia.css); `data-acento` dá a cor da cena.
 */
import { Check } from "lucide-react";
import { Fragment, type CSSProperties, type ReactNode } from "react";

import { Comecar } from "../Comecar.tsx";
import { ETAPAS_DO_PAINEL, HEROI, TEXTOS_DAS_CENAS, type AcentoDaCena } from "../conteudo.ts";
import { Celular, FotoDoProduto, Notebook, type Tela } from "./Aparelhos.tsx";
import { ApoioDaCena, Beneficios, Destaque, Etiqueta, TituloDaCena, Trechos, Trilha } from "./TextoDaCena.tsx";

const TELAS = {
  loja: { nome: "loja", descricao: "Vitrine da Brasa Burger no SimpleClick, com a cor da loja e o botão para ver o cardápio." },
  cardapio: { nome: "cardapio", descricao: "Cardápio da Brasa Burger com o Brasa Clássico em destaque, por R$ 26,90." },
  produto: { nome: "produto", descricao: "Página do Brasa Clássico: foto, preço, descrição e escolha do ponto da carne." },
  sacola: { nome: "sacola", descricao: "Sacola com dois Brasa Clássico, total de R$ 53,80 e o botão Fechar pedido." },
  fechamento: { nome: "fechamento", descricao: "Fechamento do pedido: entrega em casa, endereço salvo e total de R$ 59,80." },
  pedidos: { nome: "painel-pedidos", descricao: "Quadro de pedidos do painel da Brasa Burger, com os pedidos separados por etapa." },
  metricas: { nome: "painel-metricas", descricao: "Resumo da loja no painel: vendas da semana, pedidos, ticket médio e pedidos por etapa." },
  peca: { nome: "produto-autopecas", descricao: "Página de um tambor de freio na loja da UniversoKar, com marca, referência e preço." },
} as const satisfies Record<string, Tela>;

/**
 * As cenas, na ordem. `id` é a âncora (o menu do topo usa `como-funciona` e
 * `por-dentro`); `rotulo` é o nome no indicador lateral.
 */
export const CENAS_DA_NARRATIVA = [
  { id: "inicio", rotulo: "Início" },
  { id: "como-funciona", rotulo: "Vitrine" },
  { id: "pedido", rotulo: "Pedido" },
  { id: "por-dentro", rotulo: "Painel" },
  { id: "resumo", rotulo: "Resumo" },
  { id: "ramos", rotulo: "Qualquer ramo" },
  { id: "autopeca", rotulo: "Autopeça" },
] as const;

function Cena({
  indice,
  titulo,
  acento,
  children,
  figura,
  largo = false,
}: {
  readonly indice: number;
  /** A cor da cena (tipografia.css): destaques, luz atrás do aparelho, indicador. */
  readonly acento: AcentoDaCena;
  /** O id do título da cena (rótulo do artigo). */
  readonly titulo: string;
  readonly children: ReactNode;
  /** O que aparece junto do texto sem o modo slide (no palco, ele mostra). */
  readonly figura: ReactNode;
  /** Cena do notebook: texto mais estreito, aparelho largo. */
  readonly largo?: boolean;
}) {
  const { id } = CENAS_DA_NARRATIVA[indice]!;
  return (
    <article
      className={`sc-lp-momento${largo ? " sc-lp-momento--largo" : ""}`}
      data-cena={indice}
      data-acento={acento}
      id={id}
      aria-labelledby={titulo}
    >
      <div className="sc-lp-momento__texto">{children}</div>
      <div className="sc-lp-momento__figura" aria-hidden="true">
        {figura}
      </div>
    </article>
  );
}

/** O indicador lateral: uma bolinha por cena, clicável, e o progresso. */
function IndicadorDeCenas() {
  return (
    <nav className="sc-lp-indicador" aria-label="Cenas da apresentação">
      <span className="sc-lp-indicador__trilho" aria-hidden="true">
        <span className="sc-lp-indicador__progresso" />
      </span>
      <ol className="sc-lp-indicador__lista">
        {CENAS_DA_NARRATIVA.map((cena, indice) => (
          <li key={cena.id}>
            <a
              className="sc-lp-indicador__ponto"
              href={`#${cena.id}`}
              data-cena={indice}
              {...(indice === 0 ? { "aria-current": "step" as const } : {})}
            >
              <span className="sc-lp-indicador__rotulo">
                <span className="sc-lp-so-leitor">Cena {indice + 1} de {CENAS_DA_NARRATIVA.length}: </span>
                {cena.rotulo}
              </span>
            </a>
          </li>
        ))}
      </ol>
      <p className="sc-lp-indicador__contagem" aria-hidden="true">
        <span data-contagem>01</span> / {String(CENAS_DA_NARRATIVA.length).padStart(2, "0")}
      </p>
    </nav>
  );
}

/** Os aparelhos do palco: um celular e um notebook, que trocam de tela. */
function AparelhosDoPalco() {
  return (
    <div className="sc-lp-narrativa__aparelhos" aria-hidden="true">
      <div className="sc-lp-narrativa__vaga sc-lp-narrativa__vaga--celular">
        <div className="sc-lp-composicao sc-lp-composicao--palco">
          <Celular
            telas={[TELAS.loja, TELAS.cardapio, TELAS.produto, TELAS.sacola, TELAS.fechamento, TELAS.peca]}
            prioridade
          />
          <FotoDoProduto produto="hamburguer" prioridade className="sc-lp-produto--voa" />
          <FotoDoProduto produto="hamburguer" className="sc-lp-produto--ramo" />
          <FotoDoProduto produto="peca" className="sc-lp-produto--ramo sc-lp-produto--depois" />
        </div>
      </div>
      <div className="sc-lp-narrativa__vaga sc-lp-narrativa__vaga--notebook">
        <Notebook telas={[TELAS.pedidos, TELAS.metricas]} className="sc-lp-notebook--palco" />
      </div>
    </div>
  );
}

/**
 * A narrativa inteira: herói, vitrine, pedido, painel, resumo e os dois
 * ramos, num palco só.
 */
export function NarrativaEmCenas() {
  return (
    <section
      className="sc-lp-narrativa"
      aria-label="Como funciona"
      style={{ "--cenas": CENAS_DA_NARRATIVA.length } as CSSProperties}
    >
      <div className="sc-lp-narrativa__palco">
        <div className="sc-lp-narrativa__fundo" aria-hidden="true">
          <span className="sc-lp-narrativa__linhas" />
          <span className="sc-lp-narrativa__luz" />
          <span className="sc-lp-narrativa__luz sc-lp-narrativa__luz--fria" />
        </div>

        <div className="sc-lp-narrativa__grade">
          <AparelhosDoPalco />

          <Cena
            indice={0}
            titulo="lp-titulo"
            acento="limao"
            figura={
              <div className="sc-lp-composicao">
                <Celular telas={[TELAS.loja]} prioridade />
                <FotoDoProduto produto="hamburguer" prioridade />
              </div>
            }
          >
            <Etiqueta>
              <Trechos trechos={HEROI.selo} como="destaque" />
            </Etiqueta>
            <h1 className="sc-lp-heroi__titulo sc-lp-revelar-linhas" id="lp-titulo">
              {HEROI.linhas.map((linha, i) => (
                <Fragment key={i}>
                  {i > 0 ? " " : null}
                  <span className="sc-lp-linha">
                    <span>
                      {typeof linha === "string" ? (
                        linha
                      ) : (
                        <Destaque efeito={linha.efeito}>{linha.destaque}</Destaque>
                      )}
                    </span>
                  </span>
                </Fragment>
              ))}
            </h1>
            <p className="sc-lp-heroi__texto">
              <Trechos trechos={HEROI.apoio} como="negrito" />
            </p>
            <div className="sc-lp-heroi__acoes">
              <Comecar />
              <a className="sc-lp-botao sc-lp-botao--fantasma" href="#como-funciona">
                Ver como funciona
              </a>
            </div>
            <ul className="sc-lp-heroi__garantias">
              {HEROI.garantias.map((garantia) => (
                <li key={garantia}>
                  <Check aria-hidden="true" size={16} strokeWidth={3} /> {garantia}
                </li>
              ))}
            </ul>
          </Cena>

          <Cena
            indice={1}
            titulo="lp-vitrine"
            acento={TEXTOS_DAS_CENAS.vitrine.acento}
            figura={<Celular telas={[TELAS.cardapio]} />}
          >
            <Etiqueta numero="01">{TEXTOS_DAS_CENAS.vitrine.etiqueta}</Etiqueta>
            <TituloDaCena id="lp-vitrine" trechos={TEXTOS_DAS_CENAS.vitrine.titulo} />
            <ApoioDaCena trechos={TEXTOS_DAS_CENAS.vitrine.apoio} />
            <Beneficios itens={TEXTOS_DAS_CENAS.vitrine.beneficios} />
          </Cena>

          <Cena
            indice={2}
            titulo="lp-pedido"
            acento={TEXTOS_DAS_CENAS.pedido.acento}
            figura={
              <div className="sc-lp-par">
                <Celular telas={[TELAS.produto]} />
                <Celular telas={[TELAS.fechamento]} />
              </div>
            }
          >
            <Etiqueta numero="02">{TEXTOS_DAS_CENAS.pedido.etiqueta}</Etiqueta>
            <TituloDaCena id="lp-pedido" trechos={TEXTOS_DAS_CENAS.pedido.titulo} />
            <ApoioDaCena trechos={TEXTOS_DAS_CENAS.pedido.apoio} />
            <ol className="sc-lp-etapas" aria-label="As etapas do pedido">
              <li data-etapa="0">Produto</li>
              <li data-etapa="1">Sacola</li>
              <li data-etapa="2">Confirmação</li>
            </ol>
          </Cena>

          <Cena
            indice={3}
            titulo="lp-painel"
            acento={TEXTOS_DAS_CENAS.painel.acento}
            largo
            figura={<Notebook telas={[TELAS.pedidos]} />}
          >
            <Etiqueta numero="03">{TEXTOS_DAS_CENAS.painel.etiqueta}</Etiqueta>
            <TituloDaCena id="lp-painel" trechos={TEXTOS_DAS_CENAS.painel.titulo} />
            <ApoioDaCena trechos={TEXTOS_DAS_CENAS.painel.apoio} />
            <Trilha etapas={ETAPAS_DO_PAINEL} rotulo="O caminho do pedido no painel" />
          </Cena>

          <Cena
            indice={4}
            titulo="lp-resumo"
            acento={TEXTOS_DAS_CENAS.resumo.acento}
            largo
            figura={<Notebook telas={[TELAS.metricas]} />}
          >
            <Etiqueta numero="04">{TEXTOS_DAS_CENAS.resumo.etiqueta}</Etiqueta>
            <TituloDaCena id="lp-resumo" trechos={TEXTOS_DAS_CENAS.resumo.titulo} />
            <ApoioDaCena trechos={TEXTOS_DAS_CENAS.resumo.apoio} />
            <Beneficios itens={TEXTOS_DAS_CENAS.resumo.beneficios} />
          </Cena>

          <Cena
            indice={5}
            titulo="lp-ramo-comida"
            acento={TEXTOS_DAS_CENAS.ramoComida.acento}
            figura={
              <div className="sc-lp-composicao">
                <Celular telas={[TELAS.produto]} inclinacao="esquerda" />
                <FotoDoProduto produto="hamburguer" />
              </div>
            }
          >
            <Etiqueta numero="05">{TEXTOS_DAS_CENAS.ramoComida.etiqueta}</Etiqueta>
            <TituloDaCena id="lp-ramo-comida" trechos={TEXTOS_DAS_CENAS.ramoComida.titulo} grande />
            <ApoioDaCena trechos={TEXTOS_DAS_CENAS.ramoComida.apoio} />
            <Beneficios itens={TEXTOS_DAS_CENAS.ramoComida.beneficios} />
          </Cena>

          <Cena
            indice={6}
            titulo="lp-ramo-pecas"
            acento={TEXTOS_DAS_CENAS.ramoPecas.acento}
            figura={
              <div className="sc-lp-composicao">
                <Celular telas={[TELAS.peca]} inclinacao="esquerda" />
                <FotoDoProduto produto="peca" />
              </div>
            }
          >
            <Etiqueta numero="06">{TEXTOS_DAS_CENAS.ramoPecas.etiqueta}</Etiqueta>
            <TituloDaCena id="lp-ramo-pecas" trechos={TEXTOS_DAS_CENAS.ramoPecas.titulo} grande />
            <ApoioDaCena trechos={TEXTOS_DAS_CENAS.ramoPecas.apoio} />
            <Beneficios itens={TEXTOS_DAS_CENAS.ramoPecas.beneficios} />
          </Cena>
        </div>

        <IndicadorDeCenas />
      </div>
    </section>
  );
}
