/**
 * Parâmetros e guarda de banco do perfil de simulação. Nada aqui conecta a
 * banco: são as recusas que têm de acontecer ANTES de qualquer conexão.
 */

import { describe, expect, it } from "vitest";

import {
  analisarUrlDePostgres,
  analisarUrlDeRedis,
  ErroDeGuarda,
  identificador,
  montarAlvo,
  urlDoBanco,
} from "./banco.ts";
import {
  ErroDeParametros,
  lerParametrosDaAplicacao,
  lerParametrosDaCarga,
  lerParametrosDaValidacao,
  mascararUrl,
  validarEnderecoLocal,
  validarNomeDoBanco,
} from "./parametros.ts";

const BASE = ["--semente", "sc-2026", "--referencia", "2026-11-01T18:00:00-03:00"];

const AMBIENTE = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://sc_app:x@localhost:6432/simpleclick_dev?pgbouncer=true",
  DATABASE_URL_DIRETA: "postgresql://simpleclick:x@localhost:5432/simpleclick_dev",
  DATABASE_URL_TEST: "postgresql://simpleclick:x@localhost:5533/simpleclick_test",
  SENHA_BANCO_MIGRADOR: "migrador-123456",
  SENHA_BANCO_APLICACAO: "aplicacao-123456",
  SENHA_BANCO_ADMINISTRACAO: "administracao-123456",
};

describe("argumentos da carga", () => {
  it("lê semente e referência, ignora o -- solto do pnpm e aceita --chave=valor", () => {
    const p = lerParametrosDaCarga(["--", ...BASE, "--recriar", "--falhar-apos=37"]);
    expect(p.semente).toBe("sc-2026");
    expect(p.referencia.toISOString()).toBe("2026-11-01T21:00:00.000Z");
    expect(p.recriar).toBe(true);
    expect(p.falharApos).toBe(37);
    expect(p.banco).toBe("simpleclick_simulacao");
    expect(p.aceitarTrust).toBe(false);
  });

  it("não tem valor padrão para semente nem referência", () => {
    expect(() => lerParametrosDaCarga(["--referencia", "2026-11-01T18:00:00-03:00"])).toThrow(/--semente é obrigatório/);
    expect(() => lerParametrosDaCarga(["--semente", "x"])).toThrow(/--referencia é obrigatório/);
    expect(() => lerParametrosDaCarga([])).toThrow(ErroDeParametros);
  });

  it("recusa referência sem fuso, inválida ou fora do formato", () => {
    const com = (r: string) => lerParametrosDaCarga(["--semente", "x", "--referencia", r]);
    expect(() => com("2026-11-01T18:00:00")).toThrow(/com fuso/);
    expect(() => com("2026-11-01")).toThrow(/com fuso/);
    expect(() => com("2026-13-45T18:00:00Z")).toThrow(/não é uma data válida/);
    expect(com("2026-11-01T18:00Z").referencia.toISOString()).toBe("2026-11-01T18:00:00.000Z");
  });

  it("recusa opção desconhecida, repetida, valor ausente e --falhar-apos ruim", () => {
    expect(() => lerParametrosDaCarga([...BASE, "--limpar-tudo"])).toThrow(/desconhecida/);
    expect(() => lerParametrosDaCarga([...BASE, "--recriar", "--recriar"])).toThrow(/mais de uma vez/);
    expect(() => lerParametrosDaCarga(["--semente", "--referencia", "2026-11-01T18:00:00Z"])).toThrow(/precisa de um valor/);
    expect(() => lerParametrosDaCarga([...BASE, "--falhar-apos", "0"])).toThrow(/inteiro maior que zero/);
    expect(() => lerParametrosDaCarga([...BASE, "--falhar-apos", "abc"])).toThrow(/inteiro/);
    expect(() => lerParametrosDaCarga([...BASE, "solto"])).toThrow(/inesperado/);
  });
});

describe("nome do banco", () => {
  it("aceita só o padrão da simulação", () => {
    expect(validarNomeDoBanco(undefined)).toBe("simpleclick_simulacao");
    expect(validarNomeDoBanco("simpleclick_simulacao_k6")).toBe("simpleclick_simulacao_k6");
    for (const ruim of [
      "simpleclick_dev",
      "simpleclick_test",
      "postgres",
      "simpleclick_simulacao_",
      "simpleclick_simulacao_K6",
      "simpleclick_simulacao-k6",
      'simpleclick_simulacao"; DROP DATABASE simpleclick_dev; --',
    ]) {
      expect(() => validarNomeDoBanco(ruim), ruim).toThrow(ErroDeParametros);
    }
  });

  it("escapa o identificador", () => {
    expect(identificador("simpleclick_simulacao")).toBe('"simpleclick_simulacao"');
    expect(identificador('a"b')).toBe('"a""b"');
  });
});

describe("guarda de banco (recusa antes de conectar) [D-2]", () => {
  it("monta o alvo na base da simulação, com manutenção em postgres", () => {
    const alvo = montarAlvo(AMBIENTE, "simpleclick_simulacao");
    expect(new URL(alvo.urlDoMigrador).pathname).toBe("/simpleclick_simulacao");
    expect(new URL(alvo.urlDeManutencao).pathname).toBe("/postgres");
    expect(new URL(alvo.urlDoMigrador).port).toBe("5432");
  });

  it("recusa NODE_ENV=production", () => {
    expect(() => montarAlvo({ ...AMBIENTE, NODE_ENV: "production" }, "simpleclick_simulacao")).toThrow(/produção/);
    expect(() => montarAlvo({ ...AMBIENTE, NODE_ENV: " Production " }, "simpleclick_simulacao")).toThrow(ErroDeGuarda);
  });

  it("recusa banco igual ao de DATABASE_URL, DATABASE_URL_DIRETA ou DATABASE_URL_TEST", () => {
    // O padrão do nome já barra os de dev e teste; a comparação cobre o caso de
    // o ambiente apontar para um banco com nome de simulação.
    for (const variavel of ["DATABASE_URL", "DATABASE_URL_DIRETA", "DATABASE_URL_TEST"]) {
      const ambiente = {
        ...AMBIENTE,
        [variavel]: "postgresql://u:x@localhost:5432/simpleclick_simulacao",
      };
      expect(() => montarAlvo(ambiente, "simpleclick_simulacao"), variavel).toThrow(/mesmo de uma das conexões/);
    }
    expect(() => montarAlvo(AMBIENTE, "simpleclick_dev")).toThrow(ErroDeGuarda);
  });

  it("recusa host que não é local e parâmetros que trocam o destino", () => {
    const com = (valor: string) =>
      montarAlvo({ ...AMBIENTE, DATABASE_URL_DIRETA: valor }, "simpleclick_simulacao");
    expect(() => com("postgresql://u:x@db.exemplo.com:5432/simpleclick_dev")).toThrow(/só roda em banco local/);
    expect(() => com("postgresql://u:x@10.0.0.5:5432/simpleclick_dev")).toThrow(ErroDeGuarda);
    expect(() => com("postgresql://u:x@localhost:5432/simpleclick_dev?host=db.exemplo.com")).toThrow(/troca o destino/);
    expect(() => com("postgresql://u:x@localhost:5432/simpleclick_dev?hostaddr=10.0.0.5")).toThrow(/troca o destino/);
    expect(() => com("postgresql://u:x@localhost:5432/simpleclick_dev?service=prod")).toThrow(/troca o destino/);
    expect(() => montarAlvo({ ...AMBIENTE, DATABASE_URL: "postgresql://u:x@localhost:6432/simpleclick_dev?host=outro" }, "simpleclick_simulacao")).toThrow(/troca o destino/);
  });

  it("aceita ::1 com colchetes e 127.0.0.1", () => {
    expect(analisarUrlDePostgres("x", "postgresql://u:x@[::1]:5432/b").host).toBe("::1");
    expect(analisarUrlDePostgres("x", "postgresql://u:x@127.0.0.1:5432/b").banco).toBe("b");
    expect(analisarUrlDePostgres("x", "postgres://u:x@LOCALHOST/b").banco).toBe("b");
  });

  it("recusa esquema que não é de PostgreSQL", () => {
    expect(() => analisarUrlDePostgres("x", "mysql://u:x@localhost/b")).toThrow(ErroDeGuarda);
    expect(() => analisarUrlDePostgres("x", "isto não é url")).toThrow(/inválido/);
  });

  it("exige as três senhas dos papéis", () => {
    const { SENHA_BANCO_APLICACAO: _tirada, ...sem } = AMBIENTE;
    expect(() => montarAlvo(sem, "simpleclick_simulacao")).toThrow(/SENHA_BANCO_APLICACAO/);
  });

  it("exige DATABASE_URL_DIRETA", () => {
    const { DATABASE_URL_DIRETA: _tirada, ...sem } = AMBIENTE;
    expect(() => montarAlvo(sem, "simpleclick_simulacao")).toThrow(/DATABASE_URL_DIRETA/);
  });

  it("Redis: só local, só redis:// (nada de rediss nem host por query)", () => {
    expect(analisarUrlDeRedis("REDIS_URL", "redis://localhost:6379/5").port).toBe("6379");
    expect(() => analisarUrlDeRedis("REDIS_URL", "rediss://localhost:6379/5")).toThrow(ErroDeGuarda);
    expect(() => analisarUrlDeRedis("REDIS_URL", "redis://cache.exemplo.com:6379/5")).toThrow(/local/);
    expect(() => analisarUrlDeRedis("REDIS_URL", "redis://localhost:6379/5?host=cache.exemplo.com")).toThrow(/troca o destino/);
  });

  it("urlDoBanco troca só o nome do banco", () => {
    expect(urlDoBanco("postgresql://u:x@localhost:5432/simpleclick_dev", "postgres")).toBe(
      "postgresql://u:x@localhost:5432/postgres",
    );
  });
});

describe("endereços do site e da API", () => {
  it("aceita só http(s) local e devolve a origem", () => {
    expect(validarEnderecoLocal("--site", "http://localhost:3200/")).toBe("http://localhost:3200");
    expect(validarEnderecoLocal("--api", "http://127.0.0.1:3201/qualquer")).toBe("http://127.0.0.1:3201");
    expect(validarEnderecoLocal("--api", "http://[::1]:3201")).toBe("http://[::1]:3201");
  });

  it("recusa servidor publicado, credencial no endereço e outros esquemas", () => {
    expect(() => validarEnderecoLocal("--site", "https://simpleclick.com.br")).toThrow(/local/);
    expect(() => validarEnderecoLocal("--site", "http://localhost.exemplo.com")).toThrow(/local/);
    expect(() => validarEnderecoLocal("--site", "http://u:p@localhost:3200")).toThrow(/credencial/);
    expect(() => validarEnderecoLocal("--site", "ftp://localhost")).toThrow(/http/);
  });

  it("a validação pede --site e --api juntos", () => {
    expect(() => lerParametrosDaValidacao(["--site", "http://localhost:3200"])).toThrow(/andam juntos/);
    const p = lerParametrosDaValidacao(["--", "--site", "http://localhost:3200", "--api", "http://localhost:3201"]);
    expect(p.site).toBe("http://localhost:3200");
    expect(lerParametrosDaValidacao([]).site).toBeNull();
    expect(() => lerParametrosDaValidacao(["--site", "https://exemplo.com", "--api", "http://localhost:3201"])).toThrow(ErroDeParametros);
  });

  it("a aplicação usa as portas 3200 e 3201", () => {
    const p = lerParametrosDaAplicacao(["--"]);
    expect([p.portaDoSite, p.portaDaApi]).toEqual([3200, 3201]);
  });
});

describe("máscara de endereço", () => {
  it("mostra esquema, host, porta e banco, sem credencial", () => {
    const m = mascararUrl("postgresql://simpleclick:segredo123@localhost:5432/simpleclick_simulacao?sslmode=x");
    expect(m).toBe("postgresql://localhost:5432/simpleclick_simulacao");
    expect(m).not.toContain("segredo123");
    expect(m).not.toContain("@");
    expect(mascararUrl("redis://:senha@localhost:6379/5")).toBe("redis://localhost:6379/5");
    expect(mascararUrl("lixo")).toBe("<endereço inválido>");
  });
});
