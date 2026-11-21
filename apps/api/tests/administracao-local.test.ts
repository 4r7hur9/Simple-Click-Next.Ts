/**
 * Script operacional local da administração (#163, T-3) contra um banco de
 * VERDADE: o banco descartável deste arquivo, com a conexão `sc_admin`
 * montada aqui e injetada — nada de `.env`.
 *
 * O que se prova (CA-8, CA-9):
 * - simulação desfaz tudo; aplicar deixa a conta como ÚNICA administração
 *   ativa, revoga (sem apagar) os outros grants, encerra as sessões certas e
 *   não muda as contagens de identidades, lojas e vínculos;
 * - rodar de novo não muda nada (idempotente);
 * - sem aplicativo autenticador e preview fora de development, aborta sem
 *   revogar ninguém; conta nova só nasce em development, sem aceite legal;
 * - recusa `current_database()` diferente de `--banco` e banco de teste;
 * - o próprio script (`node src/administracao-local.ts --verificar`) inicia
 *   contra este banco;
 * - a saída nunca traz a senha nem o resumo.
 */

import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  comoAdministracao,
  criarAdministradorDaPlataforma,
  criarIdentidade,
  criarLoja,
  criarMembro,
  sufixoDeTeste,
  type IdentidadeDeTeste,
} from "@simpleclick/testing";

import { ESPERA_LONGA, exigirVariavel } from "./apoio-de-isolamento.ts";
import {
  type ConexaoLocal,
  executarAdministracaoLocal,
} from "../src/administracao-local.ts";
import { derivarSenha, senhaConfere } from "../src/modules/auth/senha.ts";

const PASTA_DA_API = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const executar = promisify(execFile);

// Montadas na hora: nenhum literal com cara de credencial no código.
const SENHA = ["frase", "longa", "da", "administracao", "local"].join(" ");
const SENHA_ANTIGA = ["outra", "frase", "antiga", "da", "conta"].join(" ");

/** A cadeia `sc_admin` do banco deste arquivo, como a API montaria. */
function urlDaAdministracao(): string {
  const destino = new URL(bancoDoArquivo().url);
  destino.username = "sc_admin";
  destino.password = exigirVariavel("SENHA_BANCO_ADMINISTRACAO");
  return destino.toString();
}

async function conectar(url: string): Promise<ConexaoLocal> {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  return cliente;
}

interface Rodada {
  readonly email: string;
  readonly modo?: "--verificar" | "--aplicar" | undefined;
  readonly nodeEnvDoPreview?: string;
  readonly banco?: string;
  readonly aceitarBancoDeTeste?: boolean;
}

async function rodar(rodada: Rodada) {
  const saida: string[] = [];
  const codigo = await executarAdministracaoLocal({
    argv: [
      "--email",
      rodada.email,
      "--banco",
      rodada.banco ?? bancoDoArquivo().nome,
      "--node-env-do-preview",
      rodada.nodeEnvDoPreview ?? "production",
      ...(rodada.modo === undefined ? [] : [rodada.modo]),
    ],
    ambiente: {
      NODE_ENV: "test",
      DATABASE_URL_ADMINISTRACAO: urlDaAdministracao(),
    },
    escrever: (linha) => saida.push(linha),
    lerSenha: async () => SENHA,
    terminalInterativo: true,
    conectar,
    aceitarBancoDeTeste: rodada.aceitarBancoDeTeste ?? true,
  });
  return { codigo, saida, texto: saida.join("\n") };
}

/** Tudo que o script não pode mudar, e quem está ativo. */
async function retrato() {
  return comoAdministracao(async (tx) => {
    const { rows } = await tx.query<{
      identidades: number;
      lojas: number;
      vinculos: number;
      grants: number;
      sessoes: number;
      aceites: number;
    }>(
      `SELECT (SELECT count(*) FROM app.identities)::int        AS identidades,
              (SELECT count(*) FROM app.stores)::int            AS lojas,
              (SELECT count(*) FROM app.store_members)::int     AS vinculos,
              (SELECT count(*) FROM app.platform_admins)::int   AS grants,
              (SELECT count(*) FROM app.sessions)::int          AS sessoes,
              (SELECT count(*) FROM app.legal_acceptances)::int AS aceites`,
    );
    const ativos = await tx.query<{ id: string }>(
      `SELECT identity_id::text AS id FROM app.platform_admins
        WHERE revoked_at IS NULL ORDER BY 1`,
    );
    const contagens = rows[0];
    if (contagens === undefined) throw new Error("contagem sem linha");
    return { ...contagens, ativos: ativos.rows.map((linha) => linha.id) };
  });
}

async function contaNoBanco(id: string) {
  return comoAdministracao(async (tx) => {
    const { rows } = await tx.query<{
      resumo: string | null;
      verificada: boolean;
      falhas: number;
      trava: Date | null;
    }>(
      `SELECT password_hash AS resumo, email_verified_at IS NOT NULL AS verificada,
              failed_login_count AS falhas, locked_until AS trava
         FROM app.identities WHERE id = $1`,
      [id],
    );
    return rows[0];
  });
}

async function sessao(id: string) {
  return comoAdministracao(async (tx) => {
    const { rows } = await tx.query<{
      revogada: boolean;
      motivo: string | null;
    }>(
      `SELECT revoked_at IS NOT NULL AS revogada, revoked_reason AS motivo
         FROM app.sessions WHERE id = $1`,
      [id],
    );
    return rows[0];
  });
}

async function criarSessao(
  identidadeId: string,
  papel: "CUSTOMER" | "OWNER" | "ADMIN",
  expirada = false,
): Promise<string> {
  const id = randomUUID();
  await comoAdministracao((tx) =>
    tx.query(
      `INSERT INTO app.sessions (id, identity_id, family_id, token_sha256,
                                 role_at_issue, client_kind, issued_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'WEB', now() - interval '2 hours',
               CASE WHEN $6::boolean THEN now() - interval '1 hour'
                    ELSE now() + interval '1 day' END)`,
      [
        id,
        identidadeId,
        randomUUID(),
        randomBytes(32).toString("hex"),
        papel,
        expirada,
      ],
    ),
  );
  return id;
}

async function confirmarAplicativo(identidadeId: string): Promise<void> {
  await comoAdministracao((tx) =>
    tx.query(
      `INSERT INTO app.totp_credentials (identity_id, secret_enc, confirmed_at)
       VALUES ($1, 'v1.prova-da-administracao-local', now())`,
      [identidadeId],
    ),
  );
}

// ---------------------------------------------------------------------------
// Cenário: duas administrações indevidas e a conta certa, existente
// ---------------------------------------------------------------------------

let alvo: IdentidadeDeTeste;
let indevida: IdentidadeDeTeste;
let outraIndevida: IdentidadeDeTeste;
const sessoes = {
  daConta: "",
  adminDaIndevida: "",
  donoDaIndevida: "",
  adminExpirada: "",
};

beforeAll(async () => {
  const loja = await criarLoja();
  await criarLoja();
  indevida = await criarAdministradorDaPlataforma();
  outraIndevida = await criarAdministradorDaPlataforma();
  alvo = await criarIdentidade({ emailVerificado: false });
  await criarMembro({ loja, identidade: alvo, papel: "OWNER" });
  await confirmarAplicativo(alvo.id);
  const antiga = await derivarSenha(SENHA_ANTIGA);
  await comoAdministracao((tx) =>
    tx.query(
      `UPDATE app.identities
          SET password_hash = $2, failed_login_count = 4,
              locked_until = now() + interval '1 hour'
        WHERE id = $1`,
      [alvo.id, antiga],
    ),
  );
  sessoes.daConta = await criarSessao(alvo.id, "OWNER");
  sessoes.adminDaIndevida = await criarSessao(indevida.id, "ADMIN");
  sessoes.donoDaIndevida = await criarSessao(indevida.id, "OWNER");
  sessoes.adminExpirada = await criarSessao(outraIndevida.id, "ADMIN", true);
}, ESPERA_LONGA);

describe("administração local contra o banco descartável", () => {
  it(
    "[CA-9] o script inicia pelo terminal com --verificar contra este banco, sem .env",
    async () => {
      const pacote = JSON.parse(
        readFileSync(resolve(PASTA_DA_API, "package.json"), "utf8"),
      ) as { scripts: Record<string, string> };
      expect(pacote.scripts["administracao:local"]).toBe(
        "node --env-file-if-exists=../../.env src/administracao-local.ts",
      );

      // O mesmo arquivo do script do pacote, sem `--env-file`: o ambiente é
      // só o que a prova passa.
      const { stdout } = await executar(
        process.execPath,
        [
          "src/administracao-local.ts",
          "--email",
          alvo.email,
          "--banco",
          bancoDoArquivo().nome,
          "--node-env-do-preview",
          "development",
          "--verificar",
        ],
        {
          cwd: PASTA_DA_API,
          env: {
            PATH: process.env.PATH,
            NODE_ENV: "test",
            DATABASE_URL_ADMINISTRACAO: urlDaAdministracao(),
          },
        },
      );
      expect(stdout).toContain(`banco: ${bancoDoArquivo().nome}`);
      expect(stdout).toContain("modo: verificar (só leitura)");
      expect(stdout).toMatch(/administrações ativas=2/);
      expect(stdout).toContain("NÃO é a única administração ativa");
    },
    ESPERA_LONGA,
  );

  it(
    "[CA-9] recusa current_database() diferente de --banco, sem alterar nada",
    async () => {
      const antes = await retrato();
      const { codigo, texto } = await rodar({
        email: alvo.email,
        modo: "--aplicar",
        banco: "simpleclick_dev",
      });

      expect(codigo).toBe(1);
      expect(texto).toMatch(/não é o informado em --banco/);
      expect(await retrato()).toEqual(antes);
    },
    ESPERA_LONGA,
  );

  it(
    "[CA-9] recusa simular ou aplicar em banco de teste quando a prova não libera",
    async () => {
      const antes = await retrato();
      for (const modo of [undefined, "--aplicar"] as const) {
        const { codigo, texto } = await rodar({
          email: alvo.email,
          modo,
          aceitarBancoDeTeste: false,
        });
        expect(codigo).toBe(1);
        expect(texto).toMatch(/é banco de teste/);
      }
      expect(await retrato()).toEqual(antes);
    },
    ESPERA_LONGA,
  );

  it(
    "[CA-9] sem aplicativo e preview fora de development, aborta sem revogar ninguém",
    async () => {
      const semAplicativo = await criarIdentidade();
      const antes = await retrato();

      const existente = await rodar({
        email: semAplicativo.email,
        modo: "--aplicar",
      });
      expect(existente.codigo).toBe(1);
      expect(existente.texto).toContain(
        "NODE_ENV declarado do preview: production",
      );
      expect(existente.texto).toMatch(/sem aplicativo autenticador confirmado/);

      const nova = await rodar({
        email: `nova-${sufixoDeTeste()}@exemplo.test`,
        modo: "--aplicar",
        nodeEnvDoPreview: "staging",
      });
      expect(nova.codigo).toBe(1);
      expect(nova.texto).toContain("NODE_ENV declarado do preview: staging");

      expect(await retrato()).toEqual(antes);
      expect((await contaNoBanco(semAplicativo.id))?.resumo).toBeNull();
    },
    ESPERA_LONGA,
  );

  it(
    "[CA-8] simulação mostra o que faria e desfaz tudo",
    async () => {
      const antes = await retrato();
      const contaAntes = await contaNoBanco(alvo.id);

      const { codigo, texto } = await rodar({ email: alvo.email });

      expect(codigo).toBe(0);
      expect(texto).toMatch(/administrações revogadas: 2/);
      expect(texto).toMatch(/simulação concluída/);
      expect(await retrato()).toEqual(antes);
      expect(await contaNoBanco(alvo.id)).toEqual(contaAntes);
      expect((await sessao(sessoes.daConta))?.revogada).toBe(false);
      expect((await sessao(sessoes.adminDaIndevida))?.revogada).toBe(false);
    },
    ESPERA_LONGA,
  );

  it(
    "[CA-8][CA-9] aplicar deixa a conta como única administração, sem apagar nada",
    async () => {
      const antes = await retrato();
      expect(antes.ativos).toEqual([indevida.id, outraIndevida.id].sort());

      const { codigo, texto } = await rodar({
        email: alvo.email,
        modo: "--aplicar",
      });

      expect(codigo).toBe(0);
      const depois = await retrato();
      // Uma linha de grant a mais (a da conta); as revogadas continuam lá.
      expect(depois).toEqual({
        ...antes,
        grants: antes.grants + 1,
        ativos: [alvo.id],
      });

      const conta = await contaNoBanco(alvo.id);
      expect(await senhaConfere(SENHA, conta?.resumo ?? "")).toBe(true);
      expect(conta).toMatchObject({ verificada: true, falhas: 0, trava: null });

      expect(await sessao(sessoes.daConta)).toEqual({
        revogada: true,
        motivo: "PASSWORD_CHANGED",
      });
      expect(await sessao(sessoes.adminDaIndevida)).toEqual({
        revogada: true,
        motivo: "ADMIN_REVOKED",
      });
      expect((await sessao(sessoes.donoDaIndevida))?.revogada).toBe(false);
      expect((await sessao(sessoes.adminExpirada))?.revogada).toBe(false);

      expect(texto).toContain(indevida.id);
      expect(texto).toContain(outraIndevida.id);
      expect(texto).toContain("NODE_ENV declarado do preview: production");
      expect(texto).not.toContain(SENHA);
      expect(texto).not.toContain(conta?.resumo ?? "<sem resumo>");
    },
    ESPERA_LONGA,
  );

  it(
    "[CA-8][CA-9] rodar de novo não muda nada (idempotente)",
    async () => {
      const antes = await retrato();
      const contaAntes = await contaNoBanco(alvo.id);

      const { codigo, texto } = await rodar({
        email: alvo.email,
        modo: "--aplicar",
      });

      expect(codigo).toBe(0);
      expect(texto).toMatch(/senha: igual à atual, mantida/);
      expect(texto).toMatch(/administração da conta: já estava ativa/);
      expect(texto).toMatch(/administrações revogadas: 0/);
      expect(texto).toMatch(/\(PASSWORD_CHANGED\): 0/);
      expect(await retrato()).toEqual(antes);
      expect(await contaNoBanco(alvo.id)).toEqual(contaAntes);
      expect(texto).not.toContain(SENHA);
      expect(texto).not.toContain(contaAntes?.resumo ?? "<sem resumo>");

      const verificado = await rodar({
        email: alvo.email,
        modo: "--verificar",
      });
      expect(verificado.codigo).toBe(0);
      expect(verificado.texto).toContain(
        "✔ a conta informada é a única administração ativa",
      );
    },
    ESPERA_LONGA,
  );

  it(
    "[CA-8] conta nova em development nasce verificada, única administração e sem aceite legal",
    async () => {
      const antes = await retrato();
      const email = `nova-${sufixoDeTeste()}@exemplo.test`;

      const { codigo, texto } = await rodar({
        email,
        modo: "--aplicar",
        nodeEnvDoPreview: "development",
      });

      expect(codigo).toBe(0);
      expect(texto).toMatch(/conta: criada/);
      const depois = await retrato();
      expect(depois.identidades).toBe(antes.identidades + 1);
      expect(depois.lojas).toBe(antes.lojas);
      expect(depois.vinculos).toBe(antes.vinculos);
      expect(depois.aceites).toBe(antes.aceites);
      expect(depois.grants).toBe(antes.grants + 1);
      expect(depois.ativos).toHaveLength(1);
      expect(depois.ativos).not.toContain(alvo.id);

      const nova = await contaNoBanco(depois.ativos[0] ?? "");
      expect(nova?.verificada).toBe(true);
      expect(await senhaConfere(SENHA, nova?.resumo ?? "")).toBe(true);
      expect(texto).toContain(alvo.id);
      expect(texto).not.toContain(SENHA);
      expect(texto).not.toContain(nova?.resumo ?? "<sem resumo>");
    },
    ESPERA_LONGA,
  );
});
