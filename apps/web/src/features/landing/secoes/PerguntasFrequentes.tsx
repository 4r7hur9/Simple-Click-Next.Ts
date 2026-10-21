import { Mail, Plus } from "lucide-react";

import { emailDeSuporte } from "../../../lib/email-de-suporte.ts";
import { Comecar } from "../Comecar.tsx";
import { PERGUNTAS_FREQUENTES, TEXTO_DAS_PERGUNTAS, type PerguntaFrequente } from "./conteudo-de-prova.ts";
import { ApoioDaTela, Pilula, TelaDaLanding, TituloDaTela, ordem } from "./TelaDaLanding.tsx";

export interface PerguntasFrequentesProps {
  perguntas?: readonly PerguntaFrequente[] | undefined;
  id?: string | undefined;
  /** Para onde vai o "Falar com a gente" (padrão: o e-mail do suporte). */
  contato?: string | undefined;
}

/**
 * "Perguntas frequentes" (#duvidas): à esquerda, o título e o cartão de
 * contato com os dois botões; à direita, a sanfona numerada. Uma resposta
 * aberta por vez (`details name`, nativo: teclado e busca do navegador
 * funcionam, e sem script também).
 */
export function PerguntasFrequentes({
  perguntas = PERGUNTAS_FREQUENTES,
  id = "perguntas",
  contato = `mailto:${emailDeSuporte()}`,
}: PerguntasFrequentesProps) {
  const texto = TEXTO_DAS_PERGUNTAS;
  const tituloId = `${id}-titulo`;
  return (
    <TelaDaLanding id={id} personalidade="duvidas" tituloId={tituloId}>
      <div className="sc-duvidas">
        <div className="sc-duvidas__lado">
          <header className="sc-tela__cabeca">
            <Pilula>{texto.sobrancelha}</Pilula>
            <TituloDaTela id={tituloId} trechos={texto.titulo} />
            <ApoioDaTela trechos={texto.apoio} />
          </header>
          <div className="sc-duvidas__contato" data-surge style={ordem(3)}>
            <p className="sc-duvidas__contato-texto">
              <span aria-hidden="true" className="sc-duvidas__contato-icone">
                <Mail size={18} strokeWidth={1.9} />
              </span>
              <span>
                Resposta por e-mail em <strong>{contato.replace(/^mailto:/, "")}</strong>
              </span>
            </p>
            <div className="sc-duvidas__botoes">
              <a className="sc-lp-botao sc-lp-botao--contorno" href={contato}>
                <span>{texto.chamada}</span>
                <Mail aria-hidden="true" size={18} strokeWidth={2} />
              </a>
              <Comecar />
            </div>
          </div>
        </div>

        <div className="sc-duvidas__lista" data-surge style={ordem(4)}>
          {perguntas.map((p, indice) => (
            <details className="sc-duvidas__item" key={p.pergunta} name={`${id}-grupo`}>
              <summary>
                <span aria-hidden="true" className="sc-duvidas__numero">
                  {String(indice + 1).padStart(2, "0")}
                </span>
                <span className="sc-duvidas__pergunta">{p.pergunta}</span>
                <span aria-hidden="true" className="sc-duvidas__sinal">
                  <Plus size={18} strokeWidth={2.25} />
                </span>
              </summary>
              <p className="sc-duvidas__resposta">{p.resposta}</p>
            </details>
          ))}
        </div>
      </div>
    </TelaDaLanding>
  );
}
