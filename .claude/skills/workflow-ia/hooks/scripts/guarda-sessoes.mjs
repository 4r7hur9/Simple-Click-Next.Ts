#!/usr/bin/env node
// PreToolUse (mcp__*__session_open|session_send): durante a task, toda delegação vai pela ferramenta Agent,
// nesta sessão. Uma sessão nova (ex.: aba do RM Code aberta por session_open) polui as abas do usuário e
// não carrega agent_type, então furaria a identidade dos papéis que os hooks atestam. Fora de task, não interfere.

import { contexto, negar } from './_comum.mjs';

const { entrada, estado } = contexto();
const nome = String(entrada.tool_name || '');
if (!/^mcp__.+__session_(open|send)$/.test(nome)) process.exit(0);

const comoDelegar = 'Delegue pela ferramenta Agent, nesta sessão, com o subagent_type de "wf ambiente" e run_in_background: true. Não abra sessões nem abas novas e não delegue por outra sessão.';
if (entrada.agent_type) negar(`Subagente não abre nem conduz outra sessão (${nome}). ${comoDelegar}`);
if (estado && estado.fase !== 'encerrada' && !estado.pausada) negar(`Task ${estado.id} em andamento: ${nome} não é usado no Workflow IA. ${comoDelegar}`);
process.exit(0);
