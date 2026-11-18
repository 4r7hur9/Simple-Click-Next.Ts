// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { VariacaoEmSeta } from "../src/features/dashboard/VariacaoEmSeta.tsx";

describe("painel · métricas", () => {
  it("[CA-1] @spec:AC-11239 a variação vai em seta e em texto, não só em cor", () => {
    const html = renderToStaticMarkup(
      <VariacaoEmSeta
        variacao={{
          atual: 120,
          anterior: 100,
          variacaoPorCento: 20,
          direcao: "subiu",
        } as never}
        unidade="pedidos"
        contra="ontem"
      />,
    );
    expect(html).toContain("↑");
    expect(html).toContain("20%");
    expect(html).toContain("comparado com ontem");
  });
});
