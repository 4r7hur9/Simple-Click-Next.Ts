/**
 * A cópia dos artefatos de uma execução para o git (#142), por LISTA FECHADA:
 *
 *   node tests/performance/ambiente/artefatos.ts <rótulo> [<rótulo>...]
 *
 * De `tests/performance/saida/<rótulo>/` para `docs/desempenho/<rótulo>/` vão
 * só: resumo.md/json, relatorio.md, reconciliacao.md, k6.json, metadados.json
 * (campos permitidos, SHA curto) e explain/*.{txt,json}. NUNCA: pontos*,
 * *.log, manifesto.json, chaves-incertas.json, .servicos*, validacao-do-seed/.
 *
 * Cada arquivo passa por `criarSanitizador` (seed/volume/sanitizar.ts) com os
 * valores que a execução conhece (senhas de simulação, nonce do descartável) e
 * por padrões extras (URL com credencial, Bearer, caminho de usuário, SENHA_).
 * Se algo sobrar depois da redação, o arquivo NÃO é gravado e o código é 1.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { criarSanitizador } from "../../../packages/database/seed/volume/sanitizar.ts";
import { lerJson, RAIZ } from "./apoio.ts";

export const ARQUIVOS_PERMITIDOS = [
  "resumo.md",
  "resumo.json",
  "relatorio.md",
  "reconciliacao.md",
  "k6.json",
  "metadados.json",
] as const;

/** Padrões que, depois da redação, ainda reprovam um arquivo. */
export const PADROES_EXTRAS: readonly (readonly [string, RegExp])[] = [
  ["URL do Postgres", /postgres(ql)?:\/\//i],
  ["URL do Redis", /redis:\/\//i],
  ["cabeçalho Bearer", /Bearer\s/],
  ["caminho de usuário (macOS)", /\/Users\//],
  ["caminho de usuário (Linux)", /\/home\//],
  ["variável de senha", /SENHA_/],
];

/** Só os campos de metadados.json que ajudam a reproduzir (sem SHA longo). */
export function metadadosPermitidos(m: Record<string, unknown>): Record<string, unknown> {
  const revisao = (m.revisao ?? {}) as Record<string, unknown>;
  return {
    etapa: m.etapa,
    rotulo: m.rotulo,
    rodada: m.rodada,
    preparadoEm: m.preparadoEm,
    revisao: {
      sha12: revisao.sha12,
      alteracoesLocaisNaoCommitadas: revisao.alteracoesLocaisNaoCommitadas,
      ref: revisao.ref,
      evento: revisao.evento,
      hashDoHarness: revisao.hashDoHarness,
      hashDoGitStatus: revisao.hashDoGitStatus,
    },
    seed: m.seed,
    runner: m.runner,
    configuracao: m.configuracao,
    banco: m.banco,
    volume: m.volume,
  };
}

export interface ResultadoDaCopia {
  gravados: string[];
  recusados: { arquivo: string; motivos: string[] }[];
}

/** Sanitiza um texto; devolve o texto limpo ou os motivos de recusa. */
export function sanitizar(
  texto: string,
  valoresLigados: readonly string[],
): { ok: true; texto: string } | { ok: false; motivos: string[] } {
  const s = criarSanitizador(valoresLigados);
  const limpo = s.texto(texto);
  const motivos = [
    ...s.varrer(limpo),
    ...PADROES_EXTRAS.filter(([, p]) => p.test(limpo)).map(([nome]) => nome),
  ];
  return motivos.length === 0 ? { ok: true, texto: limpo } : { ok: false, motivos: [...new Set(motivos)] };
}

export function copiarArtefatos(
  origem: string,
  destino: string,
  valoresLigados: readonly string[],
): ResultadoDaCopia {
  const resultado: ResultadoDaCopia = { gravados: [], recusados: [] };
  const metadados = lerJson<Record<string, unknown>>(resolve(origem, "metadados.json"));
  const shaLongo = String((metadados?.revisao as Record<string, unknown> | undefined)?.sha ?? "");
  const sha12 = shaLongo.slice(0, 12);
  const candidatos: [string, string][] = [];
  for (const nome of ARQUIVOS_PERMITIDOS) {
    const caminho = resolve(origem, nome);
    if (!existsSync(caminho)) continue;
    let texto = readFileSync(caminho, "utf8");
    if (nome === "metadados.json" && metadados) texto = `${JSON.stringify(metadadosPermitidos(metadados), null, 2)}\n`;
    // O SHA completo tem 40 hex, o mesmo formato do token público: vai curto.
    if (/^[0-9a-f]{40}$/.test(shaLongo)) texto = texto.replaceAll(shaLongo, sha12);
    candidatos.push([nome, texto]);
  }
  const pastaDoExplain = resolve(origem, "explain");
  if (existsSync(pastaDoExplain)) {
    for (const nome of readdirSync(pastaDoExplain).sort()) {
      if (!/^[a-z0-9-]+\.(txt|json)$/.test(nome)) continue;
      candidatos.push([`explain/${nome}`, readFileSync(resolve(pastaDoExplain, nome), "utf8")]);
    }
  }
  for (const [nome, texto] of candidatos) {
    const r = sanitizar(texto, valoresLigados);
    if (!r.ok) {
      resultado.recusados.push({ arquivo: nome, motivos: r.motivos });
      continue;
    }
    const alvo = resolve(destino, nome);
    mkdirSync(resolve(alvo, ".."), { recursive: true });
    writeFileSync(alvo, r.texto);
    resultado.gravados.push(nome);
  }
  return resultado;
}

/** Os valores que a execução conhece e que nunca podem ir para o git. */
async function valoresLigadosDoAmbiente(): Promise<string[]> {
  const { SENHA_DOS_DONOS } = await import("../../../packages/database/seed/demo/contas.ts");
  const valores = [SENHA_DOS_DONOS, "Senha-k6-Simulacao-2026!"];
  for (const nome of ["SC_PERF_NONCE", "SENHA_BANCO_MIGRADOR", "SENHA_BANCO_APLICACAO", "SENHA_BANCO_ADMINISTRACAO"]) {
    const v = process.env[nome];
    if (v) valores.push(v);
  }
  return valores;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rotulos = process.argv.slice(2);
  let falhou = rotulos.length === 0;
  const ligados = await valoresLigadosDoAmbiente();
  for (const rotulo of rotulos) {
    if (!/^[a-z0-9-]{1,40}$/.test(rotulo)) {
      process.stderr.write(`rótulo inválido: ${rotulo}\n`);
      falhou = true;
      continue;
    }
    const r = copiarArtefatos(
      resolve(RAIZ, "tests/performance/saida", rotulo),
      resolve(RAIZ, "docs/desempenho", rotulo),
      ligados,
    );
    process.stdout.write(`${rotulo}: ${r.gravados.length} gravado(s)\n`);
    for (const x of r.recusados) {
      process.stderr.write(`  ✘ ${x.arquivo} recusado: ${x.motivos.join(", ")}\n`);
      falhou = true;
    }
  }
  process.exitCode = falhou ? 1 : 0;
}
