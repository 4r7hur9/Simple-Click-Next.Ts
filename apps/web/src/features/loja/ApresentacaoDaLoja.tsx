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
import { PALETA_CLARA, TemaDaLoja } from "@simpleclick/ui";

import { iniciaisDe } from "../../lib/iniciais.ts";

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
export interface AberturaNaTela {
  readonly aberta: boolean;
  readonly proximaAbertura: string | null;
  readonly motivo: string;
  readonly explicacaoDaExcecao?: string | null | undefined;
}

export interface ApresentacaoDaLojaProps {
  readonly loja: LojaNaTela;
  readonly abertura: AberturaNaTela;
  /** Para onde vai quem quer ver o cardápio. */
  readonly linkDoCardapio: string;
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
  const explicacao =
    abertura.motivo === "EXCECAO" && abertura.explicacaoDaExcecao
      ? abertura.explicacaoDaExcecao
      : null;

  return (
    <p
      className={`sc-loja__situacao sc-loja__situacao--${
        abertura.aberta ? "aberta" : "fechada"
      }`}
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
          O fundo é decoração pura: um lavado da cor da loja, em camadas, para a
          tela ter profundidade sem carregar imagem. Fica fora do fluxo e some
          para o leitor de tela.
        */}
        <div className="sc-loja__fundo" aria-hidden="true">
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

            <h1 className="sc-loja__nome">{loja.nome}</h1>

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
              <span>Ver o cardápio</span>
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
                Você pode ver o cardápio e voltar depois.
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
