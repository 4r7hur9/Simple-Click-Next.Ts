#!/usr/bin/env node
// PreToolUse (Task|Agent):
//  - registra o subagente iniciado (runtime/subagentes.jsonl); a CLI usa esse
//    registro para exigir que o julgamento da verificação venha do verificador-final;
//  - mede o consumo de tokens da task ativa (informativo: não há teto, nunca nega).

import fs from 'node:fs';
import { contexto, taskEmExecucao } from './_comum.mjs';
import { caminhos, comLock, lerEstado, gravarEstado, gitHead, agoraISO } from '../../scripts/lib/core.mjs';
import { atualizarOrcamento } from '../../scripts/lib/orcamento.mjs';

const { entrada, raiz, estado } = contexto();
if (!estado || estado.fase === 'encerrada') process.exit(0);

const tipo = entrada.tool_input?.subagent_type || entrada.tool_input?.agent_type || '';
try {
  const c = caminhos(raiz);
  fs.mkdirSync(c.runtime, { recursive: true });
  fs.appendFileSync(c.subagentes, JSON.stringify({ em: agoraISO(), tipo, task: estado.id, fase: estado.fase, head: gitHead(raiz), chamador: entrada.agent_type || 'principal' }) + '\n');
} catch {
  /* melhor esforço */
}

if (!taskEmExecucao(estado) || estado.veredito) process.exit(0);

// Mede fora do lock (o transcript pode ser grande) e grava sob o lock, sobre o estado relido.
const medido = { ...estado, orcamento: { ...(estado.orcamento || {}), sessoes: { ...(estado.orcamento?.sessoes || {}) } } };
atualizarOrcamento(raiz, medido, { transcriptPath: entrada.transcript_path, sessionId: entrada.session_id });
try {
  comLock(
    raiz,
    () => {
      const atual = lerEstado(raiz, estado.id);
      atual.orcamento = atual.orcamento || { sessoes: {} };
      for (const [sid, v] of Object.entries(medido.orcamento.sessoes || {})) atual.orcamento.sessoes[sid] = Math.max(atual.orcamento.sessoes?.[sid] || 0, v);
      atual.orcamento.tokensUsados = Object.values(atual.orcamento.sessoes).reduce((a, b) => a + b, 0);
      atual.orcamento.atualizadoEm = agoraISO();
      gravarEstado(raiz, atual);
    },
    { esperaMs: 10000 }
  );
} catch {
  /* melhor esforço: sem o lock, só não grava */
}
process.exit(0);
