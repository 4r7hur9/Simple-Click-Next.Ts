import { TelaDeAprovacao } from "../../../../features/aprovacao/TelaDeAprovacao.tsx";
import {
  emailDeSuporte,
  lerLojaEmAnalise,
} from "../../../../server/loja-em-analise.ts";

/** Busca os dados da loja em análise e mostra a tela (card #28). */
export async function TelaDeAprovacaoDaLoja({
  loja,
  token,
}: {
  readonly loja: {
    readonly apelido: string;
    readonly nome: string;
    readonly situacao: string;
  };
  readonly token: string;
}) {
  const dados = await lerLojaEmAnalise(token, loja.apelido);
  return (
    <TelaDeAprovacao loja={loja} dados={dados} suporte={emailDeSuporte()} />
  );
}
