/**
 * Prova da LGPD funcional (card #79): aceite versionado no cadastro, exportação
 * dos dados, exclusão (anonimização) da conta e o bloqueio do dono com loja.
 *
 * Contra PostgreSQL de verdade, pela credencial que atende requisição, com a
 * API montada como em produção e chamada por HTTP (cadastro e login de verdade;
 * só a loja e o pedido de prova entram direto no banco).
 */
import type { Express } from "express";
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  CABECALHO_DA_PONTE,
  CABECALHO_DO_AGENTE_DO_VISITANTE,
  CABECALHO_DO_ENDERECO_DO_VISITANTE,
  VERSAO_DOS_DOCUMENTOS_LEGAIS,
} from "@simpleclick/contracts";
import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarCliente,
  criarEnderecoDoCliente,
  criarIdentidade,
  criarLoja,
  criarMembro,
  sufixoDeTeste,
} from "@simpleclick/testing";

import { emailNovo } from "./apoio-da-conta.ts";
import {
  AMBIENTE_DE_PRODUCAO,
  cacheDoLimiteDeProva,
  enviar,
  FRASE_DA_PROVA,
  ORIGEM,
} from "./apoio-das-rotas-de-identidade.ts";
import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import { criarApp } from "../src/app.ts";
import { clienteDaCompra } from "../src/modules/auth/cliente-da-compra.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { exigirAceiteVigente } from "../src/core/aceites-legais.ts";
import {
  celulaCsv,
  csvDosPedidos,
  podeExportar,
  reiniciarLimiteDeExportacao,
} from "../src/modules/conta/privacidade.ts";

// A conta lê o segredo do ambiente; o cadastro assina com o da fonte da prova.
process.env["JWT_SECRET"] = AMBIENTE_DE_PRODUCAO.JWT_SECRET;
const SEGREDO_DA_PONTE = "segredo-da-ponte-da-prova-com-mais-de-32-caracteres";
process.env["SEGREDO_DA_PONTE"] = SEGREDO_DA_PONTE;

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: Express;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = criarApp({
    origens: [ORIGEM],
    identidade: {
      fonte: AMBIENTE_DE_PRODUCAO,
      acesso: () => acesso,
      cacheDoLimite: cacheDoLimiteDeProva().cache,
    },
    contaInterna: { acesso },
    exigirAceite: exigirAceiteVigente({
      acesso,
      identidade: (requisicao) =>
        clienteDaCompra(requisicao, process.env["JWT_SECRET"])?.identidadeId ?? null,
    }),
  });
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

beforeEach(() => reiniciarLimiteDeExportacao());

interface Conta {
  readonly id: string;
  readonly email: string;
  readonly token: string;
}

/** Cadastro de verdade, com o aceite marcado. */
async function cadastrar(extra: Record<string, string> = {}): Promise<Conta> {
  const email = emailNovo();
  const resposta = await enviar(
    app,
    "/cadastro",
    { nome: "Pessoa da prova", email, senha: FRASE_DA_PROVA, aceitouTermos: true },
    extra,
  );
  expect(resposta.status).toBe(201);
  const { rows } = await migrador.query<{ id: string }>(
    `SELECT id FROM app.identities WHERE email_norm = $1`,
    [email],
  );
  return { id: rows[0]!.id, email, token: String(resposta.body.tokenDeAcesso) };
}

/** Uma conta antiga: existe sem nenhum aceite gravado (foi criada antes do deploy). */
async function contaAntiga(): Promise<Conta> {
  const nova = await cadastrar();
  // O aceite é só-acrescenta (até para o migrador); a conta antiga é uma
  // identidade criada por fora, que entra com a senha da prova.
  const antiga = await criarIdentidade({ email: emailNovo() });
  await migrador.query(
    `UPDATE app.identities SET password_hash = (SELECT password_hash FROM app.identities WHERE id = $2)
      WHERE id = $1`,
    [antiga.id, nova.id],
  );
  const login = await enviar(app, "/login", { email: antiga.email, senha: FRASE_DA_PROVA });
  expect(login.status).toBe(200);
  return { id: antiga.id, email: antiga.email, token: String(login.body.tokenDeAcesso) };
}

const comToken = (conta: Conta) => ({ authorization: `Bearer ${conta.token}`, origin: ORIGEM });

const get = (conta: Conta, caminho: string) =>
  request(app).get(caminho).set(comToken(conta));
const post = (conta: Conta, caminho: string, corpo: object = {}) =>
  request(app).post(caminho).set(comToken(conta)).send(corpo);

/** Qualquer ação de criação fora de /auth e /conta: o freio responde antes da rota. */
const criarAlgo = (conta: Conta) =>
  post(conta, "/v1/lojas/qualquer-loja/catalogo/categorias", { nome: "X" });

async function aceites(id: string) {
  const { rows } = await migrador.query<{
    document: string; version: string; ip: string | null; user_agent: string | null; origin: string;
  }>(
    `SELECT document, version, ip, user_agent, origin
       FROM app.legal_acceptances WHERE identity_id = $1 ORDER BY document`,
    [id],
  );
  return rows;
}

async function trilha(id: string) {
  const { rows } = await migrador.query<{ action: string }>(
    `SELECT action FROM app.audit_platform WHERE entity_id = $1 ORDER BY id`,
    [id],
  );
  return rows.map((l) => l.action);
}

describe("aceite no cadastro", () => {
  it("sem a marca dos termos o cadastro é recusado e nenhuma conta nasce", async () => {
    const email = emailNovo();
    const resposta = await enviar(app, "/cadastro", {
      nome: "Sem aceite",
      email,
      senha: FRASE_DA_PROVA,
    });
    expect(resposta.status).toBe(400);
    const { rowCount } = await migrador.query(
      `SELECT 1 FROM app.identities WHERE email_norm = $1`,
      [email],
    );
    expect(rowCount).toBe(0);
  }, ESPERA_LONGA);

  it("grava os dois documentos na versão vigente, com IP e navegador de quem aceitou", async () => {
    const conta = await cadastrar({
      [CABECALHO_DA_PONTE]: SEGREDO_DA_PONTE,
      [CABECALHO_DO_ENDERECO_DO_VISITANTE]: "203.0.113.9",
      [CABECALHO_DO_AGENTE_DO_VISITANTE]: "NavegadorDaProva/1.0",
    });
    const linhas = await aceites(conta.id);
    expect(linhas.map((l) => l.document)).toEqual(["PRIVACY_POLICY", "TERMS_OF_USE"]);
    for (const linha of linhas) {
      expect(linha.version).toBe(VERSAO_DOS_DOCUMENTOS_LEGAIS.TERMS_OF_USE);
      expect(linha.ip).toBe("203.0.113.9");
      expect(linha.user_agent).toBe("NavegadorDaProva/1.0");
      expect(linha.origin).toBe("SIGNUP");
    }
    const situacao = await get(conta, "/v1/conta/aceites");
    expect(situacao.status).toBe(200);
    expect(situacao.body.pendentes).toEqual([]);
    expect(situacao.body.historico).toHaveLength(2);
  }, ESPERA_LONGA);

  it("sem a prova da ponte, o IP e o navegador informados são ignorados", async () => {
    const conta = await cadastrar({
      [CABECALHO_DO_ENDERECO_DO_VISITANTE]: "198.51.100.7",
      [CABECALHO_DO_AGENTE_DO_VISITANTE]: "Forjado/9.9",
      "user-agent": "Direto/2.0",
    });
    const [linha] = await aceites(conta.id);
    expect(linha?.ip).not.toBe("198.51.100.7");
    expect(linha?.user_agent).toBe("Direto/2.0");
  }, ESPERA_LONGA);

  it("quem abre loja aceita também os termos do lojista, e sem a marca a loja não abre", async () => {
    const conta = await cadastrar();
    const sem = await post(conta, "/v1/auth/lojas", { nome: "Pastel", tipoDeNegocio: "FOOD_SNACK" });
    expect(sem.status).toBe(400);
    const com = await post(conta, "/v1/auth/lojas", {
      nome: `Pastel ${sufixoDeTeste()}`,
      tipoDeNegocio: "FOOD_SNACK",
      aceitouTermosDoLojista: true,
    });
    expect(com.status).toBe(201);
    expect((await aceites(conta.id)).map((l) => l.document)).toEqual([
      "MERCHANT_TERMS",
      "PRIVACY_POLICY",
      "TERMS_OF_USE",
    ]);
  }, ESPERA_LONGA);
});

describe("aceite versionado", () => {
  it("conta antiga vê tudo pendente, só as ações de criação são barradas, e aceitar libera", async () => {
    const conta = await contaAntiga();
    const antes = await get(conta, "/v1/conta/aceites");
    expect(antes.body.pendentes.map((p: { documento: string }) => p.documento)).toEqual([
      "TERMS_OF_USE",
      "PRIVACY_POLICY",
    ]);

    const barrada = await criarAlgo(conta);
    expect(barrada.status).toBe(403);
    expect(barrada.body.erro).toBe("aceite_pendente");

    // Escrever em qualquer rota é barrado (PUT também)...
    const barradaPut = await request(app)
      .put("/v1/lojas/qualquer-loja/catalogo/categorias/x")
      .set(comToken(conta))
      .send({});
    expect(barradaPut.body.erro).toBe("aceite_pendente");
    // ...mas ler, sair e a própria conta seguem livres.
    expect((await get(conta, "/v1/conta/dados")).status).toBe(200);
    expect((await get(conta, "/v1/lojas/qualquer-loja/catalogo/categorias")).body.erro).not.toBe("aceite_pendente");
    expect((await post(conta, "/v1/auth/sessoes/atual/encerrar")).body.erro).not.toBe("aceite_pendente");

    const aceito = await post(conta, "/v1/conta/aceites", {
      documentos: ["TERMS_OF_USE", "PRIVACY_POLICY"],
    });
    expect(aceito.status).toBe(200);
    expect(aceito.body.pendentes).toEqual([]);
    expect((await aceites(conta.id)).every((l) => l.origin === "RENEWAL")).toBe(true);

    const liberada = await criarAlgo(conta);
    expect(liberada.body.erro).not.toBe("aceite_pendente");
  }, ESPERA_LONGA);

  it("aceite de versão antiga não vale: a versão vigente continua pendente", async () => {
    const conta = await contaAntiga();
    for (const documento of ["TERMS_OF_USE", "PRIVACY_POLICY"]) {
      await migrador.query(
        `INSERT INTO app.legal_acceptances (identity_id, document, version, origin)
         VALUES ($1, $2, '2020-01-01', 'SIGNUP')`,
        [conta.id, documento],
      );
    }
    const situacao = await get(conta, "/v1/conta/aceites");
    expect(situacao.body.pendentes).toHaveLength(2);
    expect(situacao.body.historico).toHaveLength(2);
    expect((await criarAlgo(conta)).body.erro).toBe("aceite_pendente");
  }, ESPERA_LONGA);

  it("só aceita o que está pendente: dono é quem assina os termos do lojista", async () => {
    const conta = await cadastrar();
    const intruso = await post(conta, "/v1/conta/aceites", { documentos: ["MERCHANT_TERMS"] });
    expect(intruso.status).toBe(200);
    expect((await aceites(conta.id)).map((l) => l.document)).not.toContain("MERCHANT_TERMS");

    const dona = { id: conta.id, email: conta.email, nome: "Pessoa da prova", telefone: null };
    await criarLoja({ dono: dona });
    const pendentes = await get(conta, "/v1/conta/aceites");
    expect(pendentes.body.pendentes.map((p: { documento: string }) => p.documento)).toEqual([
      "MERCHANT_TERMS",
    ]);
    expect((await criarAlgo(conta)).body.erro).toBe("aceite_pendente");
    await post(conta, "/v1/conta/aceites", { documentos: ["MERCHANT_TERMS"] });
    expect((await get(conta, "/v1/conta/aceites")).body.pendentes).toEqual([]);
  }, ESPERA_LONGA);

  it("sem sessão o aceite responde 401", async () => {
    expect((await request(app).get("/v1/conta/aceites")).status).toBe(401);
  });
});

/** Uma cliente com cadastro, endereço e um pedido numa loja. */
async function clienteComPedido() {
  const conta = await cadastrar();
  const loja = await criarLoja({ nome: `Loja ${sufixoDeTeste()}` });
  const ficha = await criarCliente({
    loja,
    nome: "Maria Cliente",
    email: conta.email,
    identidade: { id: conta.id, email: conta.email, nome: "Pessoa da prova", telefone: null },
  });
  await criarEnderecoDoCliente({ identidade: { id: conta.id, email: conta.email, nome: "Pessoa da prova", telefone: null }, logradouro: "Rua das Flores" });
  const numero = Number(sufixoDeTeste().replace(/\D/g, "").slice(-6)) || 1;
  const { rows } = await migrador.query<{ id: string }>(
    `INSERT INTO app.orders (store_id, number, code, public_token, store_customer_id,
                             total_cents, items_total_cents, subtotal_cents, customer_note)
     VALUES ($1, $2, $3, $4, $5, 4590, 4590, 4590, 'sem cebola, portão azul')
     RETURNING id`,
    [loja.id, numero, `P${numero}`, `token-${sufixoDeTeste()}-${numero}`, ficha.id],
  );
  const pedidoId = rows[0]!.id;
  await migrador.query(
    `INSERT INTO app.order_contacts (order_id, store_id, name, phone_e164, email, doc_number, street, city)
     VALUES ($1, $2, 'Maria Cliente', '+5511999990000', $3, '52998224725', 'Rua das Flores', 'São Paulo')`,
    [pedidoId, loja.id, conta.email],
  );
  await migrador.query(
    `INSERT INTO app.order_items (store_id, order_id, product_name, quantity, unit_price_cents, line_total_cents)
     VALUES ($1, $2, 'Coxinha =cmd|x', 3, 1530, 4590)`,
    [loja.id, pedidoId],
  );
  return { conta, loja, ficha, pedidoId, codigo: `P${numero}` };
}

describe("exportar meus dados", () => {
  it("pede a senha", async () => {
    const conta = await cadastrar();
    const sem = await post(conta, "/v1/conta/privacidade/exportar", {});
    expect(sem.status).toBe(422);
    const errada = await post(conta, "/v1/conta/privacidade/exportar", { senha: "errada" });
    expect(errada.status).toBe(403);
    expect(errada.body.erro).toBe("senha_incorreta");
    expect(await trilha(conta.id)).not.toContain("LGPD_EXPORTACAO");
  }, ESPERA_LONGA);

  it("entrega o JSON com cadastro, endereços, pedidos, aceites e registra na trilha", async () => {
    const { conta, codigo } = await clienteComPedido();
    const resposta = await post(conta, "/v1/conta/privacidade/exportar", { senha: FRASE_DA_PROVA });
    expect(resposta.status).toBe(200);
    expect(resposta.headers["content-disposition"]).toContain("attachment");
    expect(resposta.headers["cache-control"]).toBe("no-store");
    const arquivo = resposta.body;
    expect(arquivo.conta).toMatchObject({ id: conta.id, email: conta.email, nome: "Pessoa da prova" });
    expect(arquivo.enderecos[0]).toMatchObject({ rua: "Rua das Flores" });
    expect(arquivo.pedidos).toHaveLength(1);
    expect(arquivo.pedidos[0]).toMatchObject({ codigo, totalCentavos: 4590 });
    expect(arquivo.pedidos[0].itens[0]).toMatchObject({ quantidade: 3 });
    expect(arquivo.aceites).toHaveLength(2);
    expect(arquivo.nasLojas).toHaveProperty("lojasFavoritas");
    // Nunca sai senha nem o resumo dela.
    expect(JSON.stringify(arquivo)).not.toMatch(/password|argon2/i);
    expect(await trilha(conta.id)).toContain("LGPD_EXPORTACAO");
  }, ESPERA_LONGA);

  it("entrega o CSV dos pedidos, com BOM para o Excel", async () => {
    const { conta, codigo } = await clienteComPedido();
    const resposta = await post(conta, "/v1/conta/privacidade/exportar", {
      senha: FRASE_DA_PROVA,
      formato: "csv",
    });
    expect(resposta.status).toBe(200);
    expect(resposta.headers["content-type"]).toContain("text/csv");
    const texto = resposta.text;
    expect(texto.startsWith("\uFEFF")).toBe(true);
    expect(texto).toContain(codigo);
    expect(texto).toContain("45,90");
    expect(texto).toContain("3x Coxinha");
  }, ESPERA_LONGA);

  it("tem limite: a quarta exportação da hora é recusada", async () => {
    const conta = await cadastrar();
    for (let i = 0; i < 3; i += 1) {
      expect((await post(conta, "/v1/conta/privacidade/exportar", { senha: FRASE_DA_PROVA })).status).toBe(200);
    }
    const quarta = await post(conta, "/v1/conta/privacidade/exportar", { senha: FRASE_DA_PROVA });
    expect(quarta.status).toBe(429);
    expect(quarta.body.erro).toBe("muitas_exportacoes");
  }, ESPERA_LONGA);

  it("exportar não é barrado por aceite pendente", async () => {
    const conta = await contaAntiga();
    const resposta = await post(conta, "/v1/conta/privacidade/exportar", { senha: FRASE_DA_PROVA });
    expect(resposta.status).toBe(200);
  }, ESPERA_LONGA);
});

describe("limite e CSV (unidade)", () => {
  it("o limite conta por conta e libera depois de uma hora", () => {
    const agora = 1_000_000;
    expect(podeExportar("a", agora)).toBe(true);
    expect(podeExportar("a", agora + 1)).toBe(true);
    expect(podeExportar("a", agora + 2)).toBe(true);
    expect(podeExportar("a", agora + 3)).toBe(false);
    expect(podeExportar("b", agora + 3)).toBe(true);
    expect(podeExportar("a", agora + 3_600_001)).toBe(true);
  });

  it("escapa aspas, separador e fórmulas", () => {
    expect(celulaCsv('diz "oi"; tchau')).toBe('"diz ""oi""; tchau"');
    expect(celulaCsv("=SOMA(A1)")).toBe("'=SOMA(A1)");
    expect(celulaCsv(null)).toBe("");
    expect(csvDosPedidos([]).startsWith("﻿Pedido;")).toBe(true);
  });
});

describe("excluir minha conta", () => {
  it("exige a palavra EXCLUIR e a senha certa, e nada muda se faltar uma", async () => {
    const conta = await cadastrar();
    const semPalavra = await post(conta, "/v1/conta/excluir", { senha: FRASE_DA_PROVA });
    expect(semPalavra.status).toBe(422);
    expect(semPalavra.body.erro).toBe("confirmacao_invalida");
    const minuscula = await post(conta, "/v1/conta/excluir", { senha: FRASE_DA_PROVA, confirmacao: "excluir" });
    expect(minuscula.status).toBe(422);
    const errada = await post(conta, "/v1/conta/excluir", { senha: "errada", confirmacao: "EXCLUIR" });
    expect(errada.status).toBe(403);
    const { rows } = await migrador.query(`SELECT 1 FROM app.identities WHERE id = $1 AND anonymized_at IS NULL`, [conta.id]);
    expect(rows).toHaveLength(1);
  }, ESPERA_LONGA);

  it("anonimiza os dados pessoais, mantém o pedido sem dado pessoal, encerra as sessões e registra", async () => {
    const { conta, loja, ficha, pedidoId } = await clienteComPedido();
    const sessoesAntes = await migrador.query(
      `SELECT 1 FROM app.sessions WHERE identity_id = $1 AND revoked_at IS NULL`,
      [conta.id],
    );
    expect(sessoesAntes.rowCount).toBeGreaterThan(0);

    const resposta = await post(conta, "/v1/conta/excluir", { senha: FRASE_DA_PROVA, confirmacao: "EXCLUIR" });
    expect(resposta.status).toBe(204);

    const { rows: [identidade] } = await migrador.query(
      `SELECT display_name, phone_e164, cpf, password_hash, email_norm, anonymized_at
         FROM app.identities WHERE id = $1`,
      [conta.id],
    );
    expect(identidade).toMatchObject({ display_name: null, phone_e164: null, cpf: null, password_hash: null });
    expect(identidade.email_norm).toMatch(/@conta-excluida\.invalid$/);
    expect(identidade.anonymized_at).not.toBeNull();

    expect((await migrador.query(`SELECT 1 FROM app.customer_addresses WHERE identity_id = $1`, [conta.id])).rowCount).toBe(0);
    const { rows: [cliente] } = await migrador.query(
      `SELECT display_name, phone_e164, email, anonymized_at FROM app.store_customers WHERE id = $1`,
      [ficha.id],
    );
    expect(cliente).toMatchObject({ display_name: null, phone_e164: null, email: null });
    expect(cliente.anonymized_at).not.toBeNull();

    // O pedido segue como registro da loja, sem nenhum dado pessoal.
    const { rows: [pedido] } = await migrador.query(
      `SELECT o.total_cents, o.customer_note, c.name, c.phone_e164, c.email, c.doc_number, c.street, c.anonymized_at
         FROM app.orders o JOIN app.order_contacts c ON c.order_id = o.id
        WHERE o.id = $1 AND o.store_id = $2`,
      [pedidoId, loja.id],
    );
    expect(Number(pedido.total_cents)).toBe(4590);
    expect(pedido).toMatchObject({ customer_note: null, name: "Cliente removido", email: null, doc_number: null, street: null });
    expect(pedido.anonymized_at).not.toBeNull();
    expect((await migrador.query(`SELECT 1 FROM app.order_items WHERE order_id = $1`, [pedidoId])).rowCount).toBe(1);

    const sessoes = await migrador.query(
      `SELECT 1 FROM app.sessions WHERE identity_id = $1 AND revoked_at IS NULL`,
      [conta.id],
    );
    expect(sessoes.rowCount).toBe(0);
    // O aceite fica como prova do que foi consentido.
    expect(await aceites(conta.id)).toHaveLength(2);
    expect(await trilha(conta.id)).toEqual(
      expect.arrayContaining(["LGPD_EXCLUSAO_PEDIDA", "LGPD_EXCLUSAO_CONCLUIDA"]),
    );

    const login = await enviar(app, "/login", { email: conta.email, senha: FRASE_DA_PROVA });
    expect(login.status).not.toBe(200);
  }, ESPERA_LONGA);

  it("dono com loja ativa não exclui: 409 tem_loja, nada é apagado e o pedido fica na trilha", async () => {
    const conta = await cadastrar();
    const dono = { id: conta.id, email: conta.email, nome: "Pessoa da prova", telefone: null };
    await criarLoja({ dono, status: "ACTIVE" });
    const resposta = await post(conta, "/v1/conta/excluir", { senha: FRASE_DA_PROVA, confirmacao: "EXCLUIR" });
    expect(resposta.status).toBe(409);
    expect(resposta.body.erro).toBe("tem_loja");
    expect(resposta.body.mensagem).toMatch(/transfira|encerramento/i);
    const { rows: [identidade] } = await migrador.query(
      `SELECT display_name, anonymized_at FROM app.identities WHERE id = $1`,
      [conta.id],
    );
    expect(identidade).toMatchObject({ display_name: "Pessoa da prova", anonymized_at: null });
    expect(await trilha(conta.id)).toEqual(["LGPD_EXCLUSAO_PEDIDA", "LGPD_EXCLUSAO_BLOQUEADA"]);
  }, ESPERA_LONGA);

  it("quem é só da equipe de uma loja exclui, e o vínculo é encerrado", async () => {
    const conta = await cadastrar();
    const loja = await criarLoja({});
    await criarMembro({
      loja,
      identidade: { id: conta.id, email: conta.email, nome: "Pessoa da prova", telefone: null },
      papel: "STAFF",
    });
    const resposta = await post(conta, "/v1/conta/excluir", { senha: FRASE_DA_PROVA, confirmacao: "EXCLUIR" });
    expect(resposta.status).toBe(204);
    const { rows } = await migrador.query(
      `SELECT revoked_at FROM app.store_members WHERE identity_id = $1`,
      [conta.id],
    );
    expect(rows[0]?.revoked_at).not.toBeNull();
  }, ESPERA_LONGA);

  it("sem sessão responde 401", async () => {
    const resposta = await request(app)
      .post("/v1/conta/excluir")
      .set("origin", ORIGEM)
      .send({ senha: "x", confirmacao: "EXCLUIR" });
    expect(resposta.status).toBe(401);
  });
});
