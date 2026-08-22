import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import VitrineDoDesignSystem from "../src/app/(dev)/ui/page";

const HTML = renderToStaticMarkup(<VitrineDoDesignSystem />);

describe("vitrine da identidade oficial", () => {
  it("@spec:AC-945 mostra as variações oficiais sem efeitos ou dimensões abaixo do mínimo", () => {
    expect(HTML).toContain("/brand/logo-primary.svg");
    expect(HTML).toContain("/brand/logo-reverse.svg");
    expect(HTML).toContain('width="96"');
    expect(HTML).not.toMatch(/filter:|rotate\(|drop-shadow/i);
  });

  it("@spec:AC-949 reúne paleta, tipografia, tokens, temas e componentes na mesma rota", () => {
    expect(HTML.match(/data-cor-oficial=/g)).toHaveLength(8);
    for (const secao of [
      "marca",
      "paleta",
      "tipografia",
      "tokens",
      "botao",
      "campo",
      "cartao",
      "lista",
      "aviso",
      "dialogo",
      "estados",
      "tema",
    ]) {
      expect(HTML).toContain(`id="secao-${secao}"`);
    }
    expect(HTML).toContain('data-temas="claro escuro"');
  });

  it("@spec:AC-949 declara suporte a 344px e não introduz badges ou pílulas", () => {
    expect(HTML).toContain('data-largura-minima="344px"');
    expect(HTML).toContain("overflow-x-clip");
    expect(HTML).not.toMatch(/badge|pill|rounded-full/i);
  });
});
