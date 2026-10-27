/**
 * "Lado a lado" (#comparar): SimpleClick, iFood, Zé Delivery e Nuvemshop na
 * mesma régua, numa tela.
 *
 * Um cartão por empresa, com os seis critérios na mesma ordem. No computador
 * os cartões viram as colunas de uma tabela (as linhas se alinham por
 * `subgrid`) e o do SimpleClick sobe, aceso; no celular e no tablet eles
 * correm de lado, um por vez. Cada célula tem um ícone que resume o fato para
 * quem vende (atende, em parte, não atende, sem dado) e o texto com o fato.
 *
 * Só fato com fonte (conteudo.ts); as fontes ficam na legenda pequena do pé,
 * que abre a gaveta "Fontes e metodologia" (a mesma da seção de mercado).
 */
import "@simpleclick/ui/styles/landing-dados.css";

import { Check, Minus, X } from "lucide-react";

import { Comecar } from "../Comecar.tsx";
import {
  COMPARACAO,
  EMPRESAS_DA_COMPARACAO,
  FONTES_DA_COMPARACAO,
  NOTA_DA_COMPARACAO,
  TEXTO_DA_COMPARACAO,
  type SeloDaComparacao,
} from "../conteudo.ts";
import { FontesDosDados } from "./FontesDosDados.tsx";
import { ApoioDaTela, Pilula, TelaDaLanding, TituloDaTela, ordem } from "./TelaDaLanding.tsx";

const NOME_DO_SELO: Readonly<Record<SeloDaComparacao, string>> = {
  sim: "Atende",
  parcial: "Em parte",
  nao: "Não atende",
  "sem-dado": "Sem dado público",
};

/** Meio círculo cheio: "atende em parte". */
function MeioCirculo() {
  return (
    <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 24 24" width="14">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2.5" />
      <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" />
    </svg>
  );
}

function IconeDoSelo({ selo }: { readonly selo: SeloDaComparacao }) {
  if (selo === "sim") return <Check aria-hidden="true" size={14} strokeWidth={3} />;
  if (selo === "nao") return <X aria-hidden="true" size={14} strokeWidth={3} />;
  if (selo === "parcial") return <MeioCirculo />;
  return <Minus aria-hidden="true" size={14} strokeWidth={3} />;
}

const FONTES = FONTES_DA_COMPARACAO.map((fonte) => ({
  nome: fonte.veiculo,
  curto: fonte.veiculo,
  url: fonte.url,
  data: `consultado em ${fonte.data}`,
}));

export function Comparar({ id = "comparar" }: { readonly id?: string }) {
  const texto = TEXTO_DA_COMPARACAO;
  const tituloId = `${id}-titulo`;
  return (
    <TelaDaLanding id={id} personalidade="regua" tituloId={tituloId}>
      <header className="sc-tela__cabeca sc-tela__cabeca--com-acao">
        <div className="sc-tela__cabeca-texto">
          <Pilula>{texto.sobrancelha}</Pilula>
          <TituloDaTela id={tituloId} trechos={texto.titulo} />
          <ApoioDaTela trechos={texto.apoio} />
        </div>
        <div className="sc-tela__acao" data-surge style={ordem(3)}>
          <Comecar rotulo={texto.chamada} />
        </div>
      </header>

      <div className="sc-regua" data-surge style={ordem(4)}>
        <ul aria-hidden="true" className="sc-regua__criterios">
          <li className="sc-regua__canto">
            <span>Critério</span>
          </li>
          {COMPARACAO.map((linha) => (
            <li key={linha.criterio}>{linha.criterio}</li>
          ))}
        </ul>

        {/* No celular a lista rola para o lado: com foco, as setas do teclado também a levam. */}
        <ul aria-label="As quatro empresas, critério por critério" className="sc-regua__empresas" tabIndex={0}>
          {EMPRESAS_DA_COMPARACAO.map((empresa) => (
            <li className="sc-regua__empresa" data-empresa={empresa.chave} key={empresa.chave}>
              <div className="sc-regua__cabeca">
                <h3 className="sc-regua__nome">{empresa.nome}</h3>
                <p className="sc-regua__tipo">{empresa.tipo}</p>
                {empresa.chave === "simpleclick" ? (
                  <p className="sc-regua__selo">
                    <strong>0%</strong> de comissão
                  </p>
                ) : null}
              </div>
              <dl className="sc-regua__linhas">
                {COMPARACAO.map((linha) => {
                  const celula = linha[empresa.chave];
                  return (
                    <div className="sc-regua__linha" data-selo={celula.selo} key={linha.criterio}>
                      <dt>{linha.criterio}</dt>
                      <dd>
                        <span className="sc-regua__icone">
                          <IconeDoSelo selo={celula.selo} />
                        </span>
                        <span>
                          <span className="sc-tela__so-leitor">{NOME_DO_SELO[celula.selo]}: </span>
                          {celula.texto}
                        </span>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </li>
          ))}
        </ul>
      </div>

      <div className="sc-tela__pe sc-regua__pe" data-surge style={ordem(5)}>
        <ul aria-label="O que cada ícone quer dizer" className="sc-regua__legenda">
          {(Object.keys(NOME_DO_SELO) as SeloDaComparacao[]).map((selo) => (
            <li data-selo={selo} key={selo}>
              <span className="sc-regua__icone">
                <IconeDoSelo selo={selo} />
              </span>
              {NOME_DO_SELO[selo]}
            </li>
          ))}
        </ul>
        <p aria-hidden="true" className="sc-regua__dica">
          Deslize para ver as quatro →
        </p>
        <FontesDosDados fontes={FONTES} metodologia={NOTA_DA_COMPARACAO} />
      </div>
    </TelaDaLanding>
  );
}
