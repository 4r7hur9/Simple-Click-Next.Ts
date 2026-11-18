import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Botao } from "../src/botao";
import { BotaoMarcavel } from "../src/botao-marcavel";
import { IconeBrilho, IconeCompartilhar, IconeEstrela } from "../src/icones";

/**
 * Ícones de ação e botão marcável (card #104, T-10403): curtir é sempre o
 * brilho ✦, favoritar é sempre a estrela ★, e o estado é anunciado por
 * `aria-pressed` sem trocar o nome do botão.
 */

const RAIZ = fileURLToPath(new URL("../../..", import.meta.url));
const lerSrc = (nome: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../src/${nome}`, import.meta.url)),
    "utf8",
  );
const CSS = readFileSync(
  fileURLToPath(new URL("../styles/componentes.css", import.meta.url)),
  "utf8",
);

/** As telas que ainda importam o lucide direto (donas: #105, #106, landing). */
const LEGADO_QUE_SO_PODE_DIMINUIR = [
  "apps/web/src/features/feed/GavetaDeComentarios.tsx",
  "apps/web/src/features/feed/MidiaDoPost.tsx",
  "apps/web/src/features/feed/Post.tsx",
  "apps/web/src/features/feed/PostDeLoja.tsx",
  "apps/web/src/features/feed/Stories.tsx",
  "apps/web/src/features/landing/Comecar.tsx",
  "apps/web/src/features/landing/cenas/Cenas.tsx",
  "apps/web/src/features/landing/cenas/TextoDaCena.tsx",
  "apps/web/src/features/landing/secoes/CartoesDeMercado.tsx",
  "apps/web/src/features/landing/secoes/Comparar.tsx",
  "apps/web/src/features/landing/secoes/ConviteFinal.tsx",
  "apps/web/src/features/landing/secoes/DadosDeMercado.tsx",
  "apps/web/src/features/landing/secoes/Depoimentos.tsx",
  "apps/web/src/features/landing/secoes/FaixaDeConfianca.tsx",
  "apps/web/src/features/landing/secoes/FontesDosDados.tsx",
  "apps/web/src/features/landing/secoes/PerguntasFrequentes.tsx",
  "apps/web/src/features/landing/secoes/Recursos.tsx",
  "apps/web/src/features/legal/BotaoVoltarAoTopo.tsx",
  "apps/web/src/features/legal/RodapeDoSimpleClick.tsx",
] as const;

const IMPORTA_LUCIDE = /["']lucide-react(\/[^"']*)?["']/;

function fontes(pasta: string): string[] {
  const achados: string[] = [];
  for (const nome of readdirSync(pasta)) {
    if (nome === "node_modules" || nome === ".next") continue;
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) achados.push(...fontes(caminho));
    else if (/\.(ts|tsx)$/.test(nome)) achados.push(caminho);
  }
  return achados;
}

describe("curtir e favoritar", () => {
  it("[CA-5] @spec:AC-10405 curtir é o brilho de quatro pontas, em contorno e depois preenchido", () => {
    const vazio = renderToStaticMarkup(<IconeBrilho />);
    const cheio = renderToStaticMarkup(<IconeBrilho preenchido />);

    expect(vazio).toContain('fill="none"');
    expect(vazio).not.toContain("data-preenchido");
    expect(cheio).toContain('fill="currentColor"');
    expect(cheio).toContain("data-preenchido");
  });

  it("[CA-5] @spec:AC-10405 nunca aparece um coração: o pacote de ícones não o importa nem o exporta", () => {
    const icones = lerSrc("icones.ts");
    expect(icones).not.toMatch(/\bHeart\b/);
    expect(icones).not.toMatch(/IconeCoracao/i);
    expect(renderToStaticMarkup(<IconeBrilho preenchido />)).not.toMatch(
      /heart/i,
    );
  });

  it("[CA-6] @spec:AC-10406 favoritar é a estrela, em contorno ou preenchida", () => {
    const vazio = renderToStaticMarkup(<IconeEstrela />);
    const cheio = renderToStaticMarkup(<IconeEstrela preenchido />);

    expect(vazio).toContain("lucide-star");
    expect(vazio).toContain('fill="none"');
    expect(cheio).toContain('fill="currentColor"');
    expect(cheio).toContain("data-preenchido");
    expect(cheio).toContain("sc-icone-estrela");
  });

  it("[CA-6] @spec:AC-10406 a classe de quem chama soma com a da estrela, em vez de a substituir", () => {
    const html = renderToStaticMarkup(
      <IconeEstrela preenchido className="minha-classe" />,
    );
    expect(html).toContain("sc-icone-estrela");
    expect(html).toContain("minha-classe");
  });

  it("[CA-6] @spec:AC-10406 a estrela preenchida usa a cor própria dela, e não a da marca da loja", () => {
    expect(CSS).toMatch(
      /\.sc-icone-estrela\[data-preenchido\]\s*\{[^}]*color:\s*var\(--cor-estrela\)/,
    );
  });

  it("[CA-6] @spec:AC-10406 o botão marcável anuncia o estado por aria-pressed sem trocar o nome", () => {
    const desmarcado = renderToStaticMarkup(
      <Botao soIcone marcado={false} icone={<IconeBrilho />}>
        Curtir
      </Botao>,
    );
    const marcado = renderToStaticMarkup(
      <Botao soIcone marcado icone={<IconeBrilho preenchido />}>
        Curtir
      </Botao>,
    );

    expect(desmarcado).toContain('aria-pressed="false"');
    expect(marcado).toContain('aria-pressed="true"');
    expect(desmarcado).toContain("sc-botao--marcavel");
    // O nome é o mesmo nos dois estados ("Curtir", e não "Descurtir").
    expect(desmarcado).toContain(">Curtir</span>");
    expect(marcado).toContain(">Curtir</span>");
    expect(marcado).not.toMatch(/Descurtir/);
  });

  it("[CA-6] @spec:AC-10406 um aria-pressed passado direto por quem chama continua valendo", () => {
    const html = renderToStaticMarkup(
      <Botao aria-pressed="true">Por valor</Botao>,
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain("sc-botao--marcavel");
  });

  it("[CA-6] @spec:AC-10406 botão comum não ganha aria-pressed", () => {
    expect(renderToStaticMarkup(<Botao>Salvar</Botao>)).not.toContain(
      "aria-pressed",
    );
  });

  it("[CA-6] @spec:AC-10406 um botão que já chega marcado do servidor nasce sem pulso", () => {
    const html = renderToStaticMarkup(
      <BotaoMarcavel marcado soIcone>
        Curtir
      </BotaoMarcavel>,
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain("data-pulso");
  });

  it("[CA-6] @spec:AC-10406 o pulso só roda com o atributo da transição e some com movimento reduzido", () => {
    expect(CSS).toMatch(/\.sc-botao--marcavel\[data-pulso\]\s+svg\s*\{/);
    expect(CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.sc-botao--marcavel\[data-pulso\] svg\s*\{\s*animation:\s*none/,
    );
  });
});

describe("compartilhar e demais ícones vêm do pacote", () => {
  it("[CA-7] @spec:AC-10407 IconeCompartilhar é decorativo e vem do pacote de ícones", () => {
    const html = renderToStaticMarkup(<IconeCompartilhar />);
    expect(html).toContain("lucide-share-2");
    expect(html).toContain('aria-hidden="true"');
  });

  it("[CA-7] @spec:AC-10407 as peças novas e o resto do pacote nunca importam o lucide direto", () => {
    const fora = fontes(join(RAIZ, "packages/ui/src"))
      .filter((arquivo) => !arquivo.endsWith("/icones.ts"))
      .filter((arquivo) => IMPORTA_LUCIDE.test(readFileSync(arquivo, "utf8")));
    expect(fora).toEqual([]);
  });

  it("[CA-7] @spec:AC-10407 nenhuma tela nova importa o lucide direto nem usa Material Symbols (a lista antiga só diminui)", () => {
    const importam = fontes(join(RAIZ, "apps/web/src"))
      .filter((arquivo) => IMPORTA_LUCIDE.test(readFileSync(arquivo, "utf8")))
      .map((arquivo) => arquivo.slice(RAIZ.length).replace(/^\/+/, ""))
      .sort();

    const novos = importam.filter(
      (arquivo) =>
        !(LEGADO_QUE_SO_PODE_DIMINUIR as readonly string[]).includes(arquivo),
    );
    expect(novos, "tela nova com import direto do lucide-react").toEqual([]);

    const material = fontes(join(RAIZ, "apps/web/src")).filter((arquivo) =>
      /material[- ]symbols/i.test(readFileSync(arquivo, "utf8")),
    );
    expect(material).toEqual([]);
  });
});
