// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SeloDeStatus } from "../src/features/painel-pedidos/SeloDeStatus.tsx";
import { lerDaFeature } from "./apoio-painel-lojista.ts";

describe("painel · pedidos", () => {
  it("[CA-1] @spec:AC-11222 a etapa do pedido aparece em texto, não só em cor", () => {
    for (const status of ["PENDING", "PREPARING", "COMPLETED", "CANCELLED"]) {
      const html = renderToStaticMarkup(<SeloDeStatus status={status} />);
      expect(html.replace(/<[^>]+>/g, "").trim().length, status).toBeGreaterThan(2);
    }
  });

  it("[CA-2] @spec:AC-11247 a folha do cupom não herda cor nem tema da tela", () => {
    const cupom = lerDaFeature("impressao/FolhaDoCupom.tsx");
    expect(cupom).not.toContain("var(--cor-");
    expect(cupom).not.toContain("data-tema");
  });
});
