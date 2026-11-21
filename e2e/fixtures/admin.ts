/**
 * A montagem do ponta a ponta da ADMINISTRAÇÃO DA PLATAFORMA (T-209).
 *
 * A SESSÃO É EMITIDA AQUI, como a do dono em `painel.ts`: o site do ponta a
 * ponta roda em modo produção e o cookie da tela de entrada sai preso ao
 * domínio de produção. A entrada tem prova própria (T-110); o que este pacote
 * prova é o que a administração faz depois de entrar.
 *
 * O ADMINISTRADOR É DE VERDADE. A API tem duas travas: o token precisa dizer
 * ADMIN e a identidade precisa estar em `platform_admins` sem revogação. A
 * montagem cria a identidade e o registro de administrador pela conexão
 * direta, e é o identificador dela que vai no token.
 */
import { createHmac, randomInt, randomUUID } from "node:crypto";

import type { APIRequestContext, BrowserContext } from "@playwright/test";
import { Client } from "pg";

import { prepararContaParaATela } from "./redesign-lojas.ts";

/** O e-mail do administrador do ponta a ponta. Domínio reservado a teste. */
const EMAIL_DO_ADMINISTRADOR = "admin@e2e-admin.test";

/** O nome que aparece na trilha e na lista de documentos. */
export const NOME_DO_ADMINISTRADOR = "Administração do ponta a ponta";

let administrador: string | undefined;

function conectar(): Client {
  const url = process.env["DATABASE_URL_DIRETA"];
  if (url === undefined || url === "") {
    throw new Error(
      "o ponta a ponta precisa de DATABASE_URL_DIRETA para montar o administrador",
    );
  }
  return new Client({ connectionString: url });
}

/**
 * TRAVA (card #163, D-6): esta montagem reativa e cria administradores
 * direto no banco, então só roda em banco descartável de teste. Recusa
 * qualquer outro `current_database()` (ex.: o de desenvolvimento do `.env`).
 */
const BANCO_DE_TESTE = /^(simpleclick_test|sc_e2e_[a-z0-9_]+)$/;

export async function conectarEmBancoDeTeste(): Promise<Client> {
  const cliente = conectar();
  await cliente.connect();
  try {
    const resposta = await cliente.query<{ banco: string }>(
      "SELECT current_database() AS banco",
    );
    const banco = resposta.rows[0]?.banco ?? "";
    if (!BANCO_DE_TESTE.test(banco)) {
      throw new Error(
        `o ponta a ponta da administração recusa o banco "${banco}": só roda em simpleclick_test ou sc_e2e_* (use "pnpm --filter @simpleclick/e2e test:e2e:isolado")`,
      );
    }
    return cliente;
  } catch (erro) {
    await cliente.end();
    throw erro;
  }
}

function base64Url(valor: unknown): string {
  return Buffer.from(JSON.stringify(valor)).toString("base64url");
}

/** O token de acesso de um administrador, no formato que a API confere. */
export function tokenDoAdministrador(
  identidadeId: string,
  papel: "ADMIN" | "OWNER" | "CUSTOMER" = "ADMIN",
): string {
  const segredo = process.env["JWT_SECRET"]?.trim();
  if (segredo === undefined || segredo === "") {
    throw new Error("o ponta a ponta da administração precisa de JWT_SECRET");
  }
  const agora = Math.floor(Date.now() / 1_000);
  const conteudo = `${base64Url({ alg: "HS256", typ: "JWT" })}.${base64Url({
    sub: identidadeId,
    role: papel,
    sid: randomUUID(),
    fid: randomUUID(),
    iat: agora,
    exp: agora + 15 * 60,
  })}`;
  const assinatura = createHmac("sha256", segredo)
    .update(conteudo)
    .digest("base64url");
  return `${conteudo}.${assinatura}`;
}

/**
 * Garante a identidade do administrador e o registro ativo dele em
 * `platform_admins`. Repetível: os dois projetos do Playwright montam o mesmo
 * administrador ao mesmo tempo, e registro revogado volta a valer.
 */
export async function garantirAdministrador(): Promise<string> {
  if (administrador !== undefined) return administrador;
  const cliente = await conectarEmBancoDeTeste();
  try {
    const identidade = await cliente.query<{ id: string }>(
      `INSERT INTO app.identities (email_norm, display_name, email_verified_at)
       VALUES ($1, $2, now())
       ON CONFLICT (email_norm) DO UPDATE SET updated_at = now()
       RETURNING id`,
      [EMAIL_DO_ADMINISTRADOR, NOME_DO_ADMINISTRADOR],
    );
    const id = identidade.rows[0]?.id;
    if (id === undefined) throw new Error("não consegui criar o administrador");
    await cliente.query(
      `INSERT INTO app.platform_admins (identity_id) VALUES ($1)
       ON CONFLICT (identity_id) DO UPDATE SET revoked_at = NULL`,
      [id],
    );
    administrador = id;
  } finally {
    await cliente.end();
  }
  // Toda conta precisa dos aceites vigentes (403 `aceite_pendente` sem eles)
  // e do tutorial já visto; a janela de novo aceite tem prova própria.
  await prepararContaParaATela(administrador, "cliente");
  return administrador;
}

/** Põe a sessão do administrador no navegador do cenário. */
export async function entrarComoAdministrador(
  contexto: BrowserContext,
  enderecoDoSite: string,
): Promise<void> {
  const id = await garantirAdministrador();
  await contexto.addCookies([
    {
      name: "sc_access",
      value: tokenDoAdministrador(id),
      url: enderecoDoSite,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

/** Um CNPJ com os dígitos verificadores certos, diferente a cada chamada. */
export function cnpjValido(): string {
  const digitos = Array.from({ length: 8 }, () => randomInt(10)).concat([
    0, 0, 0, 1,
  ]);
  const verificador = (pesos: readonly number[]) => {
    const soma = pesos.reduce(
      (total, peso, indice) => total + peso * (digitos[indice] ?? 0),
      0,
    );
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  digitos.push(verificador([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  digitos.push(verificador([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  return digitos.join("");
}

/** Uma loja criada pela rota da administração. */
export interface LojaDaAdministracao {
  readonly id: string;
  readonly nome: string;
  readonly apelido: string;
}

/**
 * Cria uma loja pela API da administração, com o mesmo cadastro que a tela
 * envia. O cadastro pela tela tem cenário próprio (`admin-lojas.spec.ts`);
 * os outros cenários só precisam de uma loja de verdade para agir sobre ela.
 */
export async function criarLojaPelaAdministracao(
  api: APIRequestContext,
  enderecoDoSite: string,
  nome: string,
): Promise<LojaDaAdministracao> {
  const id = await garantirAdministrador();
  const apelido = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const resposta = await api.post("/v1/admin/lojas", {
    headers: {
      authorization: `Bearer ${tokenDoAdministrador(id)}`,
      origin: enderecoDoSite,
    },
    data: {
      nome,
      razaoSocial: null,
      documento: cnpjValido(),
      responsavel: {
        nome: "Responsável do Ponta a Ponta",
        email: `responsavel-${randomUUID().slice(0, 8)}@e2e-admin.test`,
        telefone: "11988887777",
      },
      endereco: {
        cep: "01310100",
        logradouro: "Avenida Paulista",
        numero: "1000",
        complemento: null,
        bairro: "Bela Vista",
        cidade: "São Paulo",
        uf: "SP",
      },
      tipoDeNegocio: "FOOD_RESTAURANT",
      apelido,
    },
  });
  if (resposta.status() !== 201) {
    throw new Error(
      `a loja não foi criada (${resposta.status()}): ${await resposta.text()}`,
    );
  }
  const corpo = (await resposta.json()) as { id: string; apelido: string };
  return { id: corpo.id, nome, apelido: corpo.apelido };
}

/** Põe a loja no ar (ACTIVE), como a publicação faria. */
export async function porLojaNoAr(lojaId: string): Promise<void> {
  const cliente = await conectarEmBancoDeTeste();
  try {
    await cliente.query(
      `UPDATE app.stores SET status = 'ACTIVE' WHERE id = $1`,
      [lojaId],
    );
  } finally {
    await cliente.end();
  }
}
