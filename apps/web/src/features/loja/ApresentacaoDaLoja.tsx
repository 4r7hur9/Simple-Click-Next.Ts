/**
 * A apresentação da loja, em UMA TELA (AC-400, AC-401, AC-015).
 *
 * A DECISÃO QUE MANDA AQUI: quem abre o endereço de uma loja quer o cardápio.
 * Esta página é uma porta, não um destino — e porta com três telas de rolagem
 * até a maçaneta é atrito no mesmo lugar em que a skill manda não ter nenhum.
 *
 * A SEGUNDA DECISÃO: a página tem a cara da SIMPLECLICK e a assinatura da LOJA.
 * O painel é grafite, com a trama e o tipo da marca; a cor que o dono escolheu
 * pinta o que é dele — o anel da marca, o pulso, o botão e os brilhos do fundo
 * — com o contraste ajustado pelo próprio design system (AC-015). Sem isso a
 * pastelaria e a loja de roupa teriam exatamente a mesma tela.
 *
 * ESTE COMPONENTE NÃO ANIMA NADA. Ele desenha a página inteira, legível, com
 * JavaScript desligado — que é o que o AC-415 exige e o que a torna encontrável.
 */
import { PALETA_CLARA, TemaDaLoja } from "@simpleclick/ui";

import { iniciaisDe } from "../../lib/iniciais.ts";
import {
  fraseDaSituacao,
  type AberturaDaLoja,
} from "../../lib/situacao-da-loja.ts";
import { MundoDaLoja } from "./MundoDaLoja.tsx";

/** A loja, como o contrato da API a descreve. */
export interface LojaNaTela {
  readonly apelido: string;
  readonly nome: string;
  readonly boasVindas: string | null;
  readonly logo: string | null;
  readonly capa: string | null;
  readonly formasDeEntrega: readonly string[];
  readonly cores?: Readonly<Record<string, string>> | null | undefined;
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
export type AberturaNaTela = AberturaDaLoja;

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
 * componente é reprovada pelo ESLint (AC-014).
 */
const COR_DE_RESERVA = PALETA_CLARA.primaria;

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
function SituacaoDaLoja({ abertura }: { readonly abertura: AberturaNaTela }) {
  return (
    <p
      className={`sc-situacao sc-loja__situacao sc-situacao--${
        abertura.aberta ? "aberta" : "fechada"
      }`}
    >
      {/* O ponto é decoração: quem ouve a página recebe o texto ao lado. */}
      <span className="sc-situacao__pulso" aria-hidden="true" />
      <span className="sc-loja__situacao-texto">
        {fraseDaSituacao(abertura)}
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
  const temRodape =
    loja.formasDeEntrega.length > 0 || loja.enderecoParaRetirada !== null;

  return (
    <TemaDaLoja
      corPrincipal={loja.cores?.["primaria"] ?? COR_DE_RESERVA}
      className="sc-loja"
    >
      <div data-narrativa="apresentacao">
        {/*
          O fundo é decoração pura: a trama da marca e dois lavados da cor da
          loja, para a tela ter profundidade sem carregar imagem. Fica fora do
          fluxo e some para o leitor de tela.
        */}
        <div className="sc-loja__fundo" aria-hidden="true">
          <MundoDaLoja />
          <span className="sc-loja__trama" />
          <span className="sc-loja__brilho sc-loja__brilho--um" />
          <span className="sc-loja__brilho sc-loja__brilho--dois" />
        </div>

        <section className="sc-loja__tela" data-secao="loja">
          <header className="sc-loja__identidade">
            <span className="sc-loja__marca">
              {loja.logo ? (
                // A dimensão vai na marcação para o espaço já estar reservado e
                // a página não pular quando a imagem carregar (AC-416).
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

            <h1 className="sc-loja__nome">
              <span className="sc-marcador sc-marcador--marca">
                {loja.nome}
              </span>
            </h1>

            <SituacaoDaLoja abertura={abertura} />

            {loja.boasVindas ? (
              <p className="sc-loja__boas-vindas">{loja.boasVindas}</p>
            ) : null}
          </header>

          {/*
            O caminho para o cardápio fica no meio da tela: é o que a pessoa veio
            buscar, e o polegar dela alcança o centro sem esticar.

            É um link de verdade, e não um botão que navega por script: funciona
            com JavaScript desligado, abre em nova aba pelo teclado, e o buscador
            o segue.
          */}
          <p className="sc-loja__chamada">
            <a className="sc-loja__entrar" href={linkDoCardapio}>
              <span>Ver o {rotuloDoCatalogo.toLowerCase()}</span>
              <svg
                className="sc-loja__seta"
                viewBox="0 0 20 20"
                width="20"
                height="20"
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
            {!abertura.aberta ? (
              <span className="sc-loja__nota">
                Você pode ver o {rotuloDoCatalogo.toLowerCase()} e voltar
                depois.
              </span>
            ) : null}
          </p>

          {temRodape ? (
            <footer className="sc-loja__detalhes">
              {loja.formasDeEntrega.length > 0 ? (
                <ul className="sc-loja__formas">
                  {loja.formasDeEntrega.map((forma) => (
                    <li key={forma}>{NOME_DA_ENTREGA[forma] ?? forma}</li>
                  ))}
                </ul>
              ) : null}

              {loja.enderecoParaRetirada ? (
                <address className="sc-loja__endereco">
                  {enderecoEmUmaLinha(loja.enderecoParaRetirada)}
                </address>
              ) : null}
            </footer>
          ) : null}
        </section>
      </div>
    </TemaDaLoja>
  );
}
