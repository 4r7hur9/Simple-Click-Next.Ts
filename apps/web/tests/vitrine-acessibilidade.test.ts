import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const gradeDeProdutos = readFileSync(
  new URL("../src/features/vitrine/GradeDeProdutos.tsx", import.meta.url),
  "utf8",
);
const focoDaVitrine = readFileSync(
  new URL("../../../packages/ui/styles/vitrine.css", import.meta.url),
  "utf8",
);
const narrativaDaLoja = readFileSync(
  new URL("../../../packages/ui/styles/narrativa.css", import.meta.url),
  "utf8",
);
const estiloGlobal = readFileSync(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8",
);

describe("contratos declarativos da vitrine pública", () => {
  it("@spec:AC-416 reserva a foto e entrega variantes responsivas", () => {
    expect(gradeDeProdutos).toContain('from "next/image"');
    expect(gradeDeProdutos).toContain("LARGURA_DA_IMAGEM = 320");
    expect(gradeDeProdutos).toContain("ALTURA_DA_IMAGEM = 240");
    expect(gradeDeProdutos).toContain("width={LARGURA_DA_IMAGEM}");
    expect(gradeDeProdutos).toContain("height={ALTURA_DA_IMAGEM}");
    expect(gradeDeProdutos).toContain("sizes=");
    expect(gradeDeProdutos).toContain(
      'loading={prioridade ? undefined : "lazy"}',
    );
  });

  it("@spec:AC-418 declara foco visível para os links da vitrine", () => {
    expect(estiloGlobal).toMatch(/:focus-visible\s*\{/);
    expect(narrativaDaLoja).toMatch(
      /\.sc-loja__entrar:focus-visible\s*\{[^}]*outline:\s*3px solid/s,
    );
  });

  it("@spec:AC-419 mantém a decoração fora da camada de conteúdo", () => {
    expect(narrativaDaLoja).toMatch(/\.sc-loja\s*\{[^}]*isolation:\s*isolate/s);
    expect(narrativaDaLoja).toMatch(/\.sc-loja__fundo\s*\{[^}]*z-index:\s*0/s);
    expect(narrativaDaLoja).toMatch(/\.sc-loja__mundo\s*\{[^}]*z-index:\s*0/s);
    expect(narrativaDaLoja).toMatch(/\.sc-loja__tela\s*\{[^}]*z-index:\s*2/s);
  });

  it("@spec:AC-420 garante alvo de toque mínimo no botão de busca", () => {
    expect(focoDaVitrine).toMatch(
      /\.sc-vitrine__busca-botao\s*\{[^}]*min-block-size:\s*2\.75rem/s,
    );
  });
});
