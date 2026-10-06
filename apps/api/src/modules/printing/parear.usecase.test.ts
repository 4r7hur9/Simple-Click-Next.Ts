/**
 * As regras puras do pareamento e do estado do agente (T-608 — AC-623,
 * AC-624).
 *
 * O que só o banco sustenta — o código que fecha depois de cinco erros, o
 * agente anterior revogado, a credencial que só alcança a própria loja — está
 * em `apps/api/tests/impressao-automatica.test.ts`. Aqui ficam as formas: o
 * código, a credencial, os resumos, o cache do limite que falha fechado e a
 * régua que diz quando o agente está fora do ar.
 */
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  cacheDoLimiteSobDemanda,
  ErroDoCacheDoLimite,
} from "../../core/limite.ts";
import {
  SILENCIO_QUE_DESCONECTA_MS,
  situacaoDaImpressaoAutomatica,
} from "./estado-do-agente.usecase.ts";
import {
  BYTES_DA_CREDENCIAL,
  pareceCredencialDoAgente,
  PREFIXO_DA_CREDENCIAL,
  resumirCodigoDePareamento,
  resumirCredencialDoAgente,
  sortearCodigoDePareamento,
  sortearCredencialDoAgente,
} from "./parear.usecase.ts";

const LOJA_A = "6d6633cc-92c0-4395-b402-10fad781624f";
const LOJA_B = "b1addc9c-582a-4cb8-b750-c5ddd4319d18";

describe("o código de pareamento", () => {
  it("@spec:AC-623 tem sempre seis dígitos, com zero à esquerda, e varia a cada geração", () => {
    const codigos = Array.from({ length: 200 }, sortearCodigoDePareamento);
    for (const codigo of codigos) expect(codigo).toMatch(/^\d{6}$/);
    expect(new Set(codigos).size).toBeGreaterThan(190);
  });

  it("@spec:AC-623 o resumo é salgado com a loja: o mesmo código em duas lojas não tem o mesmo resumo", () => {
    const daA = resumirCodigoDePareamento(LOJA_A, "004213");
    expect(daA).toHaveLength(32);
    expect(daA).toEqual(
      createHash("sha256").update(`${LOJA_A}:004213`).digest(),
    );
    expect(daA).not.toEqual(resumirCodigoDePareamento(LOJA_B, "004213"));
  });
});

describe("a credencial do agente", () => {
  it("@spec:AC-623 é longa, aleatória e reconhecível, e o banco recebe só o sha256 dela", () => {
    const credencial = sortearCredencialDoAgente();
    expect(credencial.startsWith(PREFIXO_DA_CREDENCIAL)).toBe(true);
    // 32 bytes em base64url: 43 caracteres, 256 bits de acaso.
    expect(credencial.length - PREFIXO_DA_CREDENCIAL.length).toBe(
      Math.ceil((BYTES_DA_CREDENCIAL * 4) / 3),
    );
    expect(pareceCredencialDoAgente(credencial)).toBe(true);
    expect(sortearCredencialDoAgente()).not.toBe(credencial);

    const resumo = resumirCredencialDoAgente(credencial);
    expect(resumo).toHaveLength(32);
    expect(resumo.toString("hex")).not.toContain(credencial);
  });

  it("@spec:AC-623 o que não tem a forma de credencial nossa é recusado antes do banco", () => {
    for (const forjada of [
      "",
      "sca_",
      "sca_curta",
      `sca_${"A".repeat(42)}`,
      `sca_${"A".repeat(44)}`,
      `xyz_${"A".repeat(43)}`,
      `sca_${"A".repeat(42)}=`,
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.assinatura",
    ]) {
      expect(pareceCredencialDoAgente(forjada), forjada).toBe(false);
    }
  });
});

describe("o limite do pareamento falha fechado", () => {
  it("@spec:AC-623 sem Redis configurado, toda conversa com o cache do limite é recusada", async () => {
    const cache = cacheDoLimiteSobDemanda(undefined);
    await expect(cache.executarScript("return 1", [], [])).rejects.toThrow(
      ErroDoCacheDoLimite,
    );
    await expect(
      cacheDoLimiteSobDemanda("  ").executarScript("return 1", [], []),
    ).rejects.toThrow(ErroDoCacheDoLimite);
  });

  it("@spec:AC-623 com o Redis fora do ar, o cache desiste dentro do prazo em vez de pendurar a rota", async () => {
    const cache = cacheDoLimiteSobDemanda("redis://127.0.0.1:1/0", 400);
    const inicio = Date.now();
    await expect(cache.executarScript("return 1", [], [])).rejects.toThrow(
      ErroDoCacheDoLimite,
    );
    expect(Date.now() - inicio).toBeLessThan(5_000);
    // E a tentativa seguinte tenta de novo, sem herdar a conexão quebrada.
    await expect(cache.executarScript("return 1", [], [])).rejects.toThrow(
      ErroDoCacheDoLimite,
    );
  });
});

describe("a régua do agente fora do ar (AC-624)", () => {
  const agora = new Date("2026-10-03T20:00:00.000Z");
  const haSegundos = (segundos: number) =>
    new Date(agora.getTime() - segundos * 1000);

  it("@spec:AC-624 ligado, com agente que falou há pouco, está conectado; calado além do limite, desconectado", () => {
    const base = { automatico: true, agentesAtivos: 1, agora };
    expect(
      situacaoDaImpressaoAutomatica({ ...base, ultimoContato: haSegundos(3) }),
    ).toBe("conectada");
    expect(
      situacaoDaImpressaoAutomatica({
        ...base,
        ultimoContato: haSegundos(SILENCIO_QUE_DESCONECTA_MS / 1000),
      }),
    ).toBe("conectada");
    expect(
      situacaoDaImpressaoAutomatica({
        ...base,
        ultimoContato: haSegundos(SILENCIO_QUE_DESCONECTA_MS / 1000 + 1),
      }),
    ).toBe("desconectada");
    expect(
      situacaoDaImpressaoAutomatica({ ...base, ultimoContato: null }),
    ).toBe("desconectada");
  });

  it("@spec:AC-624 ligado sem agente pareado é 'sem agente'; desligado é 'desligada', esteja o agente como estiver", () => {
    expect(
      situacaoDaImpressaoAutomatica({
        automatico: true,
        agentesAtivos: 0,
        ultimoContato: null,
        agora,
      }),
    ).toBe("sem_agente");
    expect(
      situacaoDaImpressaoAutomatica({
        automatico: false,
        agentesAtivos: 1,
        ultimoContato: haSegundos(600),
        agora,
      }),
    ).toBe("desligada");
  });
});
