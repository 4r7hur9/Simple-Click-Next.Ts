import "@simpleclick/ui/styles/cadastro.css";

import type { LojaEmAnaliseNaTela } from "./tipos.ts";
import { dataHoraDoBrasil } from "./formato.ts";
import { AcoesDaAprovacao } from "./AcoesDaAprovacao.tsx";

/**
 * "Cadastro em análise" / "Cadastro recusado": o que o dono vê no painel
 * enquanto a administração não aprova a loja (card #28).
 *
 * Substitui o painel inteiro (sem menu, sem pedidos, sem produtos): até a
 * aprovação não há função de venda para usar. Aguardando: mensagem amigável,
 * o que acontece agora, editar os dados e o contato do suporte. Recusada: o
 * motivo que a administração deu, e a pessoa corrige os dados e reenvia.
 * Quando a loja é aprovada, o painel volta ao normal na próxima página.
 */
export function TelaDeAprovacao({
  loja,
  dados,
  suporte,
}: {
  readonly loja: {
    readonly apelido: string;
    readonly nome: string;
    readonly situacao: string;
  };
  /** Os dados cadastrados; `null` quando a API não entregou. */
  readonly dados: LojaEmAnaliseNaTela | null;
  readonly suporte: string;
}) {
  const recusada = loja.situacao === "REJECTED";

  return (
    <main className="sc-aprovacao" aria-labelledby="aprovacao-titulo">
      <div className="sc-aprovacao__cartao">
        <div className="sc-aprovacao__topo">
          <span className="sc-aprovacao__marca">simpleclick</span>
          <span
            className="sc-aprovacao__selo"
            data-tom={recusada ? "recusada" : "analise"}
          >
            {recusada ? "Precisa de ajustes" : "Em análise"}
          </span>
        </div>

        <header>
          <h1 id="aprovacao-titulo" className="sc-aprovacao__titulo">
            {recusada ? "Seu cadastro precisa de ajustes" : "Cadastro em análise"}
          </h1>
          <p className="sc-aprovacao__texto">
            {recusada
              ? "A equipe do SimpleClick olhou o cadastro da sua loja e pediu uma correção. Ajuste os dados e envie de novo."
              : "Recebemos o cadastro da sua loja. Assim que a equipe do SimpleClick aprovar, o painel completo é liberado para você."}
          </p>
        </header>

        <div className="sc-aprovacao__loja">
          <strong>{dados === null ? loja.nome : dados.nome}</strong>
          <span>Endereço: /loja/{loja.apelido}</span>
          {dados?.cidade ? (
            <span>
              {dados.cidade}
              {dados.uf ? ` - ${dados.uf}` : ""}
            </span>
          ) : null}
        </div>

        {recusada ? (
          <p className="sc-aprovacao__motivo" role="status">
            <strong>Motivo informado pela equipe:</strong>{" "}
            {dados?.recusa?.motivo || "Fale com o suporte para saber mais."}
            {dados?.recusa ? (
              <>
                <br />
                <small>em {dataHoraDoBrasil(dados.recusa.desde)}</small>
              </>
            ) : null}
          </p>
        ) : (
          <ol className="sc-aprovacao__passos">
            <li>
              <span>
                <strong>A equipe confere o cadastro</strong>
                Isso costuma levar pouco tempo.
              </span>
            </li>
            <li>
              <span>
                <strong>Sua loja é liberada</strong>
                Você entra de novo no painel e já vê tudo: produtos, pedidos e
                o link da vitrine.
              </span>
            </li>
            <li>
              <span>
                <strong>Você vende</strong>
                Depois é só cadastrar os produtos e compartilhar o link.
              </span>
            </li>
          </ol>
        )}

        <AcoesDaAprovacao
          recusada={recusada}
          dados={
            dados === null
              ? null
              : {
                  nome: dados.nome,
                  tipoDeNegocio: dados.tipoDeNegocio,
                  whatsapp: dados.whatsapp ?? "",
                  cidade: dados.cidade ?? "",
                  uf: dados.uf ?? "",
                }
          }
        />

        <p className="sc-aprovacao__rodape">
          Dúvidas? Escreva para{" "}
          <a href={`mailto:${suporte}`}>{suporte}</a>.
        </p>
      </div>
    </main>
  );
}
