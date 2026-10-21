/**
 * A quantidade e o botão de adicionar, com o total do item (AC-410, AC-411,
 * AC-413).
 *
 * O TOTAL VIVE NO BOTÃO, e não em outro canto da página. É o número que decide
 * a compra, e o polegar já está ali — separá-lo obrigaria a pessoa a olhar para
 * cima para conferir antes de apertar.
 *
 * O BOTÃO NÃO FICA DESABILITADO QUANDO FALTA ESCOLHA, e isso é deliberado. Um
 * botão apagado não explica o que falta: a pessoa toca, nada acontece, e ela
 * conclui que a página quebrou. O AC-412 pede o contrário — que a página
 * RECUSE, role até o grupo pendente e diga o que falta. Para isso o botão
 * precisa continuar clicável.
 *
 * ELE FICA DESABILITADO QUANDO O PRODUTO NÃO ESTÁ À VENDA (AC-413), porque aí
 * não há nada que a pessoa possa fazer na página para resolver — e a explicação
 * aparece ao lado, que é o que o critério exige.
 *
 * AO LADO DO BOTÃO, o carrinho. É um link, e não outro botão de ação: depois
 * de adicionar, o próximo passo de quem terminou é conferir e fechar, e ele
 * fica no mesmo lugar do polegar.
 */
import { IconeAdicionar, IconePedido, IconeRemover } from "@simpleclick/ui";

export interface BotaoAdicionarProps {
  /** O total do item, já escrito como dinheiro. */
  readonly total: string;
  readonly quantidade: number;
  /** Falso quando o produto não está à venda (AC-413). */
  readonly aVenda: boolean;
  /** A frase que explica por que não está à venda. */
  readonly explicacao?: string | null | undefined;
  /** Verdadeiro enquanto a adição está indo ao servidor. */
  readonly enviando?: boolean | undefined;
  readonly aoMudarQuantidade: (quantidade: number) => void;
  readonly aoAdicionar: () => void;
  /** Para onde vai quem quer ver o carrinho. Sem ele, o atalho não aparece. */
  readonly linkDoCarrinho?: string | undefined;
}

/** O teto de unidades por item, para o dedo escorregado não pedir 200 coxinhas. */
const MAXIMO = 99;

export function BotaoAdicionar({
  total,
  quantidade,
  aVenda,
  explicacao = null,
  enviando = false,
  aoMudarQuantidade,
  aoAdicionar,
  linkDoCarrinho,
}: BotaoAdicionarProps) {
  return (
    <div className="sc-produto__acao">
      {aVenda ? (
        <div
          className="sc-produto__quantidade"
          role="group"
          aria-label="Quantidade"
        >
          <button
            type="button"
            className="sc-produto__passo"
            onClick={() => aoMudarQuantidade(Math.max(1, quantidade - 1))}
            disabled={quantidade <= 1}
            aria-label="Diminuir a quantidade"
          >
            <IconeRemover />
          </button>
          {/*
            O número é texto, e não campo de digitação. Campo numérico no
            celular abre teclado, exige validação de "12a" e permite colar
            "1e9" — três problemas para uma escolha que são dois botões.
            `aria-live` faz o leitor de tela anunciar a mudança.
          */}
          <span className="sc-produto__contagem" aria-live="polite">
            {quantidade}
          </span>
          <button
            type="button"
            className="sc-produto__passo"
            onClick={() => aoMudarQuantidade(Math.min(MAXIMO, quantidade + 1))}
            disabled={quantidade >= MAXIMO}
            aria-label="Aumentar a quantidade"
          >
            <IconeAdicionar />
          </button>
        </div>
      ) : null}

      <button
        type="button"
        className="sc-produto__adicionar"
        onClick={aoAdicionar}
        disabled={!aVenda || enviando}
      >
        {aVenda ? (
          <>
            <span>{enviando ? "Adicionando…" : "Adicionar à sacola"}</span>
            {/*
              O total muda a cada escolha, e o leitor de tela precisa ouvir a
              mudança — senão quem não vê aperta sem saber quanto vai pagar.
            */}
            <span className="sc-produto__total" aria-live="polite">
              {total}
            </span>
          </>
        ) : (
          <span>Indisponível</span>
        )}
      </button>

      {linkDoCarrinho ? (
        <a
          className="sc-botao sc-botao--secundaria sc-botao--pilula sc-botao--grande sc-botao--so-icone sc-produto__carrinho"
          href={linkDoCarrinho}
        >
          <IconePedido />
          <span className="sc-so-leitor">Ver o carrinho</span>
        </a>
      ) : null}

      {explicacao ? (
        <p className="sc-produto__indisponivel">{explicacao}</p>
      ) : null}
    </div>
  );
}
