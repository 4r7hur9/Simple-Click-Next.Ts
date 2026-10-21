/**
 * As contas da demonstração (card #50).
 *
 * QUATRO CONTAS DE TESTE, com senha conhecida e regravada a cada carga (quem
 * trocou a senha no teste volta a entrar com a documentada):
 *
 *   ADMIN    maria.card6@exemplo.test     administração da plataforma e dona
 *            de 2 lojas (Pastelaria da Vila e Marmitaria Sabor de Casa)
 *   DONO     dono.demo@simpleclick.test   dono de 2 lojas (Pastelaria da Vila
 *            e Moda Boa Vista): o seletor de loja e o limite de 2 lojas
 *   EQUIPE   staff.demo@simpleclick.test  equipe da Pastelaria da Vila
 *   CLIENTE  ana.ribeiro@cliente.test     pedidos em várias lojas, favoritos,
 *            recentes, curtidas e comentários
 *
 * Além delas: um dono por loja nova (mesma senha da demonstração, para quem
 * quiser entrar no painel de uma loja específica) e as pessoas que curtem e
 * comentam (sem senha: não entram, só aparecem).
 */

import { argon2, randomBytes } from "node:crypto";

import type { ClienteSql } from "../../src/migrate.ts";
import { gravar, id } from "./escrita.ts";

export interface ContaDeTeste {
  readonly papel: "ADMIN" | "DONO" | "EQUIPE" | "CLIENTE";
  readonly email: string;
  readonly senha: string;
  readonly nome: string;
}

export const CONTA_ADMIN: ContaDeTeste = {
  papel: "ADMIN",
  email: "maria.card6@exemplo.test",
  senha: "ArthurBruno2k@",
  nome: "Maria Teste",
};

export const CONTA_DONO: ContaDeTeste = {
  papel: "DONO",
  email: "dono.demo@simpleclick.test",
  senha: "DemoSimpleClick2026",
  nome: "Dono da Demonstração",
};

export const CONTA_EQUIPE: ContaDeTeste = {
  papel: "EQUIPE",
  email: "staff.demo@simpleclick.test",
  senha: "DemoSimpleClick2026",
  nome: "Staff da Demonstração",
};

export const CONTA_CLIENTE: ContaDeTeste = {
  papel: "CLIENTE",
  email: "ana.ribeiro@cliente.test",
  senha: "SenhaTeste!2026x",
  nome: "Ana Ribeiro",
};

export const CONTAS_DE_TESTE = [
  CONTA_ADMIN,
  CONTA_DONO,
  CONTA_EQUIPE,
  CONTA_CLIENTE,
] as const;

/** Senha dos donos das lojas novas. */
export const SENHA_DOS_DONOS = "DemoSimpleClick2026";

/** Mesmo formato de `apps/api/src/modules/auth/senha.ts` (argon2id). */
export function derivarSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  return new Promise((aceitar, recusar) => {
    argon2(
      "argon2id",
      {
        message: senha,
        nonce: sal,
        memory: 65_536,
        passes: 3,
        parallelism: 1,
        tagLength: 32,
      },
      (erro, resumo) => {
        if (erro !== null) recusar(erro);
        else
          aceitar(
            [
              "argon2id",
              "m=65536,t=3,p=1",
              sal.toString("base64url"),
              resumo.toString("base64url"),
            ].join("$"),
          );
      },
    );
  });
}

const DESDE = new Date("2026-01-01T12:00:00Z");

/**
 * A versão dos documentos legais que as contas de demonstração já aceitaram
 * (card #79), para o freio de aceite não barrar nenhum fluxo de teste. É a
 * mesma de `VERSAO_DOS_DOCUMENTOS_LEGAIS` em `@simpleclick/contracts`
 * (packages/contracts/src/legal.ts): mudou lá, mude aqui e rode o seed de novo.
 */
export const VERSAO_LEGAL_DAS_CONTAS_DE_DEMO = "2026-10-19";

/** Grava o aceite vigente dos três documentos para a conta (idempotente). */
export async function aceitarDocumentosLegais(
  cliente: ClienteSql,
  contaId: string,
): Promise<void> {
  await cliente.query(
    `INSERT INTO app.legal_acceptances (identity_id, document, version, origin)
     SELECT $1::uuid, d, $2, 'SIGNUP'
       FROM unnest(ARRAY['TERMS_OF_USE', 'PRIVACY_POLICY', 'MERCHANT_TERMS']) AS d
     ON CONFLICT (identity_id, document, version) DO NOTHING`,
    [contaId, VERSAO_LEGAL_DAS_CONTAS_DE_DEMO],
  );
}

/**
 * Garante a conta pelo e-mail e devolve o id. Conta que já existe mantém o id
 * (e tudo o que está ligado a ela); só nome e senha voltam ao documentado.
 * Sem senha, a conta não entra (só aparece em curtidas e comentários).
 */
export async function garantirConta(
  cliente: ClienteSql,
  conta: {
    readonly email: string;
    readonly nome: string;
    readonly senha?: string;
    readonly telefone?: string;
  },
): Promise<string> {
  const email = conta.email.trim().toLowerCase();
  const existente = await cliente.query(
    "SELECT id FROM app.identities WHERE email_norm = $1",
    [email],
  );
  const contaId =
    existente.rows[0]?.id === undefined
      ? id(`identidade:${email}`)
      : String(existente.rows[0].id);
  await gravar(cliente, "identities", {
    id: contaId,
    email_norm: email,
    ...(conta.senha === undefined
      ? {}
      : { password_hash: await derivarSenha(conta.senha) }),
    email_verified_at: DESDE,
    display_name: conta.nome,
    ...(conta.telefone === undefined ? {} : { phone_e164: conta.telefone }),
    locale: "pt-BR",
    failed_login_count: 0,
    locked_until: null,
  });
  await aceitarDocumentosLegais(cliente, contaId);
  return contaId;
}

/** Vínculo ativo de dono ou equipe com a loja (reaproveita o que existe). */
export async function vincular(
  cliente: ClienteSql,
  lojaId: string,
  contaId: string,
  papel: "OWNER" | "STAFF",
): Promise<void> {
  const vinculo = await cliente.query(
    "SELECT id FROM app.store_members WHERE store_id = $1 AND identity_id = $2",
    [lojaId, contaId],
  );
  await gravar(cliente, "store_members", {
    id:
      vinculo.rows[0]?.id === undefined
        ? id(`membro:${contaId}:${lojaId}`)
        : String(vinculo.rows[0].id),
    store_id: lojaId,
    identity_id: contaId,
    role: papel,
    invite_accepted_at: DESDE,
    revoked_at: null,
    ...(papel === "STAFF" ? { account_managed: true } : {}),
  });
}

/** Administração da plataforma (reaproveita a concessão que já existe). */
export async function concederAdministracao(
  cliente: ClienteSql,
  contaId: string,
): Promise<void> {
  await cliente.query(
    `INSERT INTO app.platform_admins (identity_id, granted_at)
     SELECT $1, $2
      WHERE NOT EXISTS (SELECT 1 FROM app.platform_admins WHERE identity_id = $1)`,
    [contaId, DESDE],
  );
  await cliente.query(
    "UPDATE app.platform_admins SET revoked_at = NULL WHERE identity_id = $1",
    [contaId],
  );
}

/** Pessoas que curtem e comentam: nome e e-mail, sem senha. */
export const PESSOAS_DO_FEED: readonly { readonly email: string; readonly nome: string }[] = [
  "Camila Feitosa",
  "Diego Albuquerque",
  "Bruna Pinheiro",
  "Thiago Moreira",
  "Larissa Gurgel",
  "Felipe Arruda",
  "Natália Bastos",
  "Gustavo Parente",
  "Isabela Viana",
  "Matheus Barroso",
  "Patrícia Lopes",
  "Renato Façanha",
].map((nome) => ({
  nome,
  email: `${nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(" ", ".")}@feed.exemplo.test`,
}));
