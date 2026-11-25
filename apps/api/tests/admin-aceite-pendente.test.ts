/**
 * Card #12 (T-1) — por que o admin de produção toma 403 ao aprovar loja.
 *
 * Com o freio de aceite versionado LIGADO (como em `main.ts`), um admin ativo
 * que ainda não aceitou os documentos vigentes recebe 403 `aceite_pendente` nas
 * ações de escrita da administração; a leitura segue livre. Depois de aceitar
 * por `POST /v1/conta/aceites`, aprova normalmente. As duas travas de papel
 * continuam valendo com o freio ligado: quem não é admin ativo recebe 403
 * `acesso_negado`.
 */

import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  conectarNoBancoDoArquivo,
  criarAdministradorDaPlataforma,
  criarIdentidade,
  type IdentidadeDeTeste,
} from "@simpleclick/testing";

import { exigirAceiteVigente } from "../src/core/aceites-legais.ts";
import { clienteDaCompra } from "../src/modules/auth/cliente-da-compra.ts";
import { ESPERA_DA_ADMINISTRACAO } from "./apoio-da-administracao.ts";
import {
  cliente,
  montarApiCompleta,
  sessao,
  type ApiCompleta,
} from "./apoio-da-fundacao.ts";

const TODOS = ["TERMS_OF_USE", "PRIVACY_POLICY", "MERCHANT_TERMS"];

let api: ApiCompleta;
let http: ReturnType<typeof cliente>;
let migrador: pg.Client;
let admin: IdentidadeDeTeste;
let adminRevogado: IdentidadeDeTeste;
let lojista: { id: string; token: string };
let contador = 0;

async function cadastrar(nome: string): Promise<{ id: string; token: string }> {
  const email = `${nome.toLowerCase().replace(/\W+/g, ".")}.${++contador}@exemplo.test`;
  const cadastro = await http.post("/v1/auth/cadastro", {
    nome,
    email,
    senha: "PastelDaAna#2026",
    aceitouTermos: true,
  });
  if (cadastro.status !== 201) {
    throw new Error(`cadastro falhou: ${cadastro.status}`);
  }
  const { rows } = await migrador.query<{ id: string }>(
    `SELECT id::text AS id FROM app.identities WHERE email_norm = $1`,
    [email],
  );
  return { id: rows[0]!.id, token: String(cadastro.body.tokenDeAcesso) };
}

/**
 * Abre uma loja pendente com um lojista NOVO a cada chamada (a API limita as
 * lojas por dono: com um só lojista, a terceira loja dava 409
 * `limite_atingido`); `lojista` passa a ser o dono da loja recém-aberta.
 */
async function abrirLojaPendente(nome: string) {
  lojista = await cadastrar(`Lojista de ${nome}`);
  const r = await http.post(
    "/v1/auth/lojas",
    { nome, tipoDeNegocio: "FOOD_SNACK", aceitouTermosDoLojista: true },
    { authorization: `Bearer ${lojista.token}` },
  );
  expect(r.status).toBe(201);
  lojista.token = String(r.body.tokenDeAcesso);
  const { rows } = await migrador.query<{ id: string }>(
    `SELECT id::text AS id FROM app.stores WHERE slug = $1`,
    [r.body.loja.apelido],
  );
  return rows[0]!.id;
}

async function statusDaLoja(id: string): Promise<string> {
  const { rows } = await migrador.query<{ status: string }>(
    `SELECT status FROM app.stores WHERE id = $1`,
    [id],
  );
  return rows[0]!.status;
}

async function aceitarTudo(id: string): Promise<void> {
  // Aceita pelo mesmo caminho do produto, com a sessão da própria pessoa.
  const r = await http.post(
    "/v1/conta/aceites",
    { documentos: TODOS },
    sessao(id, "CUSTOMER"),
  );
  expect(r.status).toBe(200);
}

const aprovar = (lojaId: string, cab: Record<string, string>) =>
  http.post(`/v1/admin/lojas/${lojaId}/aprovar`, {}, cab);

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  api = montarApiCompleta({
    exigirAceite: exigirAceiteVigente({
      identidade: (requisicao) =>
        clienteDaCompra(requisicao, process.env.JWT_SECRET?.trim())
          ?.identidadeId ?? null,
    }),
  });
  http = cliente(api);
  admin = await criarAdministradorDaPlataforma();
  adminRevogado = await criarAdministradorDaPlataforma();
  lojista = await cadastrar("Ana Lojista");
}, ESPERA_DA_ADMINISTRACAO);

afterAll(async () => {
  await api?.encerrar();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

describe("admin ativo sem aceites, com o freio ligado", () => {
  it(
    "[CA-1] lê (200), mas aprovar dá 403 aceite_pendente e a loja segue pendente",
    async () => {
      const lojaId = await abrirLojaPendente("Pastel Um");
      const cab = sessao(admin.id, "ADMIN");

      expect((await http.get("/v1/admin/lojas", cab)).status).toBe(200);

      const r = await aprovar(lojaId, cab);
      expect(r.status).toBe(403);
      expect(r.body.erro).toBe("aceite_pendente");
      expect(r.body.pendentes.length).toBeGreaterThan(0);
      for (const p of r.body.pendentes) {
        expect(typeof p.documento).toBe("string");
        expect(typeof p.versao).toBe("string");
      }
      expect(await statusDaLoja(lojaId)).toBe("PENDING_APPROVAL");
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "[CA-2] depois de aceitar em /v1/conta/aceites, aprovar dá 200 e a loja fica ACTIVE",
    async () => {
      const lojaId = await abrirLojaPendente("Pastel Dois");
      const cab = sessao(admin.id, "ADMIN");
      expect((await aprovar(lojaId, cab)).body.erro).toBe("aceite_pendente");

      const pendentes = await http.get("/v1/conta/aceites", cab);
      expect(pendentes.status).toBe(200);
      const docs = (pendentes.body.pendentes as { documento: string }[]).map(
        (p) => p.documento,
      );
      const aceite = await http.post(
        "/v1/conta/aceites",
        { documentos: docs },
        cab,
      );
      expect(aceite.status).toBe(200);
      expect(aceite.body.pendentes).toEqual([]);

      const r = await aprovar(lojaId, cab);
      expect(r.status).toBe(200);
      expect(await statusDaLoja(lojaId)).toBe("ACTIVE");
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});

describe("as travas de papel valem com o freio ligado", () => {
  it(
    "[CA-3a] CUSTOMER em dia dá 403 acesso_negado",
    async () => {
      const lojaId = await abrirLojaPendente("Pastel Tres");
      const cliente1 = await cadastrar("Cliente Em Dia");
      const r = await aprovar(lojaId, sessao(cliente1.id, "CUSTOMER"));
      expect(r.status).toBe(403);
      expect(r.body.erro).toBe("acesso_negado");
      expect(await statusDaLoja(lojaId)).toBe("PENDING_APPROVAL");
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "[CA-3b] token ADMIN com acesso revogado e aceites em dia dá 403 acesso_negado",
    async () => {
      const lojaId = await abrirLojaPendente("Pastel Quatro");
      await aceitarTudo(adminRevogado.id);
      await migrador.query(
        `UPDATE app.platform_admins SET revoked_at = now()
          WHERE identity_id = $1 AND revoked_at IS NULL`,
        [adminRevogado.id],
      );
      const r = await aprovar(lojaId, sessao(adminRevogado.id, "ADMIN"));
      expect(r.status).toBe(403);
      expect(r.body.erro).toBe("acesso_negado");
      expect(await statusDaLoja(lojaId)).toBe("PENDING_APPROVAL");
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "[CA-3c] OWNER em dia com os 3 aceites dá 403 acesso_negado",
    async () => {
      const lojaId = await abrirLojaPendente("Pastel Cinco");
      // O lojista aceitou os 3 documentos ao cadastrar e abrir a loja.
      const r = await aprovar(lojaId, {
        authorization: `Bearer ${lojista.token}`,
      });
      expect(r.status).toBe(403);
      expect(r.body.erro).toBe("acesso_negado");
      expect(await statusDaLoja(lojaId)).toBe("PENDING_APPROVAL");
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "[CA-3d] CUSTOMER com aceite pendente dá aceite_pendente e, depois de aceitar, acesso_negado",
    async () => {
      const lojaId = await abrirLojaPendente("Pastel Seis");
      // Identidade criada direto no banco, sem nenhum aceite registrado
      // (`legal_acceptances` é imutável: não dá para apagar os de quem cadastrou).
      const pessoa = await criarIdentidade();
      const cab = sessao(pessoa.id, "CUSTOMER");
      const antes = await aprovar(lojaId, cab);
      expect(antes.status).toBe(403);
      expect(antes.body.erro).toBe("aceite_pendente");

      await aceitarTudo(pessoa.id);
      const depois = await aprovar(lojaId, cab);
      expect(depois.status).toBe(403);
      expect(depois.body.erro).toBe("acesso_negado");
      expect(await statusDaLoja(lojaId)).toBe("PENDING_APPROVAL");
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});
