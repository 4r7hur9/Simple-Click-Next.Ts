/**
 * A política de referência do site (card #105): o endereço da página — que
 * pode levar o destino do login ou o código do pedido — não vai inteiro a
 * quem está fora do site. O cabeçalho real na resposta de uma rota é conferido
 * no e2e (`e2e/specs/navegacao-do-cliente.onp.spec.ts`).
 */
import { describe, expect, it } from "vitest";

import configuracao from "../next.config.ts";

describe("Referrer-Policy", () => {
  it("[CA-33] @spec:AC-10514 o site todo manda strict-origin-when-cross-origin", async () => {
    const regras = (await configuracao.headers?.()) ?? [];
    const doSite = regras.find((regra) => regra.source === "/:path*");
    expect(doSite).toBeDefined();
    expect(doSite?.headers).toContainEqual({
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    });
  });

  it("[CA-33] @spec:AC-10514 nenhuma regra relaxa a política (unsafe-url, no-referrer-when-downgrade)", async () => {
    const regras = (await configuracao.headers?.()) ?? [];
    const valores = regras
      .flatMap((regra) => regra.headers)
      .filter((h) => h.key.toLowerCase() === "referrer-policy")
      .map((h) => h.value);
    expect(valores.length).toBeGreaterThan(0);
    for (const valor of valores) {
      expect(valor).not.toMatch(/unsafe-url|no-referrer-when-downgrade/);
      expect(valor).toBe("strict-origin-when-cross-origin");
    }
  });

  it("[CA-33] @spec:AC-10514 as outras configurações do site seguem (redirecionamentos e poweredByHeader)", async () => {
    const redirecionamentos = (await configuracao.redirects?.()) ?? [];
    expect(redirecionamentos.length).toBeGreaterThan(0);
    expect(configuracao.poweredByHeader).toBe(false);
  });
});
