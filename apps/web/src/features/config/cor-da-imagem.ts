/**
 * A cor dominante de uma foto da loja, medida no navegador (card #64).
 *
 * Serve ao selo ABERTO/FECHADO: no automático, ele escolhe a pílula clara ou
 * escura pelo contraste com a capa. A medida é feita no painel, quando o dono
 * escolhe a foto, e vai junto com o tema — a vitrine é desenhada no servidor
 * e não teria como olhar a imagem.
 *
 * MEDE SÓ A METADE ESQUERDA, que é onde o selo fica nas duas capas. A foto é
 * reduzida antes da conta: a média de 64 × 16 pontos basta e não pesa.
 *
 * É MELHOR ESFORÇO. Imagem de outro domínio sem permissão de leitura (CORS)
 * suja o `canvas` e a leitura falha — aí a cor fica desconhecida e o selo
 * usa o padrão escuro, que é o do véu das capas.
 */
import { corMedia } from "@simpleclick/ui";

const LARGURA_DA_AMOSTRA = 64;
const ALTURA_DA_AMOSTRA = 16;
/** A fração da largura, a partir da esquerda, que conta para a média. */
const FRACAO_DA_ESQUERDA = 0.5;

export function medirCorDaImagem(endereco: string): Promise<string | null> {
  if (typeof document === "undefined" || endereco.trim() === "")
    return Promise.resolve(null);
  return new Promise((resolver) => {
    const imagem = new Image();
    imagem.crossOrigin = "anonymous";
    imagem.decoding = "async";
    imagem.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = LARGURA_DA_AMOSTRA;
        canvas.height = ALTURA_DA_AMOSTRA;
        const contexto = canvas.getContext("2d", { willReadFrequently: true });
        if (!contexto) return resolver(null);
        contexto.drawImage(imagem, 0, 0, LARGURA_DA_AMOSTRA, ALTURA_DA_AMOSTRA);
        const { data } = contexto.getImageData(
          0,
          0,
          Math.max(1, Math.round(LARGURA_DA_AMOSTRA * FRACAO_DA_ESQUERDA)),
          ALTURA_DA_AMOSTRA,
        );
        resolver(corMedia(data));
      } catch {
        resolver(null);
      }
    };
    imagem.onerror = () => resolver(null);
    imagem.src = endereco;
  });
}
