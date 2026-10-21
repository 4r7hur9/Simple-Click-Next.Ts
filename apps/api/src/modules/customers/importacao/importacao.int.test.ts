/**
 * Prova do importador de clientes (card #60) pela aplicação inteira, contra
 * PostgreSQL de verdade: prévia que não grava, confirmação em lote pelo
 * cadastro manual, repetidos (no arquivo e na loja) ignorados ou completados,
 * limite de clientes da loja, permissão e tetos do arquivo.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  esquemaDaPreviaDaImportacao,
  esquemaDoResultadoDaImportacao,
  TAMANHO_MAXIMO_DA_IMPORTACAO_EM_BYTES,
} from "@simpleclick/contracts";
import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarMembro,
} from "@simpleclick/testing";

import {
  aplicacaoDosClientes,
  ESPERA_DOS_CLIENTES,
  lojaComDono,
  ORIGEM_DO_PAINEL,
  Painel,
  type LojaComDono,
} from "../../../../tests/apoio-de-clientes.ts";
import { abrirAcessoDaAplicacao } from "../../../../tests/apoio-de-isolamento.ts";
import {
  comoPortador,
  tokenDeAcesso,
} from "../../../../tests/apoio-de-pedidos.ts";
import { criarApp } from "../../../app.ts";
import type { AcessoAoBanco } from "../../../core/db.ts";
import { papelDaContaNaLoja } from "../../../core/equipe-da-loja.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: ReturnType<typeof aplicacaoDosClientes>;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = aplicacaoDosClientes(acesso);
}, ESPERA_DOS_CLIENTES);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_DOS_CLIENTES);

function enviar(
  alvo: LojaComDono,
  passo: "previa" | "confirmar",
  arquivo: string | Buffer,
  {
    consulta = {},
    autorizacao = alvo.autorizacao,
  }: {
    consulta?: Record<string, string>;
    autorizacao?: string | null;
  } = {},
) {
  const pedido = request(app)
    .post(`/v1/lojas/${alvo.loja.apelido}/clientes/importacao/${passo}`)
    .query(consulta)
    .set("Origin", ORIGEM_DO_PAINEL)
    .set("Content-Type", "application/octet-stream");
  if (autorizacao !== null) pedido.set("Authorization", autorizacao);
  return pedido.send(
    typeof arquivo === "string" ? Buffer.from(arquivo, "utf-8") : arquivo,
  );
}

async function quantosClientes(alvo: LojaComDono): Promise<number> {
  const { rows } = await migrador.query<{ n: string }>(
    "SELECT count(*) AS n FROM app.store_customers WHERE store_id = $1 AND removed_at IS NULL",
    [alvo.loja.id],
  );
  return Number(rows[0]?.n ?? 0);
}

const PLANILHA = [
  "Nome completo;Celular;E-mail;Obs",
  "Ana Lead;(85) 98888-0001;ana.lead@exemplo.test;veio do Instagram",
  "Bruno Lead;85 98888-0002;;",
  "Telefone Ruim;123;;",
  "Ana Repetida;+55 85 98888-0001;;",
  "Cadastrada Antes;85988880009;;quer novidades",
].join("\r\n");

describe("prévia: lê, sugere e conta sem gravar", () => {
  let alvo: LojaComDono;

  beforeAll(async () => {
    alvo = await lojaComDono(migrador, { nome: "Importa Prévia" });
    const painel = new Painel(app, alvo);
    expect(
      (await painel.cadastrar({ nome: "Já Cliente", telefone: "85988880009" }))
        .status,
    ).toBe(201);
  }, ESPERA_DOS_CLIENTES);

  it("devolve colunas, mapeamento sugerido, primeiras linhas e a contagem prevista", async () => {
    const antes = await quantosClientes(alvo);
    const resposta = await enviar(alvo, "previa", PLANILHA, {
      consulta: { arquivo: "leads.csv" },
    });
    expect(resposta.status).toBe(200);
    const previa = esquemaDaPreviaDaImportacao.parse(resposta.body);

    expect(previa.arquivo).toMatchObject({
      formato: "csv",
      separador: ";",
      linhas: 5,
    });
    expect(previa.mapeamento).toMatchObject({
      nome: "Nome completo",
      telefone: "Celular",
      email: "E-mail",
      observacao: "Obs",
    });
    expect(previa.previsao).toEqual({
      total: 5,
      novos: 2,
      repetidos: 2,
      repetidosNaLoja: 1,
      repetidosNoArquivo: 1,
      invalidos: 1,
    });
    expect(previa.problemas).toEqual([
      expect.objectContaining({ linha: 4, campo: "telefone" }),
    ]);
    expect(previa.primeirasLinhas.map((l) => [l.linha, l.situacao])).toEqual([
      [2, "novo"],
      [3, "novo"],
      [4, "invalido"],
      [5, "repetido"],
      [6, "repetido"],
    ]);
    expect(await quantosClientes(alvo)).toBe(antes);
  });

  it("aceita o mapeamento manual (mapa.<campo>) e avisa o obrigatório sem coluna", async () => {
    const resposta = await enviar(alvo, "previa", PLANILHA, {
      consulta: { "mapa.telefone": "" },
    });
    const previa = esquemaDaPreviaDaImportacao.parse(resposta.body);
    expect(previa.mapeamento.telefone).toBeNull();
    expect(previa.previsao.invalidos).toBe(5);
    expect(previa.avisos.join(" ")).toMatch(/Telefone/);
  });

  it("JSON mandado como application/json também é lido", async () => {
    const resposta = await request(app)
      .post(`/v1/lojas/${alvo.loja.apelido}/clientes/importacao/previa`)
      .set("Origin", ORIGEM_DO_PAINEL)
      .set("Authorization", alvo.autorizacao)
      .send([{ nome: "Json Lead", whatsapp: "85988880100" }]);
    expect(resposta.status).toBe(200);
    expect(resposta.body.arquivo.formato).toBe("json");
    expect(resposta.body.previsao.novos).toBe(1);
  });
});

describe("confirmar: grava pelo cadastro, em lote", () => {
  let alvo: LojaComDono;
  let jaCliente: string;

  beforeAll(async () => {
    alvo = await lojaComDono(migrador, { nome: "Importa Confirma" });
    const criado = await new Painel(app, alvo).cadastrar({
      nome: "Cadastrada Antes",
      telefone: "85988880009",
    });
    jaCliente = criado.body.id as string;
  }, ESPERA_DOS_CLIENTES);

  it("cria os novos, ignora repetidos e devolve inválidos com linha, motivo e relatório", async () => {
    const resposta = await enviar(alvo, "confirmar", PLANILHA, {
      consulta: { arquivo: "leads.csv" },
    });
    expect(resposta.status).toBe(200);
    const resultado = esquemaDoResultadoDaImportacao.parse(resposta.body);

    expect(resultado.criados).toBe(2);
    expect(resultado.atualizados).toBe(0);
    expect(resultado.repetidos.map((r) => [r.linha, r.onde])).toEqual([
      [5, "arquivo"],
      [6, "loja"],
    ]);
    expect(resultado.repetidos[1]?.clienteId).toBe(jaCliente);
    expect(resultado.invalidos).toEqual([
      expect.objectContaining({ linha: 4, campo: "telefone" }),
    ]);
    expect(resultado.relatorio?.nomeDoArquivo).toBe("leads-erros.csv");
    expect(resultado.relatorio?.csv).toContain("4;inválido;");
    expect(await quantosClientes(alvo)).toBe(3);

    // Igual ao cadastro manual: telefone normalizado, e-mail sem caixa.
    const { rows } = await migrador.query<{
      phone_e164: string;
      email: string | null;
      notes: string | null;
    }>(
      "SELECT phone_e164, email, notes FROM app.store_customers WHERE store_id = $1 AND display_name = 'Ana Lead'",
      [alvo.loja.id],
    );
    expect(rows).toEqual([
      {
        phone_e164: "+5585988880001",
        email: "ana.lead@exemplo.test",
        notes: "veio do Instagram",
      },
    ]);

    // A ficha de quem já era cliente não mudou.
    const { rows: antiga } = await migrador.query<{ notes: string | null }>(
      "SELECT notes FROM app.store_customers WHERE id = $1",
      [jaCliente],
    );
    expect(antiga[0]?.notes).toBeNull();

    // Uma linha na trilha, sem dado pessoal.
    const { rows: trilha } = await migrador.query<{
      action: string;
      after_data: Record<string, unknown>;
    }>(
      "SELECT action, after_data FROM app.audit_log WHERE store_id = $1 AND action = 'CLIENTES_IMPORTADOS'",
      [alvo.loja.id],
    );
    expect(trilha).toHaveLength(1);
    expect(trilha[0]?.after_data).toMatchObject({
      criados: 2,
      invalidos: 1,
      repetidos: 2,
    });
    expect(JSON.stringify(trilha[0]?.after_data)).not.toContain("Ana");
  });

  it("de novo, o mesmo arquivo não duplica ninguém", async () => {
    const resultado = esquemaDoResultadoDaImportacao.parse(
      (await enviar(alvo, "confirmar", PLANILHA)).body,
    );
    expect(resultado.criados).toBe(0);
    expect(resultado.repetidos).toHaveLength(4);
    expect(await quantosClientes(alvo)).toBe(3);
  });

  it("'completar' preenche só os campos vazios de quem já é cliente", async () => {
    const resultado = esquemaDoResultadoDaImportacao.parse(
      (
        await enviar(alvo, "confirmar", PLANILHA, {
          consulta: { repetidos: "completar" },
        })
      ).body,
    );
    expect(resultado.repetidosComo).toBe("completar");
    expect(resultado.atualizados).toBe(1);
    const { rows } = await migrador.query<{
      display_name: string;
      notes: string | null;
    }>("SELECT display_name, notes FROM app.store_customers WHERE id = $1", [
      jaCliente,
    ]);
    expect(rows[0]).toEqual({
      display_name: "Cadastrada Antes",
      notes: "quer novidades",
    });
  });

  it("o relatório baixa como CSV", async () => {
    const resposta = await request(app)
      .post(`/v1/lojas/${alvo.loja.apelido}/clientes/importacao/relatorio`)
      .query({ arquivo: "leads.csv" })
      .set("Origin", ORIGEM_DO_PAINEL)
      .set("Authorization", alvo.autorizacao)
      .send({
        linhas: [
          {
            linha: 4,
            situacao: "invalido",
            motivo: "Telefone curto.",
            nome: "X",
            telefone: "123",
            email: null,
          },
        ],
      });
    expect(resposta.status).toBe(200);
    expect(resposta.headers["content-type"]).toMatch(/text\/csv/);
    expect(resposta.headers["content-disposition"]).toContain(
      "leads-erros.csv",
    );
    expect(resposta.text).toContain("4;inválido;Telefone curto.;X;123;");
  });
});

describe("limite de clientes da loja", () => {
  it(
    "quem não cabe fica de fora, com a linha no relatório; a prévia avisa antes",
    async () => {
      const alvo = await lojaComDono(migrador, { nome: "Importa Limite" });
      await migrador.query(
        "INSERT INTO app.store_limits (store_id, max_customers) VALUES ($1, 2)",
        [alvo.loja.id],
      );
      const arquivo = [
        "nome,telefone",
        "Um,85988881001",
        "Dois,85988881002",
        "Três,85988881003",
        "Quatro,85988881004",
      ].join("\n");

      const previa = esquemaDaPreviaDaImportacao.parse(
        (await enviar(alvo, "previa", arquivo)).body,
      );
      expect(previa.limite).toEqual({
        limite: 2,
        uso: 0,
        restante: 2,
        excedentes: 2,
      });
      expect(previa.avisos.join(" ")).toMatch(/ficariam de fora/);

      const resultado = esquemaDoResultadoDaImportacao.parse(
        (await enviar(alvo, "confirmar", arquivo)).body,
      );
      expect(resultado.criados).toBe(2);
      expect(resultado.foraDoLimite).toEqual([4, 5]);
      expect(
        resultado.relatorio?.linhas.filter(
          (l) => l.situacao === "fora_do_limite",
        ),
      ).toHaveLength(2);
      expect(await quantosClientes(alvo)).toBe(2);
    },
    ESPERA_DOS_CLIENTES,
  );
});

describe("permissão e tetos", () => {
  let alvo: LojaComDono;

  beforeAll(async () => {
    alvo = await lojaComDono(migrador, { nome: "Importa Portão" });
  }, ESPERA_DOS_CLIENTES);

  it("sem sessão: 401, sem ler o arquivo", async () => {
    const resposta = await enviar(alvo, "previa", PLANILHA, {
      autorizacao: null,
    });
    expect(resposta.status).toBe(401);
  });

  it("a equipe (permissão de clientes) importa, entrando com a sessão de cliente", async () => {
    const equipe = await criarMembro({ loja: alvo.loja, papel: "STAFF" });
    // O portão pergunta o papel da conta NESTA loja ao banco do arquivo.
    const comPortao = criarApp({
      origens: [ORIGEM_DO_PAINEL],
      clientes: { acesso },
      portaoDaEquipe: {
        papelNaLoja: (identidadeId, apelido) =>
          papelDaContaNaLoja(identidadeId, apelido, acesso),
      },
    });
    const resposta = await request(comPortao)
      .post(`/v1/lojas/${alvo.loja.apelido}/clientes/importacao/previa`)
      .set("Origin", ORIGEM_DO_PAINEL)
      .set(
        "Authorization",
        comoPortador(tokenDeAcesso(equipe.identidade.id, "CUSTOMER")),
      )
      .set("Content-Type", "text/csv")
      .send(PLANILHA);
    expect(resposta.status).toBe(200);
    expect(resposta.body.previsao.novos).toBe(3);
  });

  it("dono de outra loja não alcança esta", async () => {
    const outra = await lojaComDono(migrador, { nome: "Importa Vizinha" });
    const resposta = await enviar(alvo, "confirmar", PLANILHA, {
      autorizacao: outra.autorizacao,
    });
    expect([401, 403, 404]).toContain(resposta.status);
    expect(await quantosClientes(alvo)).toBe(0);
  });

  it("arquivo gigante: 413 arquivo_grande_demais", async () => {
    const gigante = Buffer.alloc(
      TAMANHO_MAXIMO_DA_IMPORTACAO_EM_BYTES + 10,
      0x61,
    );
    const resposta = await enviar(alvo, "previa", gigante);
    expect(resposta.status).toBe(413);
    expect(resposta.body.erro).toBe("arquivo_grande_demais");
  });

  it("linhas demais: 413 linhas_demais", async () => {
    const linhas = Array.from(
      { length: 5001 },
      (_, i) => `P${i},8598${String(i).padStart(7, "0")}`,
    );
    const resposta = await enviar(
      alvo,
      "previa",
      `nome,telefone\n${linhas.join("\n")}`,
    );
    expect(resposta.status).toBe(413);
    expect(resposta.body.erro).toBe("linhas_demais");
  });

  it(".xls antigo: 415 com orientação", async () => {
    const resposta = await enviar(
      alvo,
      "previa",
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3]),
      {
        consulta: { arquivo: "velho.xls" },
      },
    );
    expect(resposta.status).toBe(415);
    expect(resposta.body.mensagem).toMatch(/xlsx/);
  });
});
