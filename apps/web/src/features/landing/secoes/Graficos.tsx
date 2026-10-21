/**
 * Os gráficos da seção de mercado, em SVG e CSS puros (sem biblioteca).
 *
 * Cada gráfico chega desenhado do servidor; o GraficoAnimado só anima a
 * entrada. Para quem usa leitor de tela, a parte visual é uma imagem com
 * descrição (role="img" + aria-label) e os números completos ficam numa tabela
 * escondida logo ao lado.
 *
 * Cores com papel fixo, iguais em todos os gráficos: verde-limão é o que fica
 * com a loja (e os canais dela), âmbar é o que vai para a plataforma, cinza é
 * o resto. Nenhum texto usa a cor da série: a amostra ao lado dá a identidade.
 * Paleta conferida com o validador da skill dataviz sobre o grafite #161c19.
 */
import {
  OPCOES_DE_VENDA,
  emReaisComCentavos,
  sobraDeCemReais,
} from "../custo-do-aplicativo.ts";
import { LegendaDaFonte } from "./CartoesDeMercado.tsx";
import {
  CANAIS_DO_DELIVERY,
  COMPRAS_NO_CELULAR,
  FONTES_DAS_TAXAS,
} from "./conteudo-de-prova.ts";
import { GraficoAnimado } from "./GraficoAnimado.tsx";

/** As fontes do gráfico, na mesma legenda pequena dos cartões. */
function Fontes({ indices }: { indices: readonly number[] }) {
  return (
    <p className="sc-dados__pe-do-grafico">
      {indices.map((indice) => (
        <LegendaDaFonte indice={indice} key={indice} />
      ))}
    </p>
  );
}

const PORCENTO = (valor: number) =>
  `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

/** (a) De cada R$ 100, quanto fica com a loja em cada forma de vender. */
export function SobraDeCadaPedido() {
  const linhas = OPCOES_DE_VENDA.map((opcao) => {
    const sobra = sobraDeCemReais(opcao);
    return { opcao, sobra, taxa: Math.round((100 - sobra) * 100) / 100 };
  });
  const descricao = `De cada R$ 100 em pedido: ${linhas
    .map((l) => `${l.opcao.nome}, ${emReaisComCentavos(l.sobra)} ficam com você`)
    .join("; ")}.`;

  return (
    <GraficoAnimado className="sc-prova__grafico sc-prova__grafico--sobra">
      <figcaption className="sc-prova__grafico-cabeca">
        <h4 className="sc-prova__subtitulo">
          De cada R$&nbsp;100 em pedido, quanto fica com você
        </h4>
        <p className="sc-prova__grafico-texto">
          Só a taxa por pedido; a mensalidade está na conta ao lado.
        </p>
        <ul className="sc-prova__legenda" aria-hidden="true">
          <li>
            <span className="sc-prova__amostra" data-serie="sobra" />
            Fica com você
          </li>
          <li>
            <span className="sc-prova__amostra" data-serie="taxa" />
            Fica com a plataforma
          </li>
        </ul>
      </figcaption>

      <div aria-label={descricao} className="sc-prova__barras" role="img">
        {linhas.map(({ opcao, sobra, taxa }) => (
          <div
            className="sc-prova__barra-linha"
            data-destaque={opcao.id === "simpleclick" ? "sim" : undefined}
            key={opcao.id}
          >
            <p className="sc-prova__barra-nome">
              <strong>{opcao.nome}</strong>
              <span>{opcao.detalhe}</span>
            </p>
            <div className="sc-prova__trilho">
              <span className="sc-prova__barra" data-barra>
                <span
                  className="sc-prova__segmento"
                  data-serie="sobra"
                  style={{ flexGrow: sobra }}
                />
                {taxa > 0 ? (
                  <span
                    className="sc-prova__segmento"
                    data-serie="taxa"
                    style={{ flexGrow: taxa }}
                  />
                ) : null}
              </span>
            </div>
            <p className="sc-prova__barra-valor" data-rotulo-do-grafico>
              <strong>{emReaisComCentavos(sobra)}</strong>
              <span>
                {taxa > 0
                  ? `${emReaisComCentavos(taxa)} de taxa`
                  : "sem taxa"}
              </span>
            </p>
          </div>
        ))}
      </div>

      <div className="sc-prova__so-leitor">
        <table>
          <caption>De cada R$ 100 em pedido, quanto fica com você</caption>
          <thead>
            <tr>
              <th scope="col">Forma de vender</th>
              <th scope="col">Fica com você</th>
              <th scope="col">Taxa por pedido</th>
              <th scope="col">Mensalidade</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ opcao, sobra, taxa }) => (
              <tr key={opcao.id}>
                <th scope="row">
                  {opcao.nome} ({opcao.detalhe})
                </th>
                <td>{emReaisComCentavos(sobra)}</td>
                <td>{emReaisComCentavos(taxa)}</td>
                <td>{opcao.mensalidade ?? "sem mensalidade"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Fontes indices={FONTES_DAS_TAXAS} />
    </GraficoAnimado>
  );
}

/** Folga entre as fatias da rosca, em unidades do contorno (100 = volta). */
const FOLGA = 0.6;

/** (c) De onde vem o faturamento do delivery: rosca com quatro canais. */
export function CanaisDoDelivery() {
  const { canais, fonte } = CANAIS_DO_DELIVERY;
  let inicio = 0;
  const fatias = canais.map((canal) => {
    const fatia = { canal, inicio };
    inicio += canal.parte;
    return fatia;
  });
  const whatsapp = canais.find((c) => c.id === "whatsapp");
  const descricao = `Faturamento do delivery de bares e restaurantes por canal: ${canais
    .map((c) => `${c.nome}, ${PORCENTO(c.parte)}`)
    .join("; ")}.`;

  return (
    <GraficoAnimado className="sc-prova__grafico">
      <figcaption className="sc-prova__grafico-cabeca">
        <h4 className="sc-prova__subtitulo">
          De onde vem o faturamento do delivery
        </h4>
        <p className="sc-prova__grafico-texto">
          Bares e restaurantes, segundo pesquisa da Abrasel com 2.176 donos.
        </p>
      </figcaption>

      <div className="sc-prova__rosca-corpo">
        <div aria-label={descricao} className="sc-prova__rosca" role="img">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 120 120">
            <circle className="sc-prova__rosca-trilho" cx="60" cy="60" r="48" />
            {fatias.map(({ canal, inicio: comeco }) => (
              <circle
                className="sc-prova__fatia"
                cx="60"
                cy="60"
                data-fatia
                data-serie={canal.id}
                key={canal.id}
                pathLength={100}
                r="48"
                strokeDasharray={`${canal.parte - FOLGA} ${100 - canal.parte + FOLGA}`}
                strokeDashoffset={-comeco}
              />
            ))}
          </svg>
          {whatsapp ? (
            <p className="sc-prova__rosca-centro" data-rotulo-do-grafico>
              <strong>{PORCENTO(whatsapp.parte)}</strong>
              <span>pelo WhatsApp</span>
            </p>
          ) : null}
        </div>

        <ul className="sc-prova__legenda sc-prova__legenda--lista" aria-hidden="true">
          {canais.map((canal) => (
            <li key={canal.id}>
              <span className="sc-prova__amostra" data-serie={canal.id} />
              <span>{canal.nome}</span>
              <strong>{PORCENTO(canal.parte)}</strong>
            </li>
          ))}
        </ul>
      </div>

      <div className="sc-prova__so-leitor">
        <table>
          <caption>Faturamento do delivery por canal</caption>
          <thead>
            <tr>
              <th scope="col">Canal</th>
              <th scope="col">Parte do faturamento</th>
            </tr>
          </thead>
          <tbody>
            {canais.map((canal) => (
              <tr key={canal.id}>
                <th scope="row">{canal.nome}</th>
                <td>{PORCENTO(canal.parte)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Fontes indices={[fonte]} />
    </GraficoAnimado>
  );
}

/** (c) 79 de cada 100 compras online no celular: quadriculado de 100. */
export function ComprasNoCelular() {
  const { parte, fonte } = COMPRAS_NO_CELULAR;
  const descricao = `${parte} de cada 100 compras online no Brasil são feitas no celular.`;

  return (
    <GraficoAnimado className="sc-prova__grafico">
      <figcaption className="sc-prova__grafico-cabeca">
        <h4 className="sc-prova__subtitulo">Onde as pessoas compram</h4>
        <p className="sc-prova__grafico-texto">
          De cada 100 compras online no Brasil.
        </p>
      </figcaption>

      <div className="sc-prova__quadros-corpo">
        <div aria-label={descricao} className="sc-prova__quadros" role="img">
          {Array.from({ length: 100 }, (_, i) => (
            <span
              className="sc-prova__celula"
              data-celula
              data-serie={i < parte ? "celular" : undefined}
              key={i}
            />
          ))}
        </div>
        <ul className="sc-prova__legenda sc-prova__legenda--lista" aria-hidden="true">
          <li>
            <span className="sc-prova__amostra" data-serie="celular" />
            <span>No celular</span>
            <strong>{parte}</strong>
          </li>
          <li>
            <span className="sc-prova__amostra" data-serie="resto" />
            <span>Em outros aparelhos</span>
            <strong>{100 - parte}</strong>
          </li>
        </ul>
      </div>

      <div className="sc-prova__so-leitor">
        <table>
          <caption>Compras online por aparelho, de cada 100</caption>
          <tbody>
            <tr>
              <th scope="row">No celular</th>
              <td>{parte}</td>
            </tr>
            <tr>
              <th scope="row">Em outros aparelhos</th>
              <td>{100 - parte}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <Fontes indices={[fonte]} />
    </GraficoAnimado>
  );
}
