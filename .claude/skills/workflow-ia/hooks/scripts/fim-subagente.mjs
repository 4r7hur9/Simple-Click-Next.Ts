#!/usr/bin/env node
// SubagentStop: registra o fim de cada subagente (runtime/subagentes-fim.jsonl). Com o início registrado pelo
// guarda-agentes, o gate de parada sabe quando o orquestrador está só esperando um subagente em segundo plano.

import fs from 'node:fs';
import { contexto } from './_comum.mjs';
import { caminhos, agoraISO } from '../../scripts/lib/core.mjs';

const { entrada, raiz, estado } = contexto();
if (!estado || estado.fase === 'encerrada') process.exit(0);

try {
  const c = caminhos(raiz);
  fs.mkdirSync(c.runtime, { recursive: true });
  fs.appendFileSync(c.subagentesFim, JSON.stringify({ em: agoraISO(), tipo: entrada.agent_type || '', agentId: entrada.agent_id || null, task: estado.id }) + '\n');
} catch {
  /* melhor esforço: sem o registro, o disparo expira em limites.esperaSubagenteMin */
}
process.exit(0);
