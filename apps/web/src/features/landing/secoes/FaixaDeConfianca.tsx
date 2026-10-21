import { ArrowRight, BadgeDollarSign, Check, Infinity as Infinito, Percent, type LucideIcon } from "lucide-react";

import { Comecar } from "../Comecar.tsx";
import { FAIXA_DE_CONFIANCA, type GarantiaDeConfianca } from "./conteudo-de-prova.ts";
import { Pilula, TelaDaLanding, TituloEmLinhas, ordem } from "./TelaDaLanding.tsx";

export interface FaixaDeConfiancaProps {
  /** Destino do botão; sem ele, o "Começar" da landing (cadastro de dono). */
  href?: string | undefined;
  id?: string | undefined;
}

const ICONES: Readonly<Record<GarantiaDeConfianca["icone"], LucideIcon>> = {
  comissao: Percent,
  mensalidade: BadgeDollarSign,
  pedidos: Infinito,
};

/**
 * "Grátis. Sem comissão. Sem mensalidade." (#preco): a seção de impacto. O
 * título é o maior da página, uma frase por linha e cada uma numa cor
 * (limão, âmbar, prata); embaixo, o botão e as três garantias em cartões com
 * número grande.
 */
export function FaixaDeConfianca({ href, id = "confianca" }: FaixaDeConfiancaProps) {
  const c = FAIXA_DE_CONFIANCA;
  const tituloId = `${id}-titulo`;
  return (
    <TelaDaLanding id={id} personalidade="impacto" tituloId={tituloId}>
      <div className="sc-impacto">
        <div className="sc-impacto__alto">
          <Pilula>{c.sobrancelha}</Pilula>
          <TituloEmLinhas className="sc-impacto__titulo" id={tituloId} linhas={c.frases} />
        </div>

        <div className="sc-impacto__acao" data-surge style={ordem(3)}>
          <p className="sc-impacto__texto">{c.texto}</p>
          <div className="sc-impacto__botao">
            {href ? (
              <a className="sc-lp-botao sc-lp-botao--cheio" href={href}>
                <span>{c.chamada}</span>
                <ArrowRight aria-hidden="true" size={18} strokeWidth={2} />
              </a>
            ) : (
              <Comecar rotulo={c.chamada} />
            )}
          </div>
        </div>

        <ul className="sc-impacto__garantias">
          {c.garantias.map((g, indice) => {
            const Icone = ICONES[g.icone];
            return (
              <li className="sc-impacto__garantia" data-surge key={g.titulo} style={ordem(4 + indice)}>
                <span aria-hidden="true" className="sc-impacto__icone">
                  <Icone size={20} strokeWidth={2} />
                </span>
                <span aria-hidden="true" className="sc-impacto__numero">
                  {g.numero}
                </span>
                <span className="sc-impacto__garantia-texto">
                  <strong>{g.titulo}</strong>
                  <span>{g.texto}</span>
                </span>
              </li>
            );
          })}
        </ul>

        <ul aria-label="Também incluso" className="sc-impacto__selos" data-surge style={ordem(7)}>
          {c.selos.map((selo) => (
            <li key={selo}>
              <Check aria-hidden="true" size={14} strokeWidth={3} />
              {selo}
            </li>
          ))}
        </ul>
      </div>
    </TelaDaLanding>
  );
}
