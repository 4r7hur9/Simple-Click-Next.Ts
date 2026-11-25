/**
 * Anti-moldura (clickjacking, card #19): todo o site recusa ser embutido em
 * iframe de outro site; só a prévia da Aparência (iframe do próprio site) é
 * liberada, e apenas para o mesmo site.
 */
import { describe, expect, it } from "vitest";

import configuracao from "../next.config.ts";

type Regra = { source: string; headers: { key: string; value: string }[] };

/** Casa o `source` do Next (`:p`, `:p*`) com um caminho — o bastante para as regras daqui. */
const casa = (source: string, caminho: string): boolean => {
  const re = source
    .split("/")
    .map((parte) =>
      parte.startsWith(":")
        ? parte.endsWith("*")
          ? "(?:/.*)?"
          : "/[^/]+"
        : parte === ""
          ? ""
          : `/${parte}`,
    )
    .join("");
  return new RegExp(`^${re === "" ? "/" : re}$`).test(caminho);
};

/** Cabeçalhos finais de um caminho: a última regra que casa vence, por chave. */
const cabecalhosDe = async (caminho: string): Promise<Map<string, string>> => {
  const regras = (await configuracao.headers?.()) as Regra[];
  const final = new Map<string, string>();
  for (const regra of regras) {
    if (!casa(regra.source, caminho)) continue;
    for (const { key, value } of regra.headers) final.set(key, value);
  }
  return final;
};

describe("cabeçalhos anti-moldura", () => {
  it.each([
    "/",
    "/admin",
    "/admin/lojas",
    "/admin/entrar",
    "/painel",
    "/painel/produtos",
    "/conta",
    "/entrar",
    "/cadastrar",
    "/recuperar-senha",
    "/loja/minha-loja",
    "/loja/minha-loja/previa",
    "/api/saude",
  ])("%s não pode ser embutida por outro site", async (caminho) => {
    const c = await cabecalhosDe(caminho);
    expect(c.get("X-Frame-Options")).toBe("DENY");
    expect(c.get("Content-Security-Policy")).toBe("frame-ancestors 'none'");
  });

  it.each(["/loja/minha-loja/previa/vitrine", "/loja/minha-loja/previa/cardapio"])(
    "%s só pode ser embutida pelo próprio site (prévia da Aparência)",
    async (caminho) => {
      const c = await cabecalhosDe(caminho);
      expect(c.get("X-Frame-Options")).toBe("SAMEORIGIN");
      expect(c.get("Content-Security-Policy")).toBe("frame-ancestors 'self'");
    },
  );

  it("mantém a política de referência global", async () => {
    const c = await cabecalhosDe("/admin");
    expect(c.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
});
