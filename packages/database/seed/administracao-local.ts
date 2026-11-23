/**
 * A administração da plataforma no banco LOCAL, pelo seed (card #3).
 *
 * Depois de zerar o banco e rodar o seed, a pessoa que desenvolve precisa de
 * UMA conta de administração com senha para abrir `/admin`. A senha NUNCA mora
 * no repositório (decisão D-5 do card #163): ela vem do `.env` local, nas
 * variáveis `ADMIN_LOCAL_EMAIL`, `ADMIN_LOCAL_SENHA` e, se quiser,
 * `ADMIN_LOCAL_NOME`. Sem as duas primeiras, nada é gravado e sai um aviso.
 *
 * Este módulo fica FORA de `seed/demo/` de propósito: a carga da demonstração
 * continua sem conceder administração a conta nenhuma com senha pública (o
 * teste `[CA-7]` de `demo/guarda.test.ts`). Aqui a única conta que recebe o
 * grant é a do `.env`, e só se ela não for uma conta pública das cargas, nem
 * dona de loja, nem uma conta comum que nunca foi administração.
 *
 * Idempotente: rodar de novo não duplica nada. A senha só é regravada quando
 * mudou (e então as sessões da conta caem com `PASSWORD_CHANGED`). Nenhum aceite
 * legal é gravado em nome da pessoa: ela aceita no primeiro login.
 */

import { argon2Sync, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { derivarUrlDePapel, type ClienteSql } from "../src/migrate.ts";
import {
  ehBancoDeTeste,
  ehBancoLocalDeDesenvolvimento,
  exigirDestinoLocalDaDemonstracao,
  type FonteDeAmbiente,
} from "./destino-local.ts";
import {
  CONTAS_DE_TESTE,
  derivarSenha,
  PESSOAS_DO_FEED,
  SENHA_DOS_DONOS,
} from "./demo/contas.ts";
import { LOJAS_NOVAS } from "./demo/lojas/index.ts";
import { PESSOAS } from "./lojas.ts";

export { MARCADORES_DE_HOSPEDAGEM } from "./destino-local.ts";

export const VARIAVEL_DO_EMAIL = "ADMIN_LOCAL_EMAIL";
export const VARIAVEL_DA_SENHA = "ADMIN_LOCAL_SENHA";
export const VARIAVEL_DO_NOME = "ADMIN_LOCAL_NOME";

const MINIMO_DA_SENHA = 12;

export type SituacaoDaAdministracaoLocal =
  "sem_variaveis" | "criada" | "atualizada" | "ja_existia";

/** Recusa com motivo. A mensagem nunca traz a senha nem a URL do banco. */
export class ErroDaAdministracaoLocalDoSeed extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDaAdministracaoLocalDoSeed";
  }
}

export interface OpcoesDaAdministracaoLocalDoSeed {
  readonly ambiente: FonteDeAmbiente;
  /** A URL direta do banco: obrigatória, para a trava de destino local. */
  readonly urlDoBanco: string;
  /** Uma linha da saída de quem opera. */
  readonly relatar: (linha: string) => void;
  /** Só os testes ligam: aceita banco de teste descartável. */
  readonly aceitarBancoDeTeste?: boolean;
}

/** E-mails de contas com senha pública (ou sem dono real) das cargas de exemplo. */
function emailsPublicos(): ReadonlySet<string> {
  const emails = new Set<string>();
  for (const conta of CONTAS_DE_TESTE) emails.add(conta.email.toLowerCase());
  for (const pessoa of PESSOAS_DO_FEED) emails.add(pessoa.email.toLowerCase());
  for (const loja of LOJAS_NOVAS) {
    const dono = loja.nova?.dono.email;
    if (dono !== undefined) emails.add(dono.toLowerCase());
  }
  for (const pessoa of Object.values(PESSOAS)) {
    // A administração do seed original é justamente a conta que pode virar a
    // do `.env`: ela existe sem senha e já tem grant.
    if (
      pessoa.email.toLowerCase() === PESSOAS.administracao.email.toLowerCase()
    ) {
      continue;
    }
    emails.add(pessoa.email.toLowerCase());
  }
  return emails;
}

function senhasPublicas(): ReadonlySet<string> {
  const senhas = new Set<string>([SENHA_DOS_DONOS]);
  for (const conta of CONTAS_DE_TESTE) senhas.add(conta.senha);
  return new Set([...senhas].map((senha) => senha.toLowerCase()));
}

/** Confere a senha contra um hash `argon2id$m=…,t=…,p=…$sal$resumo` (formato da API). */
export function senhaConfereComOHash(senha: string, hash: string): boolean {
  const partes = hash.split("$");
  if (partes.length !== 4 || partes[0] !== "argon2id") return false;
  if (partes[1] !== "m=65536,t=3,p=1") return false;
  try {
    const sal = Buffer.from(partes[2] ?? "", "base64url");
    const esperado = Buffer.from(partes[3] ?? "", "base64url");
    const obtido = argon2Sync("argon2id", {
      message: senha,
      nonce: sal,
      memory: 65_536,
      passes: 3,
      parallelism: 1,
      tagLength: 32,
    });
    return (
      esperado.length === obtido.length && timingSafeEqual(esperado, obtido)
    );
  } catch {
    return false;
  }
}

/** Lê e confere as variáveis; `undefined` quando falta alguma das duas obrigatórias. */
function lerPedido(ambiente: FonteDeAmbiente) {
  const email = ambiente[VARIAVEL_DO_EMAIL]?.trim().toLowerCase() ?? "";
  const senha = ambiente[VARIAVEL_DA_SENHA] ?? "";
  if (email === "" || senha === "") return undefined;
  const nome = ambiente[VARIAVEL_DO_NOME]?.trim() || "Administração";
  return { email, senha, nome };
}

const FORMA_DE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Garante a conta de administração local do `.env`. Recusa (lançando
 * `ErroDaAdministracaoLocalDoSeed` ou `ErroDeAmbienteDeProducao`) ANTES de
 * gravar qualquer coisa; sem as variáveis, só avisa.
 */
export async function garantirAdministracaoLocal(
  cliente: ClienteSql,
  opcoes: OpcoesDaAdministracaoLocalDoSeed,
): Promise<SituacaoDaAdministracaoLocal> {
  const { ambiente, urlDoBanco, relatar } = opcoes;
  const pedido = lerPedido(ambiente);
  if (pedido === undefined) {
    relatar(
      `administração local: sem ${VARIAVEL_DO_EMAIL} e ${VARIAVEL_DA_SENHA} no .env, nenhuma conta de administração foi criada`,
    );
    return "sem_variaveis";
  }

  exigirDestinoLocalDaDemonstracao(ambiente, urlDoBanco);

  if (!FORMA_DE_EMAIL.test(pedido.email) || pedido.email.length > 254) {
    throw new ErroDaAdministracaoLocalDoSeed(
      `${VARIAVEL_DO_EMAIL} não é um e-mail válido`,
    );
  }
  if (pedido.senha.length < MINIMO_DA_SENHA) {
    throw new ErroDaAdministracaoLocalDoSeed(
      `${VARIAVEL_DA_SENHA} precisa ter pelo menos ${MINIMO_DA_SENHA} caracteres`,
    );
  }
  if (senhasPublicas().has(pedido.senha.toLowerCase())) {
    throw new ErroDaAdministracaoLocalDoSeed(
      `${VARIAVEL_DA_SENHA} é uma senha pública das cargas de exemplo; escolha outra`,
    );
  }
  if (emailsPublicos().has(pedido.email)) {
    throw new ErroDaAdministracaoLocalDoSeed(
      `${VARIAVEL_DO_EMAIL} é de uma conta das cargas de exemplo; use um e-mail seu`,
    );
  }

  const banco = String(
    (await cliente.query("SELECT current_database()::text AS banco")).rows[0]
      ?.banco ?? "",
  );
  const bancoAceito =
    ehBancoLocalDeDesenvolvimento(banco) ||
    (opcoes.aceitarBancoDeTeste === true && ehBancoDeTeste(banco));
  if (!bancoAceito) {
    throw new ErroDaAdministracaoLocalDoSeed(
      `o banco "${banco}" não é um banco local de desenvolvimento (aceitos: simpleclick, simpleclick_dev, simpleclick_local e *_dev, *_local)`,
    );
  }
  if (ambiente.NODE_ENV?.trim().toLowerCase() !== "development") {
    relatar(
      "administração local: a API só dispensa o segundo fator com NODE_ENV=development; com outro valor a conta pede o aplicativo autenticador",
    );
  }

  const hashNovo = await derivarSenha(pedido.senha);

  await cliente.query("BEGIN");
  try {
    const achada = await cliente.query(
      `SELECT i.id::text AS id, i.password_hash AS hash,
              EXISTS (SELECT 1 FROM app.platform_admins a WHERE a.identity_id = i.id) AS ja_foi_admin,
              EXISTS (SELECT 1 FROM app.store_members m
                       WHERE m.identity_id = i.id AND m.revoked_at IS NULL) AS tem_vinculo
         FROM app.identities i WHERE i.email_norm = $1`,
      [pedido.email],
    );
    const existente = achada.rows[0];
    let situacao: SituacaoDaAdministracaoLocal;
    let identidadeId: string;

    if (existente === undefined) {
      const criada = await cliente.query(
        `INSERT INTO app.identities (email_norm, password_hash, email_verified_at, display_name, locale)
         VALUES ($1, $2, now(), $3, 'pt-BR') RETURNING id::text AS id`,
        [pedido.email, hashNovo, pedido.nome],
      );
      identidadeId = String(criada.rows[0]?.id);
      situacao = "criada";
    } else {
      identidadeId = String(existente.id);
      if (existente.ja_foi_admin !== true) {
        throw new ErroDaAdministracaoLocalDoSeed(
          `${VARIAVEL_DO_EMAIL} é de uma conta que nunca foi administração; o seed não promove conta existente`,
        );
      }
      if (existente.tem_vinculo === true) {
        throw new ErroDaAdministracaoLocalDoSeed(
          `${VARIAVEL_DO_EMAIL} é de uma conta com vínculo ativo de loja; use uma conta só de administração`,
        );
      }
      const mesmaSenha =
        typeof existente.hash === "string" &&
        senhaConfereComOHash(pedido.senha, existente.hash);
      if (mesmaSenha) {
        await cliente.query(
          `UPDATE app.identities
              SET email_verified_at = COALESCE(email_verified_at, now()),
                  failed_login_count = 0, locked_until = NULL
            WHERE id = $1::uuid`,
          [identidadeId],
        );
        situacao = "ja_existia";
      } else {
        await cliente.query(
          `UPDATE app.identities
              SET password_hash = $2,
                  email_verified_at = COALESCE(email_verified_at, now()),
                  failed_login_count = 0, locked_until = NULL
            WHERE id = $1::uuid`,
          [identidadeId, hashNovo],
        );
        await cliente.query(
          `UPDATE app.sessions SET revoked_at = now(), revoked_reason = 'PASSWORD_CHANGED'
            WHERE identity_id = $1::uuid AND revoked_at IS NULL`,
          [identidadeId],
        );
        situacao = "atualizada";
      }
    }

    await cliente.query(
      `INSERT INTO app.platform_admins (identity_id, granted_by) VALUES ($1::uuid, NULL)
       ON CONFLICT (identity_id) DO UPDATE SET revoked_at = NULL`,
      [identidadeId],
    );
    await cliente.query("COMMIT");
    relatar(
      `administração local: conta do .env ${{ criada: "criada", atualizada: "com a senha atualizada", ja_existia: "já estava pronta" }[situacao as "criada" | "atualizada" | "ja_existia"]}`,
    );
    return situacao;
  } catch (erro) {
    await cliente.query("ROLLBACK");
    throw erro;
  }
}

/**
 * Chamada pelos `principal()` das cargas: depois de a carga terminar, garante a
 * conta local. Uma recusa vira um aviso e não muda o código de saída da carga.
 */
export async function garantirAdministracaoLocalSemFalhar(
  cliente: ClienteSql,
  opcoes: OpcoesDaAdministracaoLocalDoSeed,
): Promise<void> {
  try {
    await garantirAdministracaoLocal(cliente, opcoes);
  } catch (erro) {
    opcoes.relatar(
      `administração local: não criada — ${erro instanceof Error ? erro.message.split("\n")[0] : "erro"}`,
    );
  }
}

async function principal(): Promise<number> {
  const { default: pg } = await import("pg");
  const direta = process.env.DATABASE_URL_DIRETA?.trim();
  const senha = process.env.SENHA_BANCO_ADMINISTRACAO?.trim();
  if (!direta || !senha) {
    process.stderr.write(
      "DATABASE_URL_DIRETA e SENHA_BANCO_ADMINISTRACAO precisam estar no .env da raiz.\n",
    );
    return 1;
  }
  const cliente = new pg.Client({
    connectionString: derivarUrlDePapel(direta, "sc_admin", senha),
  });
  try {
    await cliente.connect();
    await garantirAdministracaoLocal(cliente, {
      ambiente: process.env,
      urlDoBanco: direta,
      relatar: (linha) => process.stdout.write(`${linha}\n`),
    });
    return 0;
  } catch (erro) {
    process.stderr.write(
      `${erro instanceof Error ? erro.message.split("\n")[0] : String(erro)}\n`,
    );
    return 1;
  } finally {
    await cliente.end().catch(() => undefined);
  }
}

const chamadoDiretamente =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (chamadoDiretamente) {
  process.exitCode = await principal();
}
