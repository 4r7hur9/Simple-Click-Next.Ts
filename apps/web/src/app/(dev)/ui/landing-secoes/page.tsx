
import {
  DadosDeMercado,
  Depoimentos,
  FaixaDeConfianca,
  PerguntasFrequentes,
} from "../../../../features/landing/secoes/index.ts";

/**
 * Página `/ui/landing-secoes`: as seções de prova da landing (#87), uma de
 * cada vez, para conferir sem abrir a landing inteira.
 */
export default function PreviaDasSecoesDeProva() {
  return (
    <main>
      <DadosDeMercado />
      <Depoimentos />
      <PerguntasFrequentes />
      <FaixaDeConfianca />
    </main>
  );
}
