/**
 * `seed:volume` (#138): +100.000 pedidos sintéticos sobre o seed de simulação.
 *
 *   pnpm --filter @simpleclick/database seed:volume carregar --semente sc-2026 \
 *        --referencia 2026-11-01T18:00:00-03:00 [--ensaio | --falhar-na-loja N]
 *   pnpm --filter @simpleclick/database seed:volume validar  --semente … --referencia …
 *   pnpm --filter @simpleclick/database seed:volume explicar --semente … --referencia …
 *
 * Só escreve em `simpleclick_simulacao` (guarda única em `guarda.ts`). `carregar`
 * faz carga → espera do autoanalyze → validação → EXPLAIN; `validar` e
 * `explicar` nunca gravam dados. Saídas sanitizadas em `saida/` (ignorado pelo git).
 *
 * Códigos de saída: 0 sucesso · 2 parâmetros, guarda ou pré-condição · 3 falha
 * induzida (`--falhar-na-loja`) · 1 erro de execução ou divergência.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ErroDeGuarda } from "../simulacao/banco.ts";
import type { Ambiente } from "../simulacao/banco.ts";
import { carregar, esperarAutoanalyze, FalhaInduzida, type ResumoDaCarga, type EstadoDoAutoanalyze } from "./carga.ts";
import { explicar, PASTA_DE_SAIDA, type ResultadoDoExplain } from "./explicar.ts";
import { abrirConexaoGuardada, type FabricaDeConexao, fabricaPadrao } from "./guarda.ts";
import { ErroDeParametros, lerParametros, type ParametrosDoVolume } from "./parametros.ts";
import { descreverErroSeguro } from "./sanitizar.ts";
import { type BaselineDaCarga, validar, type RelatorioDeValidacao } from "./validar.ts";

export interface DependenciasDaCli {
  readonly env: Ambiente;
  readonly fabrica?: FabricaDeConexao;
  readonly escrever?: (linha: string) => void;
  /** Pasta de saída; `null` não grava arquivos. */
  readonly pasta?: string | null;
  readonly esperarAutoanalyze?: boolean;
}

const MB = 1024 * 1024;
const segundos = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

async function gravar(pasta: string | null, nome: string, conteudo: unknown): Promise<void> {
  if (pasta === null) return;
  await mkdir(pasta, { recursive: true });
  await writeFile(`${pasta}${nome}`, typeof conteudo === "string" ? conteudo : `${JSON.stringify(conteudo, null, 2)}\n`, "utf8");
}

async function lerBaseline(pasta: string | null, params: ParametrosDoVolume): Promise<BaselineDaCarga | null> {
  if (pasta === null) return null;
  try {
    const lido = JSON.parse(await readFile(`${pasta}baseline.json`, "utf8")) as {
      semente: string; referencia: string; impressaoDaBaseAntes: string; hashDoPlano: string;
    };
    return lido.semente === params.semente && lido.referencia === params.referencia.toISOString()
      ? { impressaoDaBaseAntes: lido.impressaoDaBaseAntes, hashDoPlano: lido.hashDoPlano }
      : null;
  } catch {
    return null;
  }
}

/** O resumo em Markdown (sem dado pessoal): é a base do doc 09. */
export function montarRelatorio(
  carga: ResumoDaCarga | null,
  espera: EstadoDoAutoanalyze | null,
  validacao: RelatorioDeValidacao | null,
  explain: ResultadoDoExplain | null,
): string {
  const linhas: string[] = ["# Volume — relatório da execução", ""];
  if (carga !== null) {
    linhas.push(
      "## Carga", "",
      `- modo: **${carga.modo}** · pedidos inseridos: ${carga.pedidosInseridos} · já existiam (pulados): ${carga.pedidosPulados} · clientes novos: ${carga.clientesInseridos}`,
      `- tempos: preparo ${segundos(carga.tempos.preparoMs)} · carga ${segundos(carga.tempos.cargaMs)} · total ${segundos(carga.tempos.totalMs)}`,
      `- hash do plano: \`${carga.hashDoPlano}\``,
      `- impressão da base do #135: antes \`${carga.impressaoDaBaseAntes}\` · depois \`${carga.impressaoDaBaseDepois}\``, "",
    );
  }
  if (espera !== null) {
    linhas.push(`- autoanalyze: ${espera.todasAtualizadas ? "todas as tabelas de pedido atualizadas" : "NÃO confirmado dentro do limite (estatísticas possivelmente defasadas)"} após ${segundos(espera.esperouMs)}`, "");
  }
  if (validacao !== null) {
    linhas.push(
      "## Validação", "",
      `- veredito: **${validacao.ok ? "APROVADA" : "REPROVADA"}** · pedidos: base ${validacao.totais.base} + volume ${validacao.totais.volume} = ${validacao.totais.total}`,
      `- invariantes SQL: ${validacao.invariantes.length} · amostra: ${validacao.amostra.pedidosDoVolume} do volume + ${validacao.amostra.pedidosDaBase} da base · divergências: ${validacao.divergencias.length}`,
      `- impressão da base: \`${validacao.impressaoDaBase}\` · hash do plano: \`${validacao.hashDoPlano}\``, "",
      "| tabela | linhas (estimativa) | dados (MB) | índices (MB) | total (MB) |", "| --- | ---: | ---: | ---: | ---: |",
      ...validacao.tamanhos.map((t) => `| ${t.tabela} | ${t.linhasEstimadas} | ${(t.dadosBytes / MB).toFixed(1)} | ${(t.indicesBytes / MB).toFixed(1)} | ${(t.totalBytes / MB).toFixed(1)} |`), "",
    );
    if (validacao.divergencias.length > 0) linhas.push("Divergências (até 20):", "", ...validacao.divergencias.slice(0, 20).map((d) => `- ${d}`), "");
  }
  if (explain !== null) {
    linhas.push(
      "## EXPLAIN (ANALYZE, BUFFERS)", "",
      "| cenário | loja | consulta | linhas | passada 1 (ms) | passada 2 (ms) | buffers 2ª (hit/read) |", "| --- | --- | --- | ---: | ---: | ---: | --- |",
    );
    for (const c of explain.cenarios) {
      for (const consulta of [...new Set(c.registros.map((r) => r.consulta))]) {
        const p1 = c.registros.find((r) => r.consulta === consulta && r.passada === 1);
        const p2 = c.registros.find((r) => r.consulta === consulta && r.passada === 2);
        linhas.push(`| ${c.id} | ${c.loja} | ${consulta} | ${p1?.linhas ?? 0} | ${(p1?.execucaoMs ?? 0).toFixed(2)} | ${(p2?.execucaoMs ?? 0).toFixed(2)} | ${p2?.compartilhadosEmCache ?? 0}/${p2?.compartilhadosLidos ?? 0} |`);
      }
    }
    linhas.push("", "Provas negativas de RLS:", "", ...explain.negativas.map((p) => `- ${p.ok ? "✔" : "✘"} ${p.nome} (obtido ${p.obtido}, esperado ${p.esperado})`), "");
    if (explain.bloqueados.length > 0) linhas.push("Pendências:", "", ...explain.bloqueados.map((b) => `- ${b}`), "");
  }
  return `${linhas.join("\n")}\n`;
}

export async function principal(argv: readonly string[], deps: DependenciasDaCli): Promise<number> {
  const escrever = deps.escrever ?? ((linha: string) => process.stdout.write(`${linha}\n`));
  const pasta = deps.pasta === undefined ? PASTA_DE_SAIDA : deps.pasta;
  const fabrica = deps.fabrica ?? fabricaPadrao;
  try {
    const params = lerParametros(argv);

    if (params.comando === "carregar") {
      const carga = await carregar(deps.env, params, { fabrica, relatar: escrever });
      await gravar(pasta, `carga-${carga.modo}.json`, carga);
      await gravar(pasta, "carga.json", carga);
      escrever(`carga (${carga.modo}): ${carga.pedidosInseridos} inseridos, ${carga.pedidosPulados} já existiam, em ${segundos(carga.tempos.cargaMs)} (total ${segundos(carga.tempos.totalMs)}).`);
      if (carga.ensaio) return 0;
      if (carga.modo === "completa" || carga.modo === "retomada") {
        await gravar(pasta, "baseline.json", {
          semente: params.semente, referencia: params.referencia.toISOString(),
          impressaoDaBaseAntes: carga.impressaoDaBaseAntes, hashDoPlano: carga.hashDoPlano,
        });
      }

      let espera: EstadoDoAutoanalyze | null = null;
      if (carga.pedidosInseridos > 0 && carga.inicioDaEscrita !== null && deps.esperarAutoanalyze !== false) {
        escrever("aguardando o autoanalyze das tabelas de pedido (até 15 min)…");
        const admin = await abrirConexaoGuardada(deps.env, "sc_admin", fabrica);
        try {
          espera = await esperarAutoanalyze(admin, new Date(carga.inicioDaEscrita));
        } finally {
          await admin.end().catch(() => {});
        }
        await gravar(pasta, "autoanalyze.json", espera);
      }
      const baseline = (await lerBaseline(pasta, params)) ?? { impressaoDaBaseAntes: carga.impressaoDaBaseAntes, hashDoPlano: carga.hashDoPlano };
      const validacao = await validar(deps.env, params, { fabrica, baseline, relatar: escrever });
      await gravar(pasta, "validacao.json", validacao);
      if (!validacao.ok) {
        await gravar(pasta, "relatorio.md", montarRelatorio(carga, espera, validacao, null));
        escrever(`validação REPROVADA: ${validacao.divergencias.length} divergência(s). Relatório em saida/relatorio.md.`);
        return 1;
      }
      const explain = await explicar(deps.env, params, { fabrica, relatar: escrever, pasta });
      await gravar(pasta, "relatorio.md", montarRelatorio(carga, espera, validacao, explain));
      escrever(explain.ok ? "carregar: APROVADO (carga, validação e EXPLAIN)." : `carregar: carga e validação aprovadas; EXPLAIN com ${explain.bloqueados.length} pendência(s).`);
      return explain.ok ? 0 : 1;
    }

    if (params.comando === "validar") {
      const baseline = await lerBaseline(pasta, params);
      const validacao = await validar(deps.env, params, { fabrica, baseline, relatar: escrever });
      await gravar(pasta, "validacao.json", validacao);
      await gravar(pasta, "relatorio.md", montarRelatorio(null, null, validacao, null));
      escrever(validacao.ok ? `validar: APROVADO (${validacao.totais.total} pedidos).` : `validar: REPROVADO (${validacao.divergencias.length} divergência(s)).`);
      return validacao.ok ? 0 : 1;
    }

    const explain = await explicar(deps.env, params, { fabrica, relatar: escrever, pasta });
    await gravar(pasta, "relatorio.md", montarRelatorio(null, null, null, explain));
    escrever(explain.ok ? "explicar: APROVADO." : `explicar: ${explain.bloqueados.length} pendência(s).`);
    return explain.ok ? 0 : 1;
  } catch (erro) {
    const mensagem = descreverErroSeguro(erro);
    (deps.escrever ?? ((linha: string) => process.stderr.write(`${linha}\n`)))(mensagem);
    if (erro instanceof ErroDeParametros || erro instanceof ErroDeGuarda) return 2;
    if (erro instanceof FalhaInduzida) return 3;
    return 1;
  }
}

const chamadoDiretamente =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (chamadoDiretamente) {
  process.exitCode = await principal(process.argv.slice(2), { env: process.env });
}
