import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { aplicarMigracoes, derivarUrlDePapel } from "../../src/migrate.ts";
import { carregarDadosDeExemplo } from "../index.ts";
import { MODA, PASTELARIA } from "../lojas.ts";
import { CONTAS_DE_TESTE } from "./contas.ts";
import { carregarDemonstracao, TODAS_AS_LOJAS_DEMO } from "./index.ts";
import { LOJAS_NOVAS } from "./lojas/index.ts";
import { AVISO_18 } from "./lojas/apoio.ts";
import { pedidosDeHoje, pedidosDoMes } from "./roteiro.ts";

/**
 * Prova da demonstração grande (card #50): os DADOS (uma loja por tipo de
 * negócio, catálogo coerente, Fortaleza, tabacaria só para maiores) e a CARGA
 * contra PostgreSQL de verdade — rodada duas vezes, para provar que a segunda
 * não duplica nada.
 */

const RAIZ = fileURLToPath(new URL("../../../../", import.meta.url));
const ARQUIVO_DE_AMBIENTE = join(RAIZ, ".env");
if (existsSync(ARQUIVO_DE_AMBIENTE)) process.loadEnvFile(ARQUIVO_DE_AMBIENTE);

/** Os 22 tipos de negócio que o banco semeia (0003 e 0063). */
function tiposDoBanco(): string[] {
  const sql = ["0003_lojas.sql", "0063_novos_tipos_de_negocio.sql"]
    .map((arquivo) =>
      readFileSync(join(RAIZ, "packages/database/migrations", arquivo), "utf8"),
    )
    .join("\n");
  const inseridos = sql
    .split("INSERT INTO app.vertical_presets")
    .slice(1)
    .map((trecho) => trecho.split("ON CONFLICT")[0]!);
  return inseridos.flatMap((trecho) =>
    [...trecho.matchAll(/^\s*\('([A-Z_]+)',/gm)].map((m) => m[1]!),
  );
}

const FORTALEZA = { lat: -3.7319, lng: -38.5267 };

function distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6371;
}

describe("dados da demonstração", () => {
  it("tem uma loja para cada um dos 22 tipos de negócio, com apelidos únicos", () => {
    const tipos = tiposDoBanco();
    expect(tipos).toHaveLength(22);
    const ramos = new Set(LOJAS_NOVAS.map((l) => l.nova!.ramo));
    // Lanchonete e Roupas já têm loja no seed original; as novas cobrem o resto.
    for (const tipo of tipos.filter((t) => t !== "FOOD_SNACK" && t !== "APPAREL")) {
      expect(ramos, tipo).toContain(tipo);
    }
    const apelidos = LOJAS_NOVAS.map((l) => l.nova!.apelido);
    expect(new Set(apelidos).size).toBe(apelidos.length);
    const chaves = TODAS_AS_LOJAS_DEMO.map((l) => l.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("espalha as lojas por Fortaleza e arredores (até 40 km do centro)", () => {
    for (const loja of TODAS_AS_LOJAS_DEMO) {
      expect(distanciaKm(FORTALEZA, loja.coordenadas), loja.chave).toBeLessThan(40);
      expect(loja.endereco.uf, loja.chave).toBe("CE");
    }
    const coordenadas = TODAS_AS_LOJAS_DEMO.map((l) => `${l.coordenadas.lat},${l.coordenadas.lng}`);
    expect(new Set(coordenadas).size).toBe(coordenadas.length);
  });

  it("dá a cada loja nova de 8 a 20 produtos em 3 a 6 categorias, todas usadas e com especificações válidas", () => {
    for (const loja of LOJAS_NOVAS) {
      expect(loja.produtos.length, loja.chave).toBeGreaterThanOrEqual(8);
      expect(loja.produtos.length, loja.chave).toBeLessThanOrEqual(20);
      expect(loja.categorias.length, loja.chave).toBeGreaterThanOrEqual(3);
      expect(loja.categorias.length, loja.chave).toBeLessThanOrEqual(6);
      const chaves = loja.produtos.map((p) => p.chave);
      expect(new Set(chaves).size, loja.chave).toBe(chaves.length);
      for (const categoria of loja.categorias) {
        expect(
          loja.produtos.some((p) => p.categoria === categoria.chave),
          `${loja.chave}/${categoria.chave} sem produto`,
        ).toBe(true);
      }
      for (const produto of loja.produtos) {
        const categoria = loja.categorias.find((c) => c.chave === produto.categoria);
        expect(categoria, `${loja.chave}/${produto.chave}`).toBeDefined();
        for (const [chave, valor] of Object.entries(produto.especificacoes)) {
          const especificacao = categoria!.especificacoes.find((e) => e.chave === chave);
          expect(especificacao, `${loja.chave}/${produto.chave}/${chave}`).toBeDefined();
          expect(
            especificacao!.tipo !== "ENUM" || especificacao!.opcoes!.includes(String(valor)),
            `${loja.chave}/${produto.chave}/${chave}: ${String(valor)} fora da lista`,
          ).toBe(true);
        }
        expect(Number.isInteger(produto.preco) && produto.preco > 0).toBe(true);
        if (produto.promo !== undefined) expect(produto.promo).toBeLessThan(produto.preco);
      }
    }
  });

  it("tem destaques, promoções, vídeos, stories e capa própria em parte das lojas", () => {
    const produtos = LOJAS_NOVAS.flatMap((l) => l.produtos);
    expect(produtos.filter((p) => p.destaque === true).length).toBeGreaterThan(40);
    expect(produtos.filter((p) => p.promo !== undefined).length).toBeGreaterThan(30);
    expect(produtos.filter((p) => p.video === true).length).toBeGreaterThanOrEqual(15);
    const comStories = TODAS_AS_LOJAS_DEMO.filter((l) => (l.stories ?? []).length > 0);
    expect(comStories.length).toBeGreaterThanOrEqual(10);
    for (const loja of comStories) {
      for (const story of loja.stories!) {
        expect(loja.produtos.map((p) => p.chave), `${loja.chave}/${story.chave}`).toContain(story.produto);
        expect(story.legenda.length).toBeLessThanOrEqual(200);
        expect(story.horasAtras).toBeLessThan(24);
      }
    }
    const comCapa = LOJAS_NOVAS.filter((l) => l.capa === true).length;
    expect(comCapa).toBeGreaterThan(0);
    expect(comCapa).toBeLessThan(LOJAS_NOVAS.length);
  });

  it("vende na tabacaria só para maiores de 18, com o aviso em todo produto e sem stories", () => {
    const tabacaria = LOJAS_NOVAS.find((l) => l.nova!.ramo === "TOBACCO")!;
    expect(tabacaria.sobre).toMatch(/18/);
    expect(tabacaria.stories ?? []).toHaveLength(0);
    for (const produto of tabacaria.produtos) {
      expect(produto.descricao, produto.chave).toContain(AVISO_18);
      expect(produto.video, produto.chave).not.toBe(true);
    }
  });

  it("gera o quadro de hoje com todas as etapas do pedido e o mês só com concluídos e cancelados", () => {
    for (const loja of LOJAS_NOVAS) {
      const hoje = pedidosDeHoje(loja, "2026-10-17", 900, [
        { chave: "x", nome: "X", telefone: "+5585999999999", email: null, endereco: { logradouro: "Rua", numero: "1", complemento: null, bairro: "Centro" } },
      ]);
      const etapas = new Set(hoje.map((p) => p.pedido.status));
      for (const etapa of ["PENDING", "ACCEPTED", "PREPARING", "COMPLETED", "CANCELLED"]) {
        expect(etapas, `${loja.chave}: ${etapa}`).toContain(etapa);
      }
      expect(etapas.has("READY_FOR_PICKUP") || etapas.has("OUT_FOR_DELIVERY")).toBe(true);
      for (const { chave, pedido } of hoje) {
        expect(chave).toContain("2026-10-17");
        expect(pedido.minutosAtras).toBeLessThanOrEqual(900);
        expect(pedido.itens.length).toBeGreaterThan(0);
      }
      const mes = pedidosDoMes(loja);
      expect(new Set(mes.map((p) => p.pedido.status))).toEqual(new Set(["COMPLETED", "CANCELLED"]));
      for (const { pedido } of mes) {
        expect(pedido.minutosAtras).toBeGreaterThanOrEqual(1440);
        expect(pedido.minutosAtras).toBeLessThan(31 * 1440);
      }
      // Previsível: o mesmo roteiro a cada chamada.
      expect(pedidosDoMes(loja)).toEqual(mes);
    }
  });
});

// ---------------------------------------------------------------------------
// A carga, num banco descartável
// ---------------------------------------------------------------------------

const URL_ADMINISTRATIVA = process.env["DATABASE_URL_TEST"]?.trim() ?? "";
const SEGREDOS = {
  SENHA_BANCO_MIGRADOR: process.env["SENHA_BANCO_MIGRADOR"]?.trim() ?? "",
  SENHA_BANCO_APLICACAO: process.env["SENHA_BANCO_APLICACAO"]?.trim() ?? "",
  SENHA_BANCO_ADMINISTRACAO: process.env["SENHA_BANCO_ADMINISTRACAO"]?.trim() ?? "",
};
const ESPERA = 600_000;
const AGORA = new Date("2026-10-17T18:30:00Z");

describe("carga da demonstração", () => {
  const nome = `sc_teste_demo50_${Date.now().toString(36)}`;
  let migrador: pg.Client;
  let administracao: pg.Client;
  let contagemDaPrimeira: Record<string, number>;
  let contagemDaSegunda: Record<string, number>;

  const TABELAS = [
    "stores",
    "products",
    "product_images",
    "product_variants",
    "orders",
    "order_items",
    "store_customers",
    "stories",
    "product_likes",
    "comments",
    "favorite_products",
    "store_visits",
    "identities",
  ];

  async function contar(): Promise<Record<string, number>> {
    const contagem: Record<string, number> = {};
    for (const tabela of TABELAS) {
      const r = await migrador.query(`SELECT count(*)::int AS n FROM app.${tabela}`);
      contagem[tabela] = Number(r.rows[0].n);
    }
    return contagem;
  }

  beforeAll(async () => {
    expect(URL_ADMINISTRATIVA, "DATABASE_URL_TEST no .env").not.toBe("");
    const raiz = new pg.Client({ connectionString: URL_ADMINISTRATIVA });
    await raiz.connect();
    await raiz.query(`CREATE DATABASE ${nome} TEMPLATE template0`);
    await raiz.end();
    const url = new URL(URL_ADMINISTRATIVA);
    url.pathname = `/${nome}`;
    migrador = new pg.Client({ connectionString: url.toString() });
    await migrador.connect();
    await aplicarMigracoes({ cliente: migrador, segredos: SEGREDOS });
    administracao = new pg.Client({
      connectionString: derivarUrlDePapel(url.toString(), "sc_admin", SEGREDOS.SENHA_BANCO_ADMINISTRACAO),
    });
    await administracao.connect();
    await carregarDadosDeExemplo({ cliente: administracao, ambiente: { NODE_ENV: "development" } });
    await carregarDemonstracao({ cliente: administracao, agora: AGORA, semVideos: true });
    contagemDaPrimeira = await contar();
    await carregarDemonstracao({ cliente: administracao, agora: AGORA, semVideos: true });
    contagemDaSegunda = await contar();
  }, ESPERA);

  afterAll(async () => {
    await administracao?.end().catch(() => {});
    await migrador?.end().catch(() => {});
    const raiz = new pg.Client({ connectionString: URL_ADMINISTRATIVA });
    await raiz.connect();
    await raiz.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`);
    await raiz.end();
  }, ESPERA);

  it("rodar de novo no mesmo dia não duplica nada", () => {
    expect(contagemDaSegunda).toEqual(contagemDaPrimeira);
  });

  it("deixa as 24 lojas ativas, aprovadas, no feed e com coordenadas, uma por tipo de negócio", async () => {
    const r = await migrador.query(
      `SELECT s.vertical_code, s.status, s.approved_at IS NOT NULL AS aprovada, s.feed_visible, s.lat
         FROM app.stores s WHERE s.slug = ANY($1)`,
      [[...LOJAS_NOVAS.map((l) => l.nova!.apelido), PASTELARIA.slug, MODA.slug]],
    );
    expect(r.rows).toHaveLength(24);
    for (const linha of r.rows) {
      expect(linha.status).toBe("ACTIVE");
      expect(linha.aprovada).toBe(true);
      expect(linha.feed_visible).toBe(true);
      expect(linha.lat).not.toBeNull();
    }
    expect(new Set(r.rows.map((l) => l.vertical_code)).size).toBe(22);
  });

  it("planta as 4 contas de teste com os papéis certos", async () => {
    const r = await migrador.query(
      `SELECT i.email_norm, i.password_hash IS NOT NULL AS tem_senha,
              EXISTS (SELECT 1 FROM app.platform_admins a WHERE a.identity_id = i.id AND a.revoked_at IS NULL) AS admin,
              (SELECT array_agg(m.role || ':' || s.slug ORDER BY s.slug) FROM app.store_members m
                 JOIN app.stores s ON s.id = m.store_id
                WHERE m.identity_id = i.id AND m.revoked_at IS NULL) AS vinculos
         FROM app.identities i WHERE i.email_norm = ANY($1)`,
      [CONTAS_DE_TESTE.map((c) => c.email)],
    );
    const por = Object.fromEntries(r.rows.map((l) => [l.email_norm, l]));
    for (const conta of CONTAS_DE_TESTE) expect(por[conta.email]?.tem_senha, conta.email).toBe(true);
    expect(por["maria.card6@exemplo.test"].admin).toBe(true);
    expect(por["maria.card6@exemplo.test"].vinculos).toEqual(
      [`OWNER:marmitaria-sabor-de-casa`, `OWNER:${PASTELARIA.slug}`].sort(),
    );
    expect(por["dono.demo@simpleclick.test"].vinculos).toEqual(
      [`OWNER:${MODA.slug}`, `OWNER:${PASTELARIA.slug}`].sort(),
    );
    expect(por["staff.demo@simpleclick.test"].vinculos).toEqual([`STAFF:${PASTELARIA.slug}`]);
    expect(por["ana.ribeiro@cliente.test"].vinculos).toBeNull();
  });

  it("dá à cliente de teste pedidos, favoritos, recentes e comentários", async () => {
    const ana = "(SELECT id FROM app.identities WHERE email_norm = 'ana.ribeiro@cliente.test')";
    const r = await migrador.query(
      `SELECT
         (SELECT count(*) FROM app.orders o JOIN app.store_customers c ON c.id = o.store_customer_id WHERE c.identity_id = ${ana})::int AS pedidos,
         (SELECT count(*) FROM app.favorite_stores WHERE identity_id = ${ana})::int AS lojas,
         (SELECT count(*) FROM app.favorite_products WHERE identity_id = ${ana})::int AS produtos,
         (SELECT count(*) FROM app.store_visits WHERE identity_id = ${ana} AND last_visited_at > $1::timestamptz - interval '30 days')::int AS recentes,
         (SELECT count(*) FROM app.comments WHERE identity_id = ${ana} AND status = 'PENDENTE')::int AS pendentes,
         (SELECT count(*) FROM app.comments WHERE identity_id = ${ana} AND status = 'APROVADO')::int AS aprovados`,
      [AGORA],
    );
    const linha = r.rows[0];
    expect(linha.pedidos).toBeGreaterThanOrEqual(10);
    expect(linha.lojas).toBeGreaterThanOrEqual(3);
    expect(linha.produtos).toBeGreaterThanOrEqual(5);
    expect(linha.recentes).toBeGreaterThanOrEqual(5);
    expect(linha.pendentes).toBeGreaterThan(0);
    expect(linha.aprovados).toBeGreaterThan(0);
  });

  it("deixa stories no ar, pedidos de hoje em todas as etapas e comentários aprovados e pendentes", async () => {
    const stories = await migrador.query(
      "SELECT count(*)::int AS n FROM app.stories WHERE expires_at > $1",
      [AGORA],
    );
    expect(stories.rows[0].n).toBeGreaterThanOrEqual(20);
    const etapas = await migrador.query(
      `SELECT DISTINCT status FROM app.orders
        WHERE (placed_at AT TIME ZONE 'America/Fortaleza')::date = ($1::timestamptz AT TIME ZONE 'America/Fortaleza')::date`,
      [AGORA],
    );
    expect(new Set(etapas.rows.map((l) => l.status))).toEqual(
      new Set(["PENDING", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"]),
    );
    const comentarios = await migrador.query("SELECT DISTINCT status FROM app.comments");
    expect(new Set(comentarios.rows.map((l) => l.status))).toEqual(new Set(["APROVADO", "PENDENTE", "RECUSADO"]));
    const feed = await migrador.query(
      "SELECT count(*)::int AS n FROM app.feed_posts",
    );
    expect(feed.rows[0].n).toBeGreaterThan(150);
  });
});
