/**
 * O EXPLAIN (ANALYZE, BUFFERS) das consultas quentes (#138), medido como a
 * aplicação mede: `sc_app` com RLS e o contexto de cinco papéis/variáveis que
 * `aplicarContextoNaTransacao` grava (seis `set_config`, `is_local = true`).
 *
 * Tudo roda em `BEGIN READ ONLY`, com `statement_timeout` e `lock_timeout`, e
 * termina em ROLLBACK. O planejador não é alterado (nada de `enable_seqscan`).
 * Duas passagens por cenário: a segunda NÃO prova cache frio (o cache do
 * PostgreSQL e do sistema podem estar quentes nas duas).
 *
 * A saída é sanitizada antes de qualquer gravação (D-10).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import type { ClienteSql } from "../../src/migrate.ts";
import type { Ambiente } from "../simulacao/banco.ts";
import { lerLojasDaBase, numero, texto } from "./base.ts";
import { erroSeguro } from "./carga.ts";
import {
  CATALOGO_DE_CONSULTAS,
  SQL_CATALOGO_PAGINA,
  SQL_CATALOGO_RESUMO,
  SQL_CLIENTE_MAIS_MOVIMENTADO,
  SQL_CONTATO_DO_TOKEN,
  SQL_CONTATOS_DA_FILA,
  SQL_CONTATOS_DO_QUADRO,
  SQL_DIA_DA_LOJA,
  SQL_DIA_DE_PICO,
  SQL_FICHA_DO_CLIENTE,
  SQL_FILA,
  SQL_HISTORICO_DO_CLIENTE,
  SQL_HISTORICO_DO_TOKEN,
  SQL_ITENS_DO_HISTORICO,
  SQL_ITENS_DO_QUADRO,
  SQL_ITENS_DO_TOKEN,
  SQL_LOJA_DO_TOKEN,
  SQL_MEUS_PEDIDOS_CHAMADA,
  SQL_MEUS_PEDIDOS_CORPO,
  SQL_OPCOES_DO_HISTORICO,
  SQL_OPCOES_DO_TOKEN,
  SQL_PEDIDO_PELO_TOKEN,
  SQL_PEDIDO_RECENTE,
  SQL_QUADRO_DE_HOJE,
  SQL_QUADRO_DO_DIA,
  type PapelDoContexto,
} from "./consultas.ts";
import {
  abrirConexaoGuardada,
  type ConexaoDoVolume,
  type FabricaDeConexao,
  fabricaPadrao,
} from "./guarda.ts";
import type { ParametrosDoVolume } from "./parametros.ts";
import {
  distribuirPedidos,
  idDaIdentidadeDoVolume,
  type LojaDoBanco,
} from "./plano.ts";
import { criarSanitizador, type Sanitizador } from "./sanitizar.ts";

export const PASTA_DE_SAIDA = fileURLToPath(new URL("./saida/", import.meta.url));

const DIAS_DE_SOBRA = 3;
const PAGINA_DO_CATALOGO = 24;
const CORTE_DO_RESUMO = 12;

// ---------------------------------------------------------------------------
// Contexto e execução
// ---------------------------------------------------------------------------

export interface ContextoDoPedido {
  readonly lojaId: string;
  readonly usuarioId: string;
  readonly papel: PapelDoContexto;
  readonly tokenDoPedido: string;
}

export const SQL_CONTEXTO = `
  SELECT set_config('app.store_id',    $1, true),
         set_config('app.user_id',     $2, true),
         set_config('app.role',        $3, true),
         set_config('app.order_token', $4, true),
         set_config('app.checkout_key', $5, true),
         set_config('app.cart_session', $6, true)`;

export async function abrirTransacaoDeLeitura(cliente: ClienteSql, contexto: ContextoDoPedido): Promise<void> {
  await cliente.query("BEGIN READ ONLY");
  await cliente.query("SET LOCAL statement_timeout = '60s'");
  await cliente.query("SET LOCAL lock_timeout = '5s'");
  await cliente.query(SQL_CONTEXTO, [contexto.lojaId, contexto.usuarioId, contexto.papel, contexto.tokenDoPedido, "", ""]);
}

export interface RegistroDoPlano {
  readonly consulta: string;
  readonly passada: 1 | 2;
  readonly linhas: number;
  readonly planejamentoMs: number;
  readonly execucaoMs: number;
  readonly compartilhadosEmCache: number;
  readonly compartilhadosLidos: number;
  readonly nosPrincipais: readonly string[];
  readonly plano: unknown;
}

type LinhaSql = Record<string, unknown>;

/** Percorre o plano e junta os tipos de nó (para o resumo). */
export function tiposDeNo(plano: unknown, acumulado: string[] = []): string[] {
  if (plano !== null && typeof plano === "object") {
    const no = plano as Record<string, unknown>;
    if (typeof no["Node Type"] === "string") {
      const alvo = typeof no["Index Name"] === "string" ? ` [${no["Index Name"]}]` : typeof no["Relation Name"] === "string" ? ` [${no["Relation Name"]}]` : "";
      acumulado.push(`${no["Node Type"]}${alvo}`);
    }
    for (const filho of Array.isArray(no["Plans"]) ? no["Plans"] : []) tiposDeNo(filho, acumulado);
  }
  return acumulado;
}

/** Texto do plano derivado do JSON (uma execução só: nada de EXPLAIN duplicado). */
export function textoDoPlano(raiz: unknown): string {
  const linhas: string[] = [];
  const escrever = (no: Record<string, unknown>, nivel: number): void => {
    const recuo = nivel === 0 ? "" : `${"      ".repeat(nivel - 1)}  ->  `;
    const alvo = [no["Relation Name"], no["Index Name"] ? `usando ${String(no["Index Name"])}` : null]
      .filter((x) => x !== undefined && x !== null && x !== "")
      .join(" ");
    linhas.push(
      `${recuo}${String(no["Node Type"])}${alvo === "" ? "" : ` em ${alvo}`}  (custo=${String(no["Startup Cost"])}..${String(no["Total Cost"])} linhas=${String(no["Plan Rows"])})  (tempo real=${String(no["Actual Startup Time"])}..${String(no["Actual Total Time"])} linhas=${String(no["Actual Rows"])} voltas=${String(no["Actual Loops"])})`,
    );
    const indent = `${"      ".repeat(nivel)}        `;
    for (const [rotulo, chave] of [["Index Cond", "Index Cond"], ["Filter", "Filter"], ["Sort Key", "Sort Key"], ["Rows Removed by Filter", "Rows Removed by Filter"]] as const) {
      if (no[chave] !== undefined) linhas.push(`${indent}${rotulo}: ${JSON.stringify(no[chave])}`);
    }
    const hit = no["Shared Hit Blocks"];
    const lido = no["Shared Read Blocks"];
    if (hit !== undefined || lido !== undefined) {
      linhas.push(`${indent}Buffers: shared hit=${String(hit ?? 0)} read=${String(lido ?? 0)}`);
    }
    for (const filho of Array.isArray(no["Plans"]) ? (no["Plans"] as Record<string, unknown>[]) : []) {
      escrever(filho, nivel + 1);
    }
  };
  const topo = raiz as { Plan?: Record<string, unknown>; "Planning Time"?: number; "Execution Time"?: number } | null;
  if (topo?.Plan !== undefined) escrever(topo.Plan, 0);
  linhas.push(`Planning Time: ${String(topo?.["Planning Time"])} ms`);
  linhas.push(`Execution Time: ${String(topo?.["Execution Time"])} ms`);
  return linhas.join("\n");
}

const somaDeBlocos = (plano: unknown, chave: string): number => {
  let total = 0;
  const visitar = (no: unknown): void => {
    if (no === null || typeof no !== "object") return;
    const n = no as Record<string, unknown>;
    if (typeof n[chave] === "number") total += n[chave] as number;
    for (const f of Array.isArray(n["Plans"]) ? n["Plans"] : []) visitar(f);
  };
  visitar((plano as { Plan?: unknown } | null)?.Plan);
  return total;
};

/**
 * Executa o EXPLAIN de uma consulta. Devolve as linhas do plano e as da própria
 * consulta (de uma execução simples, só na 1ª passada, para colher ids).
 */
async function explicarUma(
  cliente: ClienteSql,
  consulta: string,
  sql: string,
  valores: unknown[],
  passada: 1 | 2,
): Promise<RegistroDoPlano> {
  const r = await cliente.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, valores);
  const bruto = r.rows[0]?.["QUERY PLAN"];
  const topo = (Array.isArray(bruto) ? bruto[0] : bruto) as { Plan?: Record<string, unknown>; "Planning Time"?: number; "Execution Time"?: number } | undefined;
  return {
    consulta,
    passada,
    linhas: Number(topo?.Plan?.["Actual Rows"] ?? 0),
    planejamentoMs: Number(topo?.["Planning Time"] ?? 0),
    execucaoMs: Number(topo?.["Execution Time"] ?? 0),
    compartilhadosEmCache: somaDeBlocos(topo, "Shared Hit Blocks"),
    compartilhadosLidos: somaDeBlocos(topo, "Shared Read Blocks"),
    nosPrincipais: tiposDeNo(topo?.Plan),
    plano: topo,
  };
}

// ---------------------------------------------------------------------------
// Cenários
// ---------------------------------------------------------------------------

export interface CenarioExecutado {
  readonly id: string;
  readonly descricao: string;
  readonly loja: string;
  readonly papel: PapelDoContexto;
  readonly conexao: "sc_app" | "sc_admin";
  readonly parametros: Readonly<Record<string, string | number>>;
  readonly registros: readonly RegistroDoPlano[];
  readonly vazio: boolean;
}

interface Passo {
  readonly consulta: string;
  readonly sql: string;
  /** Valores ligados, a partir do que os passos anteriores colheram. */
  readonly valores: (estado: Estado) => unknown[];
  /** Colhe ids/linhas do resultado (só na 1ª passada, por execução simples). */
  readonly colher?: (linhas: LinhaSql[], estado: Estado) => void;
}

interface Estado {
  pedidos: string[];
  itens: string[];
  linhasDoDia: LinhaSql | null;
}

const estadoVazio = (): Estado => ({ pedidos: [], itens: [], linhasDoDia: null });

async function rodarCenario(
  cliente: ConexaoDoVolume,
  base: Omit<CenarioExecutado, "registros" | "vazio">,
  contexto: ContextoDoPedido,
  passos: readonly Passo[],
  valoresSensiveis: Set<string>,
): Promise<CenarioExecutado> {
  const registros: RegistroDoPlano[] = [];
  const estado = estadoVazio();
  for (const passada of [1, 2] as const) {
    await abrirTransacaoDeLeitura(cliente, contexto);
    try {
      for (const passo of passos) {
        const valores = passo.valores(estado);
        for (const v of valores) if (typeof v === "string") valoresSensiveis.add(v);
        if (passada === 1 && passo.colher !== undefined) {
          const simples = await cliente.query(passo.sql, valores);
          passo.colher(simples.rows, estado);
        }
        registros.push(await explicarUma(cliente, passo.consulta, passo.sql, valores, passada));
      }
    } finally {
      await cliente.query("ROLLBACK").catch(() => {});
    }
  }
  const principal = registros.find((r) => r.passada === 1);
  return { ...base, registros, vazio: principal === undefined || principal.linhas === 0 };
}

const idsDe = (linhas: LinhaSql[], coluna: string): string[] => linhas.map((l) => texto(l, coluna));

/** A data local de Fortaleza (`2026-11-01`) de um instante. */
export function diaLocalDeFortaleza(instante: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit" }).format(instante);
}

function passosDoQuadro(lojaId: string, dia: string | null, hoje: boolean): Passo[] {
  return [
    {
      consulta: "dia-da-loja",
      sql: SQL_DIA_DA_LOJA,
      valores: () => [lojaId, dia, DIAS_DE_SOBRA],
      colher: (linhas, e) => {
        e.linhasDoDia = linhas[0] ?? null;
      },
    },
    {
      consulta: hoje ? "quadro-de-hoje" : "quadro-do-dia",
      sql: hoje ? SQL_QUADRO_DE_HOJE : SQL_QUADRO_DO_DIA,
      valores: (e) =>
        hoje
          ? [lojaId, e.linhasDoDia?.["inicio"], e.linhasDoDia?.["fim"], e.linhasDoDia?.["limite_de_sobra"]]
          : [lojaId, e.linhasDoDia?.["inicio"], e.linhasDoDia?.["fim"]],
      colher: (linhas, e) => {
        e.pedidos = idsDe(linhas, "id");
      },
    },
    { consulta: "quadro-contatos", sql: SQL_CONTATOS_DO_QUADRO, valores: (e) => [e.pedidos] },
    { consulta: "quadro-itens", sql: SQL_ITENS_DO_QUADRO, valores: (e) => [e.pedidos] },
  ];
}

// ---------------------------------------------------------------------------
// Provas negativas de RLS
// ---------------------------------------------------------------------------

export interface ProvaNegativa {
  readonly nome: string;
  readonly esperado: string;
  readonly obtido: number;
  readonly ok: boolean;
}

async function contar(
  cliente: ConexaoDoVolume,
  contexto: ContextoDoPedido,
  sql: string,
  valores: unknown[],
): Promise<number> {
  await abrirTransacaoDeLeitura(cliente, contexto);
  try {
    const r = await cliente.query(sql, valores);
    return numero(r.rows[0]!, "n");
  } finally {
    await cliente.query("ROLLBACK").catch(() => {});
  }
}

export async function provasNegativas(
  app: ConexaoDoVolume,
  lojaA: LojaDoBanco,
  lojaB: LojaDoBanco,
  identidade: string,
  tokenDeA: string,
  tokenDeB: string,
  valoresSensiveis: Set<string>,
): Promise<ProvaNegativa[]> {
  const provas: ProvaNegativa[] = [];
  const registrar = (nome: string, esperado: string, obtido: number, ok: boolean): void => {
    provas.push({ nome, esperado, obtido, ok });
  };
  const donoDeA = lojaA.quemMudaStatus ?? "";
  const donoDeB = lojaB.quemMudaStatus ?? "";
  const comoDonoDeA: ContextoDoPedido = { lojaId: lojaA.id, usuarioId: donoDeA, papel: "OWNER", tokenDoPedido: "" };
  const publico = (lojaId: string, token: string): ContextoDoPedido => ({ lojaId, usuarioId: "", papel: "PUBLIC", tokenDoPedido: token });
  const contarPedidos = `SELECT count(*)::int AS n FROM app.orders WHERE store_id = $1::uuid`;

  const proprios = await contar(app, comoDonoDeA, contarPedidos, [lojaA.id]);
  registrar("dono da loja A enxerga os pedidos da loja A (controle positivo)", "> 0", proprios, proprios > 0);
  const alheios = await contar(app, comoDonoDeA, contarPedidos, [lojaB.id]);
  registrar("dono da loja A NÃO enxerga pedidos da loja B", "0", alheios, alheios === 0);
  const donoB = await contar(app, { ...comoDonoDeA, lojaId: lojaB.id, usuarioId: donoDeB }, contarPedidos, [lojaA.id]);
  registrar("dono da loja B NÃO enxerga pedidos da loja A", "0", donoB, donoB === 0);

  const porToken = `SELECT count(*)::int AS n FROM app.orders WHERE public_token = $1`;
  const certo = await contar(app, publico(lojaA.id, tokenDeA), porToken, [tokenDeA]);
  registrar("token certo na loja certa encontra o pedido (controle positivo)", "1", certo, certo === 1);
  const errado = "0".repeat(40);
  valoresSensiveis.add(errado);
  const comTokenErrado = await contar(app, publico(lojaA.id, errado), porToken, [errado]);
  registrar("token inexistente não encontra pedido", "0", comTokenErrado, comTokenErrado === 0);
  const cruzado = await contar(app, publico(lojaA.id, tokenDeB), porToken, [tokenDeB]);
  registrar("token de outra loja não vale no contexto da loja A", "0", cruzado, cruzado === 0);
  const semToken = await contar(app, publico(lojaA.id, ""), porToken, [tokenDeA]);
  registrar("sem token declarado, o pedido não é lido", "0", semToken, semToken === 0);

  const meus = `SELECT count(*)::int AS n FROM app.meus_pedidos(NULL::uuid)`;
  const daIdentidade = await contar(app, { lojaId: "", usuarioId: identidade, papel: "CUSTOMER", tokenDoPedido: "" }, meus, []);
  registrar("cliente vinculado vê os próprios pedidos em meus_pedidos (controle positivo)", "> 0", daIdentidade, daIdentidade > 0);
  const outroUsuario = "00000000-0000-4000-8000-000000000001";
  const alheio = await contar(app, { lojaId: "", usuarioId: outroUsuario, papel: "CUSTOMER", tokenDoPedido: "" }, meus, []);
  registrar("cliente alheio NÃO vê pedidos em meus_pedidos", "0", alheio, alheio === 0);
  const comoPublico = await contar(app, { lojaId: "", usuarioId: identidade, papel: "PUBLIC", tokenDoPedido: "" }, meus, []);
  registrar("papel PUBLIC não usa meus_pedidos", "0", comoPublico, comoPublico === 0);
  return provas;
}

// ---------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------

export interface ResultadoDoExplain {
  readonly cenarios: readonly CenarioExecutado[];
  readonly negativas: readonly ProvaNegativa[];
  readonly autoanalyze: readonly { readonly tabela: string; readonly ultimo: string | null }[];
  readonly bloqueados: readonly string[];
  readonly ok: boolean;
  readonly arquivos: readonly string[];
  readonly ms: number;
}

export interface OpcoesDoExplain {
  readonly fabrica?: FabricaDeConexao;
  readonly relatar?: (linha: string) => void;
  /** Pasta de saída; `null` não grava (testes). */
  readonly pasta?: string | null;
}

export async function explicar(
  env: Ambiente,
  params: ParametrosDoVolume,
  opcoes: OpcoesDoExplain = {},
): Promise<ResultadoDoExplain> {
  const inicio = performance.now();
  const fabrica = opcoes.fabrica ?? fabricaPadrao;
  const relatar = opcoes.relatar ?? (() => {});
  const app = await abrirConexaoGuardada(env, "sc_app", fabrica);
  let admin: ConexaoDoVolume | null = null;
  try {
    admin = await abrirConexaoGuardada(env, "sc_admin", fabrica);
    await admin.query("SET default_transaction_read_only = on");
    await app.query("SET default_transaction_read_only = on");

    const lojas = await lerLojasDaBase(admin);
    const quantidades = distribuirPedidos(params.semente, lojas.length);
    const menor = quantidades.indexOf(Math.min(...quantidades));
    const maior = quantidades.indexOf(Math.max(...quantidades));
    const alvos = [lojas[menor]!, lojas[maior]!];
    const sensiveis = new Set<string>();
    const cenarios: CenarioExecutado[] = [];
    const bloqueados: string[] = [];
    const diaDaReferencia = diaLocalDeFortaleza(params.referencia);
    const identidade = idDaIdentidadeDoVolume(params.semente);
    sensiveis.add(identidade);

    const autoanalyze = (
      await admin.query(
        `SELECT relname, greatest(last_autoanalyze, last_analyze) AS ultimo FROM pg_stat_user_tables
          WHERE schemaname = 'app' AND relname IN ('orders','order_items','order_item_options','order_status_history','order_contacts','store_customers')
          ORDER BY relname`,
      )
    ).rows.map((l) => ({ tabela: texto(l, "relname"), ultimo: l["ultimo"] === null ? null : new Date(texto(l, "ultimo")).toISOString() }));

    for (const loja of alvos) {
      const rotulo = `${loja.codigo} (${loja === alvos[0] ? "menor" : "maior"} do volume)`;
      const dono = loja.quemMudaStatus;
      if (dono === null) {
        bloqueados.push(`${loja.codigo}: sem a identidade da dona nos pedidos-base; cenários de painel bloqueados.`);
        continue;
      }
      const comoDono: ContextoDoPedido = { lojaId: loja.id, usuarioId: dono, papel: "OWNER", tokenDoPedido: "" };
      const publico = (token: string): ContextoDoPedido => ({ lojaId: loja.id, usuarioId: "", papel: "PUBLIC", tokenDoPedido: token });
      const base = (id: string, descricao: string, papel: PapelDoContexto, parametros: Record<string, string | number> = {}) => ({
        id, descricao, loja: rotulo, papel, conexao: "sc_app" as const, parametros,
      });

      // Dia de maior movimento da loja.
      const pico = (await admin.query(SQL_DIA_DE_PICO, [loja.id])).rows[0];
      const diaDePico = pico === undefined ? diaDaReferencia : texto(pico, "dia");

      cenarios.push(
        await rodarCenario(app, base("quadro-dia-da-referencia", "Quadro do dia da referência", "OWNER", { dia: diaDaReferencia }), comoDono, passosDoQuadro(loja.id, diaDaReferencia, false), sensiveis),
        await rodarCenario(app, base("quadro-dia-de-pico", "Quadro do dia de maior movimento", "OWNER", { dia: diaDePico }), comoDono, passosDoQuadro(loja.id, diaDePico, false), sensiveis),
        await rodarCenario(app, base("quadro-de-hoje-simulado", "Quadro de hoje com pendências anteriores (datas fixas a partir da referência; equivalente parametrizado)", "OWNER", { dia: diaDaReferencia }), comoDono, passosDoQuadro(loja.id, diaDaReferencia, true), sensiveis),
        await rodarCenario(app, base("fila-do-painel", "Fila de pedidos em aberto", "OWNER"), comoDono, [
          { consulta: "fila", sql: SQL_FILA, valores: () => [loja.id], colher: (l, e) => { e.pedidos = idsDe(l, "id"); } },
          { consulta: "fila-contatos", sql: SQL_CONTATOS_DA_FILA, valores: (e) => [e.pedidos] },
        ], sensiveis),
      );

      // Histórico do cliente mais movimentado.
      const cliente = (await admin.query(SQL_CLIENTE_MAIS_MOVIMENTADO, [loja.id])).rows[0];
      if (cliente !== undefined) {
        const clienteId = texto(cliente, "id");
        sensiveis.add(clienteId);
        cenarios.push(
          await rodarCenario(app, base("historico-do-cliente", "Histórico do cliente mais movimentado (limite 100)", "OWNER"), comoDono, [
            { consulta: "historico-ficha", sql: SQL_FICHA_DO_CLIENTE, valores: () => [clienteId] },
            { consulta: "historico-pedidos", sql: SQL_HISTORICO_DO_CLIENTE, valores: () => [clienteId], colher: (l, e) => { e.pedidos = idsDe(l, "id"); } },
            { consulta: "historico-itens", sql: SQL_ITENS_DO_HISTORICO, valores: (e) => [e.pedidos], colher: (l, e) => { e.itens = idsDe(l, "id"); } },
            { consulta: "historico-opcoes", sql: SQL_OPCOES_DO_HISTORICO, valores: (e) => [e.itens] },
          ], sensiveis),
        );
      } else {
        bloqueados.push(`${loja.codigo}: nenhum cliente com pedidos para o histórico.`);
      }

      // Catálogo público da loja.
      cenarios.push(
        await rodarCenario(app, base("catalogo-da-vitrine", "Resumo por seção e página (menor preço) do catálogo público", "PUBLIC"), publico(""), [
          { consulta: "catalogo-resumo", sql: SQL_CATALOGO_RESUMO, valores: () => [[], false, false, CORTE_DO_RESUMO] },
          { consulta: "catalogo-pagina", sql: SQL_CATALOGO_PAGINA, valores: () => [[], false, "menor-preco", null, params.referencia.toISOString(), false, PAGINA_DO_CATALOGO, 0] },
        ], sensiveis),
      );

      // Pedido pelo token (o pedido mais recente da loja).
      const recente = (await admin.query(SQL_PEDIDO_RECENTE, [loja.id])).rows[0];
      if (recente !== undefined) {
        const token = texto(recente, "public_token");
        sensiveis.add(token);
        cenarios.push(
          await rodarCenario(app, base("pedido-pelo-token", "Acompanhamento do pedido pelo token público", "PUBLIC"), publico(token), [
            { consulta: "token-pedido", sql: SQL_PEDIDO_PELO_TOKEN, valores: () => [token], colher: (l, e) => { e.pedidos = idsDe(l, "id"); } },
            { consulta: "token-contato", sql: SQL_CONTATO_DO_TOKEN, valores: (e) => [e.pedidos] },
            { consulta: "token-itens", sql: SQL_ITENS_DO_TOKEN, valores: (e) => [e.pedidos], colher: (l, e) => { e.itens = idsDe(l, "id"); } },
            { consulta: "token-opcoes", sql: SQL_OPCOES_DO_TOKEN, valores: (e) => [e.itens] },
            { consulta: "token-historico", sql: SQL_HISTORICO_DO_TOKEN, valores: (e) => [e.pedidos] },
            { consulta: "token-loja", sql: SQL_LOJA_DO_TOKEN, valores: () => [] },
          ], sensiveis),
        );
      }
      relatar(`explain: cenários da loja ${loja.codigo} medidos.`);
    }

    // meus_pedidos: a conta sintética do volume (cenário único, atravessa as lojas ligadas).
    const comoCliente: ContextoDoPedido = { lojaId: "", usuarioId: identidade, papel: "CUSTOMER", tokenDoPedido: "" };
    cenarios.push(
      await rodarCenario(app, { id: "meus-pedidos-chamada", descricao: "Conta do cliente: chamada de app.meus_pedidos (Function Scan)", loja: "várias (identidade sintética)", papel: "CUSTOMER", conexao: "sc_app", parametros: {} }, comoCliente, [
        { consulta: "meus-pedidos-chamada", sql: SQL_MEUS_PEDIDOS_CHAMADA, valores: () => [] },
      ], sensiveis),
      await rodarCenario(admin, { id: "meus-pedidos-corpo", descricao: "Conta do cliente: corpo de app.meus_pedidos, medido como sc_admin", loja: "várias (identidade sintética)", papel: "CUSTOMER", conexao: "sc_admin", parametros: {} }, comoCliente, [
        { consulta: "meus-pedidos-corpo", sql: SQL_MEUS_PEDIDOS_CORPO, valores: () => [] },
      ], sensiveis),
    );

    // Provas negativas.
    const tokenDe = async (loja: LojaDoBanco): Promise<string> => texto((await admin!.query(SQL_PEDIDO_RECENTE, [loja.id])).rows[0] ?? { public_token: "" }, "public_token");
    const tokenA = await tokenDe(alvos[0]!);
    const tokenB = await tokenDe(alvos[1]!);
    sensiveis.add(tokenA);
    sensiveis.add(tokenB);
    const negativas = await provasNegativas(app, alvos[0]!, alvos[1]!, identidade, tokenA, tokenB, sensiveis);

    // Sanitização + gravação.
    const sanitizador = criarSanitizador([...sensiveis]);
    const arquivos = await gravarArtefatos(cenarios, negativas, autoanalyze, sanitizador, opcoes.pasta === undefined ? PASTA_DE_SAIDA : opcoes.pasta);
    const vazios = cenarios.filter((c) => c.vazio).map((c) => `${c.id} (${c.loja})`);
    const problemas = [...bloqueados, ...vazios.map((v) => `cenário sem linhas: ${v}`), ...negativas.filter((p) => !p.ok).map((p) => `prova negativa falhou: ${p.nome}`)];
    return { cenarios, negativas, autoanalyze, bloqueados: problemas, ok: problemas.length === 0, arquivos, ms: performance.now() - inicio };
  } catch (erro) {
    throw erroSeguro("explain", erro);
  } finally {
    await admin?.end().catch(() => {});
    await app.end().catch(() => {});
  }
}

export async function gravarArtefatos(
  cenarios: readonly CenarioExecutado[],
  negativas: readonly ProvaNegativa[],
  autoanalyze: ResultadoDoExplain["autoanalyze"],
  sanitizador: Sanitizador,
  pasta: string | null,
): Promise<string[]> {
  const saida: { nome: string; conteudo: string }[] = [];
  for (const c of cenarios) {
    const json = JSON.stringify(sanitizador.json({
      cenario: c.id, descricao: c.descricao, loja: c.loja, papel: c.papel, conexao: c.conexao, parametros: c.parametros,
      consultas: CATALOGO_DE_CONSULTAS.filter((q) => c.registros.some((r) => r.consulta === q.id)).map((q) => ({ id: q.id, origem: q.origem, fonte: q.fonte })),
      registros: c.registros,
    }), null, 2);
    const textual = c.registros
      .map((r) => `=== ${r.consulta} — passada ${r.passada} ===\n${sanitizador.texto(textoDoPlano(r.plano))}`)
      .join("\n\n");
    saida.push({ nome: `${c.id}-${c.loja.split(" ")[0]}.json`, conteudo: json });
    saida.push({ nome: `${c.id}-${c.loja.split(" ")[0]}.txt`, conteudo: `${c.descricao}\n\n${textual}\n` });
  }
  saida.push({ nome: "negativas.json", conteudo: JSON.stringify(sanitizador.json({ provas: negativas }), null, 2) });
  saida.push({ nome: "autoanalyze.json", conteudo: JSON.stringify({ tabelas: autoanalyze }, null, 2) });
  for (const arquivo of saida) {
    const sobras = sanitizador.varrer(arquivo.conteudo);
    if (sobras.length > 0) {
      throw new Error(`A saída ${arquivo.nome} ainda contém dado sensível (${sobras.join(", ")}): nada foi gravado.`);
    }
  }
  if (pasta === null) return saida.map((a) => a.nome);
  const diretorio = `${pasta}explain/`;
  await mkdir(diretorio, { recursive: true });
  for (const arquivo of saida) await writeFile(`${diretorio}${arquivo.nome}`, arquivo.conteudo, "utf8");
  return saida.map((a) => a.nome);
}

