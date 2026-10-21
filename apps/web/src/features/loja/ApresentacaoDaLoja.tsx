/**
 * A apresentação da loja, em UMA TELA (AC-400, AC-401, AC-015).
 *
 * A DECISÃO QUE MANDA AQUI: quem abre o endereço de uma loja quer o cardápio.
 * Esta página é uma porta, não um destino — e porta com três telas de rolagem
 * até a maçaneta é atrito no mesmo lugar em que a skill manda não ter nenhum.
 *
 * A SEGUNDA DECISÃO: a página tem de parecer COM A LOJA, e não com um modelo.
 * A cor que o dono escolheu já estava no banco e não estava sendo usada — o
 * resultado era uma tela correta e genérica, igual para a pastelaria e para a
 * loja de roupa. Aqui essa cor pinta o fundo, o anel da marca e o botão, com o
 * contraste ajustado pelo próprio design system (AC-015).
 *
 * ESTE COMPONENTE NÃO ANIMA NADA. Ele desenha a página inteira, legível, com
 * JavaScript desligado — que é o que o AC-415 exige e o que a torna encontrável.
 */
import type { CSSProperties } from "react";
import {
  COR_DE_DESTAQUE_PADRAO_DA_LOJA,
  TemaDaMarca,
  type PreferenciaDoSelo,
} from "@simpleclick/ui";

import { capaPadraoDe } from "../../lib/capa-padrao.ts";
import { iniciaisDe } from "../../lib/iniciais.ts";
import { atributosDoSelo } from "../vitrine/SeloDeStatus.tsx";
import { FotoDaLoja } from "./FotoDaLoja.tsx";

/** O tema da loja: a cor de destaque e as fotos que o dono escolheu. */
export interface TemaNaTela {
  readonly corDestaque: string;
  readonly fundoVitrine: string | null;
  readonly topoCardapio: string | null;
  /** As versões das fotos para o celular (telas estreitas); nulas: vale a do computador. */
  readonly fundoVitrineCelular?: string | null | undefined;
  readonly topoCardapioCelular?: string | null | undefined;
  /** O selo ABERTO/FECHADO sobre a capa (card #64); padrão automático. */
  readonly seloDeStatus?: PreferenciaDoSelo | undefined;
  /** A cor medida de cada imagem, pelo endereço. */
  readonly coresDasImagens?: Readonly<Record<string, string>> | undefined;
}

/** A cor de destaque de quem ainda não escolheu: o verde SimpleClick. */
export const COR_DE_DESTAQUE_PADRAO = COR_DE_DESTAQUE_PADRAO_DA_LOJA;

/** A loja, como o contrato da API a descreve. */
export interface LojaNaTela {
  readonly apelido: string;
  readonly nome: string;
  /**
   * O código do tipo de negócio (`vertical_code`), que escolhe a capa padrão
   * quando o dono não enviou a dele. Ausente, vale a capa padrão genérica.
   */
  readonly ramo?: string | null | undefined;
  readonly boasVindas: string | null;
  /** O texto "Sobre" da loja; aqui vai resumido, a janela do Sobre traz inteiro. */
  readonly sobre?: string | null | undefined;
  readonly logo: string | null;
  readonly capa: string | null;
  readonly formasDeEntrega: readonly string[];
  readonly cores?: Readonly<Record<string, string>> | null | undefined;
  readonly tema?: TemaNaTela | null | undefined;
  readonly enderecoParaRetirada: {
    readonly logradouro: string | null;
    readonly numero: string | null;
    readonly complemento: string | null;
    readonly bairro: string | null;
    readonly cidade: string | null;
    readonly uf: string | null;
  } | null;
}

/** Se está aberta agora, e quando volta a abrir. */
export interface AberturaNaTela {
  readonly aberta: boolean;
  readonly proximaAbertura: string | null;
  readonly motivo: string;
  readonly explicacaoDaExcecao?: string | null | undefined;
}

export interface ApresentacaoDaLojaProps {
  readonly loja: LojaNaTela;
  readonly abertura: AberturaNaTela;
  /** Para onde vai quem quer ver o catálogo. */
  readonly linkDoCardapio: string;
  /**
   * A palavra do RAMO para o catálogo — "Cardápio", "Catálogo".
   *
   * LOJA DE ROUPA NÃO TEM CARDÁPIO. O botão que diz "Ver o cardápio" acerta na
   * lanchonete e erra na loja de roupas, e é o botão principal da tela.
   */
  readonly rotuloDoCatalogo: string;
}

const NOME_DA_ENTREGA: Record<string, string> = {
  DELIVERY: "Entrega",
  PICKUP: "Retirada no local",
};

/**
 * A cor de reserva quando a loja não escolheu nenhuma.
 *
 * Vem do valor declarado do design system, e não escrita aqui: cor literal em
 * componente é reprovada pelo ESLint (AC-014), e por bom motivo — duas cópias
 * do mesmo azul divergem no dia em que alguém muda uma delas.
 */

/** Junta as partes do endereço numa linha, sem vírgula sobrando. */
function enderecoEmUmaLinha(
  endereco: NonNullable<LojaNaTela["enderecoParaRetirada"]>,
): string {
  const rua = [endereco.logradouro, endereco.numero].filter(Boolean).join(", ");
  const cidade = [endereco.cidade, endereco.uf].filter(Boolean).join("/");
  return [rua, endereco.complemento, endereco.bairro, cidade]
    .filter(Boolean)
    .join(" · ");
}

/**
 * A situação da loja, como uma marca e não como uma caixa de aviso.
 *
 * Caixa de aviso é para o que interrompe. "Aberta agora" não interrompe: é um
 * dado da loja, tão permanente quanto o endereço dela, e emoldurá-lo faria a
 * tela parecer que algo deu errado.
 */
function SituacaoDaLoja({
  abertura,
  seloDeStatus,
  corDoFundo,
}: {
  readonly abertura: AberturaNaTela;
  readonly seloDeStatus: PreferenciaDoSelo | null | undefined;
  readonly corDoFundo: string | null;
}) {
  const selo = atributosDoSelo({
    preferencia: seloDeStatus,
    corDoFundo,
    aberta: abertura.aberta,
  });
  const explicacao =
    abertura.motivo === "EXCECAO" && abertura.explicacaoDaExcecao
      ? abertura.explicacaoDaExcecao
      : null;

  return (
    <p
      className={`sc-loja__situacao sc-loja__situacao--${
        abertura.aberta ? "aberta" : "fechada"
      } ${selo.className}`}
      style={selo.style}
      data-selo={selo["data-selo"]}
    >
      {/* O ponto é decoração: quem ouve a página recebe o texto ao lado. */}
      <span className="sc-loja__pulso" aria-hidden="true" />
      <span className="sc-loja__situacao-texto">
        {abertura.aberta ? (
          "Aberta agora"
        ) : (
          <>
            {explicacao ? `${explicacao} · ` : "Fechada agora · "}
            {abertura.proximaAbertura ?? "horário não informado"}
          </>
        )}
      </span>
    </p>
  );
}

export function ApresentacaoDaLoja({
  loja,
  abertura,
  linkDoCardapio,
  rotuloDoCatalogo,
}: ApresentacaoDaLojaProps) {
  const temDetalhes =
    loja.formasDeEntrega.length > 0 || loja.enderecoParaRetirada !== null;
  // A foto de fundo da vitrine que o dono escolheu manda; depois a capa dele.
  const fundo = loja.tema?.fundoVitrine ?? loja.capa;
  // A versão do celular só vale junto da foto de fundo do tema (a capa antiga
  // não tem versão própria).
  const fundoCelular = loja.tema?.fundoVitrine
    ? (loja.tema.fundoVitrineCelular ?? null)
    : null;

  return (
    <TemaDaMarca
      corDestaque={loja.tema?.corDestaque ?? COR_DE_DESTAQUE_PADRAO}
      className="sc-loja"
    >
      <div data-narrativa="apresentacao">
        <section className="sc-loja__tela" data-secao="loja">
          {/*
            O PAINEL É A LOJA. Fundo grafite da SimpleClick, o nome em letra
            grande sobre a faixa verde-click e a cor do dono só no anel da marca
            — a identidade da plataforma emoldura, a da loja assina. Quando o
            dono sobe uma capa, ela vira o fundo do painel inteiro, sob um véu
            escuro que mantém a letra legível.
          */}
          <div
            className={`sc-loja__painel ${
              fundo ? "sc-loja__painel--com-capa" : "sc-loja__painel--padrao"
            }`}
          >
            {fundo ? (
              <>
                {/* A capa é ambiente: o nome da loja já está no título. */}
                <FotoDaLoja
                  className="sc-loja__fundo"
                  src={fundo}
                  celular={fundoCelular}
                  width={1600}
                  height={1200}
                  loading="eager"
                />
                <span className="sc-loja__veu" aria-hidden="true" />
              </>
            ) : (
              <>
                {/*
                  Sem capa do dono, a capa padrão do ramo: ícones do negócio em
                  traço verde-click sobre o grafite. Decoração pura, como a
                  trama de pontos, e some para o leitor de tela.
                */}
                <span
                  className="sc-loja__padrao"
                  data-capa-padrao={loja.ramo ?? ""}
                  style={
                    {
                      "--capa-url": `url(${capaPadraoDe(loja.ramo)})`,
                    } as CSSProperties
                  }
                  aria-hidden="true"
                />
                <span className="sc-loja__trama" aria-hidden="true" />
              </>
            )}

            <header className="sc-loja__identidade">
              <div className="sc-loja__topo">
                <span className="sc-loja__marca">
                  {loja.logo ? (
                    // A dimensão vai na marcação para o espaço já estar
                    // reservado e a página não pular (AC-416).
                    <img
                      className="sc-loja__logo"
                      src={loja.logo}
                      alt=""
                      width={88}
                      height={88}
                      loading="eager"
                    />
                  ) : (
                    <span className="sc-loja__iniciais" aria-hidden="true">
                      {iniciaisDe(loja.nome)}
                    </span>
                  )}
                </span>
                <SituacaoDaLoja
                  abertura={abertura}
                  seloDeStatus={loja.tema?.seloDeStatus}
                  corDoFundo={
                    fundo ? (loja.tema?.coresDasImagens?.[fundo] ?? null) : null
                  }
                />
              </div>

              <h1 className="sc-loja__nome">
                <span className="sc-marcador">{loja.nome}</span>
              </h1>

              {loja.boasVindas ? (
                <p className="sc-loja__boas-vindas">{loja.boasVindas}</p>
              ) : null}

              {loja.sobre ? (
                <div className="sc-loja__sobre">
                  {/*
                    O caminho para a página inteira é um LINK DE TEXTO dentro do
                    filete, e não um botão: botão em pílula aqui disputava com
                    "Ver o cardápio", que é a ação que importa nesta tela.
                  */}
                  <div className="sc-loja__ficha">
                    <p className="sc-loja__ficha-titulo">Sobre a loja</p>
                    <p className="sc-loja__sobre-texto">{loja.sobre}</p>
                    {/*
                      Abre a JANELA do Sobre por cima desta tela (o ouvinte
                      mora em `JanelaDoSobre`); sem script, é um link comum
                      para a mesma loja com a janela aberta.
                    */}
                    <a
                      className="sc-loja__ler-mais"
                      href={`/loja/${loja.apelido}/sobre`}
                      data-abre-sobre=""
                    >
                      Ler mais sobre a loja
                      <svg
                        className="sc-loja__seta"
                        viewBox="0 0 20 20"
                        width="16"
                        height="16"
                        aria-hidden="true"
                      >
                        <path
                          d="M4 10h11M11 5l5 5-5 5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </a>
                  </div>
                </div>
              ) : null}
            </header>

            <div className="sc-loja__base">
              {/*
                O caminho para o cardápio é um link de verdade, e não um botão
                que navega por script: funciona com JavaScript desligado, abre
                em nova aba pelo teclado, e o buscador o segue.
              */}
              <p className="sc-loja__chamada">
                <a className="sc-loja__entrar" href={linkDoCardapio}>
                  <span>Ver o {rotuloDoCatalogo.toLowerCase()}</span>
                  <span className="sc-loja__seta-caixa" aria-hidden="true">
                    <svg
                      className="sc-loja__seta"
                      viewBox="0 0 20 20"
                      width="20"
                      height="20"
                    >
                      <path
                        d="M4 10h11M11 5l5 5-5 5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </a>
                {!abertura.aberta ? (
                  <span className="sc-loja__nota">
                    Você pode ver o {rotuloDoCatalogo.toLowerCase()} e voltar
                    depois.
                  </span>
                ) : null}
              </p>

              {temDetalhes ? (
                <footer className="sc-loja__detalhes">
                  {loja.formasDeEntrega.length > 0 ? (
                    <div className="sc-loja__ficha">
                      <p className="sc-loja__ficha-titulo">Como receber</p>
                      <ul className="sc-loja__formas">
                        {loja.formasDeEntrega.map((forma) => (
                          <li key={forma}>{NOME_DA_ENTREGA[forma] ?? forma}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {loja.enderecoParaRetirada ? (
                    <div className="sc-loja__ficha">
                      <p className="sc-loja__ficha-titulo">Onde estamos</p>
                      <address className="sc-loja__endereco">
                        {enderecoEmUmaLinha(loja.enderecoParaRetirada)}
                      </address>
                    </div>
                  ) : null}

                  {/* Segunda porta da janela do Sobre, para quem procura o horário. */}
                  <div className="sc-loja__ficha">
                    <p className="sc-loja__ficha-titulo">Informações</p>
                    <a
                      className="sc-loja__ler-mais"
                      href={`/loja/${loja.apelido}/sobre`}
                      data-abre-sobre=""
                    >
                      Horários, pagamento e contato
                    </a>
                  </div>
                </footer>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </TemaDaMarca>
  );
}
