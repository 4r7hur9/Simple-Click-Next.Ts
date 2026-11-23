/**
 * Script operacional local da administração (#163, T-3) — o que se decide
 * SEM banco: argumentos, origem da senha, política, travas de destino, saída
 * sem segredo e o lugar do script fora do build. A transação contra um banco
 * de verdade é provada em `apps/api/tests/administracao-local.test.ts`.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MARCADORES_DE_HOSPEDAGEM as MARCADORES_DO_SEED } from "@simpleclick/database/administracao-local";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

import {
  type ConexaoLocal,
  ehBancoDeTeste,
  executarAdministracaoLocal,
  lerArgumentos,
  MARCADORES_DE_HOSPEDAGEM,
  recusarSenhaNoAmbiente,
  type OpcoesDaAdministracaoLocal,
  variavelDeSenhaDaConta,
} from "./administracao-local.ts";

const PASTA_DA_API = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Montadas na hora: nenhum literal com cara de credencial no código.
const SENHA_BOA = ["frase", "longa", "da", "prova", "local"].join(" ");
const SENHA_DO_PAPEL = ["papel", "admin", "da", "prova"].join("-");
const URL_LOCAL = `postgresql://sc_admin:${SENHA_DO_PAPEL}@localhost:5432/simpleclick_dev`;

const ARGUMENTOS = [
  "--email",
  "Pessoa@Exemplo.test",
  "--banco",
  "simpleclick_dev",
  "--node-env-do-preview",
  "development",
];

interface Consulta {
  readonly texto: string;
  readonly valores: readonly unknown[] | undefined;
}

/**
 * Banco de mentira: responde `current_database()` com `bancoAtual`, conta
 * zero linhas e conta inexistente; qualquer INSERT falha COM os valores na
 * mensagem — o pior caso para a saída, que precisa esconder senha e resumo.
 */
function bancoFalso(bancoAtual = "simpleclick_dev") {
  const consultas: Consulta[] = [];
  const conexao: ConexaoLocal & { encerrada: boolean } = {
    encerrada: false,
    async query(texto, valores) {
      consultas.push({ texto, valores });
      if (texto.includes("current_database()")) {
        return { rows: [{ banco: bancoAtual }] };
      }
      if (texto.includes("count(*)")) {
        return {
          rows: [{ identidades: 3, lojas: 1, vinculos: 1, administracoes: 1 }],
        };
      }
      if (texto.trimStart().startsWith("INSERT")) {
        throw new Error(`falhou com ${JSON.stringify(valores)}`);
      }
      return { rows: [] };
    },
    async end() {
      conexao.encerrada = true;
    },
  };
  return { conexao, consultas };
}

function montar(sobrescrita: Partial<OpcoesDaAdministracaoLocal> = {}) {
  const saida: string[] = [];
  const banco = bancoFalso();
  const conectar = vi.fn(async () => banco.conexao);
  const lerSenha = vi.fn(async () => SENHA_BOA);
  const opcoes: OpcoesDaAdministracaoLocal = {
    argv: ARGUMENTOS,
    ambiente: {
      NODE_ENV: "development",
      DATABASE_URL_ADMINISTRACAO: URL_LOCAL,
    },
    escrever: (linha) => saida.push(linha),
    lerSenha,
    terminalInterativo: true,
    conectar,
    ...sobrescrita,
  };
  return { opcoes, saida, conectar, lerSenha, banco };
}

describe("lerArgumentos", () => {
  it("[CA-9] lê e-mail normalizado, banco, NODE_ENV declarado e o modo", () => {
    expect(lerArgumentos(ARGUMENTOS)).toEqual({
      email: "pessoa@exemplo.test",
      banco: "simpleclick_dev",
      nodeEnvDoPreview: "development",
      modo: "simular",
    });
    expect(lerArgumentos(["--", ...ARGUMENTOS, "--verificar"]).modo).toBe(
      "verificar",
    );
    expect(lerArgumentos([...ARGUMENTOS, "--aplicar"]).modo).toBe("aplicar");
  });

  it("[CA-9] recusa os dois modos juntos, argumento faltando ou inválido", () => {
    expect(() =>
      lerArgumentos([...ARGUMENTOS, "--verificar", "--aplicar"]),
    ).toThrow(/não andam juntos/);
    expect(() => lerArgumentos(ARGUMENTOS.slice(2))).toThrow(/--email/);
    expect(() =>
      lerArgumentos([
        "--email",
        "x@y.test",
        "--banco",
        "a;drop",
        "--node-env-do-preview",
        "development",
      ]),
    ).toThrow(/--banco/);
    expect(() =>
      lerArgumentos(["--email", "x@y.test", "--banco", "simpleclick_dev"]),
    ).toThrow(/--node-env-do-preview/);
  });

  it("[CA-9] valor solto na linha de comando não é repetido na recusa", () => {
    let mensagem = "";
    try {
      lerArgumentos([...ARGUMENTOS, SENHA_BOA]);
    } catch (erro) {
      mensagem = (erro as Error).message;
    }
    expect(mensagem).toMatch(/argumento não reconhecido/);
    expect(mensagem).not.toContain(SENHA_BOA);
  });
});

describe("executarAdministracaoLocal — entrada da senha", () => {
  it.each([
    ["--senha", SENHA_BOA],
    [`--senha=${SENHA_BOA}`],
    ["--password", SENHA_BOA],
  ])(
    "[CA-9] recusa senha no argv (%s) sem tocar no banco",
    async (...extra) => {
      const { opcoes, saida, conectar, lerSenha } = montar({
        argv: [...ARGUMENTOS, ...extra],
      });

      expect(await executarAdministracaoLocal(opcoes)).toBe(2);
      expect(saida.join("\n")).toMatch(/não é aceita na linha de comando/);
      expect(saida.join("\n")).not.toContain(SENHA_BOA);
      expect(conectar).not.toHaveBeenCalled();
      expect(lerSenha).not.toHaveBeenCalled();
    },
  );

  it("[CA-9] recusa senha da conta em variável de ambiente, citando só o nome", async () => {
    const { opcoes, saida, conectar } = montar({
      ambiente: {
        NODE_ENV: "development",
        DATABASE_URL_ADMINISTRACAO: URL_LOCAL,
        ADMIN_SENHA: SENHA_BOA,
      },
    });

    expect(await executarAdministracaoLocal(opcoes)).toBe(2);
    expect(saida.join("\n")).toMatch(/ADMIN_SENHA está definida/);
    expect(saida.join("\n")).not.toContain(SENHA_BOA);
    expect(conectar).not.toHaveBeenCalled();
  });

  it("[CA-9] senhas dos papéis do banco não contam como senha da conta", () => {
    expect(variavelDeSenhaDaConta("SENHA_BANCO_ADMINISTRACAO")).toBe(false);
    expect(variavelDeSenhaDaConta("PGPASSWORD")).toBe(false);
    expect(variavelDeSenhaDaConta("PRIMEIRO_ADMIN_SENHA")).toBe(true);
    expect(variavelDeSenhaDaConta("ADMIN_PASSWORD")).toBe(true);
    expect(variavelDeSenhaDaConta("SENHA")).toBe(true);
  });

  it("[CA-9] recusa entrada sem terminal antes de pedir a senha", async () => {
    const { opcoes, saida, conectar, lerSenha } = montar({
      terminalInterativo: false,
    });

    expect(await executarAdministracaoLocal(opcoes)).toBe(2);
    expect(saida.join("\n")).toMatch(/não é um terminal/);
    expect(lerSenha).not.toHaveBeenCalled();
    expect(conectar).not.toHaveBeenCalled();
  });

  it("[CA-9] --verificar não pede senha nem exige terminal", async () => {
    const { opcoes, lerSenha, conectar } = montar({
      argv: [...ARGUMENTOS, "--verificar"],
      terminalInterativo: false,
    });

    expect(await executarAdministracaoLocal(opcoes)).toBe(0);
    expect(lerSenha).not.toHaveBeenCalled();
    expect(conectar).toHaveBeenCalledOnce();
  });

  it("[CA-9] recusa senha fora da política, sem repetir a senha nem tocar no banco", async () => {
    const curta = "curta-12";
    const { opcoes, saida, conectar } = montar({
      lerSenha: vi.fn(async () => curta),
    });

    expect(await executarAdministracaoLocal(opcoes)).toBe(1);
    expect(saida.join("\n")).toMatch(/não cumpre a política/);
    expect(saida.join("\n")).toMatch(/pelo menos 12 caracteres/);
    expect(saida.join("\n")).not.toContain(curta);
    expect(conectar).not.toHaveBeenCalled();
  });

  it("[CA-9] recusa senha de vazamento conhecido mesmo longa o bastante", async () => {
    const { opcoes, saida } = montar({
      lerSenha: vi.fn(async () => "qwerty123"),
    });

    expect(await executarAdministracaoLocal(opcoes)).toBe(1);
    expect(saida.join("\n")).toMatch(/vazamentos conhecidos/);
  });

  it("[CA-9] recusa quando a confirmação não confere", async () => {
    const respostas = [SENHA_BOA, `${SENHA_BOA}!`];
    const { opcoes, saida, conectar } = montar({
      lerSenha: vi.fn(async () => respostas.shift() ?? ""),
    });

    expect(await executarAdministracaoLocal(opcoes)).toBe(1);
    expect(saida.join("\n")).toMatch(/não conferem/);
    expect(saida.join("\n")).not.toContain(SENHA_BOA);
    expect(conectar).not.toHaveBeenCalled();
  });
});

describe("executarAdministracaoLocal — travas de destino", () => {
  it.each([
    ["NODE_ENV=production", { NODE_ENV: "production" }, /NODE_ENV=production/],
    [
      "marcador de hospedagem",
      { RAILWAY_ENVIRONMENT: "staging" },
      /RAILWAY_ENVIRONMENT/,
    ],
    [
      "host remoto",
      {
        DATABASE_URL_ADMINISTRACAO: `postgresql://sc_admin:${SENHA_DO_PAPEL}@banco.exemplo.test:5432/simpleclick_dev`,
      },
      /não é local/,
    ],
    [
      "host trocado por parâmetro",
      { DATABASE_URL_ADMINISTRACAO: `${URL_LOCAL}?host=banco.exemplo.test` },
      /não é local/,
    ],
  ])("[CA-9] recusa %s sem conectar", async (_rotulo, extra, esperado) => {
    const { opcoes, saida, conectar } = montar({
      ambiente: {
        NODE_ENV: "development",
        DATABASE_URL_ADMINISTRACAO: URL_LOCAL,
        ...extra,
      },
    });

    expect(await executarAdministracaoLocal(opcoes)).toBe(2);
    expect(saida.join("\n")).toMatch(esperado);
    expect(saida.join("\n")).not.toContain(SENHA_DO_PAPEL);
    expect(conectar).not.toHaveBeenCalled();
  });

  it("[CA-9] aceita 127.0.0.1 e ::1 como banco local", async () => {
    for (const host of ["127.0.0.1", "[::1]"]) {
      const { opcoes } = montar({
        argv: [...ARGUMENTOS, "--verificar"],
        ambiente: {
          NODE_ENV: "development",
          DATABASE_URL_ADMINISTRACAO: `postgresql://sc_admin:${SENHA_DO_PAPEL}@${host}:5432/simpleclick_dev`,
        },
      });
      expect(await executarAdministracaoLocal(opcoes)).toBe(0);
    }
  });

  it("[CA-9] recusa quando current_database() não é o --banco, sem ler mais nada", async () => {
    const banco = bancoFalso("outro_banco");
    const { opcoes, saida } = montar({
      conectar: vi.fn(async () => banco.conexao),
    });

    expect(await executarAdministracaoLocal(opcoes)).toBe(1);
    expect(saida.join("\n")).toMatch(/não é o informado em --banco/);
    expect(banco.consultas).toHaveLength(1);
    expect(banco.conexao.encerrada).toBe(true);
  });

  it("[CA-9] recusa simular ou aplicar em banco de teste, antes de abrir transação", async () => {
    const banco = bancoFalso("sc_teste_qualquer");
    const { opcoes, saida } = montar({
      argv: [
        "--email",
        "pessoa@exemplo.test",
        "--banco",
        "sc_teste_qualquer",
        "--node-env-do-preview",
        "development",
        "--aplicar",
      ],
      conectar: vi.fn(async () => banco.conexao),
    });

    expect(await executarAdministracaoLocal(opcoes)).toBe(1);
    expect(saida.join("\n")).toMatch(/banco de teste/);
    expect(banco.consultas.map((c) => c.texto)).not.toContain("BEGIN");
  });

  it("[CA-9] nomes de banco de teste e do e2e", () => {
    expect(ehBancoDeTeste("simpleclick_test")).toBe(true);
    expect(ehBancoDeTeste("sc_e2e_123")).toBe(true);
    expect(ehBancoDeTeste("sc_teste_abc")).toBe(true);
    expect(ehBancoDeTeste("simpleclick_dev")).toBe(false);
    expect(ehBancoDeTeste("simpleclick")).toBe(false);
  });
});

describe("executarAdministracaoLocal — saída sem segredo", () => {
  it("[CA-9] erro do banco com os valores na mensagem não mostra senha nem resumo", async () => {
    const { opcoes, saida, banco } = montar();

    expect(await executarAdministracaoLocal(opcoes)).toBe(1);

    const insercao = banco.consultas.find((c) =>
      c.texto.includes("INSERT INTO app.identities"),
    );
    const resumo = String(insercao?.valores?.[1]);
    expect(resumo).toMatch(/^argon2id\$/);
    const texto = saida.join("\n");
    expect(texto).toMatch(/falha inesperada/);
    expect(texto).not.toContain(SENHA_BOA);
    expect(texto).not.toContain(resumo);
    expect(texto).not.toContain(resumo.split("$")[3]);
    expect(banco.consultas.map((c) => c.texto)).toContain("ROLLBACK");
    expect(banco.conexao.encerrada).toBe(true);
  });

  it("[CA-9] sem aplicativo e preview fora de development, aborta antes de gravar e mostra o valor declarado", async () => {
    const { opcoes, saida, banco } = montar({
      argv: [
        "--email",
        "pessoa@exemplo.test",
        "--banco",
        "simpleclick_dev",
        "--node-env-do-preview",
        "production",
      ],
    });

    expect(await executarAdministracaoLocal(opcoes)).toBe(1);
    const texto = saida.join("\n");
    expect(texto).toContain("NODE_ENV declarado do preview: production");
    expect(texto).toMatch(/sem aplicativo autenticador confirmado/);
    const gravacoes = banco.consultas.filter((c) =>
      /^\s*(INSERT|UPDATE)/.test(c.texto),
    );
    expect(gravacoes).toEqual([]);
    expect(banco.consultas.at(-1)?.texto).toBe("ROLLBACK");
  });
});

describe("fora do build", () => {
  it("[CA-9] tsconfig.build.json exclui src/administracao-local*.ts e o dist não o recebe", () => {
    const caminho = resolve(PASTA_DA_API, "tsconfig.build.json");
    const lido = ts.readConfigFile(caminho, (arquivo) =>
      ts.sys.readFile(arquivo),
    );
    expect(lido.error).toBeUndefined();
    expect(lido.config.exclude).toContain("src/administracao-local*.ts");

    const resolvido = ts.parseJsonConfigFileContent(
      lido.config,
      ts.sys,
      PASTA_DA_API,
      undefined,
      caminho,
    );
    const nomes = resolvido.fileNames.map((nome) => nome.replaceAll("\\", "/"));
    expect(nomes.some((nome) => nome.endsWith("/src/main.ts"))).toBe(true);
    expect(
      nomes.filter((nome) => nome.includes("administracao-local")),
    ).toEqual([]);
  });
});

describe("senha do .env local (card #3)", () => {
  it("[CA-7] a trava recusa ADMIN_LOCAL_SENHA e ADMIN_SENHA com valor, e aceita a variável vazia", () => {
    for (const nome of ["ADMIN_LOCAL_SENHA", "ADMIN_SENHA"]) {
      expect(() => recusarSenhaNoAmbiente({ [nome]: SENHA_BOA })).toThrow();
      expect(() => recusarSenhaNoAmbiente({ [nome]: "" })).not.toThrow();
    }
  });

  it("[CA-7] uma variável vazia no ambiente vence o --env-file (o comando documentado)", () => {
    const pasta = mkdtempSync(join(tmpdir(), "sc-env-"));
    try {
      const arquivo = join(pasta, "teste.env");
      writeFileSync(arquivo, "ADMIN_LOCAL_SENHA=vem-do-arquivo\nADMIN_SENHA=vem-do-arquivo\n");
      const saida = execFileSync(
        process.execPath,
        [
          `--env-file=${arquivo}`,
          "-e",
          "process.stdout.write(JSON.stringify([process.env.ADMIN_LOCAL_SENHA, process.env.ADMIN_SENHA]))",
        ],
        { env: { PATH: process.env.PATH ?? "", ADMIN_LOCAL_SENHA: "", ADMIN_SENHA: "" }, encoding: "utf8" },
      );
      expect(JSON.parse(saida)).toEqual(["", ""]);
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it("[CA-4] a lista de marcadores de hospedagem do seed é a mesma do CLI", () => {
    expect([...MARCADORES_DO_SEED].sort()).toEqual(
      [...MARCADORES_DE_HOSPEDAGEM].sort(),
    );
  });
});
