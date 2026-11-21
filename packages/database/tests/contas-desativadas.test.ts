import { randomBytes, randomUUID } from "node:crypto";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  apagarBanco,
  bancoDoArquivo,
  comoLoja,
  conectar,
  criarAdministradorDaPlataforma,
  criarIdentidade,
  criarLoja,
  criarMembro,
  exigirNomeEfemero,
  nomeNovoDeBancoDeTeste,
  urlDoBanco,
  urlDoServidorDeTeste,
  type IdentidadeDeTeste,
  type LojaDeTeste,
} from "../../testing/src/index.ts";
import {
  aplicarMigracoes,
  derivarUrlDePapel,
  lerMigracoes,
} from "../src/migrate.ts";

/**
 * #170 / T-1 — migração 0075: a conta passa a poder ser desativada.
 *
 * O que este arquivo prova, no banco e sem a API:
 *
 * - [CA-4] a conta desativada não entra, não renova, não recupera a senha, não
 *   aceita convite e deixa de ser equipe (a staff lê zero linhas); `sc_app` não
 *   consegue mexer em `disabled_at`; reativar devolve o acesso; nenhum desses
 *   caminhos termina em erro que não seja o previsto;
 * - [CA-5] desativar em paralelo com renovar a sessão, abrir sessão, redefinir
 *   a senha pelo link e aceitar o convite não gera deadlock nem deixa sessão
 *   viva — provado de duas formas: pela ORDEM de trava (a função espera a
 *   identidade antes de tocar na sessão, no link ou no vínculo) e por rodadas
 *   concorrentes com duas conexões por par;
 * - [CA-6] o link de uso único da administração (`issued_by`) deixa
 *   ACESSO_USADO no consumo e o pedido da própria pessoa não; o convite e o
 *   link se consomem um ao outro; a trilha nunca guarda o resumo do link;
 * - a 0075 é expand-only: sobre um banco já povoado na 0074, as colunas nascem
 *   nulas, nenhum dado muda e as oito funções mantêm assinatura, retorno,
 *   volatilidade, dono, `search_path` e permissões.
 *
 * "Desativar" aqui é o que a rota da administração faz (T-3): numa transação,
 * trava a identidade, preenche `disabled_at` e revoga as sessões com o motivo
 * ACCOUNT_DISABLED, pela credencial `sc_admin`.
 */

const ESPERA = 120_000;
const SENHA_DERIVADA = "argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA";
const UM_DIA = "now() + interval '1 day'";

// ---------------------------------------------------------------------------
// Conexões
// ---------------------------------------------------------------------------

type Papel = "sc_app" | "sc_admin" | "sc_migrator";

const VARIAVEL_DA_SENHA: Record<Papel, string> = {
  sc_app: "SENHA_BANCO_APLICACAO",
  sc_admin: "SENHA_BANCO_ADMINISTRACAO",
  sc_migrator: "SENHA_BANCO_MIGRADOR",
};

function senha(papel: Papel): string {
  const variavel = VARIAVEL_DA_SENHA[papel];
  const valor = process.env[variavel];
  if (!valor) throw new Error(`variável de ambiente ausente: ${variavel}`);
  return valor;
}

const abertas: pg.Client[] = [];

async function conectarComo(papel: Papel): Promise<pg.Client> {
  const cliente = new pg.Client({
    connectionString: derivarUrlDePapel(bancoDoArquivo().url, papel, senha(papel)),
  });
  await cliente.connect();
  // Teste que esperasse para sempre travaria o Vitest inteiro: melhor falhar.
  await cliente.query("SET lock_timeout = '20s'");
  abertas.push(cliente);
  return cliente;
}

async function pidDe(cliente: pg.Client): Promise<number> {
  const r = await cliente.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
  return r.rows[0]!.pid;
}

let migrador: pg.Client;
let admin: pg.Client;
let admin2: pg.Client;
let app: pg.Client;
let app2: pg.Client;
let loja: LojaDeTeste;

beforeAll(async () => {
  loja = await criarLoja();
  migrador = await conectarComo("sc_migrator");
  admin = await conectarComo("sc_admin");
  admin2 = await conectarComo("sc_admin");
  app = await conectarComo("sc_app");
  app2 = await conectarComo("sc_app");
}, ESPERA);

afterAll(async () => {
  await Promise.all(abertas.map((c) => c.end().catch(() => {})));
});

// ---------------------------------------------------------------------------
// Dados de cena
// ---------------------------------------------------------------------------

function resumo(): string {
  return randomBytes(32).toString("hex");
}

async function pessoa(opcoes: { comSenha?: boolean } = {}): Promise<IdentidadeDeTeste> {
  const nova = await criarIdentidade();
  if (opcoes.comSenha ?? true) {
    await migrador.query("UPDATE app.identities SET password_hash = $2 WHERE id = $1", [
      nova.id,
      SENHA_DERIVADA,
    ]);
  }
  return nova;
}

async function plantarSessao(identidade: string, token = resumo()): Promise<string> {
  await migrador.query(
    `INSERT INTO app.sessions (id, identity_id, family_id, token_sha256, role_at_issue, client_kind, expires_at)
     VALUES ($1, $2, $3, $4, 'CUSTOMER', 'WEB', ${UM_DIA})`,
    [randomUUID(), identidade, randomUUID(), token],
  );
  return token;
}

async function plantarLink(
  identidade: string,
  opcoes: { emitidoPor?: string; expiraEm?: string } = {},
): Promise<string> {
  const hash = resumo();
  await migrador.query(
    `INSERT INTO app.verification_codes (identity_id, purpose, channel, code_hash, expires_at, issued_by)
     VALUES ($1, 'PASSWORD_RESET', 'EMAIL', $2, ${opcoes.expiraEm ?? "now() + interval '1 hour'"}, $3)`,
    [identidade, hash, opcoes.emitidoPor ?? null],
  );
  return hash;
}

async function plantarConvite(identidade: string): Promise<string> {
  const hash = resumo();
  await migrador.query(
    `INSERT INTO app.store_members (store_id, identity_id, role, invited_by, invite_token_hash, invite_expires_at)
     VALUES ($1, $2, 'OWNER', $3, $4, ${UM_DIA})`,
    [loja.id, identidade, loja.dono.id, hash],
  );
  return hash;
}

async function sessoesVivas(identidade: string): Promise<number> {
  const r = await migrador.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM app.sessions WHERE identity_id = $1 AND revoked_at IS NULL",
    [identidade],
  );
  return r.rows[0]!.n;
}

async function contar(sql: string, parametros: unknown[]): Promise<number> {
  const r = await migrador.query<{ n: number }>(sql, parametros);
  return r.rows[0]!.n;
}

async function linha<T extends pg.QueryResultRow>(sql: string, parametros: unknown[]): Promise<T> {
  const r = await migrador.query<T>(sql, parametros);
  expect(r.rows).toHaveLength(1);
  return r.rows[0]!;
}

/** O que a rota da administração faz ao desativar (T-3): identidade primeiro. */
async function desativar(cliente: pg.Client, id: string): Promise<void> {
  await iniciarDesativacao(cliente, id);
  await concluirDesativacao(cliente, id);
}

async function iniciarDesativacao(cliente: pg.Client, id: string): Promise<void> {
  await cliente.query("BEGIN");
  try {
    await cliente.query("SELECT 1 FROM app.identities WHERE id = $1 FOR UPDATE", [id]);
  } catch (causa) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw causa;
  }
}

async function concluirDesativacao(cliente: pg.Client, id: string): Promise<void> {
  try {
    await cliente.query("UPDATE app.identities SET disabled_at = now() WHERE id = $1", [id]);
    await cliente.query(
      `UPDATE app.sessions SET revoked_at = now(), revoked_reason = 'ACCOUNT_DISABLED'
        WHERE identity_id = $1 AND revoked_at IS NULL`,
      [id],
    );
    await cliente.query("COMMIT");
  } catch (causa) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw causa;
  }
}

async function reativar(id: string): Promise<void> {
  await admin.query("UPDATE app.identities SET disabled_at = NULL WHERE id = $1", [id]);
}

function codigoDe(causa: unknown): string {
  return (causa as { code?: string }).code ?? "sem-codigo";
}

interface Desfecho {
  /** A função deixou a pessoa passar (sessão aberta, senha trocada, convite aceito). */
  readonly aceito: boolean;
  /** O código do PostgreSQL, quando a função recusou levantando erro. */
  readonly erro?: string;
}

async function tentar(acao: () => Promise<boolean>): Promise<Desfecho> {
  try {
    return { aceito: await acao() };
  } catch (causa) {
    return { aceito: false, erro: codigoDe(causa) };
  }
}

// ---------------------------------------------------------------------------
// As quatro portas de entrada que a desativação precisa fechar
// ---------------------------------------------------------------------------

interface Cena {
  readonly identidade: string;
  readonly [campo: string]: string;
}

interface Porta {
  readonly nome: string;
  /** Identidade com o que a porta usa: sessão, link ou convite. */
  preparar(): Promise<Cena>;
  /** Passa pela porta. `aceito` é o desfecho da função, na conexão dada. */
  passar(cliente: pg.Client, cena: Cena): Promise<Desfecho>;
  /** O estado do banco combina com o desfecho (aceito ⇔ efeito gravado)? */
  conferir(cena: Cena, desfecho: Desfecho): Promise<void>;
}

const renovacao: Porta = {
  nome: "renovação da sessão",
  async preparar() {
    const p = await pessoa();
    return { identidade: p.id, token: await plantarSessao(p.id) };
  },
  passar: (cliente, cena) =>
    tentar(async () => {
      const r = await cliente.query<{ estado: string }>(
        `SELECT estado FROM app.auth_rotacionar_sessao(
           $1, $2::uuid, $3, now(), ${UM_DIA}, now())`,
        [cena.token, randomUUID(), resumo()],
      );
      return r.rows[0]?.estado === "rotacionada";
    }),
  async conferir(cena, desfecho) {
    const filhas = await contar(
      "SELECT count(*)::int AS n FROM app.sessions WHERE identity_id = $1 AND parent_id IS NOT NULL",
      [cena.identidade],
    );
    expect(filhas, "sessão sucessora só existe se a renovação foi aceita").toBe(desfecho.aceito ? 1 : 0);
  },
};

const abrirSessao: Porta = {
  nome: "abertura de sessão",
  async preparar() {
    const p = await pessoa();
    return { identidade: p.id, token: resumo() };
  },
  passar: (cliente, cena) =>
    tentar(async () => {
      await cliente.query(
        `SELECT app.auth_criar_sessao($1::uuid, $2::uuid, $3::uuid, 'CUSTOMER', 'WEB', $4, now(), ${UM_DIA})`,
        [randomUUID(), randomUUID(), cena.identidade, cena.token],
      );
      return true;
    }),
  async conferir(cena, desfecho) {
    const n = await contar(
      "SELECT count(*)::int AS n FROM app.sessions WHERE token_sha256 = $1",
      [cena.token],
    );
    expect(n, "a sessão só existe se a abertura foi aceita").toBe(desfecho.aceito ? 1 : 0);
  },
};

const redefinicao: Porta = {
  nome: "redefinição da senha pelo link",
  async preparar() {
    const p = await pessoa();
    await plantarSessao(p.id);
    return { identidade: p.id, link: await plantarLink(p.id) };
  },
  passar: (cliente, cena) =>
    tentar(async () => {
      const r = await cliente.query<{ ok: boolean }>(
        "SELECT app.auth_redefinir_senha_pelo_pedido($1, $2, now()) AS ok",
        [cena.link, "argon2id$v=19$m=19456,t=2,p=1$bm92bw$bm92YQ"],
      );
      return r.rows[0]!.ok;
    }),
  async conferir(cena, desfecho) {
    const { password_hash: hash } = await linha<{ password_hash: string | null }>(
      "SELECT password_hash FROM app.identities WHERE id = $1",
      [cena.identidade],
    );
    expect(hash === "argon2id$v=19$m=19456,t=2,p=1$bm92bw$bm92YQ", "a senha só troca se o link foi aceito").toBe(desfecho.aceito);
  },
};

const convite: Porta = {
  nome: "aceite do convite",
  async preparar() {
    const p = await pessoa({ comSenha: false });
    await plantarSessao(p.id);
    return { identidade: p.id, convite: await plantarConvite(p.id) };
  },
  passar: (cliente, cena) =>
    tentar(async () => {
      const r = await cliente.query<{ ok: boolean }>(
        "SELECT app.auth_aceitar_convite($1, $2, now()) AS ok",
        [cena.convite, SENHA_DERIVADA],
      );
      return r.rows[0]!.ok;
    }),
  async conferir(cena, desfecho) {
    const { aceito } = await linha<{ aceito: boolean }>(
      `SELECT invite_accepted_at IS NOT NULL AS aceito
         FROM app.store_members WHERE store_id = $1 AND identity_id = $2`,
      [loja.id, cena.identidade],
    );
    expect(aceito, "o vínculo só é aceito se o convite foi aceito").toBe(desfecho.aceito);
  },
};

const PORTAS: readonly Porta[] = [renovacao, abrirSessao, redefinicao, convite];

// ---------------------------------------------------------------------------
// [CA-4] A conta desativada fica de fora, em cada caminho de entrada
// ---------------------------------------------------------------------------

describe("[CA-4] conta desativada: o banco recusa, sem revelar e sem erro inesperado", () => {
  it(
    "[CA-4] o login não a encontra (igual à conta inexistente) e volta a encontrá-la depois de reativada",
    async () => {
      const p = await pessoa();
      const consulta = () =>
        app.query("SELECT identidade_id FROM app.auth_identidade_para_login($1)", [p.email]);
      expect((await consulta()).rows).toHaveLength(1);

      await desativar(admin, p.id);
      expect((await consulta()).rows).toEqual([]);
      const inexistente = await app.query(
        "SELECT identidade_id FROM app.auth_identidade_para_login($1)",
        [`ninguem-${resumo()}@exemplo.test`],
      );
      expect(inexistente.rows).toEqual([]);

      await reativar(p.id);
      expect((await consulta()).rows).toHaveLength(1);
    },
    ESPERA,
  );

  it(
    "[CA-4] não abre sessão (P0002) e reativar permite um novo login",
    async () => {
      const p = await pessoa();
      await desativar(admin, p.id);
      const token = resumo();
      const recusada = await abrirSessao.passar(app, { identidade: p.id, token });
      expect(recusada).toEqual({ aceito: false, erro: "P0002" });
      expect(await contar("SELECT count(*)::int AS n FROM app.sessions WHERE token_sha256 = $1", [token])).toBe(0);

      await reativar(p.id);
      expect(await abrirSessao.passar(app, { identidade: p.id, token })).toEqual({ aceito: true });
    },
    ESPERA,
  );

  it(
    "[CA-4] não renova: estado 'recusada', o token fica intacto e nenhuma sessão sucessora nasce",
    async () => {
      const p = await pessoa();
      const token = await plantarSessao(p.id);
      // Só `disabled_at`, sem revogar: prova a barreira do próprio banco, e não
      // a revogação que a rota da administração faz por cima.
      await admin.query("UPDATE app.identities SET disabled_at = now() WHERE id = $1", [p.id]);

      const r = await app.query<{ estado: string; identidade_id: string | null }>(
        `SELECT estado, identidade_id FROM app.auth_rotacionar_sessao($1, $2::uuid, $3, now(), ${UM_DIA}, now())`,
        [token, randomUUID(), resumo()],
      );
      expect(r.rows).toEqual([{ estado: "recusada", identidade_id: null }]);
      const sessao = await linha<{ used_at: Date | null; revoked_at: Date | null }>(
        "SELECT used_at, revoked_at FROM app.sessions WHERE token_sha256 = $1",
        [token],
      );
      expect(sessao).toEqual({ used_at: null, revoked_at: null });
      expect(await contar("SELECT count(*)::int AS n FROM app.sessions WHERE identity_id = $1", [p.id])).toBe(1);

      await reativar(p.id);
      const volta = await app.query<{ estado: string }>(
        `SELECT estado FROM app.auth_rotacionar_sessao($1, $2::uuid, $3, now(), ${UM_DIA}, now())`,
        [token, randomUUID(), resumo()],
      );
      expect(volta.rows[0]?.estado).toBe("rotacionada");
    },
    ESPERA,
  );

  it(
    "[CA-4] o motivo ACCOUNT_DISABLED é aceito na revogação; um motivo qualquer continua recusado",
    async () => {
      const p = await pessoa();
      await plantarSessao(p.id);
      await desativar(admin, p.id);
      const { revoked_reason: motivo } = await linha<{ revoked_reason: string }>(
        "SELECT revoked_reason FROM app.sessions WHERE identity_id = $1",
        [p.id],
      );
      expect(motivo).toBe("ACCOUNT_DISABLED");

      const q = await pessoa();
      await plantarSessao(q.id);
      await expect(
        admin.query(
          "UPDATE app.sessions SET revoked_at = now(), revoked_reason = 'QUALQUER' WHERE identity_id = $1",
          [q.id],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    },
    ESPERA,
  );

  it(
    "[CA-4] a recuperação não a encontra, não cria código (P0002) e o pedido de quem está ativa segue igual",
    async () => {
      const p = await pessoa();
      const busca = () =>
        app.query("SELECT identidade_id FROM app.auth_identidade_para_recuperacao($1)", [p.email]);
      expect((await busca()).rows).toHaveLength(1);

      await desativar(admin, p.id);
      expect((await busca()).rows).toEqual([]);
      const pedido = () =>
        tentar(async () => {
          await app.query(
            "SELECT app.auth_criar_pedido_de_recuperacao($1::uuid, $2, now() + interval '1 hour')",
            [p.id, resumo()],
          );
          return true;
        });
      expect(await pedido()).toEqual({ aceito: false, erro: "P0002" });
      expect(
        await contar("SELECT count(*)::int AS n FROM app.verification_codes WHERE identity_id = $1", [p.id]),
      ).toBe(0);

      await reativar(p.id);
      expect(await pedido()).toEqual({ aceito: true });
      expect(
        await contar("SELECT count(*)::int AS n FROM app.verification_codes WHERE identity_id = $1", [p.id]),
      ).toBe(1);
    },
    ESPERA,
  );

  it(
    "[CA-4] o link de redefinição é recusado (false), sem trocar a senha, sem revogar nada e sem deixar ACESSO_USADO",
    async () => {
      const adm = await criarAdministradorDaPlataforma();
      const p = await pessoa();
      await plantarSessao(p.id);
      const link = await plantarLink(p.id, { emitidoPor: adm.id });
      await admin.query("UPDATE app.identities SET disabled_at = now() WHERE id = $1", [p.id]);

      const r = await app.query<{ ok: boolean }>(
        "SELECT app.auth_redefinir_senha_pelo_pedido($1, $2, now()) AS ok",
        [link, SENHA_DERIVADA],
      );
      expect(r.rows[0]?.ok).toBe(false);
      const { password_hash: hash } = await linha<{ password_hash: string }>(
        "SELECT password_hash FROM app.identities WHERE id = $1",
        [p.id],
      );
      expect(hash).toBe(SENHA_DERIVADA);
      expect(await sessoesVivas(p.id)).toBe(1);
      expect(
        await contar(
          "SELECT count(*)::int AS n FROM app.audit_platform WHERE action = 'ACESSO_USADO' AND entity_id = $1",
          [p.id],
        ),
      ).toBe(0);
    },
    ESPERA,
  );

  it(
    "[CA-4] o convite é recusado (false) e o vínculo continua pendente, com o convite intacto",
    async () => {
      const p = await pessoa({ comSenha: false });
      const token = await plantarConvite(p.id);
      await admin.query("UPDATE app.identities SET disabled_at = now() WHERE id = $1", [p.id]);

      const r = await app.query<{ ok: boolean }>("SELECT app.auth_aceitar_convite($1, $2, now()) AS ok", [
        token,
        SENHA_DERIVADA,
      ]);
      expect(r.rows[0]?.ok).toBe(false);
      const vinculo = await linha<{ aceito: boolean; pendente: boolean }>(
        `SELECT invite_accepted_at IS NOT NULL AS aceito, invite_token_hash IS NOT NULL AS pendente
           FROM app.store_members WHERE store_id = $1 AND identity_id = $2`,
        [loja.id, p.id],
      );
      expect(vinculo).toEqual({ aceito: false, pendente: true });
      const sem = await migrador.query("SELECT password_hash FROM app.identities WHERE id = $1", [p.id]);
      expect(sem.rows[0].password_hash).toBeNull();
    },
    ESPERA,
  );

  it(
    "[CA-4] a staff desativada deixa de ser equipe: is_store_staff() falso e zero linhas da loja; reativada, volta",
    async () => {
      const staff = await criarMembro({ loja, papel: "STAFF" });
      const donoExtra = await criarMembro({ loja, papel: "OWNER" });
      const comoEla = async (papel: "STAFF" | "OWNER", id: string) =>
        comoLoja(
          loja,
          async (tx) => {
            const e = await tx.query<{ equipe: boolean }>("SELECT app.is_store_staff() AS equipe");
            const m = await tx.query<{ n: number }>(
              "SELECT count(*)::int AS n FROM app.store_members WHERE store_id = $1",
              [loja.id],
            );
            return { equipe: e.rows[0]!.equipe, vinculos: m.rows[0]!.n };
          },
          { papel, usuarioId: id },
        );

      const antesDaStaff = await comoEla("STAFF", staff.identidade.id);
      expect(antesDaStaff.equipe).toBe(true);
      expect(antesDaStaff.vinculos).toBeGreaterThan(0);

      await desativar(admin, staff.identidade.id);
      await desativar(admin, donoExtra.identidade.id);
      expect(await comoEla("STAFF", staff.identidade.id)).toEqual({ equipe: false, vinculos: 0 });
      expect(await comoEla("OWNER", donoExtra.identidade.id)).toEqual({ equipe: false, vinculos: 0 });
      // Desativar uma pessoa não derruba a equipe dos outros.
      expect((await comoEla("OWNER", loja.dono.id)).equipe).toBe(true);

      await reativar(staff.identidade.id);
      expect(await comoEla("STAFF", staff.identidade.id)).toEqual({
        equipe: true,
        vinculos: antesDaStaff.vinculos,
      });
    },
    ESPERA,
  );

  it(
    "[CA-4] is_store_staff continua SQL estável, PARALLEL SAFE, definer do migrador, com caminho fixo e sem PUBLIC",
    async () => {
      const f = await linha<{
        linguagem: string;
        volatil: string;
        paralela: string;
        definer: boolean;
        dono: string;
        config: string[];
        acl: string[];
      }>(
        `SELECT l.lanname AS linguagem, p.provolatile AS volatil, p.proparallel AS paralela,
                p.prosecdef AS definer, pg_get_userbyid(p.proowner) AS dono,
                p.proconfig AS config, p.proacl::text[] AS acl
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           JOIN pg_language l ON l.oid = p.prolang
          WHERE n.nspname = 'app' AND p.proname = 'is_store_staff'`,
        [],
      );
      expect(f.linguagem).toBe("sql");
      expect(f.volatil).toBe("s");
      expect(f.paralela).toBe("s");
      expect(f.definer).toBe(true);
      expect(f.dono).toBe("sc_migrator");
      expect(f.config).toEqual(["search_path=app, pg_temp"]);
      expect(f.acl.map((e) => e.split("=")[0]).sort()).toEqual(["sc_admin", "sc_app", "sc_migrator"]);
    },
    ESPERA,
  );

  it(
    "[CA-4] sc_app não altera disabled_at — nem a própria, nem a de outra conta, nem para reativar —, e o resto da linha segue editável",
    async () => {
      const ativa = await pessoa();
      const outra = await pessoa();
      const desativada = await pessoa();
      await admin.query("UPDATE app.identities SET disabled_at = now() WHERE id = $1", [desativada.id]);

      // O contexto da sessão é um parâmetro que quem injeta SQL também grava:
      // a política `identities_self_update` confia nele, o gatilho não.
      const como = async (usuario: string, sql: string, parametros: unknown[] = []) => {
        await app.query("BEGIN");
        try {
          await app.query("SELECT set_config('app.user_id', $1, true), set_config('app.role', 'CUSTOMER', true)", [
            usuario,
          ]);
          return await app.query(sql, parametros);
        } finally {
          await app.query("ROLLBACK");
        }
      };

      await expect(
        como(ativa.id, "UPDATE app.identities SET disabled_at = now() WHERE id = $1", [ativa.id]),
      ).rejects.toMatchObject({ code: "42501" });
      // Contexto forjado para a vítima: a política deixa a linha passar (ela
      // confia no parâmetro), e é o gatilho que recusa.
      await expect(
        como(outra.id, "UPDATE app.identities SET disabled_at = now() WHERE id = $1", [outra.id]),
      ).rejects.toMatchObject({ code: "42501" });
      // Sem forjar nada, a linha alheia nem aparece para a política.
      const alheia = await como(ativa.id, "UPDATE app.identities SET disabled_at = now() WHERE id = $1", [outra.id]);
      expect(alheia.rowCount).toBe(0);
      await expect(
        como(desativada.id, "UPDATE app.identities SET disabled_at = NULL WHERE id = $1", [desativada.id]),
      ).rejects.toMatchObject({ code: "42501" });

      // Quem repete o valor (um ORM que grava a linha inteira) não é barrado.
      const edicao = await como(
        ativa.id,
        "UPDATE app.identities SET display_name = 'Outro nome', disabled_at = NULL WHERE id = $1",
        [ativa.id],
      );
      expect(edicao.rowCount).toBe(1);

      const depois = await migrador.query<{ id: string; desativada: boolean }>(
        "SELECT id, disabled_at IS NOT NULL AS desativada FROM app.identities WHERE id = ANY($1::uuid[])",
        [[ativa.id, outra.id, desativada.id]],
      );
      expect(Object.fromEntries(depois.rows.map((l) => [l.id, l.desativada]))).toEqual({
        [ativa.id]: false,
        [outra.id]: false,
        [desativada.id]: true,
      });

      // A administração e o migrador podem.
      await admin.query("UPDATE app.identities SET disabled_at = NULL WHERE id = $1", [desativada.id]);
      await migrador.query("UPDATE app.identities SET disabled_at = now() WHERE id = $1", [desativada.id]);
      await migrador.query("UPDATE app.identities SET disabled_at = NULL WHERE id = $1", [desativada.id]);
    },
    ESPERA,
  );

  it(
    "[CA-4] as colunas novas nascem nulas: nenhuma conta já existente fica desativada",
    async () => {
      const colunas = await migrador.query<{ tabela: string; coluna: string; tipo: string; nula: string; padrao: string | null }>(
        `SELECT table_name AS tabela, column_name AS coluna, data_type AS tipo, is_nullable AS nula, column_default AS padrao
           FROM information_schema.columns
          WHERE table_schema = 'app'
            AND ((table_name = 'identities' AND column_name = 'disabled_at')
              OR (table_name = 'verification_codes' AND column_name = 'issued_by'))
          ORDER BY table_name`,
      );
      expect(colunas.rows).toEqual([
        { tabela: "identities", coluna: "disabled_at", tipo: "timestamp with time zone", nula: "YES", padrao: null },
        { tabela: "verification_codes", coluna: "issued_by", tipo: "uuid", nula: "YES", padrao: null },
      ]);
    },
    ESPERA,
  );
});

// ---------------------------------------------------------------------------
// [CA-5] Sem deadlock e sem sessão viva: identidade primeiro, sempre
// ---------------------------------------------------------------------------

function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Espera o processo `pid` parar numa trava que não conseguiu pegar. */
async function esperarAteBloquear(pid: number, limiteMs = 15_000): Promise<void> {
  const fim = Date.now() + limiteMs;
  for (;;) {
    const r = await migrador.query("SELECT 1 FROM pg_locks WHERE pid = $1 AND NOT granted", [pid]);
    if (r.rows.length > 0) return;
    if (Date.now() > fim) throw new Error(`o processo ${pid} não chegou a esperar uma trava`);
    await dormir(15);
  }
}

/** Travas de linha (FOR UPDATE/SHARE, INSERT, UPDATE) já pegas pelo processo. */
async function travasDeLinhaNaSessaoNoLinkOuNoVinculo(pid: number): Promise<string[]> {
  const r = await migrador.query<{ relname: string; mode: string }>(
    `SELECT c.relname, l.mode
       FROM pg_locks l
       JOIN pg_class c ON c.oid = l.relation
      WHERE l.pid = $1 AND l.locktype = 'relation' AND l.granted
        AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
        AND c.relname IN ('sessions', 'verification_codes', 'store_members')
        AND l.mode IN ('RowShareLock', 'RowExclusiveLock')
      ORDER BY 1, 2`,
    [pid],
  );
  return r.rows.map((l) => `${l.relname}:${l.mode}`);
}

describe("[CA-5] desativar × entrar/renovar/redefinir/aceitar: ordem única de trava", () => {
  for (const porta of PORTAS) {
    it(
      `[CA-5] ${porta.nome}: com a identidade travada pela desativação, a função espera ELA — sem ter tocado em sessão, link ou vínculo — e depois recusa`,
      async () => {
        const cena = await porta.preparar();
        const pidApp = await pidDe(app);

        await iniciarDesativacao(admin, cena.identidade);
        let tentativa: Promise<Desfecho>;
        try {
          tentativa = porta.passar(app, cena);
          await esperarAteBloquear(pidApp);
          // A trava que sobra só pode ser a da identidade: quem já tivesse
          // travado a sessão, o link ou o vínculo estaria na ordem inversa da
          // desativação, que revoga as sessões DEPOIS de travar a identidade.
          expect(await travasDeLinhaNaSessaoNoLinkOuNoVinculo(pidApp)).toEqual([]);
        } catch (causa) {
          await admin.query("ROLLBACK").catch(() => {});
          throw causa;
        }
        await concluirDesativacao(admin, cena.identidade);

        const desfecho = await tentativa;
        expect(desfecho.aceito).toBe(false);
        // Só o erro previsto (P0002 ao abrir sessão); nunca deadlock nem 500.
        expect(desfecho.erro === undefined || desfecho.erro === "P0002").toBe(true);
        await porta.conferir(cena, desfecho);
        expect(await sessoesVivas(cena.identidade)).toBe(0);
      },
      ESPERA,
    );

    it(
      `[CA-5] ${porta.nome}: com a função já dentro, a desativação ESPERA e revoga a sessão que a função acabou de criar`,
      async () => {
        const cena = await porta.preparar();
        const pidAdmin = await pidDe(admin);

        await app.query("BEGIN");
        let desativacao: Promise<void> | undefined;
        try {
          const desfecho = await porta.passar(app, cena);
          expect(desfecho).toEqual({ aceito: true });
          desativacao = desativar(admin, cena.identidade);
          await esperarAteBloquear(pidAdmin);
        } catch (causa) {
          await app.query("ROLLBACK").catch(() => {});
          await desativacao?.catch(() => {});
          throw causa;
        }
        await app.query("COMMIT");
        await desativacao;

        await porta.conferir(cena, { aceito: true });
        expect(await sessoesVivas(cena.identidade)).toBe(0);
        const { desativada } = await linha<{ desativada: boolean }>(
          "SELECT disabled_at IS NOT NULL AS desativada FROM app.identities WHERE id = $1",
          [cena.identidade],
        );
        expect(desativada).toBe(true);
      },
      ESPERA,
    );

    it(
      `[CA-5] ${porta.nome}: 25 rodadas concorrentes (duas conexões por par) — sem deadlock, sem sessão viva, efeito coerente com o desfecho`,
      async () => {
        for (let rodada = 0; rodada < 25; rodada += 1) {
          const cena = await porta.preparar();
          const [desativacao, passagem] = await Promise.allSettled([
            (async () => {
              await dormir(Math.random() * 6);
              await desativar(admin2, cena.identidade);
            })(),
            (async () => {
              await dormir(Math.random() * 6);
              return porta.passar(app2, cena);
            })(),
          ]);

          expect(
            desativacao.status,
            `rodada ${rodada}: a desativação falhou — ${desativacao.status === "rejected" ? String(desativacao.reason) : ""}`,
          ).toBe("fulfilled");
          expect(passagem.status).toBe("fulfilled");
          const desfecho = (passagem as PromiseFulfilledResult<Desfecho>).value;
          expect(
            desfecho.erro === undefined || desfecho.erro === "P0002",
            `rodada ${rodada}: erro inesperado ${desfecho.erro ?? ""}`,
          ).toBe(true);
          await porta.conferir(cena, desfecho);
          expect(await sessoesVivas(cena.identidade), `rodada ${rodada}: sessão viva depois de desativar`).toBe(0);
        }
      },
      ESPERA,
    );
  }

  it(
    "[CA-5] pedir recuperação × redefinir pelo link, em paralelo, não gera deadlock (as duas travam a identidade antes do link)",
    async () => {
      for (let rodada = 0; rodada < 25; rodada += 1) {
        const p = await pessoa();
        const link = await plantarLink(p.id);
        const [pedido, redefinicaoFeita] = await Promise.all([
          tentar(async () => {
            await dormir(Math.random() * 4);
            await app.query(
              "SELECT app.auth_criar_pedido_de_recuperacao($1::uuid, $2, now() + interval '1 hour')",
              [p.id, resumo()],
            );
            return true;
          }),
          tentar(async () => {
            await dormir(Math.random() * 4);
            const r = await app2.query<{ ok: boolean }>(
              "SELECT app.auth_redefinir_senha_pelo_pedido($1, $2, now()) AS ok",
              [link, SENHA_DERIVADA],
            );
            return r.rows[0]!.ok;
          }),
        ]);
        expect(pedido.erro, `rodada ${rodada}`).toBeUndefined();
        expect(redefinicaoFeita.erro, `rodada ${rodada}`).toBeUndefined();
        // Um link só: o novo pedido consome o antigo, ou o link foi usado antes.
        const pendentes = await contar(
          `SELECT count(*)::int AS n FROM app.verification_codes
            WHERE identity_id = $1 AND purpose = 'PASSWORD_RESET' AND consumed_at IS NULL`,
          [p.id],
        );
        expect(pendentes, `rodada ${rodada}`).toBe(1);
      }
    },
    ESPERA,
  );
});

// ---------------------------------------------------------------------------
// [CA-6] O link de uso único: emissor, uso na trilha e consumo cruzado
// ---------------------------------------------------------------------------

describe("[CA-6] link de uso único da administração", () => {
  it(
    "[CA-6] só o link de redefinição aceita emissor, e o emissor é uma identidade",
    async () => {
      const adm = await criarAdministradorDaPlataforma();
      const p = await pessoa();
      await expect(
        admin.query(
          `INSERT INTO app.verification_codes (identity_id, purpose, channel, code_hash, expires_at, issued_by)
           VALUES ($1, 'EMAIL_VERIFY', 'EMAIL', $2, now() + interval '1 hour', $3)`,
          [p.id, resumo(), adm.id],
        ),
      ).rejects.toMatchObject({ code: "23514", constraint: "verification_codes_emissor_ck" });
      await expect(
        admin.query(
          `INSERT INTO app.verification_codes (identity_id, purpose, channel, code_hash, expires_at, issued_by)
           VALUES ($1, 'PASSWORD_RESET', 'EMAIL', $2, now() + interval '1 hour', $3)`,
          [p.id, resumo(), randomUUID()],
        ),
      ).rejects.toMatchObject({ code: "23503" });
      await expect(plantarLink(p.id, { emitidoPor: adm.id })).resolves.toMatch(/^[0-9a-f]{64}$/);
    },
    ESPERA,
  );

  it(
    "[CA-6] o uso do link da administração grava ACESSO_USADO (ator = a pessoa, papel CUSTOMER), troca a senha e revoga as sessões; a trilha não guarda o resumo",
    async () => {
      const adm = await criarAdministradorDaPlataforma();
      const p = await pessoa();
      const token = await plantarSessao(p.id);
      const link = await plantarLink(p.id, { emitidoPor: adm.id });
      const novaSenha = "argon2id$v=19$m=19456,t=2,p=1$bm92bw$bm92YQ";

      const r = await app.query<{ ok: boolean }>(
        "SELECT app.auth_redefinir_senha_pelo_pedido($1, $2, now()) AS ok",
        [link, novaSenha],
      );
      expect(r.rows[0]?.ok).toBe(true);

      const trilha = await admin.query(
        "SELECT * FROM app.audit_platform WHERE action = 'ACESSO_USADO' AND entity_id = $1",
        [p.id],
      );
      expect(trilha.rows).toHaveLength(1);
      expect(trilha.rows[0]).toMatchObject({
        actor_id: p.id,
        actor_role: "CUSTOMER",
        action: "ACESSO_USADO",
        entity: "identities",
        entity_id: p.id,
        before_data: null,
        after_data: null,
      });
      const texto = JSON.stringify(trilha.rows);
      expect(texto).not.toContain(link);
      expect(texto).not.toContain(token);

      const sessao = await linha<{ revoked_reason: string }>(
        "SELECT revoked_reason FROM app.sessions WHERE token_sha256 = $1",
        [token],
      );
      expect(sessao.revoked_reason).toBe("PASSWORD_CHANGED");
      const nova = await linha<{ password_hash: string }>("SELECT password_hash FROM app.identities WHERE id = $1", [p.id]);
      expect(nova.password_hash).toBe(novaSenha);

      // Uma segunda tentativa com o mesmo link não repete nem o efeito nem o registro.
      const outra = await app.query<{ ok: boolean }>(
        "SELECT app.auth_redefinir_senha_pelo_pedido($1, $2, now()) AS ok",
        [link, SENHA_DERIVADA],
      );
      expect(outra.rows[0]?.ok).toBe(false);
      expect(
        await contar("SELECT count(*)::int AS n FROM app.audit_platform WHERE action = 'ACESSO_USADO' AND entity_id = $1", [p.id]),
      ).toBe(1);
    },
    ESPERA,
  );

  it(
    "[CA-6] a recuperação feita pela própria pessoa (sem emissor) não grava ACESSO_USADO",
    async () => {
      const p = await pessoa();
      const link = resumo();
      await app.query("SELECT app.auth_criar_pedido_de_recuperacao($1::uuid, $2, now() + interval '1 hour')", [p.id, link]);
      const r = await app.query<{ ok: boolean }>(
        "SELECT app.auth_redefinir_senha_pelo_pedido($1, $2, now()) AS ok",
        [link, SENHA_DERIVADA],
      );
      expect(r.rows[0]?.ok).toBe(true);
      expect(
        await contar("SELECT count(*)::int AS n FROM app.audit_platform WHERE action = 'ACESSO_USADO' AND entity_id = $1", [p.id]),
      ).toBe(0);
    },
    ESPERA,
  );

  it(
    "[CA-6] o link vence em 60 minutos: vencido, é recusado e não deixa registro",
    async () => {
      const adm = await criarAdministradorDaPlataforma();
      const p = await pessoa();
      const link = await plantarLink(p.id, { emitidoPor: adm.id, expiraEm: "now() + interval '60 minutes'" });
      const quando = async (minutos: number) => {
        const r = await app.query<{ ok: boolean }>(
          "SELECT app.auth_redefinir_senha_pelo_pedido($1, $2, now() + make_interval(mins => $3::int)) AS ok",
          [link, SENHA_DERIVADA, minutos],
        );
        return r.rows[0]!.ok;
      };
      expect(await quando(61)).toBe(false);
      expect(
        await contar("SELECT count(*)::int AS n FROM app.audit_platform WHERE action = 'ACESSO_USADO' AND entity_id = $1", [p.id]),
      ).toBe(0);
      expect(await quando(59)).toBe(true);
    },
    ESPERA,
  );

  it(
    "[CA-6] aceitar o convite consome o link pendente — o da administração e o pedido pela própria pessoa —, que passa a ser recusado",
    async () => {
      const adm = await criarAdministradorDaPlataforma();
      const p = await pessoa({ comSenha: false });
      const doAdmin = await plantarLink(p.id, { emitidoPor: adm.id });
      const proprio = await plantarLink(p.id);
      const token = await plantarConvite(p.id);

      const aceito = await app.query<{ ok: boolean }>("SELECT app.auth_aceitar_convite($1, $2, now()) AS ok", [
        token,
        SENHA_DERIVADA,
      ]);
      expect(aceito.rows[0]?.ok).toBe(true);
      expect(
        await contar(
          `SELECT count(*)::int AS n FROM app.verification_codes
            WHERE identity_id = $1 AND purpose = 'PASSWORD_RESET' AND consumed_at IS NULL`,
          [p.id],
        ),
      ).toBe(0);

      for (const link of [doAdmin, proprio]) {
        const r = await app.query<{ ok: boolean }>(
          "SELECT app.auth_redefinir_senha_pelo_pedido($1, $2, now()) AS ok",
          [link, "argon2id$v=19$m=19456,t=2,p=1$bm92bw$bm92YQ"],
        );
        expect(r.rows[0]?.ok).toBe(false);
      }
      const senhaFinal = await linha<{ password_hash: string }>("SELECT password_hash FROM app.identities WHERE id = $1", [p.id]);
      expect(senhaFinal.password_hash).toBe(SENHA_DERIVADA);
      expect(
        await contar("SELECT count(*)::int AS n FROM app.audit_platform WHERE action = 'ACESSO_USADO' AND entity_id = $1", [p.id]),
      ).toBe(0);
    },
    ESPERA,
  );

  it(
    "[CA-6] um pedido novo de recuperação invalida o link anterior, inclusive o da administração (só o último vale)",
    async () => {
      const adm = await criarAdministradorDaPlataforma();
      const p = await pessoa();
      const antigo = await plantarLink(p.id, { emitidoPor: adm.id });
      await app.query("SELECT app.auth_criar_pedido_de_recuperacao($1::uuid, $2, now() + interval '1 hour')", [p.id, resumo()]);
      const r = await app.query<{ ok: boolean }>(
        "SELECT app.auth_redefinir_senha_pelo_pedido($1, $2, now()) AS ok",
        [antigo, SENHA_DERIVADA],
      );
      expect(r.rows[0]?.ok).toBe(false);
    },
    ESPERA,
  );
});

// ---------------------------------------------------------------------------
// A migração sobre um banco povoado: expand-only, contratos das funções intactos
// ---------------------------------------------------------------------------

interface FotoDaFuncao {
  readonly argumentos: string;
  readonly resultado: string;
  readonly linguagem: string;
  readonly definer: boolean;
  readonly volatil: string;
  readonly paralela: string;
  readonly dono: string;
  readonly config: string[] | null;
  readonly acl: string[] | null;
}

async function fotografarFuncoes(cliente: pg.Client): Promise<Map<string, FotoDaFuncao>> {
  const r = await cliente.query<FotoDaFuncao & { nome: string }>(
    `SELECT p.proname AS nome,
            pg_get_function_identity_arguments(p.oid) AS argumentos,
            pg_get_function_result(p.oid) AS resultado,
            l.lanname AS linguagem,
            p.prosecdef AS definer,
            p.provolatile AS volatil,
            p.proparallel AS paralela,
            pg_get_userbyid(p.proowner) AS dono,
            p.proconfig AS config,
            p.proacl::text[] AS acl
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       JOIN pg_language l ON l.oid = p.prolang
      WHERE n.nspname = 'app'`,
  );
  return new Map(
    r.rows.map(({ nome, ...resto }) => [
      `${nome}(${resto.argumentos})`,
      { ...resto, acl: resto.acl === null ? null : [...resto.acl].sort() },
    ]),
  );
}

const AS_OITO = [
  "auth_identidade_para_login",
  "auth_identidade_para_recuperacao",
  "auth_criar_pedido_de_recuperacao",
  "auth_redefinir_senha_pelo_pedido",
  "auth_criar_sessao",
  "auth_rotacionar_sessao",
  "auth_aceitar_convite",
  "is_store_staff",
] as const;

describe("0075 sobre um banco já povoado na 0074", () => {
  it(
    "expand-only: colunas nulas, nenhum dado muda, nada é apagado, e as oito funções mantêm o contrato",
    async () => {
      const todas = lerMigracoes();
      expect(todas.at(-1)?.nome).toMatch(/^0075_/);
      const ate0074 = todas.filter((m) => m.nome < "0075");
      const pasta = mkdtempSync(join(tmpdir(), "sc-0075-"));
      const nome = exigirNomeEfemero(nomeNovoDeBancoDeTeste("migracao0075"));
      const servidor = await conectar(urlDoServidorDeTeste());
      let banco: pg.Client | undefined;
      try {
        await servidor.query(`CREATE DATABASE ${nome} TEMPLATE template0`);
        for (const m of ate0074) copyFileSync(m.caminho, join(pasta, m.nome));
        banco = await conectar(urlDoBanco(urlDoServidorDeTeste(), nome));
        await aplicarMigracoes({ cliente: banco, diretorio: pasta });

        // Dados que a 0075 precisa deixar exatamente como estão.
        const pessoaAntiga = (
          await banco.query<{ id: string }>(
            `INSERT INTO app.identities (email_norm, display_name, password_hash, email_verified_at)
             VALUES ('antiga@exemplo.test', 'Antiga', $1, now()) RETURNING id`,
            [SENHA_DERIVADA],
          )
        ).rows[0]!.id;
        await banco.query(
          `INSERT INTO app.sessions (id, identity_id, family_id, token_sha256, role_at_issue, client_kind, expires_at, revoked_at, revoked_reason)
           VALUES ($1, $2, $3, $4, 'CUSTOMER', 'WEB', ${UM_DIA}, now(), 'ADMIN_REVOKED'),
                  ($5, $2, $3, $6, 'CUSTOMER', 'WEB', ${UM_DIA}, NULL, NULL)`,
          [randomUUID(), pessoaAntiga, randomUUID(), resumo(), randomUUID(), resumo()],
        );
        await banco.query(
          `INSERT INTO app.verification_codes (identity_id, purpose, channel, code_hash, expires_at)
           VALUES ($1, 'PASSWORD_RESET', 'EMAIL', $2, now() + interval '1 hour')`,
          [pessoaAntiga, resumo()],
        );

        const tabelas = ["identities", "sessions", "verification_codes"];
        const dados = async () => {
          const fotos: Record<string, string> = {};
          for (const t of tabelas) {
            // Sem as colunas novas: a comparação é só do que já existia.
            const r = await banco!.query<{ conteudo: string }>(
              `SELECT coalesce(string_agg((to_jsonb(t) - 'disabled_at' - 'issued_by')::text, ',' ORDER BY to_jsonb(t) ->> 'id'), '') AS conteudo
                 FROM app.${t} t`,
            );
            fotos[t] = r.rows[0]!.conteudo;
          }
          return fotos;
        };
        const dadosAntes = await dados();
        const funcoesAntes = await fotografarFuncoes(banco);
        const colunasAntes = (
          await banco.query<{ t: string; c: string }>(
            `SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = 'app'`,
          )
        ).rows.map((x) => `${x.t}.${x.c}`);

        // A 0075, sobre o banco povoado.
        const relatorio = await aplicarMigracoes({ cliente: banco });
        expect(relatorio.aplicadas).toHaveLength(1);
        expect(relatorio.aplicadas[0]).toMatch(/^0075_/);

        expect(await dados()).toEqual(dadosAntes);
        const nulas = await banco.query<{ desativadas: number; emitidos: number }>(
          `SELECT (SELECT count(*)::int FROM app.identities WHERE disabled_at IS NOT NULL) AS desativadas,
                  (SELECT count(*)::int FROM app.verification_codes WHERE issued_by IS NOT NULL) AS emitidos`,
        );
        expect(nulas.rows[0]).toEqual({ desativadas: 0, emitidos: 0 });

        // Nada some: toda coluna e toda função de antes continua lá.
        const colunasDepois = (
          await banco.query<{ t: string; c: string }>(
            `SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = 'app'`,
          )
        ).rows.map((x) => `${x.t}.${x.c}`);
        expect(colunasAntes.filter((c) => !colunasDepois.includes(c))).toEqual([]);
        expect(colunasDepois.filter((c) => !colunasAntes.includes(c)).sort()).toEqual([
          "identities.disabled_at",
          "verification_codes.issued_by",
        ]);

        const funcoesDepois = await fotografarFuncoes(banco);
        for (const chave of funcoesAntes.keys()) {
          expect(funcoesDepois.has(chave), `a função ${chave} sumiu`).toBe(true);
        }
        expect([...funcoesDepois.keys()].filter((k) => !funcoesAntes.has(k))).toEqual([
          "conta_desativada_so_pela_administracao()",
        ]);
        // As oito: tudo igual ao de antes, menos o corpo.
        for (const nomeDaFuncao of AS_OITO) {
          const chave = [...funcoesAntes.keys()].find((k) => k.startsWith(`${nomeDaFuncao}(`));
          expect(chave, `a função ${nomeDaFuncao} não existia na 0074`).toBeDefined();
          expect(funcoesDepois.get(chave!), nomeDaFuncao).toEqual(funcoesAntes.get(chave!));
        }
        // E as demais também não mudaram de contrato.
        for (const [chave, antes] of funcoesAntes) {
          expect(funcoesDepois.get(chave), chave).toEqual(antes);
        }

        // Rodar de novo não faz nada.
        expect((await aplicarMigracoes({ cliente: banco })).aplicadas).toEqual([]);
      } finally {
        await banco?.end().catch(() => {});
        await servidor.end().catch(() => {});
        rmSync(pasta, { recursive: true, force: true });
        await apagarBanco(nome).catch(() => {});
      }
    },
    ESPERA * 2,
  );
});
