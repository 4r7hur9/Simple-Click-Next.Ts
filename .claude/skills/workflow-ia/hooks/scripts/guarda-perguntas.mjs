#!/usr/bin/env node
// PreToolUse (AskUserQuestion): o agente só pergunta ao humano por uma decisão registrada ("wf decisao pedir").
//  - nega respostas pré-preenchidas ("answers"/"response" no input): seria o agente respondendo por você;
//  - nega a pergunta vinda de subagente;
//  - com decisão pendente, só passam as perguntas exatas dela (hash): o que você vê é o que a CLI vai aplicar;
//  - task em execução sem decisão pendente: nega (a autonomia resolve; parada obrigatória vira decisão registrada).
// Registra a emissão em runtime/respostas-humano.jsonl. Nunca devolve "allow": a resposta tem de vir de você.

import { contexto, negar, taskEmExecucao } from './_comum.mjs';
import { comLock } from '../../scripts/lib/core.mjs';
import { hashPerguntas, registrarResposta } from '../../scripts/lib/decisoes.mjs';

const { entrada, raiz, estado } = contexto();
const ti = entrada.tool_input || {};

if (entrada.agent_type) negar('Só a sessão principal pergunta ao humano. Subagente: resolva pela skill politica-autonomia ou devolva o impasse ao orquestrador.');
const preenchidas = (ti.answers && typeof ti.answers === 'object' && Object.keys(ti.answers).length) || (typeof ti.response === 'string' && ti.response.trim());
if (preenchidas) negar('AskUserQuestion com respostas pré-preenchidas ("answers"/"response") não é permitido: quem responde é o humano.');

const p = estado?.decisaoPendente;
if (p) {
  const h = hashPerguntas(ti.questions);
  if (h !== p.sha256) negar(`Estas não são as perguntas da decisão ${p.id}. Passe ao AskUserQuestion exatamente as "questions" de ".workflow-ia/wf decisao status" (texto, ordem e opções).`);
  try {
    comLock(raiz, () => registrarResposta(raiz, { tipo: 'pergunta', task: estado.id, decisao: p.id, tool_use_id: entrada.tool_use_id || null, sha256: h, session_id: entrada.session_id || null }), { esperaMs: 10000 });
  } catch {
    /* sem o registro, "wf decisao aplicar" recusa: falha segura */
  }
  process.exit(0);
}
if (taskEmExecucao(estado) && !estado.veredito) {
  negar('Durante a task o agente não pergunta ao humano fora de uma decisão registrada. Resolva pela skill politica-autonomia; se for uma parada obrigatória, rode "wf veredito BLOQUEADA --motivo \'<CÓDIGO>: ...\'" e "wf decisao pedir".');
}
process.exit(0);
