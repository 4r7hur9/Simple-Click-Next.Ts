import { describe, expect, it } from "vitest";

import { acessoVencido } from "../src/server/renovar-acesso.ts";

function jwtComExp(exp: number): string {
  const carga = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `cabecalho.${carga}.assinatura`;
}

describe("acessoVencido", () => {
  const agora = Date.UTC(2026, 9, 17, 12, 0, 0);

  it("sem cookie ou com lixo, conta como vencido", () => {
    expect(acessoVencido(undefined, agora)).toBe(true);
    expect(acessoVencido("", agora)).toBe(true);
    expect(acessoVencido("lixo", agora)).toBe(true);
  });

  it("acesso válido por mais de 30 segundos não renova", () => {
    expect(acessoVencido(jwtComExp(agora / 1000 + 600), agora)).toBe(false);
  });

  it("acesso que vence em menos de 30 segundos já renova", () => {
    expect(acessoVencido(jwtComExp(agora / 1000 + 10), agora)).toBe(true);
    expect(acessoVencido(jwtComExp(agora / 1000 - 5), agora)).toBe(true);
  });
});
