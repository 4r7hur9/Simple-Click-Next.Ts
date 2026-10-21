/**
 * "O que vem junto" (#recursos): os recursos num mosaico. O primeiro (o quadro
 * de pedidos) é o bloco grande, com um quadro em miniatura; os outros, blocos
 * pequenos com ícone. À esquerda, o título, o número que resume ("9
 * ferramentas, R$ 0 a mais") e o botão.
 */
import {
  ChartColumn,
  ClipboardList,
  ClipboardPlus,
  Compass,
  Package,
  Palette,
  Printer,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Comecar } from "../Comecar.tsx";
import { RECURSOS, TEXTO_DOS_RECURSOS, type Recurso } from "../conteudo.ts";
import { ApoioDaTela, Pilula, TelaDaLanding, TituloDaTela, ordem } from "./TelaDaLanding.tsx";

const ICONES: Readonly<Record<Recurso["icone"], LucideIcon>> = {
  pedidos: ClipboardList,
  metricas: ChartColumn,
  catalogo: Package,
  loja: Palette,
  equipe: Users,
  lojas: Store,
  manual: ClipboardPlus,
  impressao: Printer,
  explorar: Compass,
};

/** O quadro de pedidos em miniatura: seis colunas e cartões andando (decorativo). */
function QuadroEmMiniatura() {
  const colunas = [3, 2, 2, 1, 1, 2];
  return (
    <span aria-hidden="true" className="sc-mosaico__quadro">
      {colunas.map((cartoes, coluna) => (
        <span className="sc-mosaico__coluna" key={coluna} style={ordem(coluna)}>
          {Array.from({ length: cartoes }, (_, k) => (
            <span className="sc-mosaico__cartao" data-novo={coluna === 0 && k === 0 ? "" : undefined} key={k} />
          ))}
        </span>
      ))}
    </span>
  );
}

export function Recursos({ id = "recursos" }: { readonly id?: string }) {
  const texto = TEXTO_DOS_RECURSOS;
  const tituloId = `${id}-titulo`;
  return (
    <TelaDaLanding acento="ambar" id={id} personalidade="mosaico" tituloId={tituloId}>
      <div className="sc-mosaico">
        <header className="sc-tela__cabeca sc-mosaico__cabeca">
          <Pilula>{texto.sobrancelha}</Pilula>
          <TituloDaTela id={tituloId} trechos={texto.titulo} />
          <ApoioDaTela trechos={texto.apoio} />
        </header>

        <ul className="sc-mosaico__blocos">
          {RECURSOS.map((recurso, indice) => {
            const Icone = ICONES[recurso.icone];
            return (
              <li
                className={`sc-mosaico__bloco${indice === 0 ? " sc-mosaico__bloco--grande" : ""}`}
                data-surge
                key={recurso.titulo}
                style={ordem(3 + Math.min(indice, 6) * 0.6)}
              >
                <span aria-hidden="true" className="sc-mosaico__icone">
                  <Icone size={indice === 0 ? 22 : 18} strokeWidth={1.9} />
                </span>
                <h3 className="sc-mosaico__titulo">{recurso.titulo}</h3>
                <p className="sc-mosaico__texto">{recurso.texto}</p>
                {indice === 0 ? <QuadroEmMiniatura /> : null}
              </li>
            );
          })}
        </ul>

        <div className="sc-mosaico__acao" data-surge style={ordem(3)}>
          <p className="sc-mosaico__resumo">
            <span className="sc-mosaico__resumo-numero">{RECURSOS.length}</span>
            <span>
              ferramentas incluídas,
              <br />
              <strong>R$ 0 a mais</strong> por qualquer uma
            </span>
          </p>
          <Comecar rotulo={texto.chamada} />
        </div>
      </div>
    </TelaDaLanding>
  );
}
