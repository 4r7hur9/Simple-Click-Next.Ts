/**
 * Card #25 — a equipe da loja e a matriz de permissões por papel.
 *
 * Pela API inteira, sobre o banco do arquivo:
 *
 * - o dono cadastra a equipe (conta nova com senha, ou conta que já existe),
 *   respeitando o limite (1 por padrão), desativa, reativa, remove e troca a
 *   senha só de quem a loja cadastrou;
 * - a equipe (STAFF) entra no painel com a sessão de cliente — o papel vem do
 *   vínculo — e faz catálogo, pedidos, clientes e métricas, mas recebe 403 em
 *   configurações, equipe, feed e personalização;
 * - quem é administração E dono (sessão ADMIN) também entra no painel;
 * - `GET /v1/eu` devolve as permissões efetivas de cada loja.
 */

import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  MATRIZ_DE_PERMISSOES,
  PERMISSOES_DA_PLATAFORMA,
} from "@simpleclick/contracts";
import {
  conectarNoBancoDoArquivo,
  criarAdministradorDaPlataforma,
  criarIdentidade,
  criarLoja,
  criarMembro,
  type LojaDeTeste,
} from "@simpleclick/testing";

import { ESPERA_DA_ADMINISTRACAO } from "./apoio-da-administracao.ts";
import {
  cliente,
  montarApiCompleta,
  sessao,
  type ApiCompleta,
} from "./apoio-da-fundacao.ts";

let api: ApiCompleta;
let http: ReturnType<typeof cliente>;
let migrador: pg.Client;
let loja: LojaDeTeste;

const painel = (resto: string) => `/v1/lojas/${loja.apelido}${resto}`;
const comoDono = () => sessao(loja.dono.id, "OWNER");

let membroId = "";
let equipeId = "";
let categoriaId = "";

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  api = montarApiCompleta();
  http = cliente(api);
  loja = await criarLoja({ nome: "Empório do Bruno" });
}, ESPERA_DA_ADMINISTRACAO);

afterAll(async () => {
  await api?.encerrar();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

describe("o dono cadastra a equipe, respeitando o limite", () => {
  it(
    "conta nova pede senha; com senha nasce gerenciada; a segunda pessoa passa do limite",
    async () => {
      const vazia = await http.get(painel("/equipe"), comoDono());
      expect(vazia.status).toBe(200);
      expect(vazia.body.limite).toEqual({ limite: 1, uso: 0 });
      expect(vazia.body.membros).toEqual([
        expect.objectContaining({ papel: "OWNER", ativo: true }),
      ]);

      const semSenha = await http.post(
        painel("/equipe"),
        { nome: "Jonas Caixa", email: "jonas.caixa@exemplo.test" },
        comoDono(),
      );
      expect(semSenha.status).toBe(422);
      expect(semSenha.body.erro).toBe("senha_obrigatoria");

      const fraca = await http.post(
        painel("/equipe"),
        {
          nome: "Jonas Caixa",
          email: "jonas.caixa@exemplo.test",
          senha: "12345678",
        },
        comoDono(),
      );
      expect(fraca.status).toBe(422);
      expect(fraca.body.erro).toBe("senha_fraca");

      const criada = await http.post(
        painel("/equipe"),
        {
          nome: "Jonas Caixa",
          email: "Jonas.Caixa@exemplo.test",
          senha: "CaixaDoEmporio#1",
        },
        comoDono(),
      );
      expect(criada.status).toBe(201);
      expect(criada.body).toMatchObject({
        contaCriada: true,
        membro: {
          nome: "Jonas Caixa",
          email: "jonas.caixa@exemplo.test",
          papel: "STAFF",
          ativo: true,
          contaGerenciada: true,
        },
      });
      membroId = String(criada.body.membro.id);
      const { rows } = await migrador.query<{ identity_id: string }>(
        `SELECT identity_id::text AS identity_id FROM app.store_members WHERE id = $1`,
        [membroId],
      );
      equipeId = rows[0]!.identity_id;

      const repetida = await http.post(
        painel("/equipe"),
        { nome: "Jonas", email: "jonas.caixa@exemplo.test" },
        comoDono(),
      );
      expect(repetida.status).toBe(409);
      expect(repetida.body.erro).toBe("ja_e_membro");

      const segunda = await http.post(
        painel("/equipe"),
        {
          nome: "Lia",
          email: "lia.balcao@exemplo.test",
          senha: "BalcaoDaLia#22",
        },
        comoDono(),
      );
      expect(segunda.status).toBe(409);
      expect(segunda.body).toMatchObject({
        erro: "limite_atingido",
        recurso: "staff",
        limite: 1,
        uso: 1,
      });

      const trilha = await migrador.query(
        `SELECT action FROM app.audit_log WHERE store_id = $1 AND action LIKE 'EQUIPE_%'`,
        [loja.id],
      );
      expect(trilha.rows).toEqual([{ action: "EQUIPE_ADICIONADA" }]);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

describe("a equipe entra no painel com o que a matriz permite", () => {
  it(
    "catálogo, pedidos, clientes, métricas e limites: sim",
    async () => {
      const comoEquipe = sessao(equipeId, "CUSTOMER");
      const criada = await http.post(
        painel("/catalogo/categorias"),
        { nome: "Bebidas", descricao: null, visivel: true },
        comoEquipe,
      );
      expect(criada.status).toBe(201);
      categoriaId = String(criada.body.id);

      const produto = await http.post(
        painel("/catalogo/produtos"),
        {
          nome: "Suco de laranja",
          descricao: null,
          categoriaId,
          precoCentavos: 800,
          status: "PUBLISHED",
          disponivel: true,
        },
        comoEquipe,
      );
      expect(produto.status).toBe(201);
      expect(produto.body.publicarNoFeed).toBe(false);

      for (const rota of [
        "/catalogo/produtos",
        "/pedidos",
        "/clientes",
        "/limites",
        "/situacao",
      ]) {
        const lida = await http.get(painel(rota), comoEquipe);
        expect([rota, lida.status]).toEqual([rota, 200]);
      }
      const metricas = await http.get(painel("/metricas"), comoEquipe);
      expect(metricas.status).not.toBe(403);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it("configurações, equipe, feed, personalização e a marca do feed: 403 com a permissão", async () => {
    const comoEquipe = sessao(equipeId, "CUSTOMER");
    const casos: [string, string, string][] = [
      ["get", "/configuracao/contato", "configuracoes"],
      ["get", "/configuracao/pendencias", "configuracoes"],
      ["get", "/equipe", "equipe"],
      ["get", "/feed", "feed"],
      ["put", "/tema", "personalizacao"],
    ];
    for (const [metodo, rota, permissao] of casos) {
      const resposta =
        metodo === "get"
          ? await http.get(painel(rota), comoEquipe)
          : await http.put(
              painel(rota),
              { corDestaque: "#000000" },
              comoEquipe,
            );
      expect([rota, resposta.status, resposta.body.permissao]).toEqual([
        rota,
        403,
        permissao,
      ]);
    }

    const comMarca = await http.post(
      painel("/catalogo/produtos"),
      {
        nome: "Suco de uva",
        descricao: null,
        categoriaId,
        precoCentavos: 900,
        status: "PUBLISHED",
        disponivel: true,
        publicarNoFeed: true,
      },
      comoEquipe,
    );
    expect(comMarca.status).toBe(403);
    expect(comMarca.body).toMatchObject({
      erro: "sem_permissao",
      permissao: "feed",
    });

    // O dono pode tudo isso.
    expect((await http.get(painel("/feed"), comoDono())).status).toBe(200);
    expect(
      (await http.get(painel("/configuracao/contato"), comoDono())).status,
    ).toBe(200);
  });

  it("GET /v1/eu devolve as permissões efetivas de cada loja", async () => {
    const daEquipe = await http.get("/v1/eu", sessao(equipeId, "CUSTOMER"));
    expect(daEquipe.status).toBe(200);
    expect(daEquipe.body.papelEfetivo).toBe("EQUIPE");
    expect(daEquipe.body.lojasDaConta).toEqual([
      expect.objectContaining({
        apelido: loja.apelido,
        papel: "STAFF",
        permissoes: [...MATRIZ_DE_PERMISSOES.STAFF],
      }),
    ]);
    expect(daEquipe.body.permissoesDaPlataforma).toEqual([]);

    const doDono = await http.get("/v1/eu", comoDono());
    expect(doDono.body.lojasDaConta[0].permissoes).toEqual([
      ...MATRIZ_DE_PERMISSOES.OWNER,
    ]);
  });

  it(
    "administração que também é dona entra no painel com a sessão ADMIN",
    async () => {
      const admin = await criarAdministradorDaPlataforma();
      await criarMembro({ loja, identidade: admin, papel: "OWNER" });
      const comoAdmin = sessao(admin.id, "ADMIN");
      expect(
        (await http.get(painel("/catalogo/categorias"), comoAdmin)).status,
      ).toBe(200);
      const eu = await http.get("/v1/eu", comoAdmin);
      expect(eu.body.permissoesDaPlataforma).toEqual([
        ...PERMISSOES_DA_PLATAFORMA,
      ]);
      // Cliente sem vínculo continua de fora.
      const estranho = await criarIdentidade();
      expect(
        (
          await http.get(
            painel("/catalogo/categorias"),
            sessao(estranho.id, "CUSTOMER"),
          )
        ).status,
      ).toBe(401);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

describe("desativar, reativar, trocar a senha e remover", () => {
  it(
    "desativada, a equipe perde o painel; reativar respeita o limite",
    async () => {
      const desativada = await http.patch(
        painel(`/equipe/${membroId}`),
        { ativo: false },
        comoDono(),
      );
      expect(desativada.status).toBe(200);
      expect(desativada.body.membro.ativo).toBe(false);
      expect(
        (
          await http.get(
            painel("/catalogo/categorias"),
            sessao(equipeId, "CUSTOMER"),
          )
        ).status,
      ).toBe(401);

      const reativada = await http.patch(
        painel(`/equipe/${membroId}`),
        { ativo: true },
        comoDono(),
      );
      expect(reativada.body.membro.ativo).toBe(true);
      expect(
        (
          await http.get(
            painel("/catalogo/categorias"),
            sessao(equipeId, "CUSTOMER"),
          )
        ).status,
      ).toBe(200);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "troca a senha de quem a loja cadastrou, e derruba as sessões da pessoa",
    async () => {
      const trocada = await http.put(
        painel(`/equipe/${membroId}/senha`),
        { senha: "NovaSenhaDoCaixa#9" },
        comoDono(),
      );
      expect(trocada.status).toBe(204);
      const { rows } = await migrador.query<{ hash: string }>(
        `SELECT password_hash AS hash FROM app.identities WHERE id = $1`,
        [equipeId],
      );
      expect(rows[0]?.hash.startsWith("argon2id$")).toBe(true);

      // A equipe não troca senha de ninguém.
      expect(
        (
          await http.put(
            painel(`/equipe/${membroId}/senha`),
            { senha: "OutraSenha#123" },
            sessao(equipeId, "CUSTOMER"),
          )
        ).status,
      ).toBe(403);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "remove; o dono não sai; conta que já existe entra sem senha e não é gerenciada",
    async () => {
      const donoNaLista = (
        await http.get(painel("/equipe"), comoDono())
      ).body.membros.find(
        (membro: { papel: string }) => membro.papel === "OWNER",
      );
      const donoSai = await http.delete(
        painel(`/equipe/${donoNaLista.id}`),
        comoDono(),
      );
      expect(donoSai.status).toBe(409);
      expect(donoSai.body.erro).toBe("dono_nao_sai");

      expect(
        (await http.delete(painel(`/equipe/${membroId}`), comoDono())).status,
      ).toBe(204);

      const existente = await criarIdentidade({
        email: "cliente.antiga@exemplo.test",
      });
      const entrou = await http.post(
        painel("/equipe"),
        { nome: "Cliente Antiga", email: existente.email },
        comoDono(),
      );
      expect(entrou.status).toBe(201);
      expect(entrou.body).toMatchObject({
        contaCriada: false,
        membro: { contaGerenciada: false, papel: "STAFF" },
      });
      const senha = await http.put(
        painel(`/equipe/${String(entrou.body.membro.id)}/senha`),
        { senha: "NaoPodeTrocar#1" },
        comoDono(),
      );
      expect(senha.status).toBe(409);
      expect(senha.body.erro).toBe("senha_nao_gerenciada");
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});
