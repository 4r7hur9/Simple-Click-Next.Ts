import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SeletorDePeriodo } from "../src/seletor-de-periodo";

const CSS = readFileSync(
  fileURLToPath(new URL("../styles/calendario.css", import.meta.url)),
  "utf8",
);

describe("SeletorDePeriodo", () => {
  it("mostra o período no botão fechado, com aria de popover", () => {
    const html = renderToStaticMarkup(
      <SeletorDePeriodo
        hoje="2026-10-16"
        value={{ inicio: "2026-10-12", fim: "2026-10-18" }}
        onChange={() => undefined}
      />,
    );
    expect(html).toContain("12 a 18 out 2026");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="dialog"');
  });

  it("usa o nome do atalho quando o período bate", () => {
    const html = renderToStaticMarkup(
      <SeletorDePeriodo
        hoje="2026-10-16"
        value={{ inicio: "2026-10-16", fim: "2026-10-16" }}
        onChange={() => undefined}
      />,
    );
    expect(html).toContain(">Hoje<");
  });

  it("o CSS respeita a linguagem visual (sem efeitos proibidos, alvo de 44px)", () => {
    expect(CSS).not.toContain("backdrop-filter");
    expect(CSS).toContain("var(--raio-janela)");
    expect(CSS).toMatch(/\.sc-periodo__dia\s*\{[\s\S]*?block-size: var\(--altura-toque\)/);
    expect(CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
