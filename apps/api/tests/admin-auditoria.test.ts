/**
 * Histórico de auditoria consultável pela API de verdade (AC-215, AC-118).
 *
 * As lojas entram pelo cadastro da administração (T-200), o que já deixa um
 * `LOJA_CRIADA` de cada uma na trilha. Os demais atos — a troca da chave PIX,
 * uma edição antiga, um registro gravado fora da regra com e-mail em claro —
 * entram direto pelo banco, com data marcada, porque o que se prova aqui é a
 * LEITURA: filtros, página, destaque, máscara e a trilha que não muda.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  esquemaDaPaginaDaAuditoria,
  type NovaLojaEnviada,
} from "@simpleclick/contracts";
import {
  conectarNoBancoDoArquivo,
  criarAdministradorDaPlataforma,
  criarIdentidade,
  type IdentidadeDeTeste,
} from "@simpleclick/testing";

import {
  comoPapel,
  ESPERA_DA_ADMINISTRACAO,
  montarApiDaAdministracao,
  type ApiDaAdministracao,
} from "./apoio-da-administracao.ts";

let migrador: pg.Client;
let api: ApiDaAdministracao;
let administradora: IdentidadeDeTeste;
let pastel: string;
let acai: string;

function cadastro(
  nome: string,
  documento: string,
  apelido: string,
): NovaLojaEnviada {
  return {
    nome,
    razaoSocial: null,
    documento,
    responsavel: {
      nome: `Responsável por ${nome}`,
      email: `${apelido}@exemplo.test`,
      telefone: "(11) 98888-7777",
    },
    endereco: {
      cep: "01310-100",
      logradouro: "Avenida Paulista",
      numero: "1000",
      complemento: null,
      bairro: "Bela Vista",
      cidade: "São Paulo",
      uf: "SP",
    },
    tipoDeNegocio: "FOOD_SNACK",
    apelido,
  };
}

async function cadastrar(loja: NovaLojaEnviada): Promise<string> {
  const resposta = await request(api.app)
    .post("/v1/admin/lojas")
    .set(comoPapel(administradora.id, "ADMIN"))
    .send(loja);
  if (resposta.status !== 201) {
    throw new Error(`não consegui cadastrar: ${JSON.stringify(resposta.body)}`);
  }
  return String(resposta.body.id);
}

/** Um ato gravado direto na trilha, com a data que o cenário pede. */
async function gravarAto(ato: {
  readonly lojaId: string;
  readonly acao: string;
  readonly quando: string;
  readonly antes: unknown;
  readonly depois: unknown;
  readonly papel?: string;
}): Promise<void> {
  await migrador.query(
    `INSERT INTO app.audit_log
       (store_id, actor_id, actor_role, action, entity, before_data, after_data, created_at)
     VALUES ($1, $2, $3, $4, 'store_settings', $5::jsonb, $6::jsonb, $7)`,
    [
      ato.lojaId,
      administradora.id,
      ato.papel ?? "OWNER",
      ato.acao,
      JSON.stringify(ato.antes),
      JSON.stringify(ato.depois),
      ato.quando,
    ],
  );
}

function consultar(filtros: Record<string, string> = {}) {
  return request(api.app)
    .get("/v1/admin/auditoria")
    .query(filtros)
    .set(comoPapel(administradora.id, "ADMIN"));
}

/** A página lida pelo esquema ESTRITO do contrato: campo a mais reprova. */
function lida(corpo: unknown) {
  return esquemaDaPaginaDaAuditoria.parse(corpo);
}

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  api = montarApiDaAdministracao();
  administradora = await criarAdministradorDaPlataforma({
    nome: "Administradora geral",
  });
  pastel = await cadastrar(
    cadastro("Pastel da Joi", "11.222.333/0001-81", "pastel-da-joi"),
  );
  acai = await cadastrar(
    cadastro("Açaí do Zé", "529.982.247-25", "acai-do-ze"),
  );

  // 1º de outubro, meio-dia em Brasília: a troca da chave PIX do pastel.
  await gravarAto({
    lojaId: pastel,
    acao: "CONFIG_SENSIVEL_ALTERADA",
    quando: "2026-10-01T15:00:00.000Z",
    antes: { campos: { "pix.chave": "…8909" } },
    depois: {
      campos: { "pix.chave": "…1234" },
      sensivel: true,
      camposSensiveis: ["pix.chave"],
    },
  });
  // 2 de outubro às 23h30 em Brasília (já dia 3 em UTC): horário do açaí.
  await gravarAto({
    lojaId: acai,
    acao: "CONFIG_ALTERADA",
    quando: "2026-10-03T02:30:00.000Z",
    antes: { campos: { "horario.segunda": "18:00-23:00" } },
    depois: { campos: { "horario.segunda": "17:00-23:00" } },
  });
  // Registro antigo gravado fora da regra, com o e-mail em claro.
  await gravarAto({
    lojaId: acai,
    acao: "LOJA_ALTERADA",
    papel: "ADMIN",
    quando: "2026-09-10T12:00:00.000Z",
    antes: { campos: { email: "ze@acai-antigo.test", nome: "Açaí Zé" } },
    depois: { campos: { email: "ze@acai-novo.test", nome: "Açaí do Zé" } },
  });
}, ESPERA_DA_ADMINISTRACAO);

afterAll(async () => {
  await api?.encerrar();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

describe("o histórico de auditoria da administração (AC-215)", () => {
  it(
    "@spec:AC-215 lista os atos de todas as lojas, do mais recente ao mais antigo, com quem, quando, loja e antes e depois",
    async () => {
      const resposta = await consultar();
      expect(resposta.status).toBe(200);
      expect(resposta.headers["cache-control"]).toBe("no-store");
      const pagina = lida(resposta.body);

      // Dois cadastros de hoje e os três atos do cenário; nada de consulta.
      expect(pagina.total).toBe(5);
      expect(pagina.registros.map((registro) => registro.acao)).toEqual([
        "LOJA_CRIADA",
        "LOJA_CRIADA",
        "CONFIG_ALTERADA",
        "CONFIG_SENSIVEL_ALTERADA",
        "LOJA_ALTERADA",
      ]);

      const pix = pagina.registros.find(
        (registro) => registro.acao === "CONFIG_SENSIVEL_ALTERADA",
      );
      expect(pix).toMatchObject({
        quando: "2026-10-01T15:00:00.000Z",
        sensivel: true,
        papel: "OWNER",
        quem: { id: administradora.id, nome: "Administradora geral" },
        loja: { id: pastel, codigo: "0001", nome: "Pastel da Joi" },
        campos: [{ campo: "pix.chave", antes: "…8909", depois: "…1234" }],
      });
      const horario = pagina.registros.find(
        (registro) => registro.acao === "CONFIG_ALTERADA",
      );
      expect(horario?.sensivel).toBe(false);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-215 nenhum dado pessoal sai no histórico, nem o de registro gravado em claro (P-009)",
    async () => {
      const corpo = JSON.stringify((await consultar()).body);
      expect(corpo).not.toContain("ze@acai-antigo.test");
      expect(corpo).not.toContain("ze@acai-novo.test");
      expect(corpo).not.toContain("11222333000181");
      expect(corpo).not.toContain("52998224725");
      expect(corpo).not.toContain("exemplo.test");
      expect(corpo).not.toContain("98888");

      const antigo = lida((await consultar({ ato: "LOJA_ALTERADA" })).body);
      // O jsonb guarda as chaves na ordem dele: confere-se o conjunto.
      const campos = [...(antigo.registros[0]?.campos ?? [])].sort((a, b) =>
        a.campo.localeCompare(b.campo),
      );
      expect(campos).toEqual([
        { campo: "email", antes: "…test", depois: "…test" },
        { campo: "nome", antes: "Açaí Zé", depois: "Açaí do Zé" },
      ]);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-215 filtra por loja, por ato e por período em dias de Brasília",
    async () => {
      const doPastel = lida((await consultar({ loja: pastel })).body);
      expect(doPastel.registros.map((registro) => registro.acao)).toEqual([
        "LOJA_CRIADA",
        "CONFIG_SENSIVEL_ALTERADA",
      ]);
      expect(
        doPastel.registros.every((registro) => registro.loja.id === pastel),
      ).toBe(true);

      const sensiveis = lida(
        (await consultar({ ato: "CONFIG_SENSIVEL_ALTERADA" })).body,
      );
      expect(sensiveis.total).toBe(1);

      // O dia 2 inteiro, em Brasília, inclui as 23h30 que já são dia 3 em UTC.
      const doDia2 = lida(
        (await consultar({ de: "2026-10-02", ate: "2026-10-02" })).body,
      );
      expect(doDia2.registros.map((registro) => registro.acao)).toEqual([
        "CONFIG_ALTERADA",
      ]);

      const setembro = lida(
        (await consultar({ de: "2026-09-01", ate: "2026-09-30", loja: acai }))
          .body,
      );
      expect(setembro.registros.map((registro) => registro.acao)).toEqual([
        "LOJA_ALTERADA",
      ]);

      const nada = lida(
        (await consultar({ de: "2020-01-01", ate: "2020-01-31" })).body,
      );
      expect(nada).toMatchObject({ registros: [], total: 0 });
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-215 pagina com o total, e a página depois do fim volta vazia com o total certo",
    async () => {
      const primeira = lida((await consultar({ porPagina: "2" })).body);
      expect(primeira).toMatchObject({ total: 5, pagina: 1, porPagina: 2 });
      expect(primeira.registros).toHaveLength(2);

      const terceira = lida(
        (await consultar({ porPagina: "2", pagina: "3" })).body,
      );
      expect(terceira.registros).toHaveLength(1);
      expect(terceira.registros[0]?.acao).toBe("LOJA_ALTERADA");

      const alem = lida(
        (await consultar({ porPagina: "2", pagina: "9" })).body,
      );
      expect(alem).toMatchObject({ registros: [], total: 5, pagina: 9 });
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-215 @spec:AC-118 a consulta fica registrada como acesso da administração a cada loja que apareceu",
    async () => {
      const antes = await migrador.query<{ store_id: string; n: string }>(
        `SELECT store_id::text, count(*)::text AS n FROM app.audit_log
          WHERE action = 'ADMIN_ACCESS' AND entity = 'audit_log'
          GROUP BY store_id`,
      );
      const contagem = (
        linhas: { store_id: string; n: string }[],
        loja: string,
      ) => Number(linhas.find((linha) => linha.store_id === loja)?.n ?? 0);

      await consultar({ loja: pastel });

      const depois = await migrador.query<{ store_id: string; n: string }>(
        `SELECT store_id::text, count(*)::text AS n FROM app.audit_log
          WHERE action = 'ADMIN_ACCESS' AND entity = 'audit_log'
          GROUP BY store_id`,
      );
      expect(contagem(depois.rows, pastel)).toBe(
        contagem(antes.rows, pastel) + 1,
      );
      expect(contagem(depois.rows, acai)).toBe(contagem(antes.rows, acai));

      const consultas = lida(
        (await consultar({ ato: "ADMIN_ACCESS", loja: pastel })).body,
      );
      expect(consultas.total).toBeGreaterThanOrEqual(1);
      expect(consultas.registros[0]).toMatchObject({
        acao: "ADMIN_ACCESS",
        papel: "ADMIN",
        quem: { id: administradora.id },
      });
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-215 nenhum registro do histórico pode ser alterado nem apagado",
    async () => {
      await expect(
        migrador.query(
          `UPDATE app.audit_log SET action = 'ADULTERADO' WHERE store_id = $1`,
          [pastel],
        ),
      ).rejects.toThrow();
      await expect(
        migrador.query(`DELETE FROM app.audit_log WHERE store_id = $1`, [acai]),
      ).rejects.toThrow();
      const pagina = lida((await consultar()).body);
      expect(pagina.total).toBe(5);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-215 só a administração consulta, e filtro inválido é recusado antes do banco",
    async () => {
      const dono = await criarIdentidade({ nome: "Dona de loja" });
      const semSessao = await request(api.app).get("/v1/admin/auditoria");
      expect(semSessao.status).toBe(401);

      const comoDono = await request(api.app)
        .get("/v1/admin/auditoria")
        .set(comoPapel(dono.id, "OWNER"));
      expect(comoDono.status).toBe(403);

      // Token que diz ADMIN, de quem não está na tabela de administradores.
      const falso = await request(api.app)
        .get("/v1/admin/auditoria")
        .set(comoPapel(dono.id, "ADMIN"));
      expect(falso.status).toBe(403);

      const invertido = await consultar({
        de: "2026-10-05",
        ate: "2026-10-01",
      });
      expect(invertido.status).toBe(400);
      const atoEstranho = await consultar({ ato: "x'; drop" });
      expect(atoEstranho.status).toBe(400);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});
