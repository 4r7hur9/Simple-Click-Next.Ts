/**
 * A capa do cardápio: o painel grafite no topo da vitrine.
 *
 * É a mesma linguagem da porta da loja, em versão curta. Quem chegou por um
 * link direto para o cardápio reconhece onde está: o nome da loja, se ela está
 * aberta, e o título em letra grande sobre a faixa verde-click — a assinatura
 * da SimpleClick, com a cor da loja no que é dela (o pulso, o anel, o botão).
 *
 * DESENHADA NO SERVIDOR, sem script: é o primeiro bloco que a pessoa vê, e ele
 * não pode esperar JavaScript numa página que precisa abrir em rede ruim
 * (AC-415). O `h1` da página mora aqui.
 */
import {
  fraseDaSituacao,
  type AberturaDaLoja,
} from "../../lib/situacao-da-loja.ts";

export interface CapaDaVitrineProps {
  readonly nomeDaLoja: string;
  /** Como a loja chama o catálogo: "Cardápio", "Catálogo". É o título. */
  readonly rotuloDoCatalogo: string;
  readonly abertura: AberturaDaLoja;
  /** A frase de boas-vindas que o dono escreveu, se escreveu. */
  readonly boasVindas?: string | null | undefined;
}

export function CapaDaVitrine({
  nomeDaLoja,
  rotuloDoCatalogo,
  abertura,
  boasVindas = null,
}: CapaDaVitrineProps) {
  return (
    <header className="sc-capa">
      <div className="sc-capa__conteudo">
        <p className="sc-capa__loja">{nomeDaLoja}</p>

        <h1 className="sc-vitrine__titulo" id="titulo-do-catalogo">
          <span className="sc-marcador">{rotuloDoCatalogo}</span>
        </h1>

        <p
          className={`sc-situacao sc-situacao--${
            abertura.aberta ? "aberta" : "fechada"
          }`}
        >
          {/* O ponto é decoração: quem ouve a página recebe o texto ao lado. */}
          <span className="sc-situacao__pulso" aria-hidden="true" />
          <span>{fraseDaSituacao(abertura)}</span>
        </p>

        {boasVindas ? <p className="sc-capa__frase">{boasVindas}</p> : null}
      </div>
    </header>
  );
}
