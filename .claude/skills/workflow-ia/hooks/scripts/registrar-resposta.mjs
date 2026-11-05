#!/usr/bin/env node
// PostToolUse (AskUserQuestion) e UserPromptSubmit: grava o que o humano respondeu em runtime/respostas-humano.jsonl,
// que só a CLI e os hooks escrevem. "wf decisao aplicar" só aceita resposta registrada aqui e presente no transcript.
//  - PostToolUse: as respostas escolhidas no AskUserQuestion (tool_response.answers / response);
//  - UserPromptSubmit (só com decisão pendente): a mensagem digitada no chat, para respostas como "H-1: <opção>";
//  - UserPromptSubmit "/workflow-ia:ajustar <ID> <texto>": o pedido de ajuste pós-entrega, que a CLI exige do agente
//    (registrado mesmo sem task ativa: a task entregue está encerrada).

import { contexto } from './_comum.mjs';
import { comLock } from '../../scripts/lib/core.mjs';
import { hashPerguntas, registrarResposta, lerMensagem, lerPedidoAjuste } from '../../scripts/lib/decisoes.mjs';

const { entrada, raiz, estado } = contexto();
if (entrada.agent_type) process.exit(0);
const evento = entrada.hook_event_name || (entrada.prompt !== undefined ? 'UserPromptSubmit' : 'PostToolUse');
const gravar = (registro) => {
  try {
    comLock(raiz, () => registrarResposta(raiz, { task: estado?.id || null, session_id: entrada.session_id || null, transcript_path: entrada.transcript_path || null, ...registro }), { esperaMs: 10000 });
  } catch {
    /* melhor esforço: sem registro, a decisão não se aplica (falha segura) */
  }
};

if (evento === 'UserPromptSubmit' && typeof entrada.prompt === 'string') {
  const pedido = lerPedidoAjuste(entrada.prompt);
  if (pedido) gravar({ tipo: 'pedido-ajuste', task: pedido.task, texto: pedido.texto, prompt: entrada.prompt });
}
if (!estado) process.exit(0);

if (evento === 'UserPromptSubmit') {
  const p = estado.decisaoPendente;
  if (!p || typeof entrada.prompt !== 'string') process.exit(0);
  gravar({ tipo: 'mensagem', decisao: p.id, prompt: entrada.prompt });
  if (lerMensagem(entrada.prompt, p)) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: `[Workflow IA] Resposta do humano à decisão ${p.id} registrada. Rode ".workflow-ia/wf decisao aplicar".` } }));
  }
  process.exit(0);
}

if ((entrada.tool_name || 'AskUserQuestion') !== 'AskUserQuestion') process.exit(0);
const ti = entrada.tool_input || {};
const tr = entrada.tool_response;
const answers = tr && typeof tr === 'object' ? tr.answers || null : null;
const response = tr && typeof tr === 'object' ? tr.response || null : typeof tr === 'string' ? tr : null;
gravar({ tipo: 'resposta', decisao: estado.decisaoPendente?.id || null, tool_use_id: entrada.tool_use_id || null, sha256: hashPerguntas(ti.questions), answers, response });
process.exit(0);
