// Utilitários compartilhados pelos hooks do Workflow IA.
// Os hooks rodam em TODO projeto onde o plugin estiver habilitado; se o
// projeto não tiver .workflow-ia/config.json, eles não fazem nada.

import fs from 'node:fs';
import path from 'node:path';
import { acharRaizProjeto, carregarConfig, idTaskAtiva, caminhos, lerJSON, relativoReal } from '../../scripts/lib/core.mjs';
import { registrarSessao } from '../../scripts/lib/orcamento.mjs';
import { registrarBatimento } from '../../scripts/lib/ambiente.mjs';

export function lerEntrada() {
  try {
    const txt = fs.readFileSync(0, 'utf8');
    return txt ? JSON.parse(txt) : {};
  } catch {
    return {};
  }
}

/** Retorna { entrada, raiz, config, idTask, estado } ou encerra (exit 0) se o projeto não usa o Workflow IA. */
export function contexto() {
  const entrada = lerEntrada();
  const cwd = entrada.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const raiz = acharRaizProjeto(cwd) || (process.env.CLAUDE_PROJECT_DIR ? acharRaizProjeto(process.env.CLAUDE_PROJECT_DIR) : null);
  if (!raiz) process.exit(0);
  let config;
  try {
    config = carregarConfig(raiz);
  } catch {
    process.exit(0);
  }
  try {
    registrarSessao(raiz, entrada);
  } catch {
    /* melhor esforço */
  }
  try {
    // Prova de vida dos hooks: "wf ambiente" e o F0 se apoiam nisto para recusar um host sem hooks.
    registrarBatimento(raiz, entrada);
  } catch {
    /* melhor esforço */
  }
  const idTask = idTaskAtiva(raiz);
  let estado = null;
  if (idTask) estado = lerJSON(caminhos(raiz, idTask).estado, null);
  return { entrada, raiz, config, idTask, estado };
}

export function negar(motivo, evento = 'PreToolUse') {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: evento,
        permissionDecision: 'deny',
        permissionDecisionReason: `[Workflow IA] ${motivo}`,
      },
    })
  );
  process.exit(0);
}

/** Caminho relativo à raiz, resolvendo symlinks e ".."; null se estiver fora do projeto. */
export function relativo(raiz, arquivo, cwd = raiz) {
  return relativoReal(raiz, arquivo, cwd);
}

export function taskEmExecucao(estado) {
  return !!estado && estado.fase !== 'encerrada' && !estado.pausada && estado.modo !== 'revisao';
}
