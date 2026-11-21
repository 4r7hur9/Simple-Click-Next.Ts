// @vitest-environment jsdom
/**
 * Defeitos D-3, D-4, D-5 e D-7 do #144 (docs/estruturacao/10-e2e.md).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

let caminhoAtual = "/";
vi.mock("next/navigation", () => ({ usePathname: () => caminhoAtual }));

import { ForaDaTv } from "../src/features/tv/ForaDaTv";
import { ehRotaDaTv } from "../src/features/tv/rota-da-tv";
import { fotoParaOg, tipoDaImagemParaOg } from "../src/server/imagem-para-og";

const conteudo = () => createElement(ForaDaTv, null, createElement("b", null, "aviso"));
const raiz = path.resolve(__dirname, "../../..");
const css = (p: string) => readFileSync(path.join(raiz, p), "utf8");

describe("D-3: a TV não monta aviso de cookies nem janela de acesso", () => {
  it("reconhece só a rota da TV", () => {
    expect(ehRotaDaTv("/loja/padaria/tv")).toBe(true);
    expect(ehRotaDaTv("/loja/padaria/tv/")).toBe(true);
    expect(ehRotaDaTv("/loja/padaria")).toBe(false);
    expect(ehRotaDaTv("/loja/padaria/tvs")).toBe(false);
    expect(ehRotaDaTv("/loja/padaria/produto/tv")).toBe(false);
    expect(ehRotaDaTv(null)).toBe(false);
  });

  it("ForaDaTv some na TV e monta nas outras rotas", () => {
    caminhoAtual = "/loja/padaria/tv";
    expect(renderToStaticMarkup(conteudo())).toBe("");
    caminhoAtual = "/loja/padaria/cardapio";
    expect(renderToStaticMarkup(conteudo())).toBe("<b>aviso</b>");
  });
});

describe("D-4: a reserva no fim da página cobre a barra inferior", () => {
  it("reserva ≥ altura da barra + filete de 1px", () => {
    const nav = css("apps/web/src/features/usuario/navegacao.css");
    expect(nav).toMatch(/--altura-da-barra-inferior:\s*4\.5rem/);
    expect(nav).toMatch(
      /body:has\(\.sc-barra-cliente\)\s*\{[^}]*padding-block-end:\s*calc\(\s*var\(--altura-da-barra-inferior\)\s*\+\s*1px/,
    );
  });
});

describe("D-5: o painel de período rola em qualquer largura", () => {
  it("a regra base tem max-block-size e overflow-y", () => {
    const base = css("packages/ui/styles/calendario.css").match(/\.sc-periodo__janela\s*\{[^}]*\}/)?.[0] ?? "";
    expect(base).toMatch(/max-block-size:\s*calc\(100dvh/);
    expect(base).toMatch(/overflow-y:\s*auto/);
  });
});

describe("D-7: foto da imagem de compartilhamento", () => {
  it("WebP não é desenhável; PNG, JPEG e GIF são", () => {
    const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(tipoDaImagemParaOg(webp)).toBeNull();
    expect(tipoDaImagemParaOg(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe("image/png");
    expect(tipoDaImagemParaOg(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(tipoDaImagemParaOg(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe("image/gif");
  });

  it("foto local em WebP vira null (fundo verde), sem lançar", async () => {
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(path.join(raiz, "apps/web"));
    await expect(fotoParaOg("/demo/pastelaria-da-vila/pastel-de-carne-frente.webp")).resolves.toBeNull();
    cwd.mockRestore();
  });

  it("caminho fora da pasta pública, ausente ou esquisito vira null", async () => {
    await expect(fotoParaOg("/../package.json")).resolves.toBeNull();
    await expect(fotoParaOg("ftp://x/y.png")).resolves.toBeNull();
    await expect(fotoParaOg(null)).resolves.toBeNull();
    await expect(fotoParaOg("")).resolves.toBeNull();
  });
});
