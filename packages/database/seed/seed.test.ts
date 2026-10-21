import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { aplicarMigracoes, derivarUrlDePapel } from "../src/migrate.ts";
import { PRODUTOS, produtosDaLoja, type ProdutoDeExemplo } from "./catalogo.ts";
import { DATA_DE_REFERENCIA_PADRAO } from "./deterministico.ts";
import {
  carregarDadosDeExemplo,
  conferirVitrine,
  ErroDeAmbienteDeProducao,
  ErroDeBancoNaoVazio,
  montarCenario,
  type RelatorioDaCarga,
} from "./index.ts";
import { LOJAS, MODA, PASTELARIA } from "./lojas.ts";
import { PEDIDOS, STATUS_NO_BANCO } from "./pedidos.ts";

/**
 * Prova da carga de dados de exemplo, contra PostgreSQL de verdade.
 *
 * O ponto mais delicado é o determinismo (AC-037), e ele é provado do único
 * jeito que vale: **comparando dois bancos**, não lendo o código. Duas bases
 * vazias e distintas recebem a carga e são fotografadas linha a linha; as duas
 * fotografias precisam ser idênticas. Uma prova que olhasse só para o código
 * ("não chamamos `random`") passaria com um `now()` escondido numa coluna com
 * valor padrão — que é exatamente o modo de falha que existe aqui.
 *
 * A fotografia é conferida também no sentido contrário: uma alteração de uma
 * única letra, feita dentro de uma transação desfeita em seguida, tem de fazer
 * as fotografias divergirem. Sem esse contraprova, uma fotografia vazia
 * passaria por igualdade e não teria olhado para nada.
 *
 * Cada banco desta prova é criado e apagado aqui: o banco de desenvolvimento
 * nunca é tocado.
 */

const RAIZ_DO_REPOSITORIO = fileURLToPath(
  new URL("../../../", import.meta.url),
);

const ARQUIVO_DE_AMBIENTE = join(RAIZ_DO_REPOSITORIO, ".env");
if (existsSync(ARQUIVO_DE_AMBIENTE)) process.loadEnvFile(ARQUIVO_DE_AMBIENTE);

/**
 * Variável obrigatória. Falha com instruções em vez de deixar o arquivo ser
 * pulado: teste pulado não é prova, e um cenário que ninguém carregou não
 * prova carga nenhuma.
 */
function exigirVariavel(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (valor === undefined || valor === "") {
    throw new Error(
      [
        `${nome} não está definida, e sem ela não há banco onde provar a carga de exemplo.`,
        "Suba o banco descartável e preencha o ambiente:",
        "  bash infra/scripts/up.sh core test",
        "  cp .env.example .env   # e complete as senhas dos papéis de banco",
      ].join("\n"),
    );
  }
  return valor;
}

const URL_ADMINISTRATIVA = exigirVariavel("DATABASE_URL_TEST");
const SEGREDOS_DAS_MIGRACOES = {
  SENHA_BANCO_MIGRADOR: exigirVariavel("SENHA_BANCO_MIGRADOR"),
  SENHA_BANCO_APLICACAO: exigirVariavel("SENHA_BANCO_APLICACAO"),
  SENHA_BANCO_ADMINISTRACAO: exigirVariavel("SENHA_BANCO_ADMINISTRACAO"),
};

const ESPERA_LONGA = 180_000;

/** Ambiente de mentira usado nas provas: nunca o do processo. */
const AMBIENTE_DE_DESENVOLVIMENTO = { NODE_ENV: "development" } as const;

// ---------------------------------------------------------------------------
// Bancos de prova
// ---------------------------------------------------------------------------

/** Um banco descartável desta prova, com as três conexões que ela usa. */
interface BancoDeProva {
  readonly nome: string;
  /** Credencial de migração: enxerga tudo, para fotografar o banco inteiro. */
  readonly migrador: pg.Client;
  /** Credencial de administração: é quem planta o cenário. */
  readonly administracao: pg.Client;
  /** Credencial da aplicação: é quem prova que a vitrine enxerga. */
  readonly aplicacao: pg.Client;
}

async function comClienteAdministrativo<T>(
  acao: (cliente: pg.Client) => Promise<T>,
): Promise<T> {
  const cliente = new pg.Client({ connectionString: URL_ADMINISTRATIVA });
  await cliente.connect();
  try {
    return await acao(cliente);
  } finally {
    await cliente.end();
  }
}

function urlDoBanco(nome: string): string {
  const destino = new URL(URL_ADMINISTRATIVA);
  destino.pathname = `/${nome}`;
  return destino.toString();
}

async function conectar(url: string): Promise<pg.Client> {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  return cliente;
}

/** Cria um banco vazio, aplica as migrações e abre as três conexões. */
async function criarBancoDeProva(rotulo: string): Promise<BancoDeProva> {
  const nome = `sc_teste_t008_${rotulo}_${Date.now().toString(36)}`;
  await comClienteAdministrativo((cliente) =>
    cliente.query(`CREATE DATABASE ${nome} TEMPLATE template0`),
  );

  const url = urlDoBanco(nome);
  const migrador = await conectar(url);
  await aplicarMigracoes({
    cliente: migrador,
    segredos: SEGREDOS_DAS_MIGRACOES,
  });

  const administracao = await conectar(
    derivarUrlDePapel(
      url,
      "sc_admin",
      SEGREDOS_DAS_MIGRACOES.SENHA_BANCO_ADMINISTRACAO,
    ),
  );
  const aplicacao = await conectar(
    derivarUrlDePapel(
      url,
      "sc_app",
      SEGREDOS_DAS_MIGRACOES.SENHA_BANCO_APLICACAO,
    ),
  );

  return { nome, migrador, administracao, aplicacao };
}

async function descartarBancoDeProva(banco: BancoDeProva): Promise<void> {
  await banco.aplicacao.end().catch(() => {});
  await banco.administracao.end().catch(() => {});
  await banco.migrador.end().catch(() => {});
  await comClienteAdministrativo((cliente) =>
    cliente.query(`DROP DATABASE IF EXISTS ${banco.nome} WITH (FORCE)`),
  );
}

// ---------------------------------------------------------------------------
// Fotografia do banco
// ---------------------------------------------------------------------------

/** Conteúdo de cada tabela do esquema `app`, em forma comparável. */
type RetratoDoBanco = Record<string, string>;

/**
 * Colunas que o RELÓGIO DO BANCO escreve, e que a carga não tem como controlar.
 *
 * Só existe uma, e ela merece a explicação inteira. `bump_catalog_version`
 * atualiza a linha da loja a cada produto plantado — é assim que o cache do
 * catálogo é invalidado sem depender de a aplicação lembrar. Toda alteração em
 * `stores` dispara `stores_touch`, que grava `now()` em `updated_at`. O valor é,
 * portanto, o instante em que a carga rodou, e não um dado do cenário.
 *
 * A carga não pode e não deve mexer nisso: a credencial de administração não é
 * dona da tabela, então não desliga gatilho, e desligá-lo seria transformar um
 * problema de comparação numa alteração do comportamento do sistema. O que esta
 * prova faz em vez de simplesmente ignorar é mais forte: o teste seguinte exige
 * que esta seja a ÚNICA diferença entre os dois bancos, em qualquer tabela e em
 * qualquer coluna.
 */
const RELOGIOS_DO_BANCO: Readonly<Record<string, readonly string[]>> = {
  stores: ["updated_at"],
  // A linha única dos padrões de limite nasce na MIGRAÇÃO (0051), com
  // `updated_at = now()` — o instante em que o banco foi migrado, e não um dado
  // do cenário. A carga não escreve nesta tabela.
  platform_limit_defaults: ["updated_at"],
};

/**
 * Fotografa todas as tabelas do esquema `app`, com todas as colunas.
 *
 * Ordena pelo conteúdo, e não pela chave primária: a ordem de leitura do
 * PostgreSQL não é garantida, e ordenar por identificador esconderia uma coluna
 * que mudou. Ordenando pela linha inteira, qualquer diferença em qualquer
 * coluna muda a fotografia.
 *
 * Roda com a credencial de migração porque ela é a única que enxerga tudo — uma
 * fotografia sob isolamento por linha mostraria só a loja do contexto, e "os
 * dois bancos estão vazios do mesmo jeito" não prova nada.
 */
async function retratoDoBanco(
  cliente: pg.Client,
  semOsRelogiosDoBanco = false,
): Promise<RetratoDoBanco> {
  const tabelas = await cliente.query<{ relname: string }>(
    `SELECT c.relname
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relkind = 'r'
      ORDER BY c.relname`,
  );

  const retrato: RetratoDoBanco = {};
  for (const { relname } of tabelas.rows) {
    const relogios = semOsRelogiosDoBanco
      ? (RELOGIOS_DO_BANCO[relname] ?? [])
      : [];
    const linha =
      relogios.length === 0
        ? "to_jsonb(t)"
        : `(to_jsonb(t) - ARRAY[${relogios.map((coluna) => `'${coluna}'`).join(", ")}]::text[])`;

    const conteudo = await cliente.query<{ linhas: string }>(
      `SELECT coalesce(jsonb_agg(${linha} ORDER BY ${linha}::text), '[]'::jsonb)::text AS linhas
         FROM app."${relname}" t`,
    );
    retrato[relname] = conteudo.rows[0]?.linhas ?? "[]";
  }
  return retrato;
}

/** Quantas linhas uma tabela tem, vistas por quem enxerga tudo. */
async function contarLinhas(
  cliente: pg.Client,
  tabela: string,
): Promise<number> {
  const resultado = await cliente.query<{ total: string }>(
    `SELECT count(*)::int AS total FROM app."${tabela}"`,
  );
  return Number(resultado.rows[0]?.total ?? 0);
}

/** As tabelas que existem hoje no esquema `app`. */
async function tabelasExistentes(cliente: pg.Client): Promise<Set<string>> {
  const resultado = await cliente.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'app' AND table_type = 'BASE TABLE'`,
  );
  return new Set(resultado.rows.map((linha) => linha.table_name));
}

// ---------------------------------------------------------------------------
// Cenário em memória, para as asserções sobre o que a carga descreve
// ---------------------------------------------------------------------------

const CENARIO = montarCenario(DATA_DE_REFERENCIA_PADRAO);

/** As linhas que o cenário descreve para uma tabela. */
function linhasDe(tabela: string): readonly Record<string, unknown>[] {
  const conjunto = CENARIO.find((item) => item.tabela === tabela);
  if (conjunto === undefined) {
    throw new Error(
      `O cenário de exemplo não descreve a tabela ${tabela} — a prova precisa dela.`,
    );
  }
  return conjunto.linhas;
}

let primeiro: BancoDeProva;
let segundo: BancoDeProva;
let relatorioDoPrimeiro: RelatorioDaCarga;
let relatorioDoSegundo: RelatorioDaCarga;

beforeAll(async () => {
  primeiro = await criarBancoDeProva("um");
  segundo = await criarBancoDeProva("dois");

  relatorioDoPrimeiro = await carregarDadosDeExemplo({
    cliente: primeiro.administracao,
    referencia: DATA_DE_REFERENCIA_PADRAO,
    ambiente: AMBIENTE_DE_DESENVOLVIMENTO,
  });
  relatorioDoSegundo = await carregarDadosDeExemplo({
    cliente: segundo.administracao,
    referencia: DATA_DE_REFERENCIA_PADRAO,
    ambiente: AMBIENTE_DE_DESENVOLVIMENTO,
  });
}, ESPERA_LONGA);

afterAll(async () => {
  if (primeiro) await descartarBancoDeProva(primeiro);
  if (segundo) await descartarBancoDeProva(segundo);
}, ESPERA_LONGA);

// ---------------------------------------------------------------------------
// AC-004 — cenário navegável
// ---------------------------------------------------------------------------

describe("cenário navegável", () => {
  it("@spec:AC-004 planta duas lojas de ramos diferentes com catálogo, clientes e pedidos, a partir de um banco vazio", async () => {
    const lojas = await primeiro.migrador.query<{
      slug: string;
      vertical_code: string;
      status: string;
    }>("SELECT slug, vertical_code, status FROM app.stores ORDER BY code");

    expect(lojas.rows).toEqual([
      {
        slug: PASTELARIA.slug,
        vertical_code: PASTELARIA.ramo,
        status: "ACTIVE",
      },
      { slug: MODA.slug, vertical_code: MODA.ramo, status: "ACTIVE" },
    ]);
    expect(lojas.rows[0]?.vertical_code).not.toBe(lojas.rows[1]?.vertical_code);

    // Catálogo, clientes e pedidos existem para as duas lojas — nas tabelas que
    // já existem no esquema, e no cenário para as que ainda não existem.
    expect(await contarLinhas(primeiro.migrador, "products")).toBe(
      PRODUTOS.length,
    );
    expect(await contarLinhas(primeiro.migrador, "store_customers")).toBe(
      LOJAS.reduce((soma, loja) => soma + loja.clientes.length, 0),
    );
    for (const loja of LOJAS) {
      expect(
        PEDIDOS.filter((pedido) => pedido.loja.chave === loja.chave).length,
      ).toBeGreaterThan(0);
    }
  });

  it("@spec:AC-004 entrega o cenário pelo caminho de contexto que a aplicação usa: a vitrine de cada loja enxerga o próprio catálogo publicado", async () => {
    const vitrines = await conferirVitrine(primeiro.aplicacao);

    expect(vitrines).toEqual(
      LOJAS.map((loja) => ({
        loja: loja.slug,
        produtosVisiveis: produtosDaLoja(loja).filter(
          (produto: ProdutoDeExemplo) => produto.status === "PUBLISHED",
        ).length,
      })),
    );
    for (const vitrine of vitrines) {
      expect(vitrine.produtosVisiveis).toBeGreaterThan(0);
    }
  });

  it("@spec:AC-004 deixa o rascunho fora da vitrine e a configuração da loja fora do alcance do público", async () => {
    await primeiro.aplicacao.query("BEGIN");
    try {
      await primeiro.aplicacao.query(
        `SELECT set_config('app.store_id', $1, true),
                set_config('app.user_id', '', true),
                set_config('app.role', 'PUBLIC', true),
                set_config('app.order_token', '', true)`,
        [PASTELARIA.id],
      );

      const visiveis = await primeiro.aplicacao.query<{ slug: string }>(
        "SELECT slug FROM app.products ORDER BY slug",
      );
      const rascunhos = produtosDaLoja(PASTELARIA).filter(
        (produto) => produto.status === "DRAFT",
      );
      expect(rascunhos.length).toBeGreaterThan(0);
      for (const rascunho of rascunhos) {
        expect(visiveis.rows.map((linha) => linha.slug)).not.toContain(
          rascunho.slug,
        );
      }

      // A chave PIX mora em `store_settings`. A vitrine não lê essa tabela.
      const configuracao = await primeiro.aplicacao.query(
        "SELECT store_id FROM app.store_settings",
      );
      expect(configuracao.rows).toHaveLength(0);
    } finally {
      await primeiro.aplicacao.query("COMMIT");
    }
  });
});

// ---------------------------------------------------------------------------
// AC-036 — cobertura dos ramos e dos estados
// ---------------------------------------------------------------------------

describe("cobertura dos ramos e dos estados", () => {
  it("@spec:AC-036 planta uma loja de comida sem controle de estoque e uma loja de produto contável com estoque", async () => {
    const ramos = await primeiro.migrador.query<{
      slug: string;
      is_food: boolean;
      tracks_stock: boolean;
    }>(
      `SELECT s.slug, v.is_food, v.tracks_stock
         FROM app.stores s
         JOIN app.vertical_presets v ON v.code = s.vertical_code
        ORDER BY s.code`,
    );

    expect(ramos.rows).toEqual([
      { slug: PASTELARIA.slug, is_food: true, tracks_stock: false },
      { slug: MODA.slug, is_food: false, tracks_stock: true },
    ]);

    // O produto carrega a decisão: comida não controla estoque, roupa controla.
    const controle = await primeiro.migrador.query<{
      slug: string;
      track_stock: boolean;
    }>(
      `SELECT s.slug, bool_and(p.track_stock) AS track_stock
         FROM app.products p JOIN app.stores s ON s.id = p.store_id
        GROUP BY s.slug ORDER BY s.slug`,
    );
    expect(
      controle.rows.find((linha) => linha.slug === PASTELARIA.slug)
        ?.track_stock,
    ).toBe(false);
    expect(
      controle.rows.find((linha) => linha.slug === MODA.slug)?.track_stock,
    ).toBe(true);

    // E a variante confirma: estoque nulo é "não controla"; número é controle,
    // inclusive o zero de um tamanho que acabou.
    const variantesDaComida = linhasDe("product_variants").filter(
      (linha) => linha.store_id === PASTELARIA.id,
    );
    expect(variantesDaComida.length).toBeGreaterThan(0);
    for (const variante of variantesDaComida) {
      expect(variante.stock_quantity).toBeNull();
    }

    const variantesDaRoupa = linhasDe("product_variants").filter(
      (linha) => linha.store_id === MODA.id,
    );
    const estoques = variantesDaRoupa.map((linha) => linha.stock_quantity);
    expect(estoques.every((valor) => typeof valor === "number")).toBe(true);
    expect(estoques).toContain(0);
  });

  it("@spec:AC-036 dá a cada categoria as especificações dela — a especificação pertence à categoria, não ao ramo", () => {
    const categorias = linhasDe("categories");
    const especificacoes = linhasDe("attribute_definitions");

    expect(categorias.length).toBeGreaterThanOrEqual(2 * LOJAS.length);
    expect(especificacoes.length).toBeGreaterThan(0);

    // Toda especificação aponta para UMA categoria concreta, e nunca para o
    // ramo: é o ajuste de 17/08 expresso como dado.
    const idsDeCategoria = new Set(categorias.map((linha) => linha.id));
    for (const especificacao of especificacoes) {
      expect(especificacao.category_id).not.toBeNull();
      expect(idsDeCategoria.has(especificacao.category_id)).toBe(true);
    }

    // E cada categoria de cada loja tem pelo menos uma especificação própria.
    for (const categoria of categorias) {
      const proprias = especificacoes.filter(
        (especificacao) => especificacao.category_id === categoria.id,
      );
      expect(proprias.length).toBeGreaterThan(0);
    }

    // Duas categorias de ramos diferentes não compartilham chave de campo: é
    // isso que "gramatura existe em Camisetas, não em roupas em geral" quer
    // dizer.
    const chavesDaComida = especificacoes
      .filter((linha) => linha.store_id === PASTELARIA.id)
      .map((linha) => linha.key);
    const chavesDaRoupa = especificacoes
      .filter((linha) => linha.store_id === MODA.id)
      .map((linha) => linha.key);
    expect(chavesDaComida.length).toBeGreaterThan(0);
    expect(chavesDaRoupa.length).toBeGreaterThan(0);
    expect(chavesDaComida.some((chave) => chavesDaRoupa.includes(chave))).toBe(
      false,
    );
  });

  it("@spec:AC-036 dá aos produtos imagens, mais de um preço nomeado e grupos de opção que atendem ingrediente e variação", () => {
    const imagens = linhasDe("product_images");
    const precos = linhasDe("product_prices");
    const grupos = linhasDe("option_groups");
    const opcoes = linhasDe("option_items");

    // Toda produto tem imagem, e exatamente uma é a principal.
    for (const produto of PRODUTOS) {
      const suas = imagens.filter(
        (imagem) => imagem.product_id === linhaDoProduto(produto).id,
      );
      expect(suas.length).toBeGreaterThan(0);
      expect(suas.filter((imagem) => imagem.is_primary === true)).toHaveLength(
        1,
      );
    }

    // Mais de um preço NOMEADO, com rótulos distintos dados pelo dono.
    const comVariosPrecos = PRODUTOS.filter((produto) => {
      const rotulos = precos
        .filter((preco) => preco.product_id === linhaDoProduto(produto).id)
        .map((preco) => preco.label);
      return new Set(rotulos).size >= 2;
    });
    expect(comVariosPrecos.length).toBeGreaterThan(0);
    expect(precos.some((preco) => preco.kind === "PROMO")).toBe(true);
    expect(precos.some((preco) => preco.kind === "WHOLESALE")).toBe(true);

    // O MESMO mecanismo nos dois lados: ingrediente e adicional na comida,
    // eixo de variação com estoque na roupa.
    const daComida = grupos.filter((grupo) => grupo.store_id === PASTELARIA.id);
    const daRoupa = grupos.filter((grupo) => grupo.store_id === MODA.id);
    expect(daComida.some((grupo) => grupo.kind === "INGREDIENT")).toBe(true);
    expect(daComida.some((grupo) => grupo.kind === "ADDON")).toBe(true);
    expect(daComida.every((grupo) => grupo.is_variant_axis === false)).toBe(
      true,
    );
    expect(daRoupa.some((grupo) => grupo.is_variant_axis === true)).toBe(true);
    expect(opcoes.length).toBeGreaterThan(grupos.length);

    // A grade resolve variante: cada combinação liga variante, eixo e opção.
    const combinacoes = linhasDe("variant_option_values");
    expect(combinacoes.length).toBeGreaterThan(0);
    for (const combinacao of combinacoes) {
      expect(combinacao.variant_id).toBeTruthy();
      expect(combinacao.group_id).toBeTruthy();
      expect(combinacao.option_item_id).toBeTruthy();
    }
  });

  it("@spec:AC-036 planta clientes e pedidos em TODOS os status, inclusive cancelado e aguardando confirmação no WhatsApp", async () => {
    const clientes = await primeiro.migrador.query<{
      store_id: string;
      identity_id: string | null;
    }>("SELECT store_id, identity_id FROM app.store_customers");

    for (const loja of LOJAS) {
      const seus = clientes.rows.filter((linha) => linha.store_id === loja.id);
      expect(seus.length).toBeGreaterThan(0);
    }
    // Comprador com conta e cliente cadastrado à mão: os dois eixos existem.
    expect(clientes.rows.some((linha) => linha.identity_id !== null)).toBe(
      true,
    );
    expect(clientes.rows.some((linha) => linha.identity_id === null)).toBe(
      true,
    );

    const pedidos = linhasDe("orders");
    for (const loja of LOJAS) {
      const seus = pedidos.filter((pedido) => pedido.store_id === loja.id);
      const status = new Set(seus.map((pedido) => pedido.status));
      // Cobertura literal: todos os status do banco, para as duas lojas. A
      // recusa não é status desde a 0053: é o cancelado que nunca foi aceito.
      expect([...status].sort()).toEqual([...STATUS_NO_BANCO].sort());
      expect(status.has("CANCELLED")).toBe(true);
      expect(status.has("REJECTED")).toBe(false);
    }

    // Aguardando confirmação no WhatsApp NÃO é status: é o pedido pendente cuja
    // mensagem foi aberta e nunca confirmada.
    const aguardando = pedidos.filter(
      (pedido) =>
        pedido.status === "PENDING" &&
        pedido.whatsapp_clicked_at !== null &&
        pedido.whatsapp_confirmed_at === null,
    );
    expect(aguardando.length).toBe(LOJAS.length);

    // E o histórico do cancelado passa pelo aceite, enquanto o do recusado não:
    // são caminhos diferentes, e é o histórico que a página pública mostra.
    const historico = linhasDe("order_status_history");
    const caminhos = pedidos
      .filter((linha) => linha.status === "CANCELLED")
      .map((pedido) =>
        historico
          .filter((linha) => linha.order_id === pedido.id)
          .map((linha) => linha.to_status),
      );
    for (const passos of caminhos) expect(passos).toContain("CANCELLED");
    // Por loja: um cancelado depois do aceite e um recusado na chegada.
    expect(caminhos.filter((passos) => passos.includes("ACCEPTED"))).toHaveLength(LOJAS.length);
    expect(caminhos.filter((passos) => !passos.includes("ACCEPTED"))).toHaveLength(LOJAS.length);
  });

  it("@spec:AC-036 planta no banco tudo que o esquema já suporta, e adia — nomeando — só o que ainda não tem tabela", async () => {
    const existentes = await tabelasExistentes(primeiro.migrador);

    const plantadas = new Set(
      relatorioDoPrimeiro.plantadas.map((tabela) => tabela.tabela),
    );
    const adiadas = new Set(
      relatorioDoPrimeiro.adiadas.map((tabela) => tabela.tabela),
    );

    // A regra que faz esta prova morder: tabela que existe TEM de ter sido
    // plantada. No dia em que a migração de `orders` entrar, este teste passa a
    // exigir que os pedidos do cenário entrem no banco — e falha se não
    // entrarem.
    for (const conjunto of CENARIO) {
      if (existentes.has(conjunto.tabela)) {
        expect(plantadas.has(conjunto.tabela)).toBe(true);
        expect(adiadas.has(conjunto.tabela)).toBe(false);
        expect(await contarLinhas(primeiro.migrador, conjunto.tabela)).toBe(
          conjunto.linhas.length,
        );
      } else {
        expect(adiadas.has(conjunto.tabela)).toBe(true);
      }
    }

    // Nenhuma tabela do cenário está vazia de propósito: adiar é sobre a
    // tabela não existir, nunca sobre não haver o que plantar.
    for (const conjunto of CENARIO) {
      expect(conjunto.linhas.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// AC-037 — determinismo
// ---------------------------------------------------------------------------

describe("determinismo da carga", () => {
  it("@spec:AC-037 produz bancos idênticos ao rodar duas vezes em bancos vazios distintos", async () => {
    const um = await retratoDoBanco(primeiro.migrador, true);
    const dois = await retratoDoBanco(segundo.migrador, true);

    expect(primeiro.nome).not.toBe(segundo.nome);
    expect(Object.keys(um)).toEqual(Object.keys(dois));
    expect(um).toEqual(dois);

    // A fotografia precisa ter olhado para dados de verdade: comparar dois
    // conjuntos vazios seria igualdade sem conteúdo.
    const comLinhas = Object.entries(um).filter(
      ([, linhas]) => linhas !== "[]",
    );
    expect(comLinhas.length).toBeGreaterThanOrEqual(
      relatorioDoPrimeiro.plantadas.length,
    );
  });

  it("@spec:AC-037 tem no relógio do banco a ÚNICA diferença entre os dois bancos, e em nenhuma outra coluna", async () => {
    const um = await retratoDoBanco(primeiro.migrador);
    const dois = await retratoDoBanco(segundo.migrador);
    const semRelogioUm = await retratoDoBanco(primeiro.migrador, true);
    const semRelogioDois = await retratoDoBanco(segundo.migrador, true);

    // Toda tabela cujo relógio a carga não escreve bate byte a byte, com TODAS
    // as colunas. É isto que impede "ignorar o que incomoda" de virar a forma
    // de fazer a prova passar.
    for (const tabela of Object.keys(um)) {
      if (tabela in RELOGIOS_DO_BANCO) continue;
      expect({ [tabela]: um[tabela] }).toEqual({ [tabela]: dois[tabela] });
    }

    // E a tabela que tem relógio difere COM ele e é idêntica SEM ele: logo, a
    // diferença está exatamente na coluna nomeada, e em mais nada.
    for (const tabela of Object.keys(RELOGIOS_DO_BANCO)) {
      expect(um[tabela]).not.toEqual(dois[tabela]);
      expect(semRelogioUm[tabela]).toEqual(semRelogioDois[tabela]);
    }
  });

  it("@spec:AC-037 acusa diferença de um único caractere entre os dois bancos", async () => {
    const antes = await retratoDoBanco(segundo.migrador, true);

    // A alteração vive só dentro da transação desfeita em seguida: a prova
    // precisa mostrar que a comparação ENXERGA diferença, sem estragar o banco.
    await segundo.migrador.query("BEGIN");
    await segundo.migrador.query(
      "UPDATE app.stores SET name = name || '.' WHERE code = $1",
      [PASTELARIA.codigo],
    );
    const durante = await retratoDoBanco(segundo.migrador, true);
    await segundo.migrador.query("ROLLBACK");

    expect(durante).not.toEqual(antes);
    expect(await retratoDoBanco(segundo.migrador, true)).toEqual(antes);
  });

  it("@spec:AC-037 gera identificadores, datas e valores previsíveis, sem sorteio e sem 'agora'", async () => {
    // Identificador: o mesmo valor no cenário e nos dois bancos.
    const idsDoCenario = LOJAS.map((loja) => loja.id).sort();
    for (const banco of [primeiro, segundo]) {
      const encontrados = await banco.migrador.query<{ id: string }>(
        "SELECT id FROM app.stores ORDER BY id",
      );
      expect(encontrados.rows.map((linha) => linha.id).sort()).toEqual(
        idsDoCenario,
      );
    }

    // Data: derivada da referência, e distante de "agora" o bastante para que
    // um `now()` esquecido em algum valor padrão apareça na comparação.
    const criacao = await primeiro.migrador.query<{ created_at: Date }>(
      "SELECT created_at FROM app.stores ORDER BY code LIMIT 1",
    );
    const plantada = criacao.rows[0]?.created_at;
    expect(plantada).toBeInstanceOf(Date);
    expect(plantada?.getTime()).toBeLessThan(
      DATA_DE_REFERENCIA_PADRAO.getTime(),
    );

    // Valor: dinheiro é inteiro em centavos em todo o cenário (P-005).
    for (const preco of linhasDe("product_prices")) {
      expect(Number.isInteger(preco.amount_cents)).toBe(true);
    }
  });

  it("@spec:AC-037 aceita outra data de referência e desloca o cenário inteiro junto", () => {
    const outraReferencia = new Date("2026-03-01T09:00:00.000Z");
    const deslocado = montarCenario(outraReferencia);

    const original = CENARIO.find((item) => item.tabela === "stores")
      ?.linhas[0];
    const novo = deslocado.find((item) => item.tabela === "stores")?.linhas[0];

    expect(original?.id).toBe(novo?.id);
    expect(original?.created_at).toBeInstanceOf(Date);
    expect(novo?.created_at).toBeInstanceOf(Date);
    // A diferença entre as duas datas é exatamente a diferença entre as
    // referências: nenhuma data foi lida do relógio.
    expect(
      (novo?.created_at as Date).getTime() -
        (original?.created_at as Date).getTime(),
    ).toBe(outraReferencia.getTime() - DATA_DE_REFERENCIA_PADRAO.getTime());
  });
});

// ---------------------------------------------------------------------------
// AC-039 — nunca em produção
// ---------------------------------------------------------------------------

describe("recusa fora do desenvolvimento", () => {
  let bancoDeProducao: BancoDeProva;

  beforeAll(async () => {
    bancoDeProducao = await criarBancoDeProva("prod");
  }, ESPERA_LONGA);

  afterAll(async () => {
    if (bancoDeProducao) await descartarBancoDeProva(bancoDeProducao);
  }, ESPERA_LONGA);

  it("@spec:AC-039 se recusa a rodar quando o ambiente indica produção, e não escreve nada", async () => {
    const antes = await contarLinhas(bancoDeProducao.migrador, "stores");
    expect(antes).toBe(0);

    await expect(
      carregarDadosDeExemplo({
        cliente: bancoDeProducao.administracao,
        referencia: DATA_DE_REFERENCIA_PADRAO,
        ambiente: { NODE_ENV: "production" },
      }),
    ).rejects.toBeInstanceOf(ErroDeAmbienteDeProducao);

    // A recusa explica: sem isso, quem rodou por engano não sabe o que houve.
    await expect(
      carregarDadosDeExemplo({
        cliente: bancoDeProducao.administracao,
        ambiente: { NODE_ENV: "PRODUCTION" },
      }),
    ).rejects.toThrow(/produção/);

    // E nada foi escrito: recusar depois de plantar não seria recusar.
    expect(await contarLinhas(bancoDeProducao.migrador, "stores")).toBe(0);
    expect(await contarLinhas(bancoDeProducao.migrador, "identities")).toBe(0);
    expect(await contarLinhas(bancoDeProducao.migrador, "audit_log")).toBe(0);
  });

  it("@spec:AC-039 se recusa a rodar em banco que já tem loja de verdade, mesmo com o ambiente rotulado como desenvolvimento", async () => {
    // O rótulo de ambiente é o que o operador controla, e ele erra. Esta é a
    // defesa que não depende de rótulo: o banco tem uma loja que não é do
    // exemplo, logo é banco de gente.
    await bancoDeProducao.administracao.query(
      `INSERT INTO app.stores (code, name, slug, status, vertical_code)
       VALUES ('REAL-1', 'Loja de verdade', 'loja-de-verdade', 'ACTIVE', 'FOOD_SNACK')`,
    );

    await expect(
      carregarDadosDeExemplo({
        cliente: bancoDeProducao.administracao,
        referencia: DATA_DE_REFERENCIA_PADRAO,
        ambiente: AMBIENTE_DE_DESENVOLVIMENTO,
      }),
    ).rejects.toBeInstanceOf(ErroDeBancoNaoVazio);

    // A loja de verdade continua sozinha: nenhum dado fictício a alcançou.
    const lojas = await bancoDeProducao.migrador.query<{ slug: string }>(
      "SELECT slug FROM app.stores",
    );
    expect(lojas.rows.map((linha) => linha.slug)).toEqual(["loja-de-verdade"]);
  });

  it("@spec:AC-039 se recusa a recarregar um banco que já tem o exemplo, em vez de plantar por cima", async () => {
    await expect(
      carregarDadosDeExemplo({
        cliente: primeiro.administracao,
        referencia: DATA_DE_REFERENCIA_PADRAO,
        ambiente: AMBIENTE_DE_DESENVOLVIMENTO,
      }),
    ).rejects.toBeInstanceOf(ErroDeBancoNaoVazio);

    // E a carga original continua intacta — recusar não pode ter efeito.
    expect(await contarLinhas(primeiro.migrador, "products")).toBe(
      PRODUTOS.length,
    );
    expect(relatorioDoSegundo.plantadas.length).toBe(
      relatorioDoPrimeiro.plantadas.length,
    );
  });
});

/** A linha de `products` que o cenário descreve para um produto. */
function linhaDoProduto(produto: ProdutoDeExemplo): Record<string, unknown> {
  const encontrada = linhasDe("products").find(
    (linha) =>
      linha.slug === produto.slug && linha.store_id === produto.loja.id,
  );
  if (encontrada === undefined) {
    throw new Error(
      `O cenário não descreve o produto ${produto.slug} da loja ${produto.loja.slug}.`,
    );
  }
  return encontrada;
}
