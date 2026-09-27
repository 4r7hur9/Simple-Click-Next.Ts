/**
 * A ponte da parede para o celular (AC-931).
 *
 * É UM ELEMENTO GRANDE, e não um selo de canto: a câmera precisa reconhecer o
 * código a três metros, que é a distância da fila. O tamanho mora na folha
 * (`exibicao.css`), em fração da tela; aqui mora o desenho e o texto que o
 * acompanha — porque quem não quer apontar a câmera precisa poder digitar.
 *
 * PRETO SOBRE BRANCO, SEMPRE. O resto da exibição usa as cores da loja; o
 * código usa as tintas extremas do design system, porque câmera lê contraste,
 * e o dono que escolheu um verde-claro não pode ser o motivo de o código não
 * funcionar.
 */
import { useMemo } from "react";

import {
  caminhoDosModulos,
  enderecoCurto,
  enderecoParaOCelular,
  gerarCodigo,
  MARGEM_SILENCIOSA,
} from "./codigo.ts";

export interface CodigoParaOCelularProps {
  /** O endereço absoluto da vitrine da loja. */
  readonly enderecoDaVitrine: string;
  /** A frase que convida. Padrão pensado para quem está na fila. */
  readonly chamada?: string | undefined;
}

export function CodigoParaOCelular({
  enderecoDaVitrine,
  chamada = "Aponte a câmera e peça pelo celular",
}: CodigoParaOCelularProps) {
  const endereco = enderecoParaOCelular(enderecoDaVitrine);
  const curto = enderecoCurto(enderecoDaVitrine);
  const { caminho, lado } = useMemo(() => {
    const codigo = gerarCodigo(endereco);
    return {
      caminho: caminhoDosModulos(codigo),
      lado: codigo.tamanho + MARGEM_SILENCIOSA * 2,
    };
  }, [endereco]);

  return (
    <figure className="sc-codigo">
      <svg
        className="sc-codigo__desenho"
        viewBox={`0 0 ${String(lado)} ${String(lado)}`}
        role="img"
        aria-label={`Código para abrir ${curto} no celular`}
        shapeRendering="crispEdges"
      >
        <rect className="sc-codigo__fundo" width={lado} height={lado} />
        <path className="sc-codigo__modulos" d={caminho} />
      </svg>
      <figcaption className="sc-codigo__legenda">
        <span className="sc-codigo__chamada">{chamada}</span>
        <span className="sc-codigo__endereco">{curto}</span>
      </figcaption>
    </figure>
  );
}
