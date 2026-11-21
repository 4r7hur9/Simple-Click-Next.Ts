/**
 * Pessoas na administração da plataforma pela API de verdade (card #170, T-3).
 *
 * Três aplicações sobre o MESMO banco descartável deste arquivo:
 *
 * - a da administração (`sc_admin`), com a saída de e-mail trocada pela caixa
 *   de prova — é por ela que o link de acesso também chega à pessoa;
 * - a da identidade, montada como em produção (`sc_app`), para a pessoa usar
 *   o link, entrar, renovar e pedir recuperação;
 * - a do "quem sou eu", que confere o token de acesso.
 *
 * O registrador do processo é trocado por um que guarda as linhas, para
 * provar que nenhum token, resumo ou link vai para o log.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  esquemaDaFichaDaPessoa,
  esquemaDaListaDePessoas,
  esquemaDaPaginaDaAuditoriaDaPlataforma,
  esquemaDoAcessoGerado,
} from "@simpleclick/contracts";
import {
  comoAdministracao,
  conectarNoBancoDoArquivo,
  criarAdministradorDaPlataforma,
  criarCliente,
  criarIdentidade,
  criarLoja,
  criarMembro,
  sufixoDeTeste,
  type IdentidadeDeTeste,
} from "@simpleclick/testing";

import {
  comoPapel,
  ESPERA_DA_ADMINISTRACAO,
  montarApiDaAdministracao,
  ORIGEM_DA_ADMINISTRACAO,
  tokenDe,
  type ApiDaAdministracao,
} from "./apoio-da-administracao.ts";
import {
  cacheDoLimiteDeProva,
  caixaDeEmail,
  comCookie,
  enviar,
  entrar,
  FRASE_DA_PROVA,
  montarApi,
  refreshDa,
} from "./apoio-das-rotas-de-identidade.ts";
import { criarApp } from "../src/app.ts";
import { criarRegistrador, definirRegistrador } from "../src/core/log.ts";
import { resumirTokenDeConvite } from "../src/modules/auth/convite.usecase.ts";

let migrador: pg.Client;
let api: ApiDaAdministracao;
let identidadeApp: ReturnType<typeof criarApp>;
let appDoEu: ReturnType<typeof criarApp>;
let administradora: IdentidadeDeTeste;
const caixa = caixaDeEmail();
const limite = cacheDoLimiteDeProva();

/** Tudo o que o processo registrou, linha a linha. */
const linhasDoLog: string[] = [];
/** Todo token, resumo e caminho de link que a prova viu: nada disso pode vazar. */
const segredosVistos: string[] = [];

const comoAdmin = () => comoPapel(administradora.id, "ADMIN");

beforeAll(async () => {
  definirRegistrador(
    criarRegistrador({
      nivel: "debug",
      destino: {
        write(trecho: string): void {
          for (const linha of trecho.split("\n")) {
            if (linha.trim() !== "") linhasDoLog.push(linha);
          }
        },
      },
    }),
  );
  migrador = await conectarNoBancoDoArquivo();
  api = montarApiDaAdministracao({ identidade: { email: caixa.saida } });
  identidadeApp = montarApi(api.acessoDaAplicacao, { caixa, limite });
  appDoEu = criarApp({ origens: [], eu: { acesso: api.acessoDaAplicacao } });
  administradora = await criarAdministradorDaPlataforma({
    nome: "Administradora de pessoas",
  });
}, ESPERA_DA_ADMINISTRACAO);

afterAll(async () => {
  definirRegistrador(undefined);
  await api?.encerrar();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

function sha256(texto: string): string {
  return createHash("sha256").update(texto).digest("hex");
}

/** O token de um caminho `/definir-senha?token=…`, anotado como segredo. */
function tokenDoCaminho(caminho: string): string {
  const token = new URL(caminho, "https://x.test").searchParams.get("token");
  if (token === null) throw new Error(`sem token em ${caminho}`);
  segredosVistos.push(token, sha256(token), caminho);
  return token;
}

function emailNovo(rotulo = "pessoa"): string {
  return `${rotulo}-${sufixoDeTeste()}@exemplo.test`;
}

/** Cadastra pela administração e devolve a identidade e o link. */
async function cadastrar(corpo: {
  nome: string;
  email: string;
  telefone?: string;
}) {
  const resposta = await request(api.app)
    .post("/v1/admin/pessoas")
    .set(comoAdmin())
    .send(corpo);
  if (resposta.status !== 201) {
    throw new Error(
      `cadastro: ${resposta.status} ${JSON.stringify(resposta.body)}`,
    );
  }
  const corpoDaResposta = resposta.body as {
    identidadeId: string;
    acesso: unknown;
  };
  const acesso = esquemaDoAcessoGerado.parse(corpoDaResposta.acesso);
  return {
    id: corpoDaResposta.identidadeId,
    token: tokenDoCaminho(acesso.caminho),
    resposta,
  };
}

/** A pessoa define a senha pelo link, como faria na tela. */
function usarLink(token: string, senha = FRASE_DA_PROVA) {
  return enviar(identidadeApp, "/senha/redefinir", { token, senha });
}

/** Pessoa cadastrada pela administração, já com senha e uma sessão aberta. */
async function pessoaComSessao(rotulo: string) {
  const email = emailNovo(rotulo);
  const { id, token } = await cadastrar({ nome: `Pessoa ${rotulo}`, email });
  expect((await usarLink(token)).status).toBe(200);
  const login = await entrar(identidadeApp, email);
  expect(login.status).toBe(200);
  return { id, email, refresh: refreshDa(login) };
}

function desativar(
  id: string,
  corpo: object = { motivo: "Prova de desativação" },
) {
  return request(api.app)
    .put(`/v1/admin/pessoas/${id}/desativacao`)
    .set(comoAdmin())
    .send(corpo);
}

function reativar(id: string) {
  return request(api.app)
    .put(`/v1/admin/pessoas/${id}/reativacao`)
    .set(comoAdmin())
    .send({ motivo: "Prova de reativação" });
}

function gerarAcesso(
  id: string,
  corpo: object = { motivo: "Esqueceu a senha" },
) {
  return request(api.app)
    .post(`/v1/admin/pessoas/${id}/acesso`)
    .set(comoAdmin())
    .send(corpo);
}

async function sessoesVivas(identidadeId: string): Promise<number> {
  const { rows } = await migrador.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM app.sessions
      WHERE identity_id = $1 AND revoked_at IS NULL`,
    [identidadeId],
  );
  return rows[0]?.total ?? 0;
}

async function atosDaPlataforma(identidadeId: string, acao: string) {
  const { rows } = await migrador.query<{
    actor_id: string | null;
    actor_role: string;
    before_data: unknown;
    after_data: unknown;
  }>(
    `SELECT actor_id::text AS actor_id, actor_role, before_data, after_data
       FROM app.audit_platform
      WHERE entity_id = $1 AND action = $2 ORDER BY id`,
    [identidadeId, acao],
  );
  return rows;
}

async function pedidoDoCliente(dados: {
  lojaId: string;
  clienteId: string;
  numero: number;
  diasAtras: number;
}) {
  await migrador.query(
    `INSERT INTO app.orders
       (store_id, store_customer_id, number, code, public_token, status,
        channel, total_cents, subtotal_cents, placed_at)
     VALUES ($1, $2, $3, $4, $5, 'COMPLETED', 'ONLINE', 1000, 1000,
             now() - ($6 || ' days')::interval)`,
    [
      dados.lojaId,
      dados.clienteId,
      dados.numero,
      `P${dados.numero}`,
      `token-pessoas-${dados.lojaId}-${dados.numero}`,
      String(dados.diasAtras),
    ],
  );
}

/** Um convite pendente da pessoa numa loja nova; devolve o token em claro. */
async function convitePendente(identidadeId: string): Promise<string> {
  const loja = await criarLoja();
  const convite = randomBytes(32).toString("base64url");
  segredosVistos.push(convite);
  await migrador.query(
    `INSERT INTO app.store_members
       (store_id, identity_id, role, invite_token_hash, invite_expires_at)
     VALUES ($1, $2, 'STAFF', $3, now() + interval '2 days')`,
    [loja.id, identidadeId, resumirTokenDeConvite(convite)],
  );
  return convite;
}

// ---------------------------------------------------------------------------
// CA-1: lista
// ---------------------------------------------------------------------------

describe("lista de pessoas [CA-1]", () => {
  const prefixo = `zq${sufixoDeTeste()}`;
  let cliente: IdentidadeDeTeste;
  let dono: IdentidadeDeTeste;
  let equipe: IdentidadeDeTeste;
  let desativada: IdentidadeDeTeste;

  beforeAll(async () => {
    cliente = await criarIdentidade({
      nome: `${prefixo} Clara`,
      email: `${prefixo}.clara@exemplo.test`,
      telefone: "+5511977776666",
    });
    dono = await criarIdentidade({ nome: `${prefixo} Dório` });
    const loja = await criarLoja({ dono });
    equipe = await criarIdentidade({ nome: `${prefixo} Eva` });
    await criarMembro({ loja, identidade: equipe, papel: "STAFF" });
    desativada = await criarIdentidade({ nome: `${prefixo} Xavier` });
    expect((await desativar(desativada.id)).status).toBe(200);
  }, ESPERA_DA_ADMINISTRACAO);

  function listar(consulta: Record<string, string | number>) {
    return request(api.app)
      .get("/v1/admin/pessoas")
      .query(consulta)
      .set(comoAdmin());
  }

  it(
    "[CA-1] filtra por tipo e situação, busca por nome e e-mail e conta por tipo",
    async () => {
      const ativas = esquemaDaListaDePessoas.parse(
        (await listar({ busca: prefixo })).body,
      );
      expect(ativas.contagens).toEqual({
        todas: 3,
        clientes: 1,
        donos: 1,
        equipe: 1,
      });
      expect(ativas.pessoas.map((p) => p.identidadeId).sort()).toEqual(
        [cliente.id, dono.id, equipe.id].sort(),
      );

      const donos = esquemaDaListaDePessoas.parse(
        (await listar({ busca: prefixo, tipo: "donos" })).body,
      );
      expect(donos.pessoas.map((p) => p.identidadeId)).toEqual([dono.id]);
      expect(donos.pessoas[0]).toMatchObject({
        donoDeLojas: 1,
        equipeDeLojas: 0,
      });
      expect(donos.total).toBe(1);

      const daEquipe = esquemaDaListaDePessoas.parse(
        (await listar({ busca: prefixo, tipo: "equipe" })).body,
      );
      expect(daEquipe.pessoas.map((p) => p.identidadeId)).toEqual([equipe.id]);

      const desativadas = esquemaDaListaDePessoas.parse(
        (await listar({ busca: prefixo, situacao: "desativadas" })).body,
      );
      expect(desativadas.pessoas.map((p) => p.identidadeId)).toEqual([
        desativada.id,
      ]);
      expect(desativadas.pessoas[0]?.desativada).toBe(true);

      const todas = esquemaDaListaDePessoas.parse(
        (await listar({ busca: prefixo, situacao: "todas", tipo: "clientes" }))
          .body,
      );
      expect(todas.contagens).toEqual({
        todas: 4,
        clientes: 2,
        donos: 1,
        equipe: 1,
      });
      expect(todas.pessoas.map((p) => p.identidadeId).sort()).toEqual(
        [cliente.id, desativada.id].sort(),
      );

      const porEmail = esquemaDaListaDePessoas.parse(
        (await listar({ busca: `${prefixo}.clara@exemplo` })).body,
      );
      expect(porEmail.pessoas.map((p) => p.identidadeId)).toEqual([cliente.id]);

      const paginada = esquemaDaListaDePessoas.parse(
        (await listar({ busca: prefixo, porPagina: 2, pagina: 2 })).body,
      );
      expect(paginada.pessoas).toHaveLength(1);
      expect(paginada.total).toBe(3);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "[CA-1] telefone não busca, porPagina acima de 100 é recusado e o item não tem telefone, documento nem endereço",
    async () => {
      const porTelefone = esquemaDaListaDePessoas.parse(
        (await listar({ busca: "977776666" })).body,
      );
      expect(porTelefone.pessoas.map((p) => p.identidadeId)).not.toContain(
        cliente.id,
      );

      expect((await listar({ porPagina: 101 })).status).toBe(400);

      const resposta = await listar({ busca: prefixo });
      expect(resposta.headers["cache-control"]).toBe("no-store");
      const item = (resposta.body as { pessoas: Record<string, unknown>[] })
        .pessoas[0];
      expect(Object.keys(item ?? {}).sort()).toEqual(
        [
          "criadaEm",
          "desativada",
          "donoDeLojas",
          "email",
          "equipeDeLojas",
          "identidadeId",
          "nome",
          "protegida",
          "temSenha",
        ].sort(),
      );
      expect(JSON.stringify(resposta.body)).not.toContain("977776666");
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

// ---------------------------------------------------------------------------
// CA-2: ficha
// ---------------------------------------------------------------------------

describe("ficha da pessoa [CA-2]", () => {
  it(
    "[CA-2] cliente sem loja: 200 com vínculos e pedidos agregados, sem documento nem endereço, e CONTA_CONSULTADA sem o termo buscado",
    async () => {
      const cliente = await criarIdentidade({
        nome: "Cliente da ficha",
        telefone: "+5511966665555",
      });
      const lojaA = await criarLoja({ nome: "Ficha Loja A" });
      const lojaB = await criarLoja({ nome: "Ficha Loja B" });
      const naA = await criarCliente({ loja: lojaA, identidade: cliente });
      const naB = await criarCliente({ loja: lojaB, identidade: cliente });
      await pedidoDoCliente({
        lojaId: lojaA.id,
        clienteId: naA.id,
        numero: 1,
        diasAtras: 10,
      });
      await pedidoDoCliente({
        lojaId: lojaA.id,
        clienteId: naA.id,
        numero: 2,
        diasAtras: 1,
      });
      await pedidoDoCliente({
        lojaId: lojaB.id,
        clienteId: naB.id,
        numero: 1,
        diasAtras: 5,
      });

      const resposta = await request(api.app)
        .get(`/v1/admin/pessoas/${cliente.id}`)
        .query({ busca: "termo-sentinela-da-busca" })
        .set(comoAdmin());
      expect(resposta.status).toBe(200);
      expect(resposta.headers["cache-control"]).toBe("no-store");
      const ficha = esquemaDaFichaDaPessoa.parse(resposta.body);
      expect(ficha.vinculos).toEqual([]);
      expect(ficha.telefone).toBe("+5511966665555");
      expect(ficha.pedidos.total).toBe(3);
      expect(ficha.pedidos.ultimoEm).not.toBeNull();
      expect(ficha.pedidos.porLoja).toEqual([
        { lojaId: lojaA.id, nome: "Ficha Loja A", total: 2 },
        { lojaId: lojaB.id, nome: "Ficha Loja B", total: 1 },
      ]);
      const texto = JSON.stringify(resposta.body).toLowerCase();
      for (const proibido of [
        "cpf",
        "documento",
        "endereco",
        "logradouro",
        "cep",
      ]) {
        expect(texto).not.toContain(proibido);
      }

      const consultas = await atosDaPlataforma(cliente.id, "CONTA_CONSULTADA");
      expect(consultas).toHaveLength(1);
      expect(consultas[0]?.actor_id).toBe(administradora.id);
      expect(JSON.stringify(consultas)).not.toContain("termo-sentinela");

      const inexistente = await request(api.app)
        .get(`/v1/admin/pessoas/${randomUUID()}`)
        .set(comoAdmin());
      expect(inexistente.status).toBe(404);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

// ---------------------------------------------------------------------------
// CA-3: cadastro e edição
// ---------------------------------------------------------------------------

describe("cadastro e edição [CA-3]", () => {
  it(
    "[CA-3] POST cria sem senha nem papel; e-mail repetido é 409 com a identidade; campo extra é 400",
    async () => {
      const email = emailNovo("cadastro");
      const { id, resposta } = await cadastrar({
        nome: "Helena Cadastrada",
        email,
        telefone: "(11) 95555-4444",
      });
      expect(resposta.headers["cache-control"]).toBe("no-store");
      const { rows } = await migrador.query<{
        sem_senha: boolean;
        vinculos: number;
        admin: number;
      }>(
        `SELECT i.password_hash IS NULL AS sem_senha,
                (SELECT count(*)::int FROM app.store_members WHERE identity_id = i.id) AS vinculos,
                (SELECT count(*)::int FROM app.platform_admins WHERE identity_id = i.id) AS admin
           FROM app.identities i WHERE i.id = $1`,
        [id],
      );
      expect(rows[0]).toEqual({ sem_senha: true, vinculos: 0, admin: 0 });

      const repetido = await request(api.app)
        .post("/v1/admin/pessoas")
        .set(comoAdmin())
        .send({ nome: "Outra", email: email.toUpperCase() });
      expect(repetido.status).toBe(409);
      expect(repetido.body).toMatchObject({
        erro: "email_em_uso",
        identidadeId: id,
      });

      for (const extra of [{ papel: "OWNER" }, { admin: true }]) {
        const recusado = await request(api.app)
          .post("/v1/admin/pessoas")
          .set(comoAdmin())
          .send({ nome: "Com papel", email: emailNovo("papel"), ...extra });
        expect(recusado.status).toBe(400);
      }

      const criada = await atosDaPlataforma(id, "CONTA_CRIADA");
      expect(criada).toHaveLength(1);
      const texto = JSON.stringify(criada);
      expect(texto).not.toContain("Helena");
      expect(texto).not.toContain(email);
      expect(texto).not.toContain("955554444");
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "[CA-3] PATCH altera só nome e telefone, e CONTA_EDITADA guarda os valores mascarados",
    async () => {
      const pessoa = await criarIdentidade({
        nome: "Igor Antigo",
        telefone: "+5511944443333",
      });
      const editada = await request(api.app)
        .patch(`/v1/admin/pessoas/${pessoa.id}`)
        .set(comoAdmin())
        .send({ nome: "Igor Novo", telefone: "(11) 93333-2222" });
      expect(editada.status).toBe(200);
      const ficha = esquemaDaFichaDaPessoa.parse(editada.body);
      expect(ficha).toMatchObject({
        nome: "Igor Novo",
        telefone: "+5511933332222",
      });

      const comEmail = await request(api.app)
        .patch(`/v1/admin/pessoas/${pessoa.id}`)
        .set(comoAdmin())
        .send({ email: "trocado@exemplo.test" });
      expect(comEmail.status).toBe(400);
      const { rows } = await migrador.query<{ email_norm: string }>(
        "SELECT email_norm FROM app.identities WHERE id = $1",
        [pessoa.id],
      );
      expect(rows[0]?.email_norm).toBe(pessoa.email);

      const atos = await atosDaPlataforma(pessoa.id, "CONTA_EDITADA");
      expect(atos).toHaveLength(1);
      const texto = JSON.stringify(atos);
      for (const claro of [
        "Igor Antigo",
        "Igor Novo",
        "944443333",
        "933332222",
      ]) {
        expect(texto).not.toContain(claro);
      }
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

// ---------------------------------------------------------------------------
// CA-4 e CA-6: o ciclo do link, da desativação e da reativação
// ---------------------------------------------------------------------------

describe("link de acesso, desativação e reativação [CA-4] [CA-6]", () => {
  it(
    "[CA-6] o link é devolvido uma vez com no-store; o banco guarda só o sha256 e o emissor; o novo invalida o anterior e os convites; vale 60 min",
    async () => {
      const email = emailNovo("link");
      const { id, token: primeiro } = await cadastrar({
        nome: "Pessoa do link",
        email,
      });
      const convite = await convitePendente(id);

      expect((await gerarAcesso(id, {})).status).toBe(400);

      const segunda = await gerarAcesso(id);
      expect(segunda.status).toBe(201);
      expect(segunda.headers["cache-control"]).toBe("no-store");
      const gerado = esquemaDoAcessoGerado.parse(segunda.body);
      expect(gerado.caminho.startsWith("/definir-senha?token=")).toBe(true);
      const token = tokenDoCaminho(gerado.caminho);

      const { rows: codigos } = await migrador.query<{
        code_hash: string;
        issued_by: string | null;
        consumido: boolean;
        minutos: number;
      }>(
        `SELECT code_hash, issued_by::text AS issued_by,
                consumed_at IS NOT NULL AS consumido,
                extract(epoch FROM expires_at - created_at) / 60 AS minutos
           FROM app.verification_codes
          WHERE identity_id = $1 AND purpose = 'PASSWORD_RESET'
          ORDER BY created_at`,
        [id],
      );
      expect(codigos).toHaveLength(2);
      expect(codigos.map((c) => c.code_hash)).toEqual([
        sha256(primeiro),
        sha256(token),
      ]);
      expect(codigos.every((c) => c.issued_by === administradora.id)).toBe(
        true,
      );
      expect(codigos.map((c) => c.consumido)).toEqual([true, false]);
      expect(Number(codigos[1]?.minutos)).toBeGreaterThan(59);
      expect(Number(codigos[1]?.minutos)).toBeLessThanOrEqual(60.5);

      const aceite = await enviar(identidadeApp, "/convite/aceitar", {
        token: convite,
        senha: FRASE_DA_PROVA,
      });
      expect(aceite.status).toBe(410);
      expect((await usarLink(primeiro)).status).toBe(410);
      expect((await usarLink(token)).status).toBe(200);
      expect((await usarLink(token)).status).toBe(410);
      expect(caixa.ultimoToken(email)).toBe(token);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "[CA-4] [CA-6] desativar revoga sessões, barra entrada, renovação, /v1/eu, recuperação e link; reativar devolve a entrada; o uso do link grava ACESSO_USADO e a recuperação própria não",
    async () => {
      const { id, email, refresh } = await pessoaComSessao("ciclo");
      const usados = await atosDaPlataforma(id, "ACESSO_USADO");
      expect(usados).toHaveLength(1);
      expect(usados[0]).toMatchObject({ actor_id: id, actor_role: "CUSTOMER" });

      const tokenDeAcesso = tokenDe(id, "CUSTOMER");
      const eu = () =>
        request(appDoEu)
          .get("/v1/eu")
          .set("Authorization", `Bearer ${tokenDeAcesso}`);
      expect((await eu()).status).toBe(200);

      const desativada = await desativar(id);
      expect(desativada.status).toBe(200);
      expect(esquemaDaFichaDaPessoa.parse(desativada.body).desativada).toBe(
        true,
      );
      expect(await sessoesVivas(id)).toBe(0);
      const { rows: motivos } = await migrador.query<{
        revoked_reason: string;
      }>(
        `SELECT DISTINCT revoked_reason FROM app.sessions
          WHERE identity_id = $1 AND revoked_reason <> 'PASSWORD_CHANGED'`,
        [id],
      );
      expect(motivos.map((m) => m.revoked_reason)).toEqual([
        "ACCOUNT_DISABLED",
      ]);

      expect((await eu()).status).toBe(401);
      expect((await entrar(identidadeApp, email)).status).toBe(401);
      const renovar = await enviar(
        identidadeApp,
        "/renovar",
        undefined,
        comCookie(refresh),
      );
      expect(renovar.status).toBe(401);
      const contarCodigos = async () =>
        (
          await migrador.query(
            "SELECT 1 FROM app.verification_codes WHERE identity_id = $1",
            [id],
          )
        ).rowCount;
      const antes = await contarCodigos();
      expect(
        (await enviar(identidadeApp, "/senha/esqueci", { email })).status,
      ).toBe(202);
      expect(await contarCodigos()).toBe(antes);

      const linkRecusado = await gerarAcesso(id);
      expect(linkRecusado.status).toBe(409);
      expect(linkRecusado.body).toMatchObject({ erro: "conta_desativada" });
      expect((await desativar(id)).status).toBe(409);

      const reativada = await reativar(id);
      expect(reativada.status).toBe(200);
      expect(esquemaDaFichaDaPessoa.parse(reativada.body).desativada).toBe(
        false,
      );
      expect((await entrar(identidadeApp, email)).status).toBe(200);
      expect((await eu()).status).toBe(200);

      // Um segundo link da administração: o uso revoga a sessão aberta e
      // grava ACESSO_USADO de novo.
      const outro = await gerarAcesso(id);
      const tokenOutro = tokenDoCaminho(
        esquemaDoAcessoGerado.parse(outro.body).caminho,
      );
      expect((await usarLink(tokenOutro)).status).toBe(200);
      expect(await sessoesVivas(id)).toBe(0);
      expect(await atosDaPlataforma(id, "ACESSO_USADO")).toHaveLength(2);

      // A recuperação pedida pela própria pessoa não é ato da administração.
      expect(
        (await enviar(identidadeApp, "/senha/esqueci", { email })).status,
      ).toBe(202);
      const proprio = caixa.ultimoToken(email);
      segredosVistos.push(proprio, sha256(proprio));
      expect((await usarLink(proprio)).status).toBe(200);
      expect(await atosDaPlataforma(id, "ACESSO_USADO")).toHaveLength(2);

      const trilha = await atosDaPlataforma(id, "CONTA_DESATIVADA");
      expect(trilha[0]?.after_data).toMatchObject({
        motivo: "Prova de desativação",
      });
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "[CA-4] /senha/esqueci responde igual para conta desativada, inexistente e ativa, e não cria código para a desativada",
    async () => {
      const ativa = await pessoaComSessao("esqueci-ativa");
      const desligada = await pessoaComSessao("esqueci-desativada");
      expect((await desativar(desligada.id)).status).toBe(200);
      const respostas = await Promise.all(
        [ativa.email, desligada.email, emailNovo("inexistente")].map((email) =>
          enviar(identidadeApp, "/senha/esqueci", { email }),
        ),
      );
      const [primeira, ...demais] = respostas;
      expect(primeira?.status).toBe(202);
      for (const resposta of demais) {
        expect(resposta.status).toBe(primeira?.status);
        expect(resposta.body).toEqual(primeira?.body);
      }
      const { rows } = await migrador.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM app.verification_codes
          WHERE identity_id = $1 AND consumed_at IS NULL`,
        [desligada.id],
      );
      expect(rows[0]?.total).toBe(0);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

// ---------------------------------------------------------------------------
// CA-5: dono único e concorrência
// ---------------------------------------------------------------------------

describe("dono único e concorrência [CA-5]", () => {
  it(
    "[CA-5] desativar a única dona de loja ativa é 409 dono_unico com a lista; com ciência, prossegue",
    async () => {
      const dona = await criarIdentidade({ nome: "Dona única" });
      const loja = await criarLoja({ dono: dona, nome: "Loja de dona única" });
      const compartilhada = await criarLoja({ dono: dona });
      await criarMembro({ loja: compartilhada, papel: "OWNER" });

      const recusa = await desativar(dona.id);
      expect(recusa.status).toBe(409);
      expect(recusa.body).toMatchObject({
        erro: "dono_unico",
        lojas: [
          {
            lojaId: loja.id,
            nome: "Loja de dona única",
            apelido: loja.apelido,
          },
        ],
      });
      expect((recusa.body as { lojas: unknown[] }).lojas).toHaveLength(1);
      const { rows } = await migrador.query<{ desativada: boolean }>(
        "SELECT disabled_at IS NOT NULL AS desativada FROM app.identities WHERE id = $1",
        [dona.id],
      );
      expect(rows[0]?.desativada).toBe(false);

      const ciente = await desativar(dona.id, {
        motivo: "Encerrou a loja",
        lojasSemDonoCiente: true,
      });
      expect(ciente.status).toBe(200);
      const atos = await atosDaPlataforma(dona.id, "CONTA_DESATIVADA");
      expect(atos[0]?.after_data).toMatchObject({ lojasSemDono: [loja.id] });
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "[CA-5] desativar em paralelo com renovação, redefinição pelo link e aceite de convite não deixa sessão viva, não dá 500 nem deadlock",
    async () => {
      for (let rodada = 0; rodada < 3; rodada += 1) {
        // Renovação.
        const comSessao = await pessoaComSessao(`par-renovar-${rodada}`);
        const [desligar, renovar] = await Promise.all([
          desativar(comSessao.id),
          enviar(
            identidadeApp,
            "/renovar",
            undefined,
            comCookie(comSessao.refresh),
          ),
        ]);
        expect(desligar.status).toBe(200);
        expect([200, 401]).toContain(renovar.status);
        expect(await sessoesVivas(comSessao.id)).toBe(0);

        // Redefinição pelo link.
        const email = emailNovo(`par-link-${rodada}`);
        const { id, token } = await cadastrar({ nome: "Par do link", email });
        const [desligarLink, redefinir] = await Promise.all([
          desativar(id),
          usarLink(token),
        ]);
        expect(desligarLink.status).toBe(200);
        expect([200, 410]).toContain(redefinir.status);
        expect(await sessoesVivas(id)).toBe(0);
        expect((await entrar(identidadeApp, email)).status).toBe(401);

        // Aceite de convite.
        const convidada = await criarIdentidade({
          nome: `Convidada ${rodada}`,
        });
        const convite = await convitePendente(convidada.id);
        const [desligarConvite, aceitar] = await Promise.all([
          desativar(convidada.id),
          enviar(identidadeApp, "/convite/aceitar", {
            token: convite,
            senha: FRASE_DA_PROVA,
          }),
        ]);
        expect(desligarConvite.status).toBe(200);
        expect([200, 410]).toContain(aceitar.status);
        expect(await sessoesVivas(convidada.id)).toBe(0);
        expect((await entrar(identidadeApp, convidada.email)).status).toBe(401);
      }
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

// ---------------------------------------------------------------------------
// CA-10 e CA-11: autorização e conta protegida
// ---------------------------------------------------------------------------

describe("autorização por papel [CA-10]", () => {
  type Chamada = (cabecalhos: Record<string, string>) => request.Test;

  function rotas(alvo: string): [string, Chamada, boolean][] {
    const chamar =
      (
        metodo: "get" | "post" | "put" | "patch",
        caminho: string,
        corpo?: object,
      ) =>
      (cabecalhos: Record<string, string>): request.Test => {
        const pedido = request(api.app)[metodo](caminho).set(cabecalhos);
        return corpo === undefined ? pedido : pedido.send(corpo);
      };
    return [
      ["GET /pessoas", chamar("get", "/v1/admin/pessoas"), false],
      ["GET /pessoas/:id", chamar("get", `/v1/admin/pessoas/${alvo}`), false],
      [
        "PATCH /pessoas/:id",
        chamar("patch", `/v1/admin/pessoas/${alvo}`, {
          nome: "Nome pelo admin",
        }),
        true,
      ],
      [
        "POST /pessoas/:id/acesso",
        chamar("post", `/v1/admin/pessoas/${alvo}/acesso`, { motivo: "Prova" }),
        true,
      ],
      [
        "PUT /pessoas/:id/desativacao",
        chamar("put", `/v1/admin/pessoas/${alvo}/desativacao`, {
          motivo: "Prova",
        }),
        true,
      ],
      [
        "PUT /pessoas/:id/reativacao",
        chamar("put", `/v1/admin/pessoas/${alvo}/reativacao`, {
          motivo: "Prova",
        }),
        true,
      ],
      [
        "POST /pessoas",
        chamar("post", "/v1/admin/pessoas", {
          nome: "Nova",
          email: `auth-${sufixoDeTeste()}@exemplo.test`,
        }),
        true,
      ],
      [
        "GET /auditoria/plataforma",
        chamar("get", "/v1/admin/auditoria/plataforma"),
        false,
      ],
    ];
  }

  it(
    "[CA-10] dono, equipe, cliente e admin com grant revogado recebem 403; anônimo 401; mutação sem origem é recusada; admin passa",
    async () => {
      const alvo = await criarIdentidade({ nome: "Alvo intocado" });
      const loja = await criarLoja();
      const equipe = await criarIdentidade();
      await criarMembro({ loja, identidade: equipe, papel: "STAFF" });
      const cliente = await criarIdentidade();
      const revogada = await criarAdministradorDaPlataforma({
        nome: "Admin revogada",
      });
      await migrador.query(
        "UPDATE app.platform_admins SET revoked_at = now() WHERE identity_id = $1",
        [revogada.id],
      );
      const pessoasAntes = await migrador.query(
        "SELECT count(*) FROM app.identities",
      );

      for (const [rota, chamar, mutacao] of rotas(alvo.id)) {
        const negados: [string, Record<string, string>][] = [
          ["dono", comoPapel(loja.dono.id, "OWNER")],
          ["equipe", comoPapel(equipe.id, "OWNER")],
          ["cliente", comoPapel(cliente.id, "CUSTOMER")],
          ["admin revogada", comoPapel(revogada.id, "ADMIN")],
        ];
        for (const [quem, cabecalhos] of negados) {
          expect(
            (await chamar(cabecalhos)).status,
            `${rota} como ${quem}`,
          ).toBe(403);
        }
        expect(
          (await chamar({ origin: ORIGEM_DA_ADMINISTRACAO })).status,
          `${rota} anônimo`,
        ).toBe(401);
        if (mutacao) {
          const semOrigem = await chamar({
            authorization: comoAdmin().authorization,
          });
          expect(semOrigem.status, `${rota} sem origem`).toBe(403);
        }
      }
      const { rows } = await migrador.query<{
        nome: string;
        desativada: boolean;
      }>(
        `SELECT display_name AS nome, disabled_at IS NOT NULL AS desativada
           FROM app.identities WHERE id = $1`,
        [alvo.id],
      );
      expect(rows[0]).toEqual({ nome: "Alvo intocado", desativada: false });
      const pessoasDepois = await migrador.query(
        "SELECT count(*) FROM app.identities",
      );
      expect(pessoasDepois.rows).toEqual(pessoasAntes.rows);

      for (const [rota, chamar] of rotas(alvo.id)) {
        const resposta = await chamar(comoAdmin());
        expect(resposta.status, `${rota} como admin`).toBeGreaterThanOrEqual(
          200,
        );
        expect(resposta.status, `${rota} como admin`).toBeLessThan(300);
      }
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

describe("nenhuma via concede administração e a conta protegida é intocável [CA-11]", () => {
  it("[CA-11] nenhum arquivo novo de modules/admin escreve em platform_admins", () => {
    const pasta = join(
      dirname(fileURLToPath(import.meta.url)),
      "../src/modules/admin",
    );
    for (const arquivo of [
      "pessoas.repo.ts",
      "pessoas.usecase.ts",
      "pessoas.routes.ts",
      "auditoria-da-plataforma.repo.ts",
    ]) {
      const fonte = readFileSync(join(pasta, arquivo), "utf8");
      expect(fonte, arquivo).not.toMatch(
        /(INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO)\s+(app\.)?platform_admins/i,
      );
    }
  });

  it(
    "[CA-11] conta com grant ativo dá 409 conta_protegida ao editar, desativar e gerar acesso, e nada muda",
    async () => {
      const protegida = await criarAdministradorDaPlataforma({
        nome: "Outra administradora",
      });
      const tentativas = [
        request(api.app)
          .patch(`/v1/admin/pessoas/${protegida.id}`)
          .set(comoAdmin())
          .send({ nome: "Trocado" }),
        desativar(protegida.id, {
          motivo: "Tentativa",
          lojasSemDonoCiente: true,
        }),
        gerarAcesso(protegida.id),
      ];
      for (const resposta of await Promise.all(tentativas)) {
        expect(resposta.status).toBe(409);
        expect(resposta.body).toMatchObject({ erro: "conta_protegida" });
      }
      const { rows } = await migrador.query<{
        nome: string;
        desativada: boolean;
        codigos: number;
      }>(
        `SELECT display_name AS nome, disabled_at IS NOT NULL AS desativada,
                (SELECT count(*)::int FROM app.verification_codes v
                  WHERE v.identity_id = i.id) AS codigos
           FROM app.identities i WHERE i.id = $1`,
        [protegida.id],
      );
      expect(rows[0]).toEqual({
        nome: "Outra administradora",
        desativada: false,
        codigos: 0,
      });

      const lista = esquemaDaListaDePessoas.parse(
        (
          await request(api.app)
            .get("/v1/admin/pessoas")
            .query({ busca: "Outra administradora" })
            .set(comoAdmin())
        ).body,
      );
      expect(
        lista.pessoas.find((p) => p.identidadeId === protegida.id)?.protegida,
      ).toBe(true);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

// ---------------------------------------------------------------------------
// CA-20: trilha da plataforma
// ---------------------------------------------------------------------------

describe("auditoria da plataforma [CA-20]", () => {
  it(
    "[CA-20] lista os atos de pessoa, os de LGPD e os de limites, mascarados e com o marcador sensivel",
    async () => {
      const titular = await criarIdentidade({ nome: "Titular LGPD" });
      await comoAdministracao((tx) =>
        tx.query(
          `INSERT INTO app.audit_platform
             (actor_id, actor_role, action, entity, entity_id, after_data)
           VALUES ($1::uuid, 'CUSTOMER', 'LGPD_EXPORTACAO', 'identity', $2::text, $3::jsonb)`,
          [
            titular.id,
            titular.id,
            JSON.stringify({
              formato: "json",
              ip: "203.0.113.77",
              userAgent: "Navegador-Sentinela/1.0",
            }),
          ],
        ),
      );
      const limites = await request(api.app)
        .patch("/v1/admin/limites")
        .set(comoAdmin())
        .send({ lojasPorDono: 4 });
      expect(limites.status).toBe(200);
      const alvo = await criarIdentidade({ nome: "Alvo da auditoria" });
      expect((await desativar(alvo.id)).status).toBe(200);

      const ler = async (ato: string) => {
        const resposta = await request(api.app)
          .get("/v1/admin/auditoria/plataforma")
          .query({ ato })
          .set(comoAdmin());
        expect(resposta.status).toBe(200);
        expect(resposta.headers["cache-control"]).toBe("no-store");
        return esquemaDaPaginaDaAuditoriaDaPlataforma.parse(resposta.body);
      };

      const desativacoes = await ler("CONTA_DESATIVADA");
      const daAlvo = desativacoes.registros.find(
        (r) => r.entidadeId === alvo.id,
      );
      expect(daAlvo).toMatchObject({
        entidade: "identity",
        sensivel: true,
        quem: { id: administradora.id },
        papel: "ADMIN",
      });

      const lgpd = await ler("LGPD_EXPORTACAO");
      const doTitular = lgpd.registros.find((r) => r.entidadeId === titular.id);
      expect(doTitular).toBeDefined();
      const textoLgpd = JSON.stringify(doTitular);
      expect(textoLgpd).not.toContain("203.0.113.77");
      expect(textoLgpd).not.toContain("Navegador-Sentinela");
      expect(doTitular?.campos.find((c) => c.campo === "formato")?.depois).toBe(
        "json",
      );

      const padroes = await ler("LIMITES_PADRAO_ALTERADOS");
      expect(padroes.registros.length).toBeGreaterThan(0);
      expect(padroes.registros[0]?.entidade).toBe("platform_limit_defaults");

      const pagina = esquemaDaPaginaDaAuditoriaDaPlataforma.parse(
        (
          await request(api.app)
            .get("/v1/admin/auditoria/plataforma")
            .query({ porPagina: 2 })
            .set(comoAdmin())
        ).body,
      );
      expect(pagina.registros).toHaveLength(2);
      expect(pagina.total).toBeGreaterThan(2);
      const demais = await request(api.app)
        .get("/v1/admin/auditoria/plataforma")
        .query({ porPagina: 101 })
        .set(comoAdmin());
      expect(demais.status).toBe(400);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

// ---------------------------------------------------------------------------
// CA-6: nada de token, resumo ou link nas trilhas e no log
// ---------------------------------------------------------------------------

describe("sigilo do link [CA-6]", () => {
  it(
    "[CA-6] nenhum token, resumo ou caminho de link aparece em audit_log, audit_platform ou no log capturado",
    async () => {
      expect(segredosVistos.length).toBeGreaterThan(10);
      const { rows } = await migrador.query<{ texto: string }>(
        `SELECT coalesce(string_agg(to_jsonb(t)::text, ' '), '') AS texto
           FROM app.audit_log t
         UNION ALL
         SELECT coalesce(string_agg(to_jsonb(p)::text, ' '), '')
           FROM app.audit_platform p`,
      );
      const trilhas = rows.map((linha) => linha.texto).join(" ");
      const log = linhasDoLog.join("\n");
      expect(log.length).toBeGreaterThan(0);
      for (const segredo of segredosVistos) {
        expect(trilhas.includes(segredo), "trilha").toBe(false);
        expect(log.includes(segredo), "log").toBe(false);
        expect(
          log.includes(encodeURIComponent(segredo)),
          "log codificado",
        ).toBe(false);
      }
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});
