import { describe, expect, it } from "vitest";

import {
  ErroDeObservabilidade,
  lerConfiguracaoDeObservabilidade,
  VARIAVEIS_DE_OBSERVABILIDADE,
} from "./observabilidade.ts";

const TOKEN = "a".repeat(32);

describe("configuração de observabilidade", () => {
  it("fica tudo desligado sem nenhuma variável", () => {
    expect(lerConfiguracaoDeObservabilidade({})).toEqual({
      metricas: { tipo: "desligado" },
      exportador: undefined,
    });
  });

  it("aceita token de 32+ caracteres e recusa curto sem repetir o valor", () => {
    expect(
      lerConfiguracaoDeObservabilidade({ METRICAS_TOKEN: TOKEN }).metricas,
    ).toEqual({ tipo: "token", token: TOKEN });
    try {
      lerConfiguracaoDeObservabilidade({ METRICAS_TOKEN: "curto-demais" });
      expect.unreachable();
    } catch (erro) {
      expect(erro).toBeInstanceOf(ErroDeObservabilidade);
      expect((erro as Error).message).toContain("METRICAS_TOKEN");
      expect((erro as Error).message).not.toContain("curto-demais");
    }
  });

  it("abre sem token só com METRICAS_ABERTAS=sim e NODE_ENV declarado fora de produção", () => {
    expect(
      lerConfiguracaoDeObservabilidade({
        METRICAS_ABERTAS: "sim",
        NODE_ENV: "development",
      }).metricas,
    ).toEqual({ tipo: "aberto" });
    // NODE_ENV ausente: fecha.
    expect(
      lerConfiguracaoDeObservabilidade({ METRICAS_ABERTAS: "sim" }).metricas,
    ).toEqual({ tipo: "desligado" });
    // Sem a opção: fecha.
    expect(
      lerConfiguracaoDeObservabilidade({ NODE_ENV: "development" }).metricas,
    ).toEqual({ tipo: "desligado" });
  });

  it("recusa METRICAS_ABERTAS em produção", () => {
    expect(() =>
      lerConfiguracaoDeObservabilidade({
        METRICAS_ABERTAS: "sim",
        NODE_ENV: "production",
      }),
    ).toThrow(/METRICAS_ABERTAS/);
  });

  it("em produção sem token a rota fica desligada", () => {
    expect(
      lerConfiguracaoDeObservabilidade({ NODE_ENV: "production" }).metricas,
    ).toEqual({ tipo: "desligado" });
  });

  it("o exportador só existe com OTEL_EXPORTER_OTLP_ENDPOINT", () => {
    expect(lerConfiguracaoDeObservabilidade({}).exportador).toBeUndefined();
    const config = lerConfiguracaoDeObservabilidade({
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318/",
      OTEL_EXPORTER_OTLP_HEADERS: "authorization=Bearer x, outro=y",
    });
    expect(config.exportador).toEqual({
      endpoint: "http://localhost:4318",
      cabecalhos: { authorization: "Bearer x", outro: "y" },
    });
  });

  it("recusa endpoint inválido, com credencial, não-http e http remoto em produção", () => {
    const ler = (OTEL_EXPORTER_OTLP_ENDPOINT: string, NODE_ENV?: string) =>
      lerConfiguracaoDeObservabilidade({
        OTEL_EXPORTER_OTLP_ENDPOINT,
        ...(NODE_ENV === undefined ? {} : { NODE_ENV }),
      });
    expect(() => ler("isto nao e url")).toThrow(/OTEL_EXPORTER_OTLP_ENDPOINT/);
    expect(() => ler("ftp://x")).toThrow(/http/);
    expect(() => ler("http://usuario:segredo@host:4318")).toThrow(
      ErroDeObservabilidade,
    );
    try {
      ler("http://usuario:segredo@host:4318");
    } catch (erro) {
      expect((erro as Error).message).not.toContain("segredo");
    }
    expect(() => ler("http://coletor.exemplo:4318", "production")).toThrow(
      /https/,
    );
    expect(ler("http://127.0.0.1:4318", "production").exportador).toBeDefined();
    expect(ler("https://coletor.exemplo", "production").exportador).toBeDefined();
  });

  it("recusa cabeçalhos mal formados", () => {
    expect(() =>
      lerConfiguracaoDeObservabilidade({
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
        OTEL_EXPORTER_OTLP_HEADERS: "semigual",
      }),
    ).toThrow(/OTEL_EXPORTER_OTLP_HEADERS/);
  });

  it("lista as variáveis que lê", () => {
    expect(VARIAVEIS_DE_OBSERVABILIDADE).toContain("METRICAS_TOKEN");
    expect(VARIAVEIS_DE_OBSERVABILIDADE).toContain("OTEL_EXPORTER_OTLP_ENDPOINT");
  });
});
