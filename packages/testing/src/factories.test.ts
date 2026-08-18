import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { beforeAll, describe, expect, it } from "vitest";

import { conectarNoBancoDoArquivo } from "./db-test.ts";
import {
  comoAdministracao,
  comoLoja,
  criarCliente,
  criarIdentidade,
  criarLoja,
  criarMembro,
  criarProduto,
  proximoNumeroDeTeste,
  RAMOS_DE_TESTE,
} from "./factories.ts";

/**
 * Prova dos construtores de dados para teste (AC-038).
 *
 * O que se prova aqui não é que as funções existem, e sim as quatro promessas
 * que fazem uma suíte parar de mentir:
 *
 *   1. um teste monta cenário completo em poucas linhas e o encontra no banco;
 *   2. dois cenários parecidos no MESMO arquivo não se enxergam nem colidem em
 *      chave única;
 *   3. a ordem de execução não altera o resultado;
 *   4. nenhum construtor depende de dado deixado por execução anterior.
 *
 * A promessa 3 não é observável de dentro deste processo — o arquivo tem uma
 * ordem só, e afirmar que a outra ordem passaria seria opinião. Ela executa uma
 * suíte de verdade em outro processo, duas vezes, com a ordem trocada, e
 * compara o que cada caso relatou.
 */

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const VITEST = join(RAIZ, "node_modules/vitest/vitest.mjs");
const CONFIG_DE_PROVA = join(
  RAIZ,
  "packages/testing/fixtures/vitest.fixture.config.ts",
);
const PROVA_DE_ORDEM = join(
  RAIZ,
  "packages/testing/fixtures/ordem-dos-construtores.prova.ts",
);

const executar = promisify(execFile);

/** As tabelas que os construtores escrevem, na ordem em que dependem umas das outras. */
const TABELAS_DOS_CONSTRUTORES = [
  "identities",
  "stores",
  "store_settings",
  "store_members",
  "products",
  "store_customers",
] as const;

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

/** Quantas linhas existem em cada tabela, vistas sem isolamento nenhum. */
async function contarTudo(): Promise<Record<string, number>> {
  const cliente = await conectarNoBancoDoArquivo();
  try {
    const contagem: Record<string, number> = {};
    for (const tabela of TABELAS_DOS_CONSTRUTORES) {
      const resultado = await cliente.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM app.${tabela}`,
      );
      contagem[tabela] = resultado.rows[0]?.total ?? -1;
    }
    return contagem;
  } finally {
    await cliente.end();
  }
}

interface RelatoDeCaso {
  caso: string;
  lojasVisiveis: number;
  nomeDaLoja: string;
  produtos: { nome: string; precoCentavos: number }[];
  membros: number;
  clientes: number;
}

interface ResultadoDaProva {
  readonly codigo: number;
  readonly relatos: RelatoDeCaso[];
}

/**
 * Executa a prova de ordem em outro processo, na ordem pedida, e devolve o que
 * cada caso relatou.
 *
 * O ambiente do filho perde as marcas do Vitest de fora para que ele se comporte
 * como uma execução comum.
 */
async function rodarProvaDeOrdem(
  ordem: "declarada" | "invertida",
): Promise<ResultadoDaProva> {
  const pasta = mkdtempSync(join(tmpdir(), "sc-ordem-"));
  const relato = join(pasta, "relatos.jsonl");

  const ambiente: NodeJS.ProcessEnv = { ...process.env };
  for (const chave of Object.keys(ambiente)) {
    if (chave.startsWith("VITEST")) delete ambiente[chave];
  }
  ambiente.SC_RELATO_DOS_CONSTRUTORES = relato;
  ambiente.SC_ORDEM_DOS_CONSTRUTORES = ordem;

  let codigo = 0;
  try {
    await executar(
      process.execPath,
      [VITEST, "run", "--config", CONFIG_DE_PROVA, PROVA_DE_ORDEM],
      { cwd: RAIZ, env: ambiente, timeout: 180_000 },
    );
  } catch (causa) {
    codigo = (causa as { code?: number }).code ?? 1;
  }

  // Suíte que nem chegou a rodar não deixa relato: lista vazia é resposta
  // legítima aqui, e é o `codigo` que denuncia o que aconteceu.
  let relatos: RelatoDeCaso[];
  try {
    relatos = readFileSync(relato, "utf8")
      .split("\n")
      .filter((linha) => linha.trim() !== "")
      .map((linha) => JSON.parse(linha) as RelatoDeCaso);
  } catch {
    relatos = [];
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }

  return { codigo, relatos };
}

/** Ordena por caso: o relato é comparado pelo conteúdo, não pela sequência. */
function porCaso(relatos: readonly RelatoDeCaso[]): RelatoDeCaso[] {
  return [...relatos].sort((um, outro) => um.caso.localeCompare(outro.caso));
}

// ---------------------------------------------------------------------------
// O estado do banco ANTES de qualquer teste deste arquivo
// ---------------------------------------------------------------------------

/**
 * Capturado no preparo, e não dentro de um teste, de propósito: a pergunta
 * "havia dado antes de eu escrever?" só tem resposta honesta antes do primeiro
 * teste — e capturá-la em `beforeAll` é o que mantém esta prova indiferente à
 * ordem dos testes deste arquivo.
 */
let contagemAntesDeTudo: Record<string, number> = {};

beforeAll(async () => {
  contagemAntesDeTudo = await contarTudo();
});

// ---------------------------------------------------------------------------
// Promessa 1 — cenário completo em poucas linhas
// ---------------------------------------------------------------------------

it("@spec:AC-038 monta um cenário completo em poucas linhas e o encontra no banco", async () => {
  const loja = await criarLoja({ ramo: "lanchonete" });
  const dona = await criarIdentidade({ nome: "Ana da Lanchonete" });
  await criarMembro({ loja, identidade: dona });
  const produto = await criarProduto({ loja, precoCentavos: 1999 });
  const cliente = await criarCliente({ loja, nome: "Cliente fiel" });

  const achado = await comoLoja(loja, async (tx) => {
    const lojas = await tx.query<{ nome: string; ramo: string }>(
      "SELECT name AS nome, vertical_code AS ramo FROM app.stores",
    );
    const produtos = await tx.query<{ id: string; centavos: string }>(
      "SELECT id, display_price_cents::text AS centavos FROM app.products",
    );
    const membros = await tx.query<{ identidade: string; papel: string }>(
      "SELECT identity_id AS identidade, role AS papel FROM app.store_members",
    );
    const clientes = await tx.query<{ id: string; nome: string }>(
      "SELECT id, display_name AS nome FROM app.store_customers",
    );
    return { lojas, produtos, membros, clientes };
  });

  expect(achado.lojas.rows).toEqual([{ nome: loja.nome, ramo: "FOOD_SNACK" }]);
  // Dinheiro é inteiro em centavos, e volta inteiro (P-005).
  expect(achado.produtos.rows).toEqual([{ id: produto.id, centavos: "1999" }]);
  expect(achado.membros.rows).toEqual([
    { identidade: dona.id, papel: "OWNER" },
  ]);
  expect(achado.clientes.rows).toEqual([
    { id: cliente.id, nome: "Cliente fiel" },
  ]);
});

// ---------------------------------------------------------------------------
// Promessa 2 — dois cenários parecidos no mesmo arquivo
// ---------------------------------------------------------------------------

/**
 * Os dois testes abaixo declaram EXATAMENTE o mesmo cenário. É a forma de
 * cobrar as duas coisas de uma vez: se os construtores repetissem código,
 * apelido ou e-mail, o segundo a rodar quebraria em chave única; e se o
 * isolamento não valesse, cada um enxergaria o produto do outro.
 *
 * Nenhum dos dois olha para o total do banco, e é isso que os mantém corretos
 * em qualquer ordem: cada um afirma sobre o que ELE montou.
 */
async function cenarioParecido(): Promise<{
  visiveis: { nome: string; centavos: string }[];
  lojasVisiveis: number;
}> {
  const loja = await criarLoja({ nome: "Padaria do bairro" });
  await criarMembro({ loja });
  await criarProduto({ loja, nome: "Pão na chapa", precoCentavos: 750 });
  await criarCliente({ loja });

  return comoLoja(loja, async (tx) => {
    const produtos = await tx.query<{ nome: string; centavos: string }>(
      `SELECT name AS nome, display_price_cents::text AS centavos
         FROM app.products ORDER BY name`,
    );
    const lojas = await tx.query<{ total: number }>(
      "SELECT count(*)::int AS total FROM app.stores",
    );
    return {
      visiveis: produtos.rows,
      lojasVisiveis: lojas.rows[0]?.total ?? -1,
    };
  });
}

it("@spec:AC-038 o primeiro de dois cenários parecidos enxerga só o que ele montou", async () => {
  const observado = await cenarioParecido();
  expect(observado.visiveis).toEqual([
    { nome: "Pão na chapa", centavos: "750" },
  ]);
  expect(observado.lojasVisiveis).toBe(1);
});

it("@spec:AC-038 o segundo de dois cenários parecidos não colide nem enxerga o do outro", async () => {
  const observado = await cenarioParecido();
  expect(observado.visiveis).toEqual([
    { nome: "Pão na chapa", centavos: "750" },
  ]);
  expect(observado.lojasVisiveis).toBe(1);
});

// ---------------------------------------------------------------------------
// O dado nasce dentro do contexto certo
// ---------------------------------------------------------------------------

it("@spec:AC-038 o que um cenário monta não aparece no contexto de outra loja", async () => {
  const lanchonete = await criarLoja({ ramo: "lanchonete" });
  const modas = await criarLoja({ ramo: "roupas" });

  await criarProduto({ loja: lanchonete, nome: "Coxinha", precoCentavos: 800 });
  await criarCliente({ loja: lanchonete, nome: "Freguês da esquina" });

  const daModas = await comoLoja(modas, async (tx) => {
    const produtos = await tx.query<{ nome: string }>(
      "SELECT name AS nome FROM app.products",
    );
    const clientes = await tx.query<{ nome: string }>(
      "SELECT display_name AS nome FROM app.store_customers",
    );
    return { produtos: produtos.rows, clientes: clientes.rows };
  });

  expect(daModas).toEqual({ produtos: [], clientes: [] });
});

it("o banco recusa escrever numa loja que não é a do contexto", async () => {
  const lanchonete = await criarLoja({ ramo: "lanchonete" });
  const modas = await criarLoja({ ramo: "roupas" });

  // É por isso que os construtores escrevem pela credencial da aplicação
  // dentro do contexto da loja: um construtor que apontasse para a loja errada
  // seria RECUSADO aqui, em vez de plantar um dado que só quebra três tarefas
  // adiante, no teste de isolamento.
  await expect(
    comoLoja(lanchonete, async (tx) =>
      tx.query(
        `INSERT INTO app.products (store_id, name, slug, vertical_code)
         VALUES ($1, 'Produto intruso', 'produto-intruso', $2)`,
        [modas.id, modas.ramoCodigo],
      ),
    ),
  ).rejects.toThrow(/row-level security|política|policy/i);
});

// ---------------------------------------------------------------------------
// Promessa 3 — a ordem não altera o resultado
// ---------------------------------------------------------------------------

it("@spec:AC-038 a mesma suíte em ordem invertida chega ao mesmo resultado", async () => {
  const declarada = await rodarProvaDeOrdem("declarada");
  const invertida = await rodarProvaDeOrdem("invertida");

  // As duas execuções precisam mesmo ter passado: comparar relato de suíte
  // que nem rodou seria comparar duas listas vazias e chamar isso de prova.
  expect(declarada.codigo).toBe(0);
  expect(invertida.codigo).toBe(0);
  expect(declarada.relatos).toHaveLength(2);

  expect(porCaso(invertida.relatos)).toEqual(porCaso(declarada.relatos));

  // E o relato precisa ter conteúdo: cada caso enxerga a própria loja, o
  // próprio produto com o próprio preço, e mais nada.
  expect(porCaso(declarada.relatos)).toEqual([
    {
      caso: "alfa",
      lojasVisiveis: 1,
      nomeDaLoja: "Lanchonete da esquina",
      produtos: [{ nome: "X-Salada", precoCentavos: 1999 }],
      membros: 1,
      clientes: 1,
    },
    {
      caso: "beta",
      lojasVisiveis: 1,
      nomeDaLoja: "Lanchonete da esquina",
      produtos: [{ nome: "X-Salada", precoCentavos: 2999 }],
      membros: 1,
      clientes: 1,
    },
  ]);
}, 360_000);

// ---------------------------------------------------------------------------
// Promessa 4 — nada herdado de execução anterior
// ---------------------------------------------------------------------------

it("@spec:AC-038 os construtores partem de um banco vazio e não herdam nada de antes", async () => {
  // Se qualquer construtor dependesse de carga prévia, este número não seria
  // zero — e o cenário montado logo abaixo não teria como existir.
  expect(contagemAntesDeTudo).toEqual({
    identities: 0,
    stores: 0,
    store_settings: 0,
    store_members: 0,
    products: 0,
    store_customers: 0,
  });

  const loja = await criarLoja({ ramo: "roupas" });
  const produto = await criarProduto({ loja, precoCentavos: 5990 });

  const achado = await comoLoja(loja, async (tx) =>
    tx.query<{ centavos: string }>(
      "SELECT display_price_cents::text AS centavos FROM app.products WHERE id = $1",
      [produto.id],
    ),
  );
  expect(achado.rows).toEqual([{ centavos: "5990" }]);
});

// ---------------------------------------------------------------------------
// Como a unicidade é obtida
// ---------------------------------------------------------------------------

describe("valores únicos", () => {
  it("vêm de um contador do processo, e não de sorteio", () => {
    const primeiro = proximoNumeroDeTeste();
    const segundo = proximoNumeroDeTeste();
    const terceiro = proximoNumeroDeTeste();

    // Crescente de um em um: previsível o bastante para investigar uma falha,
    // único o bastante para não colidir em chave única.
    expect(segundo).toBe(primeiro + 1);
    expect(terceiro).toBe(segundo + 1);
  });

  it("dão apelido e código diferentes a duas lojas pedidas com o mesmo nome", async () => {
    const uma = await criarLoja({ nome: "Loja homônima" });
    const outra = await criarLoja({ nome: "Loja homônima" });

    expect(uma.nome).toBe(outra.nome);
    expect(uma.apelido).not.toBe(outra.apelido);
    expect(uma.codigo).not.toBe(outra.codigo);
    expect(uma.id).not.toBe(outra.id);
  });
});

// ---------------------------------------------------------------------------
// O apelido do ramo continua colado no catálogo do banco
// ---------------------------------------------------------------------------

it("todo ramo do banco tem apelido em português, e nenhum apelido aponta para código inexistente", async () => {
  const doBanco = await comoAdministracao(async (tx) =>
    tx.query<{ code: string }>("SELECT code FROM app.vertical_presets"),
  );

  expect([...Object.values(RAMOS_DE_TESTE)].sort()).toEqual(
    doBanco.rows.map((linha) => linha.code).sort(),
  );
});
