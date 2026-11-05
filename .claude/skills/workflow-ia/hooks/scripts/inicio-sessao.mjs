#!/usr/bin/env node
// SessionStart: registra onde o plugin está (para o atalho .workflow-ia/wf),
// a sessão atual (para medir o orçamento) e injeta o contexto da task ativa.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contexto } from './_comum.mjs';
import { caminhos, limitesDaTask, rodadasRevisao, gravarJSON, agoraISO } from '../../scripts/lib/core.mjs';
import { resumoFindings } from '../../scripts/lib/findings.mjs';
import { proximoPasso } from '../../scripts/lib/fluxo.mjs';

const { entrada, raiz, config, estado } = contexto();
const c = caminhos(raiz);

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
try {
  fs.mkdirSync(c.runtime, { recursive: true });
  fs.writeFileSync(c.pluginRoot, `${pluginRoot}\n`);
} catch {
  /* melhor esforço */
}
// Processo novo (startup/resume): subagentes em segundo plano de um processo anterior morreram com ele e não
// devem mais segurar o gate de parada. Em clear/compact o processo segue vivo e os subagentes também.
if (['startup', 'resume'].includes(entrada.source)) {
  try {
    gravarJSON(c.subagentesCorte, { em: agoraISO(), source: entrada.source, sessionId: entrada.session_id || null });
  } catch {
    /* melhor esforço */
  }
}
if (process.env.CLAUDE_ENV_FILE) {
  try {
    fs.appendFileSync(process.env.CLAUDE_ENV_FILE, `export WORKFLOW_IA_ROOT="${pluginRoot}"\n`);
  } catch {
    /* melhor esforço */
  }
}

let texto;
if (estado && estado.fase !== 'encerrada') {
  const lim = limitesDaTask(config, estado);
  let res = null;
  try {
    res = resumoFindings(raiz, estado, config);
  } catch {
    /* sem findings ainda */
  }
  const passo = proximoPasso(raiz, estado, config);
  texto = [
    `[Workflow IA] Task ativa: ${estado.id}${estado.titulo ? ` — ${estado.titulo}` : ''}.`,
    `Fase: ${estado.fase} · rodada de revisão ${rodadasRevisao(estado)}/${lim.maxIteracoes} · complexidade ${lim.complexidade} · ${(estado.orcamento?.tokensUsados || 0).toLocaleString('pt-BR')} tokens${estado.pausada ? ' · PAUSADA pelo humano' : ''}.`,
    res ? `Findings: ${res.total} no total, bloqueantes abertos: ${res.bloqueantesAbertos.join(', ') || 'nenhum'}.` : '',
    estado.ajuste ? `Ajuste pós-entrega ${estado.ajuste.id} (${estado.ajuste.status}) depois da entrega ${estado.ajuste.aposEntrega}: "${estado.ajuste.texto}".` : '',
    estado.alertaParada ? `Alerta: ${estado.alertaParada}` : '',
    estado.pausada
      ? 'A task está pausada. Não retome o pipeline a menos que o humano peça (/workflow-ia:retomar).'
      : estado.modo === 'revisao'
        ? `Revisão em andamento (sem alterar código). ${passo.instrucao}`
        : `Para continuar, siga a skill orquestrador-task. Próximo passo: ${passo.instrucao}`,
    'Estado e provas ficam em .workflow-ia/tasks/<ID>/ e só mudam pela CLI .workflow-ia/wf.',
  ]
    .filter(Boolean)
    .join('\n');
} else if (estado?.decisaoPendente) {
  texto = `[Workflow IA] A task ${estado.id} terminou ${estado.veredito} com a decisão humana ${estado.decisaoPendente.id} pendente. Para retomá-la de onde parou: /workflow-ia:retomar ${estado.id}.`;
} else {
  texto = '[Workflow IA] Instalado neste projeto. Para executar um card de ponta a ponta: /workflow-ia:task <ID, URL ou texto do card>. Abrir PR e fazer merge são sempre do humano.';
}

process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: texto } }));
process.exit(0);
