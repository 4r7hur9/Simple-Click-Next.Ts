/**
 * A imagem que aparece quando alguém compartilha a loja (AC-403).
 *
 * POR QUE DESENHAR EM VEZ DE USAR A CAPA. A maioria das lojas não tem capa — o
 * dono cadastra nome, produtos e preço, e a foto de fachada fica para depois.
 * Sem imagem, o WhatsApp mostra o link como uma linha de texto cinza, e o link
 * cinza não é aberto. Desenhada, toda loja tem uma prévia no primeiro minuto de
 * vida, com o nome dela e a cor que ela escolheu.
 *
 * 1200×630 é a medida que WhatsApp, Facebook e X aceitam sem recortar. Menor,
 * cada rede recorta do seu jeito e o nome da loja some numa delas.
 *
 * O DESENHO É DELIBERADAMENTE POBRE em recursos: `next/og` roda num ambiente
 * reduzido, sem CSS externo e com um subconjunto do flexbox. Estilo vai em
 * objeto, e a cor é lida da paleta declarada em JavaScript — o AC-014 continua
 * valendo, só muda o caminho até o valor.
 */
import { ImageResponse } from "next/og";
import { PALETA_CLARA } from "@simpleclick/ui";

import { buscarVitrine } from "../../../../server/vitrine.ts";

export const alt = "Loja no SimpleClick";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface ParametrosDaImagem {
  readonly params: Promise<{ readonly slug: string }>;
}

/**
 * As cores saem da PALETA DECLARADA, e não escritas à mão.
 *
 * `next/og` não tem folha de estilo — não há `var(--cor-…)` que ele resolva —,
 * mas isso é motivo para ler o valor do tema em JavaScript, e não para copiar
 * um hexadecimal. Copiado, ele divergiria da paleta na primeira vez que ela
 * mudasse, e a prévia da loja apareceria com a cor do produto do ano passado.
 */
const FUNDO = PALETA_CLARA.fundo;
const TINTA = PALETA_CLARA.tinta;
const TINTA_SUAVE = PALETA_CLARA.tintaSuave;

/** A cor de reserva quando a loja não escolheu nenhuma (AC-014). */
const COR_DE_RESERVA = PALETA_CLARA.primaria;

export default async function ImagemDaLoja({ params }: ParametrosDaImagem) {
  const { slug } = await params;
  const resultado = await buscarVitrine(slug);

  // LOJA INDISPONÍVEL AINDA DEVOLVE IMAGEM, e não erro. Esta rota é chamada
  // pelo robô da rede social, que não sabe interpretar um 500: ele mostraria o
  // link sem prévia nenhuma. Uma imagem neutra é melhor que um link cinza — e
  // não conta se aquele endereço já existiu (AC-402).
  const loja =
    resultado.estado === "encontrada" ? resultado.vitrine.loja : null;

  const nome = loja?.nome ?? "SimpleClick";
  const chamada = loja?.boasVindas ?? "Vitrine e pedidos pelo WhatsApp";
  const cor = loja?.tema?.corDestaque ?? COR_DE_RESERVA;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: FUNDO,
        padding: 72,
      }}
    >
      {/* A faixa de cor é a loja se apresentando antes de qualquer palavra:
            é a única parte da prévia que muda de loja para loja à distância. */}
      <div style={{ display: "flex", height: 16, background: cor }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            display: "flex",
            fontSize: 84,
            fontWeight: 700,
            color: TINTA,
            lineHeight: 1.05,
          }}
        >
          {nome}
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 38,
            color: TINTA_SUAVE,
            lineHeight: 1.3,
          }}
        >
          {chamada}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontSize: 30,
          color: cor,
          fontWeight: 600,
        }}
      >
        {loja === null ? "simpleclick" : `Peça em ${nome} pelo WhatsApp`}
      </div>
    </div>,
    size,
  );
}
