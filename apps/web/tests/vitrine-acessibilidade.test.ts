import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// O cartão saiu da grade para o próprio arquivo (card #74): o "Ver mais"
// desenha no navegador os cartões das páginas seguintes.
const gradeDeProdutos = readFileSync(
  new URL("../src/features/vitrine/CartaoDeProduto.tsx", import.meta.url),
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
const tema = readFileSync(
  new URL("../../../packages/ui/styles/theme.css", import.meta.url),
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
    // O véu da capa é decoração; a identidade (logo, nome, ações) sobe acima dele.
    expect(narrativaDaLoja).toMatch(/\.sc-loja__veu\s*\{[^}]*position:\s*absolute/s);
    expect(narrativaDaLoja).toMatch(
      /\.sc-loja__identidade\s*\{[^}]*z-index:\s*1/s,
    );
    expect(narrativaDaLoja).toMatch(/\.sc-loja__tela\s*\{[^}]*z-index:\s*2/s);
  });

  it("@spec:AC-420 garante alvo de toque mínimo no botão de busca", () => {
    // Desde o #104/#132 o mínimo do cliente é 48px: o botão mede pelo token
    // (nas duas medidas), e dentro da loja o token vale o do cliente.
    expect(focoDaVitrine).toMatch(
      /\.sc-vitrine__busca-botao\s*\{[^}]*min-inline-size:\s*var\(--altura-toque\)/s,
    );
    expect(focoDaVitrine).toMatch(
      /\.sc-vitrine__busca-botao\s*\{[^}]*min-block-size:\s*var\(--altura-toque\)/s,
    );
    expect(tema).toMatch(/--altura-toque-cliente:\s*3rem/);
    expect(tema).toMatch(
      /\.sc-tema-loja,[^{]*\{\s*--altura-toque:\s*var\(--altura-toque-cliente\)/s,
    );
  });
});
