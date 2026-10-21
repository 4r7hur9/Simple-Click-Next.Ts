/**
 * A imagem que aparece quando alguém compartilha um produto (AC-414).
 *
 * O AC-414 PEDE NOME E PREÇO na prévia, e é isso que separa esta imagem da foto
 * do produto. Compartilhar a foto sozinha manda a pessoa perguntar "quanto é?"
 * — e a conversa de venda começa com uma pergunta que a prévia já podia ter
 * respondido. Com o preço desenhado, quem recebe o link decide antes de abrir.
 *
 * A FOTO ENTRA COMO FUNDO quando existe, e a faixa de texto fica sobre ela com
 * fundo sólido — e não translúcido. Texto branco sobre foto é ilegível na
 * metade das fotos, e a metade é sempre a do produto que a loja mais vende.
 *
 * Vale aqui a mesma nota da imagem da loja: `next/og` roda num ambiente
 * reduzido, sem folha de estilo, com um subconjunto do flexbox — e a cor sai da
 * paleta declarada lida em JavaScript, e não de um hexadecimal copiado.
 */
import { ImageResponse } from "next/og";
import { PALETA_CLARA } from "@simpleclick/ui";

import { buscarProduto } from "../../../../../../server/produto.ts";
import { buscarVitrine } from "../../../../../../server/vitrine.ts";

export const alt = "Produto no SimpleClick";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface ParametrosDaImagem {
  readonly params: Promise<{
    readonly slug: string;
    readonly id: string;
  }>;
}

/** Como na imagem da loja: os valores vêm da paleta declarada, e não copiados. */
const FUNDO = PALETA_CLARA.fundo;
const TINTA = PALETA_CLARA.tinta;
const TINTA_SUAVE = PALETA_CLARA.tintaSuave;

/** A cor de reserva quando a loja não escolheu nenhuma (AC-014). */
const COR_DE_RESERVA = PALETA_CLARA.primaria;

export default async function ImagemDoProduto({ params }: ParametrosDaImagem) {
  const { slug, id } = await params;

  const vitrine = await buscarVitrine(slug);
  const loja = vitrine.estado === "encontrada" ? vitrine.vitrine.loja : null;

  const resultado =
    loja === null ? null : await buscarProduto(id, { apelidoDaLoja: slug });
  const produto =
    resultado !== null && resultado.estado === "encontrado"
      ? resultado.produto
      : null;

  // Como na imagem da loja: nada aqui devolve erro. O robô da rede social não
  // sabe ler um 500 — ele mostraria o link sem prévia nenhuma.
  const nome = produto?.nome ?? loja?.nome ?? "SimpleClick";
  const cor = loja?.tema?.corDestaque ?? COR_DE_RESERVA;
  const foto = produto?.imagens[0]?.url ?? null;

  // PREÇO NULO É "DEPENDE DA VARIAÇÃO", e não zero: a faixa mostra o nome da
  // loja no lugar. Escrever "R$ 0,00" prometeria de graça o que custa.
  const preco = produto?.preco ?? null;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: FUNDO,
      }}
    >
      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          background: foto === null ? cor : TINTA,
          overflow: "hidden",
        }}
      >
        {foto === null ? null : (
          // `img` cru, e não `next/image`: `next/og` desenha um PNG no
          // servidor e não passa pelo otimizador de imagens do Next.
          <img
            src={foto}
            alt=""
            width={1200}
            height={410}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 32,
          padding: "36px 56px",
          borderTop: `10px solid ${cor}`,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            flex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 54,
              fontWeight: 700,
              color: TINTA,
              lineHeight: 1.1,
            }}
          >
            {nome}
          </div>
          <div style={{ display: "flex", fontSize: 28, color: TINTA_SUAVE }}>
            {loja?.nome ?? "SimpleClick"}
          </div>
        </div>

        {preco === null ? null : (
          <div
            style={{
              display: "flex",
              fontSize: 60,
              fontWeight: 700,
              color: cor,
              whiteSpace: "nowrap",
            }}
          >
            {preco}
          </div>
        )}
      </div>
    </div>,
    size,
  );
}
