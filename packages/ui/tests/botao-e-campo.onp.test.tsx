import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Botao } from "../src/botao";
import { Campo } from "../src/campo";
import { CONTRASTE_MINIMO_TEXTO, relacaoDeContraste } from "../src/contraste";
import { TemaDaMarca } from "../src/tema-da-marca";
import { PALETA_ESCURA } from "../src/tokens";

/**
 * Botão e campo nos estados do redesign (card #104, T-10404): o botão
 * principal do cliente é pílula verde de texto escuro, o campo e a busca
 * mostram erro e foco, e o brilho some com movimento reduzido.
 */

const lerPacote = (relativo: string): string =>
  readFileSync(fileURLToPath(new URL(relativo, import.meta.url)), "utf8");

const CSS = lerPacote("../styles/componentes.css");
const BOTAO_TSX = lerPacote("../src/botao.tsx");
const CAMPO_TSX = lerPacote("../src/campo.tsx");

/** Corpo da primeira regra cujo seletor é exatamente `seletor`. */
function regra(seletor: string): string {
  const achada = CSS.match(
    new RegExp(
      `(?:^|\\n)${seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
    ),
  );
  if (!achada)
    throw new Error(`regra "${seletor}" não existe em componentes.css`);
  return achada[1] ?? "";
}

describe("botão principal do cliente", () => {
  it("[CA-8] @spec:AC-10408 cada variante aparece em repouso, desabilitada e carregando, com texto presente", () => {
    for (const variante of [
      "primaria",
      "secundaria",
      "discreta",
      "perigo",
    ] as const) {
      const repouso = renderToStaticMarkup(
        <Botao variante={variante}>Comprar</Botao>,
      );
      const desabilitado = renderToStaticMarkup(
        <Botao variante={variante} desabilitado>
          Comprar
        </Botao>,
      );
      const carregando = renderToStaticMarkup(
        <Botao variante={variante} carregando>
          Comprar
        </Botao>,
      );

      expect(repouso).toContain(`sc-botao--${variante}`);
      expect(repouso).not.toContain("disabled");
      expect(desabilitado).toContain("disabled");
      expect(carregando).toContain("disabled");
      expect(carregando).toContain('aria-busy="true"');
      expect(carregando).toContain("sc-girando");
      expect(carregando).toContain("Comprar");
    }
  });

  it("[CA-8] @spec:AC-10408 carregando não aceita segundo clique: o botão fica desabilitado de verdade", () => {
    expect(
      renderToStaticMarkup(
        <Botao carregando cta>
          Comprar
        </Botao>,
      ),
    ).toMatch(/<button[^>]*\bdisabled=""/);
  });

  it("[CA-8] @spec:AC-10408 o CTA é pílula, verde com texto escuro, de 48px", () => {
    const html = renderToStaticMarkup(<Botao cta>Comprar</Botao>);
    expect(html).toContain("sc-botao--cta");
    expect(html).toContain("sc-botao--primaria");

    const cta = regra(".sc-botao--cta");
    expect(cta).toMatch(/min-height:\s*var\(--altura-toque-cliente\)/);
    expect(cta).toMatch(/border-radius:\s*var\(--raio-completo\)/);
    expect(regra(".sc-botao--primaria")).toMatch(
      /color:\s*var\(--cor-em-primaria\)/,
    );
    expect(
      relacaoDeContraste(PALETA_ESCURA.emPrimaria, PALETA_ESCURA.primaria),
    ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
  });

  it("[CA-8] @spec:AC-10408 a pílula do painel e da conta não mudou: sem altura de cliente nem brilho", () => {
    const pilula = regra(".sc-botao--pilula");
    expect(pilula).toMatch(/border-radius:\s*var\(--raio-completo\)/);
    expect(pilula).not.toMatch(/altura-toque-cliente|box-shadow|brilho/);
  });

  it("[CA-8] @spec:AC-10408 o brilho vem de cor-mix sobre a cor principal, e não de uma variável com cor pronta", () => {
    expect(CSS).toMatch(
      /\.sc-botao--cta\.sc-botao--primaria[\s\S]*?box-shadow:\s*var\(--brilho-forma\)\s*color-mix\(in srgb,\s*var\(--cor-primaria\)\s*var\(--brilho-forca\)/,
    );
  });

  it("[CA-8] @spec:AC-10408 com movimento reduzido o brilho e o apertar saem na própria regra do botão", () => {
    const bloco =
      CSS.split("@media (prefers-reduced-motion: reduce)").find((trecho) =>
        trecho.trimStart().startsWith("{\n  .sc-botao--cta.sc-botao--primaria"),
      ) ?? "";
    expect(bloco, "bloco de movimento reduzido do CTA").not.toBe("");
    expect(bloco).toMatch(
      /\.sc-botao--cta\.sc-botao--primaria[\s\S]*?box-shadow:\s*none/,
    );
    expect(bloco).toMatch(
      /\.sc-botao:not\(\[disabled\]\):active\s*\{\s*transform:\s*none/,
    );
  });

  it("[CA-8] @spec:AC-10408 dentro da loja o CTA não tem cor de loja: não injeta cor nem lê as variáveis de marca", () => {
    const html = renderToStaticMarkup(
      <TemaDaMarca>
        <Botao cta>Comprar</Botao>
      </TemaDaMarca>,
    );
    expect(html).not.toMatch(/--cor-primaria|style=/);
    expect(html).toContain("sc-botao--cta");
    expect(regra(".sc-botao--cta")).not.toMatch(
      /--cor-marca|--cor-sobre-marca/,
    );
  });
});

describe("campo e busca", () => {
  it("[CA-9] @spec:AC-10409 o rótulo continua ligado ao controle e o erro vira texto ligado ao campo", () => {
    const html = renderToStaticMarkup(
      <Campo id="nome" rotulo="Nome da loja" erro="Digite o nome" />,
    );
    expect(html).toContain('<label class="sc-campo__rotulo" for="nome">');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toMatch(/aria-describedby="[^"]*nome-erro/);
    expect(html).toContain('id="nome-erro"');
    expect(html).toContain('role="alert"');
  });

  it("[CA-9] @spec:AC-10409 desabilitado e com foco têm aparência própria", () => {
    const desabilitado = renderToStaticMarkup(
      <Campo id="nome" rotulo="Nome" desabilitado />,
    );
    expect(desabilitado).toContain("disabled");
    expect(CSS).toMatch(/\.sc-campo__controle\[disabled\]\s*\{/);
    expect(CSS).toMatch(
      /\.sc-campo--busca \.sc-campo__controle\[disabled\]\s*\{/,
    );
    expect(CSS).toMatch(
      /\.sc-campo--busca \.sc-campo__controle:focus-visible\s*\{/,
    );
  });

  it("[CA-9] @spec:AC-10409 a busca é type search com lupa decorativa e o rótulo escondido só da vista", () => {
    const html = renderToStaticMarkup(
      <Campo id="busca" rotulo="Buscar produto" busca rotuloOculto />,
    );
    expect(html).toContain("sc-campo--busca");
    expect(html).toContain('type="search"');
    expect(html).toContain("lucide-search");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('class="sc-campo__rotulo sc-so-leitor" for="busca"');
    expect(html).toContain("Buscar produto");
  });

  it("[CA-9] @spec:AC-10409 a busca tem a altura de toque do cliente e contorno de controle, nunca a divisória", () => {
    const controle = regra(".sc-campo--busca .sc-campo__controle");
    expect(controle).toMatch(/min-height:\s*var\(--altura-toque-cliente\)/);
    expect(controle).toMatch(/border-color:\s*var\(--cor-borda-forte\)/);
    expect(controle).not.toMatch(/var\(--cor-borda\)/);
    // O campo comum não ganhou a altura do cliente: o painel segue com 44px.
    expect(regra(".sc-campo__controle")).toMatch(
      /min-height:\s*var\(--altura-toque\)/,
    );
  });
});

describe("foco visível das peças", () => {
  it("[CA-17] @spec:AC-10417 o anel é externo, de 2px, com vão de 2px, no botão e no campo", () => {
    const foco = CSS.slice(0, CSS.indexOf("/* Envelope da identidade da loja"));
    expect(foco).toContain(".sc-botao:focus-visible");
    expect(foco).toContain(".sc-campo__controle:focus-visible");
    expect(foco).toMatch(/outline:\s*2px solid var\(--cor-foco\)/);
    expect(foco).toMatch(/outline-offset:\s*2px/);
  });

  it("[CA-17] @spec:AC-10417 nenhuma peça usa tabindex positivo", () => {
    for (const fonte of [BOTAO_TSX, CAMPO_TSX]) {
      expect(fonte).not.toMatch(/tabIndex=\{?["']?[1-9]/);
    }
  });
});
