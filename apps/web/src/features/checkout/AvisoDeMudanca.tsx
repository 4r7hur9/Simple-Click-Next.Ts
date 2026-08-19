"use client";

/**
 * O que mudou no carrinho, antes de fechar (AC-503).
 *
 * A REGRA DESTA TELA é que ela INTERROMPE. O botão de fechar não fica ao lado
 * do aviso como se fosse mais uma informação: enquanto houver mudança não
 * confirmada, fechar não é oferecido. Aviso que se pode ignorar com um clique
 * no botão de sempre não avisa nada — a pessoa clica onde já ia clicar e
 * descobre o preço novo na fatura.
 *
 * Cada mudança aparece com o NOME do item, inclusive quando o servidor não
 * conseguiu nomeá-lo: produto que saiu do cardápio some do que a requisição
 * enxerga, e quem sabe o nome é esta tela, que está mostrando o carrinho.
 */
import { Aviso, Botao } from "@simpleclick/ui";

/** Uma mudança, como o servidor a descreve. */
export interface MudancaNaTela {
  readonly itemId: string;
  readonly tipo:
    "PRECO_SUBIU" | "PRECO_CAIU" | "INDISPONIVEL" | "SAIU_DO_CATALOGO";
  readonly explicacao: string;
}

export interface AvisoDeMudancaProps {
  readonly mudancas: readonly MudancaNaTela[];
  /** Nome de cada item do carrinho, para nomear o que o servidor não nomeou. */
  readonly nomesDoCarrinho?: Readonly<Record<string, string>> | undefined;
  /** O total recalculado pelo servidor, já escrito. */
  readonly novoTotal: string;
  readonly aoConfirmar: () => void;
  readonly aoVoltarAoCarrinho?: (() => void) | undefined;
}

const TITULOS: Record<MudancaNaTela["tipo"], string> = {
  PRECO_SUBIU: "Preço aumentou",
  PRECO_CAIU: "Preço baixou",
  INDISPONIVEL: "Acabou",
  SAIU_DO_CATALOGO: "Saiu do cardápio",
};

/** Troca o texto genérico pelo nome que a tela conhece. */
function comNome(
  mudanca: MudancaNaTela,
  nomes: Readonly<Record<string, string>> | undefined,
): string {
  const nome = nomes?.[mudanca.itemId];
  if (nome === undefined) return mudanca.explicacao;
  return mudanca.explicacao.replace("Um item do seu carrinho", nome);
}

export function AvisoDeMudanca({
  mudancas,
  nomesDoCarrinho,
  novoTotal,
  aoConfirmar,
  aoVoltarAoCarrinho,
}: AvisoDeMudancaProps) {
  if (mudancas.length === 0) return null;

  return (
    <Aviso
      tom="atencao"
      titulo={
        mudancas.length === 1
          ? "Uma coisa mudou no seu carrinho"
          : `${mudancas.length} coisas mudaram no seu carrinho`
      }
    >
      <ul className="sc-mudancas">
        {mudancas.map((mudanca) => (
          <li className="sc-mudancas__item" key={mudanca.itemId + mudanca.tipo}>
            <strong className="sc-mudancas__tipo">
              {TITULOS[mudanca.tipo]}
            </strong>{" "}
            {comNome(mudanca, nomesDoCarrinho)}
          </li>
        ))}
      </ul>

      <p className="sc-mudancas__total">
        Novo total: <strong>{novoTotal}</strong>
      </p>

      <Botao onClick={aoConfirmar}>Confirmar e continuar</Botao>
      {aoVoltarAoCarrinho ? (
        <Botao variante="secundaria" onClick={aoVoltarAoCarrinho}>
          Voltar ao carrinho
        </Botao>
      ) : null}
    </Aviso>
  );
}
