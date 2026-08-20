/**
 * A história que a landing conta (AC-933, AC-934, AC-937).
 *
 * ESTE COMPONENTE NÃO ANIMA NADA E NÃO DESENHA MUNDO NENHUM. Ele entrega a
 * página inteira, legível, com script desligado. A narrativa por rolagem e o
 * mundo em três dimensões entram por cima, em componentes que só existem no
 * navegador — e a ausência deles não tira uma palavra do que está aqui.
 *
 * A SEQUÊNCIA É O ARGUMENTO, e não uma lista com animação. Ela vai do problema
 * de quem anota pedido no papel, passa pelo produto resolvendo, e termina no
 * convite. Embaralhar as seções não reorganiza a página: descaracteriza o que
 * ela está dizendo.
 *
 * O texto fala a língua de quem tem loja. "Multi-tenant", "catálogo headless" e
 * "isolamento por linha" são verdade sobre o sistema e não são o problema de
 * ninguém que vende pastel.
 */

import type { ReactNode } from "react";

/** Uma seção da história, na ordem em que ela se conta. */
interface Capitulo {
  readonly id: string;
  readonly sobrancelha: string;
  readonly titulo: string;
  readonly texto: string;
  /** O que a pessoa ganha, em três frases curtas. */
  readonly pontos?: readonly string[];
}

const CAPITULOS: readonly Capitulo[] = [
  {
    id: "problema",
    sobrancelha: "O dia a dia hoje",
    titulo: "Pedido no papel, preço no grito",
    texto:
      "O cliente pergunta o preço do pastel pela quinta vez. O pedido vai para um papel que some. No fim do dia, ninguém sabe quanto entrou nem o que mais saiu.",
    pontos: [
      "Cardápio desatualizado circulando no grupo da família",
      "Pedido anotado errado que vira reclamação na entrega",
      "Fechamento do caixa por memória, no fim do expediente",
    ],
  },
  {
    id: "produto",
    sobrancelha: "Com o SimpleClick",
    titulo: "Seu cardápio online, seu pedido organizado",
    texto:
      "Você cadastra seus produtos uma vez e recebe um endereço para mandar no WhatsApp e colar no perfil. O cliente escolhe, monta o carrinho e fecha o pedido — que chega pronto para você, com tudo escrito.",
    pontos: [
      "O cliente monta o pedido sozinho, com os preços que você definiu",
      "O pedido chega no seu WhatsApp já formatado, sem digitar nada",
      "Cada pedido fica registrado, com número e histórico",
    ],
  },
  {
    id: "controle",
    sobrancelha: "No fim do dia",
    titulo: "Você sabe quanto entrou, e de quê",
    texto:
      "Quantos pedidos hoje, quanto foi de entrega, qual produto sai mais. Sem planilha, sem contar papel, sem depender da memória de ninguém.",
    pontos: [
      "Pedidos de hoje, de três dias, de sete, ou do período que você escolher",
      "Cada pedido guarda o preço do momento da compra, para sempre",
      "Loja fechada avisa o cliente, em vez de receber pedido que você não pode atender",
    ],
  },
];

export interface HistoriaDaLandingProps {
  /** Para onde vai quem decidiu começar. */
  readonly linkParaComecar: string;
  /**
   * A prévia viva, montada por quem pode ver as regras.
   *
   * Chega como elemento pronto, e não é importada aqui: este componente é
   * desenhado no servidor e precisa continuar assim, e a prévia é interativa.
   * Recebê-la mantém a história inteira legível sem script, com a prévia
   * entrando como uma ilha dentro dela.
   */
  readonly previa?: ReactNode;
}

/** O caminho para começar, repetido em cada capítulo. */
function Comecar({
  href,
  discreto = false,
}: {
  readonly href: string;
  readonly discreto?: boolean;
}) {
  return (
    <a
      className={
        discreto ? "sc-lp__comecar sc-lp__comecar--discreto" : "sc-lp__comecar"
      }
      href={href}
    >
      <span>Criar minha loja</span>
      <svg
        className="sc-lp__seta"
        viewBox="0 0 20 20"
        width="18"
        height="18"
        aria-hidden="true"
      >
        <path
          d="M4 10h11M11 5l5 5-5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
}

export function HistoriaDaLanding({
  linkParaComecar,
  previa,
}: HistoriaDaLandingProps) {
  return (
    <div className="sc-lp" data-narrativa="landing">
      {/*
        A LUZ é decoração pura, e é a única camada de fundo que chega a TODO
        aparelho — inclusive ao celular, onde o mundo em três dimensões é
        barrado. Vem do servidor, então quem tem script bloqueado a vê também.
      */}
      <div className="sc-lp__luz" aria-hidden="true">
        <span className="sc-lp__lavado sc-lp__lavado--um" />
        <span className="sc-lp__lavado sc-lp__lavado--dois" />
      </div>

      {/*
        A ABERTURA APARECE SEM ROLAR NADA (AC-933). Quem chegou precisa saber em
        segundos o que o produto faz, na língua dele — e ter o caminho à mão
        antes de decidir se vai rolar.
      */}
      <section className="sc-lp__abertura" data-capitulo="abertura">
        <div className="sc-lp__conteudo">
          <p className="sc-lp__sobrancelha">Para quem vende todo dia</p>
          <h1 className="sc-lp__titulo-maior">
            Seu cardápio online e seus pedidos organizados, sem mensalidade
          </h1>
          <p className="sc-lp__texto sc-lp__texto--grande">
            Monte seu cardápio, mande o link para os clientes e receba os
            pedidos prontos no WhatsApp. Funciona para lanchonete, loja de
            roupa, autopeças — qualquer negócio que venda.
          </p>
          <p className="sc-lp__chamada">
            <Comecar href={linkParaComecar} />
          </p>
          <p className="sc-lp__nota">
            Grátis, com todas as funcionalidades. Sem cartão de crédito.
          </p>
        </div>
      </section>

      {/*
        A PRÉVIA VEM LOGO DEPOIS DA PROMESSA, e antes dos capítulos. Quem chegou
        acabou de ler o que o produto faz; o passo seguinte natural é ver. Deixar
        a prévia no fim faria a maioria nunca chegar nela.
      */}
      {previa ? (
        <section className="sc-lp__capitulo sc-lp__demo" data-capitulo="previa">
          <div className="sc-lp__conteudo sc-lp__conteudo--largo">
            <p className="sc-lp__sobrancelha">Veja funcionando</p>
            <h2 className="sc-lp__titulo">Sua loja, agora</h2>
            <p className="sc-lp__texto">
              Escreva o nome do seu negócio e escolha uma cor. É assim que seu
              cliente vai ver, e é essa a mensagem que chega no seu WhatsApp.
            </p>
            {previa}
          </div>
        </section>
      ) : null}

      {CAPITULOS.map((capitulo, indice) => (
        <section
          className="sc-lp__capitulo"
          data-capitulo={capitulo.id}
          key={capitulo.id}
        >
          <div className="sc-lp__conteudo">
            <p className="sc-lp__sobrancelha">{capitulo.sobrancelha}</p>
            <h2 className="sc-lp__titulo">{capitulo.titulo}</h2>
            <p className="sc-lp__texto">{capitulo.texto}</p>

            {capitulo.pontos ? (
              <ul className="sc-lp__pontos">
                {capitulo.pontos.map((ponto) => (
                  <li key={ponto}>{ponto}</li>
                ))}
              </ul>
            ) : null}

            {/*
              Cada capítulo tem caminho para começar (AC-937). Quem se convenceu
              no segundo não deve precisar rolar até o fim nem voltar ao topo —
              a decisão acontece onde ela acontece.
            */}
            <p className="sc-lp__chamada">
              <Comecar
                href={linkParaComecar}
                discreto={indice < CAPITULOS.length - 1}
              />
            </p>
          </div>
        </section>
      ))}
    </div>
  );
}
