/**
 * Funções puras da validação e do lançador da aplicação do perfil de simulação:
 * a varredura das saídas, o ambiente dos servidores, a detecção de `next dev`,
 * a espera por `Retry-After` e o relatório. Não toca banco nem rede real.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  acharServidoresDeDesenvolvimento,
  montarAmbientesDosServidores,
  urlDoRedisDaSimulacao,
} from "./aplicacao.ts";
import { ErroDeGuarda } from "./banco.ts";
import { PASTA_DE_SAIDA } from "./manifesto.ts";
import { mascararUrl } from "./parametros.ts";
import { montarPlano } from "./perfil.ts";
import {
  comLimite,
  diaLocal,
  montarRelatorio,
  pedir,
  varrerSaidas,
  type Verificacao,
} from "./validar.ts";

const AMBIENTE = {
  NODE_ENV: "development",
  PATH: "/usr/bin",
  HOME: "/tmp/casa",
  DATABASE_URL: "postgresql://sc_app:segredo-da-app@localhost:5432/simpleclick_dev?pgbouncer=true",
  DATABASE_URL_DIRETA: "postgresql://simpleclick:segredo-direto@localhost:5432/simpleclick_dev",
  DATABASE_URL_TEST: "postgresql://simpleclick:x@localhost:5533/simpleclick_test",
  REDIS_URL: "redis://localhost:6379/0",
  JWT_SECRET: "jwt-da-dev-que-nao-pode-vazar-para-a-simulacao",
  SENHA_BANCO_MIGRADOR: "migrador-123456",
  SENHA_BANCO_APLICACAO: "aplicacao-123456",
  SENHA_BANCO_ADMINISTRACAO: "administracao-123456",
};

const PARAMETROS = { banco: "simpleclick_simulacao", portaDaApi: 3201, portaDoSite: 3200 };

describe("varredura das saídas", () => {
  it("detecta e-mail, +55, token de 40 hex, JWT e Set-Cookie", () => {
    const token = "a".repeat(40);
    expect(varrerSaidas("dono@loja.test")).toEqual(["arroba (e-mail)"]);
    expect(varrerSaidas("fone +5585999990101")).toEqual(["+55 (telefone)"]);
    expect(varrerSaidas(`token ${token}`)).toEqual(["token de 40 hex"]);
    expect(varrerSaidas("Bearer eyJhbGciOiJIUzI1NiJ9.x.y")).toEqual(["JWT (eyJ)"]);
    expect(varrerSaidas("set-cookie: sessao=1")).toEqual(["Set-Cookie"]);
    expect(varrerSaidas("SET-COOKIE")).toEqual(["Set-Cookie"]);
    expect(varrerSaidas(`${token} a@b +55 eyJ Set-Cookie`)).toHaveLength(5);
  });

  it("não confunde impressões SHA-256 (64 hex), SHA-1 curtos, UUIDs e URLs mascaradas com token", () => {
    const sha256 = "9342679ec1d34283e3df35204d9bc2e803bcb19ca980ee82d5af11702e07bfe1";
    expect(varrerSaidas(`ids \`${sha256}\``)).toEqual([]);
    expect(varrerSaidas("impressão 2882eaec")).toEqual([]);
    expect(varrerSaidas("id 6e1f2000-9789-5201-8c29-3e6d407955bc")).toEqual([]);
    expect(varrerSaidas("a".repeat(39))).toEqual([]);
    expect(varrerSaidas("a".repeat(41))).toEqual([]);
    expect(varrerSaidas("http://localhost:3200 e /demo/simulacao/x/logo.webp")).toEqual([]);
  });

  it("a máscara de URL mostra só esquema, host, porta e banco, sem credencial nem @", () => {
    const m = mascararUrl(AMBIENTE.DATABASE_URL);
    expect(m).toBe("postgresql://localhost:5432/simpleclick_dev");
    expect(m).not.toContain("segredo-da-app");
    expect(m).not.toContain("sc_app");
    expect(varrerSaidas(m)).toEqual([]);
  });

  it("o relatório montado com o plano e verificações fica limpo", () => {
    const plano = montarPlano("sc-2026", new Date("2026-11-01T18:00:00-03:00"));
    const verificacoes: Verificacao[] = [
      { nome: "uma conferência", ok: true, detalhe: "100 lojas" },
      { nome: "outra", ok: false, detalhe: "1 reprovada(s)", exemplos: ["sim-007: HTTP 500"] },
    ];
    const relatorio = montarRelatorio({
      plano,
      referenciaTexto: "2026-11-01T18:00:00-03:00",
      banco: "simpleclick_simulacao",
      impressoes: { ids: "a".repeat(64), conteudo: "b".repeat(64), lojas: 100, pedidos: 1000 },
      verificacoesDoBanco: verificacoes,
      aplicacao: {
        verificacoes,
        imagens: { logos: 100, capas: 100, principais: 800, extras: 10, extrasEsperadas: 10 },
      },
      enderecos: { site: "http://localhost:3200", api: "http://localhost:3201" },
    });
    expect(relatorio).toContain("REPROVADO");
    expect(relatorio).toContain("a".repeat(64));
    expect(varrerSaidas(relatorio)).toEqual([]);
  });

  const manifesto = resolve(PASTA_DE_SAIDA, "manifesto.json");
  it.skipIf(!existsSync(manifesto))("o manifesto gerado não tem token, contato nem cookie", () => {
    expect(varrerSaidas(readFileSync(manifesto, "utf8"))).toEqual([]);
  });
});

describe("ambiente dos servidores da simulação", () => {
  it("aponta tudo para a base da simulação e o Redis /5, sem herdar o da dev", () => {
    const { api, site } = montarAmbientesDosServidores(AMBIENTE, PARAMETROS);
    for (const ambiente of [api, site]) {
      expect(new URL(ambiente["DATABASE_URL"]!).pathname).toBe("/simpleclick_simulacao");
      expect(new URL(ambiente["DATABASE_URL_DIRETA"]!).pathname).toBe("/simpleclick_simulacao");
      expect(new URL(ambiente["REDIS_URL"]!).pathname).toBe("/5");
      expect(ambiente["NEXT_PUBLIC_API_URL"]).toBe("http://localhost:3201");
      expect(ambiente["URL_DO_SITE"]).toBe("http://localhost:3200");
      // Nunca a base de teste real (porta 5533) nem a da dev.
      for (const valor of Object.values(ambiente)) {
        expect(valor).not.toContain("simpleclick_dev");
        expect(valor).not.toContain("simpleclick_test");
        expect(valor).not.toContain(":5533");
      }
    }
    expect(api["PORT"]).toBe("3201");
    expect(site["PORT"]).toBe("3200");
    expect(api["SEGUNDO_PLANO"]).toBe("desligado");
    expect(api["ORIGENS_PERMITIDAS"]).toContain("http://localhost:3200");
    // O DATABASE_URL_TEST da API existe (ela exige) e é de outro banco da simulação.
    expect(new URL(api["DATABASE_URL_TEST"]!).pathname).toBe("/simpleclick_simulacao_teste");
  });

  it("gera um JWT_SECRET aleatório só na memória, diferente a cada chamada e do ambiente", () => {
    const a = montarAmbientesDosServidores(AMBIENTE, PARAMETROS).api["JWT_SECRET"]!;
    const b = montarAmbientesDosServidores(AMBIENTE, PARAMETROS).api["JWT_SECRET"]!;
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).not.toBe(b);
    expect(a).not.toBe(AMBIENTE.JWT_SECRET);
    const { api, site } = montarAmbientesDosServidores(AMBIENTE, PARAMETROS);
    expect(api["SEGREDO_DA_PONTE"]).toBe(site["SEGREDO_DA_PONTE"]);
    expect(api["SEGREDO_DE_REVALIDACAO"]).toBe(site["SEGREDO_DE_REVALIDACAO"]);
  });

  it("não herda variáveis do terminal além das básicas", () => {
    const { api } = montarAmbientesDosServidores({ ...AMBIENTE, SIMPLECLICK_DEV_TEST_EMAIL: "x@y.test", CLOUDINARY_URL: "cloudinary://a:b@c" }, PARAMETROS);
    expect(api["SIMPLECLICK_DEV_TEST_EMAIL"]).toBeUndefined();
    expect(api["CLOUDINARY_URL"]).toBeUndefined();
    expect(api["PATH"]).toBe("/usr/bin");
  });

  it("recusa DATABASE_URL_ADMINISTRACAO, produção, base errada e Redis remoto", () => {
    expect(() =>
      montarAmbientesDosServidores({ ...AMBIENTE, DATABASE_URL_ADMINISTRACAO: "postgresql://u:x@localhost:5432/simpleclick_dev" }, PARAMETROS),
    ).toThrow(/DATABASE_URL_ADMINISTRACAO/);
    expect(() => montarAmbientesDosServidores({ ...AMBIENTE, NODE_ENV: "production" }, PARAMETROS)).toThrow(ErroDeGuarda);
    expect(() => montarAmbientesDosServidores(AMBIENTE, { ...PARAMETROS, banco: "simpleclick_dev" })).toThrow(ErroDeGuarda);
    expect(() => montarAmbientesDosServidores({ ...AMBIENTE, REDIS_URL: "rediss://localhost:6379/0" }, PARAMETROS)).toThrow(ErroDeGuarda);
    expect(() => montarAmbientesDosServidores({ ...AMBIENTE, REDIS_URL: "redis://cache.exemplo.com:6379/0" }, PARAMETROS)).toThrow(/local/);
    expect(() => montarAmbientesDosServidores({ ...AMBIENTE, DATABASE_URL: "postgresql://u:x@db.exemplo.com/simpleclick_dev" }, PARAMETROS)).toThrow(/local/);
  });

  it("o Redis da simulação usa o índice 5", () => {
    expect(urlDoRedisDaSimulacao("redis://localhost:6379/0")).toBe("redis://localhost:6379/5");
  });
});

describe("servidor de desenvolvimento já rodando", () => {
  const RAIZ = "/Users/x/SC/apps/web";
  it("acha o next dev do site e ignora outros processos", () => {
    const ps = [
      "  101 /usr/bin/node /Users/x/SC/apps/web/node_modules/next/dist/bin/next dev",
      "  102 next-server (v16.4.0) /Users/x/SC/apps/web",
      "  103 /usr/bin/node /Users/x/SC/apps/api/src/main.ts",
      "  104 /usr/bin/node /Users/x/outro/node_modules/next/dist/bin/next dev",
      "  105 vim apps/web/package.json",
    ].join("\n");
    const achados = acharServidoresDeDesenvolvimento(ps, RAIZ);
    expect(achados.map((l) => l.split(/\s+/)[0])).toEqual(["101", "102"]);
    expect(acharServidoresDeDesenvolvimento("  1 launchd\n  2 zsh", RAIZ)).toEqual([]);
  });
});

describe("espera e concorrência", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("comLimite nunca passa de 4 tarefas ao mesmo tempo e guarda a ordem dos resultados", async () => {
    let ativas = 0;
    let pico = 0;
    const tarefas = Array.from({ length: 20 }, (_v, i) => async () => {
      ativas++;
      pico = Math.max(pico, ativas);
      await new Promise((r) => setTimeout(r, 2));
      ativas--;
      return i;
    });
    const r = await comLimite(tarefas, 4);
    expect(pico).toBeLessThanOrEqual(4);
    expect(pico).toBeGreaterThan(1);
    expect(r).toEqual(Array.from({ length: 20 }, (_v, i) => i));
  });

  it("pedir espera o Retry-After quando vem 429 e tenta de novo", async () => {
    vi.useFakeTimers();
    const resposta429 = new Response("", { status: 429, headers: { "retry-after": "3" } });
    const resposta200 = new Response("ok", { status: 200 });
    const chamadas: number[] = [];
    vi.stubGlobal("fetch", async () => {
      chamadas.push(Date.now());
      return chamadas.length === 1 ? resposta429 : resposta200;
    });
    const promessa = pedir("http://localhost:3201/x");
    await vi.advanceTimersByTimeAsync(2900);
    expect(chamadas).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(200);
    const r = await promessa;
    vi.useRealTimers();
    expect(r.status).toBe(200);
    expect(chamadas).toHaveLength(2);
    expect(chamadas[1]! - chamadas[0]!).toBeGreaterThanOrEqual(3000);
  });

  it("pedir devolve o 429 depois de esgotar as tentativas", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", async () => new Response("", { status: 429, headers: { "retry-after": "1" } }));
    const promessa = pedir("http://localhost:3201/x", { tentativas: 3 });
    await vi.advanceTimersByTimeAsync(10_000);
    const r = await promessa;
    vi.useRealTimers();
    expect(r.status).toBe(429);
  });
});

describe("data local", () => {
  it("usa o relógio de Fortaleza (UTC-3)", () => {
    expect(diaLocal(new Date("2026-11-02T01:30:00Z"))).toBe("2026-11-01");
    expect(diaLocal(new Date("2026-11-02T03:00:00Z"))).toBe("2026-11-02");
  });
});
