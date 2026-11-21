/**
 * Card #25 — aprovação de loja, loja aberta pelo lojista e limites.
 *
 * Pela API inteira (portão da equipe incluído), sobre o banco do arquivo:
 *
 * - a loja que o lojista abre nasce AGUARDANDO APROVAÇÃO, fora da vitrine, e
 *   o painel já funciona para ele montar o cardápio;
 * - a administração aprova, recusa (com motivo), desativa e ativa, cada ato na
 *   trilha, e transição que não existe é 409;
 * - os limites (lojas por dono, categorias e produtos por loja) barram com
 *   409 `limite_atingido {recurso, limite, uso}`, e só a administração os
 *   ajusta.
 */

import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  conectarNoBancoDoArquivo,
  criarAdministradorDaPlataforma,
  type IdentidadeDeTeste,
} from "@simpleclick/testing";

import { ESPERA_DA_ADMINISTRACAO } from "./apoio-da-administracao.ts";
import { esquemaPublicadoDaResposta } from "./apoio-do-contrato.ts";
import {
  cliente,
  montarApiCompleta,
  sessao,
  type ApiCompleta,
} from "./apoio-da-fundacao.ts";

let api: ApiCompleta;
let http: ReturnType<typeof cliente>;
let migrador: pg.Client;
let admin: IdentidadeDeTeste;

/** O lojista: conta criada pelo cadastro de verdade, que já abre a sessão. */
let lojista: { id: string; token: string };

const comoAdmin = () => sessao(admin.id, "ADMIN");
const comoLojista = () => ({ authorization: `Bearer ${lojista.token}` });

async function idDaLoja(apelido: string): Promise<string> {
  const { rows } = await migrador.query<{ id: string }>(
    `SELECT id::text AS id FROM app.stores WHERE slug = $1`,
    [apelido],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`loja ${apelido} não existe`);
  return id;
}

async function abrirLoja(nome: string, extra: object = {}) {
  return http.post(
    "/v1/auth/lojas",
    {
      nome,
      tipoDeNegocio: "FOOD_SNACK",
      aceitouTermosDoLojista: true,
      ...extra,
    },
    comoLojista(),
  );
}

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  api = montarApiCompleta();
  http = cliente(api);
  admin = await criarAdministradorDaPlataforma();
  const cadastro = await http.post("/v1/auth/cadastro", {
    nome: "Ana Lojista",
    email: "ana.lojista@exemplo.test",
    senha: "PastelDaAna#2026",
    aceitouTermos: true,
  });
  if (cadastro.status !== 201) {
    throw new Error(
      `cadastro falhou: ${cadastro.status} ${JSON.stringify(cadastro.body)}`,
    );
  }
  const { rows } = await migrador.query<{ id: string }>(
    `SELECT id::text AS id FROM app.identities WHERE email_norm = 'ana.lojista@exemplo.test'`,
  );
  lojista = { id: rows[0]!.id, token: String(cadastro.body.tokenDeAcesso) };
}, ESPERA_DA_ADMINISTRACAO);

afterAll(async () => {
  await api?.encerrar();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

describe("a loja aberta pelo lojista nasce aguardando aprovação", () => {
  it(
    "cria a loja PENDING_APPROVAL, devolve a sessão nova de dono e não aparece na vitrine",
    async () => {
      const resposta = await abrirLoja("Pastel da Ana");
      expect(resposta.status).toBe(201);
      expect(resposta.body).toMatchObject({
        status: "SESSAO_CRIADA",
        papel: "OWNER",
        loja: { apelido: "pastel-da-ana", status: "PENDING_APPROVAL" },
      });
      expect(typeof resposta.body.tokenDeAcesso).toBe("string");
      lojista.token = String(resposta.body.tokenDeAcesso);

      // Fora da vitrine e do feed até a aprovação.
      expect((await http.get("/v1/vitrine/pastel-da-ana")).status).toBe(404);
      const feed = await http.get("/v1/feed/lojas");
      expect(
        feed.body.lojas.map((l: { apelido: string }) => l.apelido),
      ).not.toContain("pastel-da-ana");

      // O painel mostra "aguardando aprovação" e já deixa montar o cardápio.
      const situacao = await http.get(
        "/v1/lojas/pastel-da-ana/situacao",
        comoLojista(),
      );
      expect(situacao.status).toBe(200);
      expect(situacao.body).toMatchObject({
        status: "PENDING_APPROVAL",
        aguardandoAprovacao: true,
      });
      const categoria = await http.post(
        "/v1/lojas/pastel-da-ana/catalogo/categorias",
        { nome: "Pastéis", descricao: null, visivel: true },
        comoLojista(),
      );
      expect(categoria.status).toBe(201);

      // A trilha guarda quem abriu a loja.
      const { rows } = await migrador.query<{
        action: string;
        actor_id: string;
      }>(
        `SELECT action, actor_id::text AS actor_id FROM app.audit_log
          WHERE store_id = $1 AND action = 'LOJA_SOLICITADA'`,
        [await idDaLoja("pastel-da-ana")],
      );
      expect(rows).toEqual([
        { action: "LOJA_SOLICITADA", actor_id: lojista.id },
      ]);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it("sem sessão é 401; apelido escolhido que já existe é 409 com sugestão", async () => {
    expect(
      (
        await http.post("/v1/auth/lojas", {
          nome: "X",
          tipoDeNegocio: "FOOD_SNACK",
        })
      ).status,
    ).toBe(401);
    const repetido = await abrirLoja("Outro Pastel", {
      apelido: "pastel-da-ana",
    });
    expect(repetido.status).toBe(409);
    expect(repetido.body).toMatchObject({
      erro: "apelido_em_uso",
      sugestao: "pastel-da-ana-2",
    });
    const tipo = await abrirLoja("Outro Pastel", {
      tipoDeNegocio: "NAO_EXISTE",
    });
    expect(tipo.status).toBe(400);
    // [CA-1] (card #137) o 400 escrito à mão passa pelo esquema publicado no
    // contrato: o cliente nativo gerado dele consegue ler esta recusa.
    expect(tipo.body.erro).toBe("tipo_desconhecido");
    const publicado = esquemaPublicadoDaResposta("/v1/auth/lojas", "post", 400);
    expect(publicado.safeParse(tipo.body).success).toBe(true);
  });
});

describe("a administração aprova, recusa, desativa e ativa", () => {
  it(
    "lista por status, aprova (a vitrine entra no ar) e recusa transição que não existe",
    async () => {
      const lojaId = await idDaLoja("pastel-da-ana");
      const pendentes = await http.get(
        "/v1/admin/lojas?situacao=PENDING_APPROVAL",
        comoAdmin(),
      );
      expect(pendentes.status).toBe(200);
      expect(JSON.stringify(pendentes.body)).toContain("pastel-da-ana");

      // Dono não aprova a própria loja.
      expect(
        (
          await http.post(
            `/v1/admin/lojas/${lojaId}/aprovar`,
            {},
            comoLojista(),
          )
        ).status,
      ).toBe(403);

      const aprovada = await http.post(
        `/v1/admin/lojas/${lojaId}/aprovar`,
        {},
        comoAdmin(),
      );
      expect(aprovada.status).toBe(200);
      expect(aprovada.body.status).toBe("ACTIVE");
      expect(aprovada.body.aprovadaEm).not.toBeNull();
      expect(aprovada.body.historico[0].acao).toBe("LOJA_APROVADA");
      expect(aprovada.body.donos).toEqual([
        expect.objectContaining({
          identidadeId: lojista.id,
          conviteAceito: true,
        }),
      ]);
      expect((await http.get("/v1/vitrine/pastel-da-ana")).status).toBe(200);

      // Repetir não muda nada; recusar loja ativa não existe.
      expect(
        (await http.post(`/v1/admin/lojas/${lojaId}/aprovar`, {}, comoAdmin()))
          .status,
      ).toBe(200);
      const invalida = await http.post(
        `/v1/admin/lojas/${lojaId}/recusar`,
        { motivo: "Documento ilegível" },
        comoAdmin(),
      );
      expect(invalida.status).toBe(409);
      expect(invalida.body).toMatchObject({
        erro: "transicao_invalida",
        status: "ACTIVE",
      });
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "desativa (sai da vitrine, o dono lê o motivo) e ativa de volta",
    async () => {
      const lojaId = await idDaLoja("pastel-da-ana");
      const desativada = await http.post(
        `/v1/admin/lojas/${lojaId}/desativar`,
        { motivo: "Mensalidade em atraso" },
        comoAdmin(),
      );
      expect(desativada.status).toBe(200);
      expect(desativada.body.status).toBe("INACTIVE");
      expect(desativada.body.suspensao.motivo).toBe("Mensalidade em atraso");
      expect((await http.get("/v1/vitrine/pastel-da-ana")).status).toBe(404);

      const situacao = await http.get(
        "/v1/lojas/pastel-da-ana/situacao",
        comoLojista(),
      );
      expect(situacao.body).toMatchObject({
        status: "INACTIVE",
        suspensao: { motivo: "Mensalidade em atraso" },
      });
      // Desativada, o painel não abre (só a situação responde).
      expect(
        (
          await http.get(
            "/v1/lojas/pastel-da-ana/catalogo/categorias",
            comoLojista(),
          )
        ).status,
      ).toBe(404);

      const ativada = await http.post(
        `/v1/admin/lojas/${lojaId}/ativar`,
        {},
        comoAdmin(),
      );
      expect(ativada.status).toBe(200);
      expect(ativada.body.status).toBe("ACTIVE");
      expect(ativada.body.historico[0].acao).toBe("LOJA_ATIVADA");
      expect((await http.get("/v1/vitrine/pastel-da-ana")).status).toBe(200);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "recusa com motivo (o dono lê), e a recusada pode ser aprovada depois",
    async () => {
      const segunda = await abrirLoja("Açaí da Ana");
      expect(segunda.status).toBe(201);
      lojista.token = String(segunda.body.tokenDeAcesso);
      const lojaId = await idDaLoja("acai-da-ana");

      const semMotivo = await http.post(
        `/v1/admin/lojas/${lojaId}/recusar`,
        {},
        comoAdmin(),
      );
      expect(semMotivo.status).toBe(400);

      const recusada = await http.post(
        `/v1/admin/lojas/${lojaId}/recusar`,
        { motivo: "Faltou o documento do responsável" },
        comoAdmin(),
      );
      expect(recusada.status).toBe(200);
      expect(recusada.body.status).toBe("REJECTED");
      expect(recusada.body.recusa.motivo).toBe(
        "Faltou o documento do responsável",
      );

      const situacao = await http.get(
        "/v1/lojas/acai-da-ana/situacao",
        comoLojista(),
      );
      expect(situacao.body).toMatchObject({
        status: "REJECTED",
        recusa: { motivo: "Faltou o documento do responsável" },
      });

      const reconsiderada = await http.post(
        `/v1/admin/lojas/${lojaId}/aprovar`,
        {},
        comoAdmin(),
      );
      expect(reconsiderada.body.status).toBe("ACTIVE");
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

describe("limites controlados pela administração", () => {
  it(
    "o dono abre no máximo 2 lojas (padrão); a administração ajusta o limite dele",
    async () => {
      // Pastel e Açaí já ocupam as duas vagas.
      const terceira = await abrirLoja("Bolo da Ana");
      expect(terceira.status).toBe(409);
      expect(terceira.body).toMatchObject({
        erro: "limite_atingido",
        recurso: "lojas",
        limite: 2,
        uso: 2,
      });

      const lido = await http.get(
        `/v1/admin/donos/${lojista.id}/limites`,
        comoAdmin(),
      );
      expect(lido.body).toMatchObject({
        limite: { recurso: "lojas", limite: 2, uso: 2, restante: 0 },
        ajuste: null,
      });
      const ajustado = await http.patch(
        `/v1/admin/donos/${lojista.id}/limites`,
        { lojas: 3 },
        comoAdmin(),
      );
      expect(ajustado.body).toMatchObject({ limite: { limite: 3 }, ajuste: 3 });
      const agora = await abrirLoja("Bolo da Ana");
      expect(agora.status).toBe(201);
      lojista.token = String(agora.body.tokenDeAcesso);

      // O dono não ajusta o próprio limite.
      expect(
        (
          await http.patch(
            `/v1/admin/donos/${lojista.id}/limites`,
            { lojas: 9 },
            comoLojista(),
          )
        ).status,
      ).toBe(403);
      const trilha = await migrador.query(
        `SELECT action FROM app.audit_platform WHERE entity_id = $1`,
        [lojista.id],
      );
      expect(trilha.rows).toEqual([{ action: "LIMITE_DO_DONO_ALTERADO" }]);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "categorias e produtos por loja: passou do limite, 409 com recurso, limite e uso",
    async () => {
      const lojaId = await idDaLoja("pastel-da-ana");
      const ajuste = await http.patch(
        `/v1/admin/lojas/${lojaId}/limites`,
        { categorias: 1, produtos: 1 },
        comoAdmin(),
      );
      expect(ajuste.status).toBe(200);
      expect(ajuste.body.ajustes).toEqual({
        staff: null,
        produtos: 1,
        categorias: 1,
        clientes: null,
      });

      const usoDoDono = await http.get(
        "/v1/lojas/pastel-da-ana/limites",
        comoLojista(),
      );
      expect(usoDoDono.status).toBe(200);
      expect(usoDoDono.body.limites).toEqual(
        expect.arrayContaining([
          { recurso: "categorias", limite: 1, uso: 1, restante: 0 },
          { recurso: "produtos", limite: 1, uso: 0, restante: 1 },
          { recurso: "staff", limite: 1, uso: 0, restante: 1 },
          { recurso: "clientes", limite: 5000, uso: 0, restante: 5000 },
        ]),
      );

      const categoria = await http.post(
        "/v1/lojas/pastel-da-ana/catalogo/categorias",
        { nome: "Doces", descricao: null, visivel: true },
        comoLojista(),
      );
      expect(categoria.status).toBe(409);
      expect(categoria.body).toMatchObject({
        erro: "limite_atingido",
        recurso: "categorias",
        limite: 1,
        uso: 1,
      });

      const categorias = await http.get(
        "/v1/lojas/pastel-da-ana/catalogo/categorias",
        comoLojista(),
      );
      const categoriaId = String(categorias.body.categorias[0].id);
      const produto = (nome: string) =>
        http.post(
          "/v1/lojas/pastel-da-ana/catalogo/produtos",
          {
            nome,
            descricao: null,
            categoriaId,
            precoCentavos: 900,
            status: "PUBLISHED",
            disponivel: true,
          },
          comoLojista(),
        );
      expect((await produto("Pastel de carne")).status).toBe(201);
      const alem = await produto("Pastel de queijo");
      expect(alem.status).toBe(409);
      expect(alem.body).toMatchObject({
        recurso: "produtos",
        limite: 1,
        uso: 1,
      });

      // `null` volta ao padrão.
      const volta = await http.patch(
        `/v1/admin/lojas/${lojaId}/limites`,
        { produtos: null },
        comoAdmin(),
      );
      expect(volta.body.ajustes.produtos).toBeNull();
      expect((await produto("Pastel de queijo")).status).toBe(201);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it("os padrões da plataforma são da administração e vão para a trilha", async () => {
    const lidos = await http.get("/v1/admin/limites", comoAdmin());
    expect(lidos.body).toEqual({
      lojasPorDono: 2,
      staffPorLoja: 1,
      produtosPorLoja: 500,
      categoriasPorLoja: 50,
      clientesPorLoja: 5000,
    });
    const mudados = await http.patch(
      "/v1/admin/limites",
      { staffPorLoja: 3 },
      comoAdmin(),
    );
    expect(mudados.body.staffPorLoja).toBe(3);
    expect(
      (await http.patch("/v1/admin/limites", { staffPorLoja: -1 }, comoAdmin()))
        .status,
    ).toBe(400);
    expect((await http.get("/v1/admin/limites", comoLojista())).status).toBe(
      403,
    );
    const trilha = await migrador.query(
      `SELECT action, after_data->>'staffPorLoja' AS staff FROM app.audit_platform
        WHERE action = 'LIMITES_PADRAO_ALTERADOS'`,
    );
    expect(trilha.rows).toEqual([
      { action: "LIMITES_PADRAO_ALTERADOS", staff: "3" },
    ]);
    await http.patch("/v1/admin/limites", { staffPorLoja: 1 }, comoAdmin());
  });
});
