/**
 * A comparação antes × depois do gargalo (#142):
 *
 *   node tests/performance/ambiente/comparar.ts carga-antes-1 carga-antes-2 -- carga-depois-1 carga-depois-2
 *
 * Lê `saida/<rótulo>/{metadados,resumo,reconciliacao}.json` e
 * `explain/gargalo.json` de cada execução e grava
 * `saida/comparacao.{json,md}`. RECUSA comparar (código 1) quando:
 * - o antes não tem o corpo da 0029 vigente, ou o depois não tem o da 0074;
 * - o harness (hash do conteúdo de tests/performance e seed) difere;
 * - as migrações diferem em algo além da 0074;
 * - perfil, semente, referência, versão do k6 ou volume diferem;
 * - alguma execução não é válida como medida;
 * - o número de chamadas do cenário conta difere em mais de 1 (a última
 *   iteração pode ser interrompida no fim do cenário).
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { gravarJson, lerJson, RAIZ } from "./apoio.ts";
import { MIGRACAO_NOVA } from "./corpos-de-meus-pedidos.ts";

export interface Execucao {
  rotulo: string;
  metadados: {
    seed: { semente: string; dataDeReferencia: string };
    revisao: { sha12?: string; hashDoHarness?: string };
    banco?: { migracoes: string[]; corpoVigenteDeMeusPedidos: string };
    volume?: { carregado: boolean; pedidos: number };
  } | null;
  k6: { versao: string; perfil: string } | null;
  resumo: {
    operacoes: Record<string, { requisicoes: number; porSegundo: number; p50: number; p95: number; p99: number; falhasHttp: number }>;
    vazao?: { requisicoesPorSegundo: number; iteracoesPorSegundo: number; compras: number; comprasDoPreparo: number };
    validade?: { ok: boolean };
    metasDeP95?: { ok: boolean };
    janelaDeControle?: Record<string, number | null>;
    trabalhoFixo?: { iteracoesDaConta: number | null; descartadasDaConta: number; linhasPorChamada: Record<string, number | null> };
    taxaDeFalhasInesperadas: number;
  } | null;
  reconciliacao: { aprovada: boolean; pedidosIniciais: number | null; pedidosNovosNoBanco: number; classes: Record<string, unknown[]> } | null;
  gargalo: {
    corpoVigente: string;
    medidas: { rotulo: string; tempoMs: number; linhas: number; seqScanEm: string[] }[];
  } | null;
}

export function lerExecucao(rotulo: string, base = resolve(RAIZ, "tests/performance/saida")): Execucao {
  const pasta = resolve(base, rotulo);
  return {
    rotulo,
    metadados: lerJson(resolve(pasta, "metadados.json")),
    k6: lerJson(resolve(pasta, "k6.json")),
    resumo: lerJson(resolve(pasta, "resumo.json")),
    reconciliacao: lerJson(resolve(pasta, "reconciliacao.json")),
    gargalo: lerJson(resolve(pasta, "explain/gargalo.json")),
  };
}

/** Os motivos para NÃO comparar (lista vazia = comparação válida). */
export function motivosDeRecusa(antes: readonly Execucao[], depois: readonly Execucao[]): string[] {
  const m: string[] = [];
  if (antes.length === 0 || depois.length === 0) return ["informe ao menos uma execução de cada lado"];
  const todas = [...antes, ...depois];
  for (const e of todas) {
    if (!e.metadados || !e.k6 || !e.resumo || !e.reconciliacao || !e.gargalo) {
      m.push(`${e.rotulo}: artefatos incompletos`);
      continue;
    }
    if (!e.reconciliacao.aprovada) m.push(`${e.rotulo}: reconciliação reprovada`);
    if (e.resumo.validade?.ok !== true) m.push(`${e.rotulo}: execução não é válida como medida`);
    if (e.metadados.volume?.carregado !== true) m.push(`${e.rotulo}: sem o volume de 100 mil pedidos`);
  }
  if (m.length > 0) return m;
  for (const e of antes)
    if (e.metadados?.banco?.corpoVigenteDeMeusPedidos !== "0029" || e.gargalo?.corpoVigente !== "0029")
      m.push(`${e.rotulo}: o antes precisa rodar com o corpo da 0029 vigente`);
  for (const e of depois)
    if (e.metadados?.banco?.corpoVigenteDeMeusPedidos !== "0074" || e.gargalo?.corpoVigente !== "0074")
      m.push(`${e.rotulo}: o depois precisa rodar com o corpo da 0074 vigente`);
  const ref = todas[0];
  const igual = (rotulo: string, f: (e: Execucao) => unknown): void => {
    const valor = JSON.stringify(f(ref));
    for (const e of todas) if (JSON.stringify(f(e)) !== valor) m.push(`${rotulo} difere entre ${ref.rotulo} e ${e.rotulo}`);
  };
  igual("o harness (hashDoHarness)", (e) => e.metadados?.revisao.hashDoHarness);
  igual("a semente", (e) => e.metadados?.seed.semente);
  igual("a referência", (e) => e.metadados?.seed.dataDeReferencia);
  igual("a versão do k6", (e) => e.k6?.versao);
  igual("o perfil", (e) => e.k6?.perfil);
  igual("o volume", (e) => e.metadados?.volume?.pedidos);
  const migracoes = (e: Execucao): string[] => e.metadados?.banco?.migracoes ?? [];
  for (const a of antes) for (const d of depois) {
    const extra = migracoes(d).filter((x) => !migracoes(a).includes(x));
    const faltando = migracoes(a).filter((x) => !migracoes(d).includes(x));
    if (faltando.length > 0 || extra.length !== 1 || extra[0] !== MIGRACAO_NOVA)
      m.push(`entre ${a.rotulo} e ${d.rotulo} as migrações diferem em ${JSON.stringify({ extra, faltando })} (só a ${MIGRACAO_NOVA} pode)`);
  }
  const chamadas = todas.map((e) => e.resumo?.trabalhoFixo?.iteracoesDaConta ?? -1);
  if (chamadas.some((n) => n < 0) || Math.max(...chamadas) - Math.min(...chamadas) > 1)
    m.push(`o número de chamadas do cenário conta difere: ${chamadas.join(", ")}`);
  return m;
}

const mediana = (xs: number[]): number => {
  const o = [...xs].sort((a, b) => a - b);
  const meio = Math.floor(o.length / 2);
  return o.length % 2 ? o[meio] : (o[meio - 1] + o[meio]) / 2;
};

const OPS = ["meus_pedidos", "fila", "catalogo", "criar", "replay", "consulta", "vitrine", "produto"] as const;

export function montarTabela(antes: readonly Execucao[], depois: readonly Execucao[]): {
  linhas: Record<string, unknown>[];
  markdown: string;
} {
  const lado = (es: readonly Execucao[]) => ({
    p95: (op: string) => mediana(es.map((e) => e.resumo?.operacoes[op]?.p95 ?? 0)),
    p99: (op: string) => mediana(es.map((e) => e.resumo?.operacoes[op]?.p99 ?? 0)),
    falhas: (op: string) => mediana(es.map((e) => e.resumo?.operacoes[op]?.falhasHttp ?? 0)),
    rps: (op: string) => mediana(es.map((e) => e.resumo?.operacoes[op]?.porSegundo ?? 0)),
    cada: (op: string) => es.map((e) => Math.round(e.resumo?.operacoes[op]?.p95 ?? 0)).join(" / "),
  });
  const a = lado(antes);
  const d = lado(depois);
  const ms = (n: number): string => `${Math.round(n)} ms`;
  const linhas: Record<string, unknown>[] = [];
  const md: string[] = [
    "| operação | p95 antes (mediana; cada) | p95 depois (mediana; cada) | p99 antes | p99 depois | req/s antes | req/s depois | falhas HTTP antes | depois |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const op of OPS) {
    const linha = {
      op,
      p95Antes: a.p95(op),
      p95Depois: d.p95(op),
      p99Antes: a.p99(op),
      p99Depois: d.p99(op),
      rpsAntes: a.rps(op),
      rpsDepois: d.rps(op),
      falhasAntes: a.falhas(op),
      falhasDepois: d.falhas(op),
    };
    linhas.push(linha);
    md.push(
      `| ${op} | ${ms(linha.p95Antes)} (${a.cada(op)}) | ${ms(linha.p95Depois)} (${d.cada(op)}) | ${ms(linha.p99Antes)} | ${ms(linha.p99Depois)} | ${linha.rpsAntes.toFixed(2)} | ${linha.rpsDepois.toFixed(2)} | ${(linha.falhasAntes * 100).toFixed(2)}% | ${(linha.falhasDepois * 100).toFixed(2)}% |`,
    );
  }
  return { linhas, markdown: md.join("\n") };
}

function principal(): number {
  const args = process.argv.slice(2);
  const corte = args.indexOf("--");
  if (corte < 0) {
    process.stderr.write("uso: comparar.ts <antes...> -- <depois...>\n");
    return 2;
  }
  const antes = args.slice(0, corte).map((r) => lerExecucao(r));
  const depois = args.slice(corte + 1).map((r) => lerExecucao(r));
  const recusas = motivosDeRecusa(antes, depois);
  const saida = resolve(RAIZ, "tests/performance/saida");
  if (recusas.length > 0) {
    process.stderr.write(`✘ comparação recusada:\n  - ${recusas.join("\n  - ")}\n`);
    gravarJson(resolve(saida, "comparacao.json"), { valida: false, recusas });
    return 1;
  }
  const { linhas, markdown } = montarTabela(antes, depois);
  const extra = (es: readonly Execucao[], f: (e: Execucao) => unknown): string => es.map(f).map(String).join(" / ");
  const md = [
    "# Antes × depois — app.meus_pedidos (0029 → 0074)",
    "",
    `Antes: ${antes.map((e) => e.rotulo).join(", ")} · Depois: ${depois.map((e) => e.rotulo).join(", ")}`,
    "",
    markdown,
    "",
    "| | antes | depois |",
    "|---|---|---|",
    `| vazão total (req/s) | ${extra(antes, (e) => e.resumo?.vazao?.requisicoesPorSegundo.toFixed(2))} | ${extra(depois, (e) => e.resumo?.vazao?.requisicoesPorSegundo.toFixed(2))} |`,
    `| compras na jornada mista | ${extra(antes, (e) => e.resumo?.vazao?.compras)} | ${extra(depois, (e) => e.resumo?.vazao?.compras)} |`,
    `| chamadas do cenário conta | ${extra(antes, (e) => e.resumo?.trabalhoFixo?.iteracoesDaConta)} | ${extra(depois, (e) => e.resumo?.trabalhoFixo?.iteracoesDaConta)} |`,
    `| falhas inesperadas | ${extra(antes, (e) => `${((e.resumo?.taxaDeFalhasInesperadas ?? 0) * 100).toFixed(2)}%`)} | ${extra(depois, (e) => `${((e.resumo?.taxaDeFalhasInesperadas ?? 0) * 100).toFixed(2)}%`)} |`,
    `| controle: p95 catálogo nos 2 min iniciais | ${extra(antes, (e) => Math.round(Number(e.resumo?.janelaDeControle?.catalogoP95 ?? 0)))} ms | ${extra(depois, (e) => Math.round(Number(e.resumo?.janelaDeControle?.catalogoP95 ?? 0)))} ms |`,
    `| controle: p95 criação nos 2 min iniciais | ${extra(antes, (e) => Math.round(Number(e.resumo?.janelaDeControle?.criarP95 ?? 0)))} ms | ${extra(depois, (e) => Math.round(Number(e.resumo?.janelaDeControle?.criarP95 ?? 0)))} ms |`,
    `| EXPLAIN da chamada (ms) | ${extra(antes, (e) => e.gargalo?.medidas.find((x) => x.rotulo === "meus-pedidos-chamada")?.tempoMs.toFixed(1))} | ${extra(depois, (e) => e.gargalo?.medidas.find((x) => x.rotulo === "meus-pedidos-chamada")?.tempoMs.toFixed(1))} |`,
    `| integridade: reconciliação | ${extra(antes, (e) => (e.reconciliacao?.aprovada ? "aprovada" : "REPROVADA"))} | ${extra(depois, (e) => (e.reconciliacao?.aprovada ? "aprovada" : "REPROVADA"))} |`,
    `| pedidos novos no banco | ${extra(antes, (e) => e.reconciliacao?.pedidosNovosNoBanco)} | ${extra(depois, (e) => e.reconciliacao?.pedidosNovosNoBanco)} |`,
    "",
  ].join("\n");
  writeFileSync(resolve(saida, "comparacao.md"), md);
  gravarJson(resolve(saida, "comparacao.json"), { valida: true, antes: antes.map((e) => e.rotulo), depois: depois.map((e) => e.rotulo), linhas });
  process.stdout.write(md);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = principal();
