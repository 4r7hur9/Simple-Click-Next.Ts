#!/usr/bin/env node
/**
 * Auditoria de regressão para o portão local.
 *
 * A auditoria completa exige prova para todos os critérios de aceite do
 * projeto — é o veredito de fim de feature, e reprova por construção enquanto
 * houver trabalho pendente. Se o gancho antes do envio usasse ela, o portão
 * nunca passaria e seria contornado todo dia, que é como um portão morre.
 *
 * Aqui separamos duas coisas que a auditoria mistura:
 *   - REGRESSÃO: algo que estava certo e quebrou, ou incoerência real entre
 *     especificação, tarefa e teste. Isso reprova.
 *   - BACKLOG: critério que ainda não tem teste porque a tarefa dele está
 *     pendente. Isso é o trabalho que falta, e é contado, não punido.
 *
 * O veredito completo continua existindo e é obrigatório antes de declarar
 * uma feature pronta: `make audit`.
 */

import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const MOTOR = join(
  homedir(),
  ".claude/skills/onp-spec-driven/scripts/onp-spec.mjs",
);

/** Incoerência real: reprova o portão. */
const REGRESSAO = new Set([
  "TASK_CONCLUIDA_SEM_PROVA",
  "TESTE_ORFAO",
  "REF_QUEBRADA",
  "ID_DUPLICADO",
  "ID_CURTO",
  "FEATURE_DIVERGENTE",
  "AC_FORA_DE_US",
  "AC_INCOMPLETO",
  "SECAO_AUSENTE",
  "VERIFY_OBSOLETO",
  "TASK_STATUS_INVALIDO",
  "STATUS_INVALIDO",
  "VERIFICACAO_MALFORMADA",
  "NIVEL_INVALIDO",
  "ARQUIVO_ORFAO",
]);

/** Trabalho que ainda não foi feito: conta, mas não reprova. */
const BACKLOG = new Set([
  "AC_SEM_TESTE",
  "AC_SEM_PROVA",
  "AC_SEM_TASK",
  "US_SEM_AC",
  "ASM_ABERTA",
  "Q_ABERTA",
  "PRINCIPIO_SEM_VERIFICACAO",
  "ARQUIVO_INEXISTENTE",
  "GLOB_SEM_ARQUIVOS",
  "SPEC_SEM_US",
  "PROVA_FRACA",
]);

function lerAuditoria() {
  let bruto;
  try {
    bruto = execFileSync("node", [MOTOR, "audit", "--json"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (erro) {
    // O motor sai com código 1 quando há problemas — a saída ainda vale.
    bruto = erro.stdout ?? "";
  }
  const fim = bruto.lastIndexOf("}");
  if (fim === -1) throw new Error("auditoria não devolveu JSON");
  return JSON.parse(bruto.slice(0, fim + 1));
}

/**
 * Princípio sem teste ainda é backlog; princípio violado por conteúdo de
 * arquivo é regressão de verdade.
 */
function ehBacklogDePrincipio(problema) {
  return /exige teste @principle/.test(problema.message ?? "");
}

function classificar(problema) {
  if (problema.code === "PRINCIPIO_VIOLADO") {
    return ehBacklogDePrincipio(problema) ? "backlog" : "regressao";
  }
  if (REGRESSAO.has(problema.code)) return "regressao";
  if (BACKLOG.has(problema.code)) return "backlog";
  return problema.severity === "erro" ? "regressao" : "backlog";
}

const auditoria = lerAuditoria();
const problemas = auditoria.findings ?? [];

const regressoes = problemas.filter((p) => classificar(p) === "regressao");
const backlog = problemas.filter((p) => classificar(p) === "backlog");

const resumo = auditoria.stats ?? {};
const comProva = resumo.acsProven ?? 0;
const totalAc = resumo.acs ?? 0;

if (totalAc) {
  const pct = ((comProva / totalAc) * 100).toFixed(1);
  console.log(
    `  progresso: ${comProva}/${totalAc} critérios provados (${pct}%)`,
  );
}
console.log(`  backlog: ${backlog.length} pendência(s) — trabalho que falta`);

if (regressoes.length === 0) {
  console.log("  sem regressão");
  process.exit(0);
}

console.log(`\n  ${regressoes.length} regressão(ões):`);
for (const p of regressoes) {
  const onde = p.line ? `${p.file}:${p.line}` : p.file;
  console.log(`    ✘ [${p.code}] ${p.message}`);
  if (onde) console.log(`       ${onde}`);
}
process.exit(1);
