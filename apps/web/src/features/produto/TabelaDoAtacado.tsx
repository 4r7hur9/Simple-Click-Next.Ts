/**
 * A tabela de atacado da página do produto (card #56): o varejo e cada faixa,
 * com o preço por unidade e quanto se economiza em cada uma.
 *
 * SÓ DESENHA. As faixas chegam da API já em preço (a mesma regra do
 * carrinho), e o texto sai de `lib/atacado-na-vitrine.ts`. A linha que vale
 * para a quantidade escolhida fica marcada, para a pessoa ver o desconto
 * chegar quando passa do pedido mínimo. Sem faixa, nada aparece.
 */
import { Info } from "@simpleclick/ui";

import type { AtacadoNaVitrine } from "../../lib/atacado-na-vitrine.ts";
import {
  faixaNoAtacado,
  linhasDoAtacado,
} from "../../lib/atacado-na-vitrine.ts";
import { EXPLICACOES_PARA_CLIENTES } from "../loja/explicacoes-para-clientes.ts";

export interface TabelaDoAtacadoProps {
  readonly atacado: AtacadoNaVitrine | null | undefined;
  /** O preço de varejo por unidade, sobre o qual as faixas foram calculadas. */
  readonly varejoCentavos: number | null;
  /** A quantidade escolhida agora, para marcar a linha que vale. */
  readonly quantidade: number;
}

export function TabelaDoAtacado({
  atacado,
  varejoCentavos,
  quantidade,
}: TabelaDoAtacadoProps) {
  const linhas = linhasDoAtacado(atacado, varejoCentavos);
  if (linhas.length === 0) return null;

  // A linha que vale é a última cuja quantidade a escolha já alcança.
  // A linha marcada é a da MESMA faixa que dá o preço por unidade do botão.
  const minimaQueVale = faixaNoAtacado(atacado, quantidade)?.quantidadeMinima;
  const indiceQueVale = linhas.findIndex(
    (linha) => linha.aPartirDe === (minimaQueVale ?? 1),
  );
  const vale = indiceQueVale === -1 ? 0 : indiceQueVale;

  return (
    <section className="sc-atacado" aria-labelledby="sc-atacado-titulo">
      <div className="sc-campo__cabeca">
        <h3 className="sc-produto__secao-nome" id="sc-atacado-titulo">
          Preços de atacado
        </h3>
        <Info
          id="sc-atacado"
          rotulo="Preços de atacado"
          conteudo={EXPLICACOES_PARA_CLIENTES.atacado}
        />
      </div>
      <table className="sc-atacado__tabela">
        <thead>
          <tr>
            <th scope="col">Quantidade</th>
            <th scope="col">Preço por unidade</th>
            <th scope="col">Você economiza</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, indice) => (
            <tr
              key={linha.aPartirDe}
              className={
                indice === vale
                  ? "sc-atacado__linha sc-atacado__linha--vale"
                  : "sc-atacado__linha"
              }
              aria-current={indice === vale ? "true" : undefined}
            >
              <th scope="row">
                {linha.quantidade}
                {linha.rotulo ? (
                  <span className="sc-atacado__rotulo">{linha.rotulo}</span>
                ) : null}
              </th>
              <td className="sc-atacado__preco">{linha.preco}</td>
              <td className="sc-atacado__economia">
                {linha.economia ?? (linha.ehVarejo ? "Varejo" : "")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
