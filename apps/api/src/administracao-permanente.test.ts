/**
 * A partida da administração permanente (card #3), sem banco: o que a API faz
 * com as variáveis, o prazo e o que ela deixa no registro.
 */
import { describe, expect, it, vi } from "vitest";

import {
  type ConexaoAberta,
  executarAdministracaoPermanente,
  extrairPedidoDaAdministracao,
} from "./administracao-permanente.ts";
import type { Registrador } from "./core/log.ts";

const CHAVE = Buffer.alloc(32, 9).toString("base64");
const SENHA = "senha-de-prova-grande-1";
const SEGREDO = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const EMAIL = "pessoa.admin@exemplo.invalido";
const URL_DO_BANCO =
  "postgresql://sc_app:senha-do-app-xx@localhost:5432/simpleclick";

const FONTE = {
  NODE_ENV: "production",
  DATABASE_URL: URL_DO_BANCO,
  SENHA_BANCO_ADMINISTRACAO: "senha-do-papel-admin-xx",
  CHAVE_CIFRA_TOTP: CHAVE,
  ADMIN_EMAIL: EMAIL,
  ADMIN_SENHA: SENHA,
  ADMIN_TOTP_SEGREDO: SEGREDO,
};

function registro() {
  const linhas: { nivel: string; evento: string; dados: unknown }[] = [];
  const nivel = (n: string) => (evento: string, dados?: unknown) => {
    linhas.push({ nivel: n, evento, dados });
  };
  const r = {
    depuracao: nivel("depuracao"),
    info: nivel("info"),
    aviso: nivel("aviso"),
    erro: nivel("erro"),
    fatal: nivel("fatal"),
  } as unknown as Registrador;
  return { r, linhas };
}

describe("extrairPedidoDaAdministracao", () => {
  it("[CA-11] não muda o objeto que o teste injeta", () => {
    const fonte = { ...FONTE };
    const copia = { ...fonte };
    extrairPedidoDaAdministracao(fonte);
    expect(fonte).toEqual(copia);
  });

  it("[CA-11] com process.env, senha e segredo saem dele; o e-mail fica", () => {
    vi.stubEnv("ADMIN_EMAIL", EMAIL);
    vi.stubEnv("ADMIN_SENHA", SENHA);
    vi.stubEnv("ADMIN_TOTP_SEGREDO", SEGREDO);
    vi.stubEnv("CHAVE_CIFRA_TOTP", CHAVE);
    try {
      const pedido = extrairPedidoDaAdministracao(process.env);
      expect(pedido.situacao).toBe("pronta");
      expect(process.env["ADMIN_SENHA"]).toBeUndefined();
      expect(process.env["ADMIN_TOTP_SEGREDO"]).toBeUndefined();
      expect(process.env["ADMIN_EMAIL"]).toBe(EMAIL);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("executarAdministracaoPermanente", () => {
  it("[CA-11] ausente: nenhuma conexão e nenhuma linha de registro", async () => {
    const { r, linhas } = registro();
    const conectar = vi.fn();
    const resultado = await executarAdministracaoPermanente({
      pedido: { situacao: "ausente" },
      fonte: FONTE,
      registro: r,
      conectar,
    });
    expect(resultado).toBe("ausente");
    expect(conectar).not.toHaveBeenCalled();
    expect(linhas).toEqual([]);
  });

  it("[CA-11] incompleta e inválida: 1 aviso com os nomes, sem conexão", async () => {
    for (const pedido of [
      { situacao: "incompleta", campos: ["ADMIN_EMAIL"] } as const,
      { situacao: "invalida", campos: ["ADMIN_SENHA"] } as const,
    ]) {
      const { r, linhas } = registro();
      const conectar = vi.fn();
      await executarAdministracaoPermanente({
        pedido,
        fonte: FONTE,
        registro: r,
        conectar,
      });
      expect(conectar).not.toHaveBeenCalled();
      expect(linhas).toHaveLength(1);
      expect(JSON.stringify(linhas[0])).toContain(pedido.campos[0]);
    }
  });

  const pronta = {
    situacao: "pronta",
    email: EMAIL,
    senha: SENHA,
    segredo: SEGREDO,
    nome: "Administração",
  } as const;

  function sem(segredoDoBanco: string): string {
    return segredoDoBanco;
  }

  it("[CA-15] banco inalcançável: vira 'falhou' com o SQLSTATE, sem e-mail, senha, segredo nem URL", async () => {
    const { r, linhas } = registro();
    const erro = Object.assign(
      new Error(
        `connect ECONNREFUSED ${URL_DO_BANCO} ${EMAIL} ${SENHA} ${SEGREDO}`,
      ),
      { code: "08006" },
    );
    const resultado = await executarAdministracaoPermanente({
      pedido: pronta,
      fonte: FONTE,
      registro: r,
      conectar: () => Promise.reject(erro),
    });
    expect(resultado).toBe("falhou");
    const texto = JSON.stringify(linhas);
    expect(texto).toContain("08006");
    for (const proibido of [
      EMAIL,
      SENHA,
      SEGREDO,
      "senha-do-app-xx",
      "senha-do-papel-admin-xx",
      "ECONNREFUSED",
    ]) {
      expect(texto).not.toContain(sem(proibido));
    }
  });

  it("[CA-15] sem SENHA_BANCO_ADMINISTRACAO vira 'falhou' e não lança", async () => {
    const { r } = registro();
    const { SENHA_BANCO_ADMINISTRACAO: _fora, ...fonte } = FONTE;
    void _fora;
    await expect(
      executarAdministracaoPermanente({
        pedido: pronta,
        fonte,
        registro: r,
        conectar: () => Promise.reject(new Error("não deveria conectar")),
      }),
    ).resolves.toBe("falhou");
  });

  it("[CA-15] conexão pendurada: o prazo vence e a partida segue", async () => {
    const { r } = registro();
    const inicio = Date.now();
    const resultado = await executarAdministracaoPermanente({
      pedido: pronta,
      fonte: FONTE,
      registro: r,
      prazoMs: 50,
      conectar: () => new Promise<ConexaoAberta>(() => undefined),
    });
    expect(resultado).toBe("prazo");
    expect(Date.now() - inicio).toBeLessThan(2_000);
  });

  it("[CA-15] trava ocupada no banco vira 'ocupada' e avisa, sem criar nada", async () => {
    const { r, linhas } = registro();
    const gravou: string[] = [];
    const conexao: ConexaoAberta = {
      query: (texto: string) => {
        if (/INSERT/i.test(texto)) gravou.push(texto);
        if (texto.includes("pg_try_advisory_xact_lock")) {
          return Promise.resolve({ rows: [{ ok: false }] });
        }
        return Promise.resolve({ rows: [] });
      },
      end: () => Promise.resolve(),
    };
    const resultado = await executarAdministracaoPermanente({
      pedido: pronta,
      fonte: FONTE,
      registro: r,
      conectar: () => Promise.resolve(conexao),
    });
    expect(resultado).toBe("ocupada");
    expect(gravou).toEqual([]);
    expect(linhas[0]?.nivel).toBe("aviso");
  });
});
