import { Hamburger, Quote, Sandwich, Shirt, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Comecar } from "../Comecar.tsx";
import { DEPOIMENTOS_DE_EXEMPLO, TEXTO_DOS_DEPOIMENTOS, type Depoimento } from "./conteudo-de-prova.ts";
import { iniciaisDe } from "./iniciais.ts";
import { ApoioDaTela, Pilula, TelaDaLanding, TituloDaTela, ordem } from "./TelaDaLanding.tsx";

export interface DepoimentosProps {
  /** Depoimentos reais entram aqui, com `ilustrativo: false`. */
  depoimentos?: readonly Depoimento[] | undefined;
  id?: string | undefined;
}

const ICONE_DO_RAMO: Readonly<Record<NonNullable<Depoimento["ramo"]>, LucideIcon>> = {
  hamburgueria: Hamburger,
  pastelaria: Sandwich,
  roupa: Shirt,
};

/** A fala, com o pedaço que importa no marca-texto. */
function FalaComDestaque({ fala, destaque }: { readonly fala: string; readonly destaque?: string | undefined }): ReactNode {
  const onde = destaque ? fala.indexOf(destaque) : -1;
  if (!destaque || onde < 0) return fala;
  return (
    <>
      {fala.slice(0, onde)}
      <mark className="sc-vozes__marca">{destaque}</mark>
      {fala.slice(onde + destaque.length)}
    </>
  );
}

/**
 * "Como lojistas usam" (#depoimentos): uma fala grande e duas menores, em
 * cartões de vidro sobre luz quente. Enquanto não houver clientes reais, as
 * falas são exemplos, e a seção diz isso numa linha discreta (e cada cartão
 * leva o selo "exemplo ilustrativo"): nada finge ser cliente de verdade.
 */
export function Depoimentos({ depoimentos = DEPOIMENTOS_DE_EXEMPLO, id = "depoimentos" }: DepoimentosProps) {
  const texto = TEXTO_DOS_DEPOIMENTOS;
  const tituloId = `${id}-titulo`;
  const temExemplo = depoimentos.some((d) => d.ilustrativo);
  return (
    <TelaDaLanding acento="ambar" id={id} personalidade="vozes" tituloId={tituloId}>
      <header className="sc-tela__cabeca sc-vozes__cabeca">
        <Pilula>{texto.sobrancelha}</Pilula>
        <TituloDaTela id={tituloId} trechos={texto.titulo} />
        <ApoioDaTela trechos={texto.apoio} />
      </header>

      <ul className="sc-vozes__lista">
        {depoimentos.map((d, indice) => {
          const Icone = d.ramo ? ICONE_DO_RAMO[d.ramo] : null;
          return (
            <li
              className={`sc-vozes__cartao${indice === 0 ? " sc-vozes__cartao--grande" : ""}`}
              data-surge
              key={`${d.nome}-${d.negocio}`}
              style={ordem(3 + indice)}
            >
              <figure>
                <Quote aria-hidden="true" className="sc-vozes__aspas" size={indice === 0 ? 40 : 28} strokeWidth={1.5} />
                <blockquote>
                  <p>
                    <FalaComDestaque destaque={d.destaque} fala={d.fala} />
                  </p>
                </blockquote>
                <figcaption>
                  <span aria-hidden="true" className="sc-vozes__avatar">
                    {Icone ? <Icone size={20} strokeWidth={1.75} /> : iniciaisDe(d.nome)}
                  </span>
                  <span className="sc-vozes__quem">
                    <strong>{d.negocio}</strong>
                    <span>
                      {d.nome}
                      {d.cidade ? ` · ${d.cidade}` : ""}
                    </span>
                  </span>
                  {d.ilustrativo ? <span className="sc-vozes__exemplo">exemplo ilustrativo</span> : null}
                </figcaption>
              </figure>
            </li>
          );
        })}
      </ul>

      <div className="sc-tela__pe sc-vozes__pe" data-surge style={ordem(6)}>
        {temExemplo ? <p className="sc-vozes__aviso">{texto.aviso}</p> : <span />}
        <Comecar rotulo={texto.chamada} />
      </div>
    </TelaDaLanding>
  );
}
