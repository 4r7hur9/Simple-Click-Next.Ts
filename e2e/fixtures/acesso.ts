/**
 * Apoio dos cenários de acesso (T-114): convite do dono, entrada pela tela e
 * leitura dos cookies da sessão.
 *
 * O CONVITE É PLANTADO NO BANCO, no papel da administração. Criar a loja pela
 * tela da administração pediria o aplicativo autenticador do administrador
 * geral, que tem prova própria; aqui o que se prova é o que o DONO faz com o
 * link: definir a primeira senha, entrar com o código do e-mail e chegar ao
 * painel. O convite fica como a rota da administração o deixaria: o vínculo
 * OWNER pendente, com só o resumo do token guardado e prazo de 7 dias.
 */
import { createHash, randomBytes } from "node:crypto";

import {
  expect as expectPadrao,
  request,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { Client } from "pg";

import { garantirLojaDoPainel } from "./painel.ts";
import { ASSUNTOS, codigoDoEmail, esperarEmail } from "./caixa-de-email.ts";

/**
 * `expect` com espera folgada. Cada passo de senha deriva Argon2 no
 * servidor, e com a máquina carregada a tela leva mais que os 5 s padrão
 * para mostrar o resultado — o estado chega, só chega devagar.
 */
export const expect = expectPadrao.configure({ timeout: 30_000 });

/** Uma senha que atende a política (12+ caracteres, fora de vazamentos). */
export const FRASE_FORTE_DE_PROVA = "Cacto azul sob a lua 2026!";

/**
 * O campo de texto pelo nome acessível exato. O rótulo visível traz o
 * asterisco de obrigatório (escondido do leitor de tela), então a busca pelo
 * texto do rótulo não acha "Senha" — pelo nome acessível, acha.
 */
export function campo(page: Page, nome: string) {
  return page.getByRole("textbox", { name: nome, exact: true });
}

/** Conexão direta ao banco descartável do ponta a ponta. */
function conectar(): Client {
  const url = process.env["DATABASE_URL_DIRETA"];
  if (url === undefined || url === "") {
    throw new Error("o ponta a ponta precisa de DATABASE_URL_DIRETA");
  }
  return new Client({ connectionString: url });
}

/**
 * Cria o convite de dono da loja do painel para o e-mail informado e devolve
 * o link que a pessoa receberia (a tela de definir senha, com o token).
 */
export async function criarConviteDeDono(
  email: string,
  enderecoDoSite: string,
): Promise<string> {
  const { id: lojaId } = await garantirLojaDoPainel();
  const token = randomBytes(32).toString("base64url");
  const resumo = createHash("sha256").update(token).digest("hex");
  const cliente = conectar();
  await cliente.connect();
  try {
    const identidade = await cliente.query<{ id: string }>(
      `INSERT INTO app.identities (email_norm, display_name)
       VALUES (lower(btrim($1)), 'Dono convidado')
       RETURNING id`,
      [email],
    );
    await cliente.query(
      `INSERT INTO app.store_members
         (store_id, identity_id, role, invite_token_hash, invite_expires_at)
       VALUES ($1, $2, 'OWNER', $3, now() + interval '7 days')`,
      [lojaId, identidade.rows[0]?.id, resumo],
    );
  } finally {
    await cliente.end();
  }
  return `${enderecoDoSite}/definir-senha?token=${encodeURIComponent(token)}&convite=true`;
}

/** Preenche e envia a tela de login. */
export async function enviarLogin(
  page: Page,
  email: string,
  senha: string,
): Promise<void> {
  await page.goto("/entrar");
  await campo(page, "E-mail").fill(email);
  await campo(page, "Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
}

/**
 * Login de quem tem segundo fator por e-mail (dono): senha, depois o código
 * que chegou na caixa. Devolve o código usado e o desafio, para o cenário
 * conferir que eles não servem de novo.
 */
export async function entrarComCodigoDoEmail(
  page: Page,
  email: string,
  senha: string,
): Promise<{ readonly codigo: string; readonly desafioId: string }> {
  const antes = Date.now();
  await enviarLogin(page, email, senha);
  await expect(page).toHaveURL(/\/entrar\/verificacao\?desafio=/);
  const desafioId = new URL(page.url()).searchParams.get("desafio") ?? "";
  const codigo = codigoDoEmail(
    await esperarEmail(email, ASSUNTOS.codigoDoLogin, antes),
  );
  await campo(page, "Código de seis dígitos").fill(codigo);
  await page.getByRole("button", { name: "Confirmar código" }).click();
  return { codigo, desafioId };
}

/** Os dois cookies da sessão no navegador, se existirem. */
export async function cookiesDaSessao(contexto: BrowserContext) {
  const todos = await contexto.cookies();
  return {
    renovacao: todos.find((cookie) => cookie.name === "sc_refresh"),
    acesso: todos.find((cookie) => cookie.name === "sc_access"),
  };
}

/**
 * Pede à API, direto, uma renovação com o token informado — como faria quem
 * copiou o cookie. Contexto de rede próprio, sem os cookies do navegador do
 * cenário. Devolve o status HTTP.
 */
export async function renovarDireto(
  enderecoDaApi: string,
  enderecoDoSite: string,
  tokenDeRenovacao: string,
): Promise<number> {
  const rede = await request.newContext();
  try {
    const resposta = await rede.post(`${enderecoDaApi}/v1/auth/renovar`, {
      headers: {
        origin: enderecoDoSite,
        "x-simpleclick-client": "navegador",
        cookie: `sc_refresh=${encodeURIComponent(tokenDeRenovacao)}`,
      },
      data: {},
    });
    return resposta.status();
  } finally {
    await rede.dispose();
  }
}

/**
 * O dono pronto para entrar: o convite plantado e a primeira senha definida
 * pela tela do link, como a pessoa faria.
 */
export async function prepararDonoPeloConvite(
  page: Page,
  email: string,
  enderecoDoSite: string,
  senha = FRASE_FORTE_DE_PROVA,
): Promise<string> {
  const link = await criarConviteDeDono(email, enderecoDoSite);
  await definirSenhaPeloLink(page, link, senha);
  await expect(page.getByText("Acesso liberado.")).toBeVisible();
  return link;
}

/** Preenche a tela de definir senha aberta pelo link do e-mail. */
export async function definirSenhaPeloLink(
  page: Page,
  link: string,
  senha: string,
): Promise<void> {
  await page.goto(link);
  await campo(page, "Nova senha").fill(senha);
  await campo(page, "Confirme a nova senha").fill(senha);
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
}
