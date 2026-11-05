// Capacidades do host: o pipeline só roda onde os hooks do plugin estão vivos e os 13 papéis existem
// como subagentes. Aqui ficam o batimento dos hooks, a avaliação do ambiente e a recusa antecipada (F0).
//
// Por que não basta o doctor: na falha real (RM Code, 2026-10-01) o doctor passou, a task foi criada e só
// na F1 apareceu "Agent type 'workflow-ia:spec-analyst' not found", com os hooks inativos sem aviso.
//
// Limite honesto: isto é uma cerca contra falha ACIDENTAL de ambiente, não um sandbox. Um orquestrador
// deliberadamente malicioso, num host sem hooks, poderia forjar os arquivos de runtime/ (a barreira final é
// o branch protegido no GitHub). O que continua verdadeiro: sem os hooks ninguém atesta o agent_type, então
// o desenho recusa em vez de fingir uma garantia.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { caminhos, lerJSON, gravarJSON, existe, agoraISO, comLock, estadoInicial, gravarEstado, marcarRegistro, definirTaskAtiva, validarIdTask } from './core.mjs';

export const PAPEIS = [
  'spec-analyst',
  'arquiteto',
  'plan-reviewer',
  'test-writer',
  'implementer',
  'security-reviewer',
  'performance-reviewer',
  'quality-reviewer',
  'test-reviewer',
  'ops-reviewer',
  'triager',
  'fixer',
  'verificador-final',
];

export const PREFIXO_NATIVO = 'workflow-ia:';

function gravarRapido(arquivo, dados) {
  fs.mkdirSync(arquivo.replace(/[/\\][^/\\]+$/, ''), { recursive: true });
  const tmp = `${arquivo}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(dados) + '\n');
  fs.renameSync(tmp, arquivo);
}

/** Chamado por todo hook (via contexto()): carimba que os hooks estão rodando. Melhor esforço. */
export function registrarBatimento(raiz, entrada) {
  const c = caminhos(raiz);
  const evento = entrada?.hook_event_name || 'desconhecido';
  const carimbo = { em: agoraISO(), evento, sessionId: entrada?.session_id || null, tool: entrada?.tool_name || null };
  gravarRapido(c.batimento, carimbo);
  // O carimbo que vale como prova é o do PreToolUse de Bash: todo "wf" roda via Bash, então o hook da
  // própria chamada acabou de carimbar.
  if (evento === 'PreToolUse' && entrada?.tool_name === 'Bash') gravarRapido(c.batimentoBash, carimbo);
}

export function lerBatimentoBash(raiz) {
  return lerJSON(caminhos(raiz).batimentoBash, null);
}

/** Cadeia de processos acima deste (pai, avô...), para saber se quem chama nasceu do mesmo shell. */
function ancestrais(limite = 16) {
  const lista = [process.ppid];
  if (process.platform === 'win32') return lista;
  let atual = process.ppid;
  for (let i = 0; i < limite && atual > 1; i += 1) {
    const r = spawnSync('ps', ['-o', 'ppid=', '-p', String(atual)], { encoding: 'utf8' });
    const pai = Number(String(r.stdout || '').trim());
    if (!(pai > 0) || lista.includes(pai)) break;
    lista.push(pai);
    atual = pai;
  }
  return lista;
}

/**
 * Os hooks estão vivos? Vale o carimbo do hook PreToolUse(Bash) dentro da janela. O carimbo renovado pela própria
 * CLI (origem "wf", comando longo) só vale para quem nasceu do mesmo shell (o "wf" encadeado na mesma chamada do
 * Bash) ou para a mesma sessão (CLAUDE_CODE_SESSION_ID): outra sessão no mesmo repositório não herda os hooks.
 */
export function hooksAtivos(raiz, config, agora = Date.now(), { env = process.env } = {}) {
  const b = lerBatimentoBash(raiz);
  if (!b?.em) return { ativo: false, idadeSegundos: null };
  const idade = Math.round((agora - Date.parse(b.em)) / 1000);
  const janela = config.host?.janelaBatimentoSegundos ?? 120;
  const r = { idadeSegundos: idade, em: b.em, sessionId: b.sessionId || null, origem: b.origem || 'hook' };
  const dentro = idade >= -5 && idade <= janela;
  if (dentro && b.origem === 'wf') {
    const sessaoAtual = env.CLAUDE_CODE_SESSION_ID || null;
    const mesmaSessao = !!(sessaoAtual && b.sessionId && sessaoAtual === b.sessionId);
    const mesmoShell = Number(b.ppid) > 1 && ancestrais().includes(Number(b.ppid));
    if (!mesmaSessao && !mesmoShell) return { ...r, ativo: false, outraSessao: true };
  }
  return { ...r, ativo: dentro };
}

/**
 * Batimento mantido pela própria CLI enquanto um comando longo do "wf" roda (gate, red, verificar-limpo, checar,
 * aguardar-vaga). Sem isto, um gate de 60 min deixava o carimbo vencer e o "wf" seguinte, encadeado na mesma
 * chamada do Bash, era recusado. Não burla a proteção: só liga se o carimbo dos hooks estava válido quando o
 * comando começou (o processo é filho de uma sessão com hooks vivos) e para quando o processo termina.
 */
export function iniciarBatimentoWf(raiz, config, { agora = Date.now() } = {}) {
  const h = hooksAtivos(raiz, config, agora);
  if (!h.ativo) return { ativo: false, parar() {} };
  const c = caminhos(raiz);
  const janela = config.host?.janelaBatimentoSegundos ?? 120;
  const intervaloMs = Math.max(1000, Math.floor((janela / 2) * 1000));
  const renovar = () => {
    try {
      const atual = lerBatimentoBash(raiz) || {};
      // ppid: o shell da chamada do Bash; só quem nasceu dele (ou a mesma sessão) herda este carimbo (hooksAtivos).
      gravarRapido(c.batimentoBash, { em: agoraISO(), evento: 'wf-renovacao', origem: 'wf', pid: process.pid, ppid: process.ppid, sessionId: atual.sessionId ?? null, tool: 'Bash' });
    } catch {
      /* melhor esforço */
    }
  };
  const timer = setInterval(renovar, intervaloMs);
  timer.unref();
  return {
    ativo: true,
    intervaloMs,
    parar: () => clearInterval(timer),
  };
}

// --------------------------------------------------------------------------- plugins externos
// O plugin oficial security-guidance faz, em Stop/SubagentStop e em git commit/push, uma revisão por LLM
// pelo Agent SDK: cada uma é um processo "claude" filho que grava uma sessão nova (no RM Code, uma aba a
// mais por subagente e por commit) e injeta findings fora do pipeline. O security-reviewer do Workflow IA
// já cobre isso; a variável abaixo desliga só essas revisões (os avisos por padrão nas edições continuam).
export const SG_PREFIXO = 'security-guidance@';
export const SG_VARIAVEL = 'ENABLE_CODE_SECURITY_REVIEW';

function desligaSG(env) {
  if (!env) return false;
  return String(env[SG_VARIAVEL] ?? '').trim() === '0' || /^(1|true|yes|on)$/i.test(String(env.SECURITY_GUIDANCE_DISABLE ?? '').trim());
}

/**
 * Situação do security-guidance para este projeto. `ativo`: habilitado no settings de maior precedência que o
 * menciona (local > projeto > perfil). `noProcesso`: a variável chegou ao ambiente desta execução (dentro da
 * sessão, é o que o host de fato aplicou). `nosSettings`: a variável está no env de algum desses settings.
 */
export function securityGuidance({ raiz, env = process.env, configDir } = {}) {
  const perfil = configDir || env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const fontes = [
    ['projeto-local', path.join(raiz, '.claude', 'settings.local.json')],
    ['projeto', path.join(raiz, '.claude', 'settings.json')],
    ['perfil', path.join(perfil, 'settings.json')],
  ]
    .map(([onde, arquivo]) => ({ onde, arquivo, st: lerJSON(arquivo, null) }))
    .filter((f) => f.st && typeof f.st === 'object');
  let ativo = false;
  let onde = null;
  for (const f of fontes) {
    const ep = f.st.enabledPlugins || {};
    const chave = Object.keys(ep).find((k) => k.startsWith(SG_PREFIXO));
    if (chave) {
      ativo = ep[chave] === true;
      onde = f.onde;
      break;
    }
  }
  // env dos settings: o de maior precedência sobrescreve os demais, chave a chave.
  const envSettings = Object.assign({}, ...fontes.slice().reverse().map((f) => f.st.env || {}));
  const noProcesso = desligaSG(env);
  const nosSettings = desligaSG(envSettings);
  return { ativo, onde, perfil, noProcesso, nosSettings, neutralizado: noProcesso || nosSettings };
}

/** Aviso (nunca bloqueio) quando o security-guidance vai abrir sessões durante a task. `sessao`: rodando dentro do agente. */
export function avisoSecurityGuidance(sg, { sessao = false } = {}) {
  if (!sg.ativo || sg.noProcesso || (!sessao && sg.nosSettings)) return null;
  const efeito = `o plugin security-guidance está ativo (${sg.onde}) e faz uma revisão por LLM a cada subagente que termina e a cada commit: cada uma abre uma sessão nova (no RM Code, uma aba) e injeta findings fora do pipeline.`;
  if (sg.nosSettings) {
    return `${efeito} O ${SG_VARIAVEL}=0 está nos settings, mas não chegou a esta sessão: o host não aplica o env do .claude/settings.json do projeto (ex.: RM Code sem settingSources). Ponha "env": {"${SG_VARIAVEL}": "0"} no settings.json do perfil (${sg.perfil}) ou desabilite o plugin, e abra uma sessão nova.`;
  }
  return `${efeito} Rode /workflow-ia:atualizar (grava "env": {"${SG_VARIAVEL}": "0"} no .claude/settings.json do projeto) ou ponha essa variável no settings do perfil, e abra uma sessão nova.`;
}

function sufixo(tipo) {
  return String(tipo).split(':').pop();
}

/**
 * Avalia o ambiente. `agentesVisiveis` é a lista de tipos de subagente que o host expõe (o orquestrador a lê
 * da descrição da ferramenta Agent; um host pode entregar o dump de system:init). Sem lista, os agentes ficam
 * "desconhecido": isso é UX de falha cedo, não prova de segurança (a prova é o hook que atesta o agent_type).
 */
export function avaliarAmbiente({ raiz, config, agentesVisiveis = null, sdkInit = null, ci = false, sessao = false, env = process.env, agora = Date.now() }) {
  const hooks = hooksAtivos(raiz, config, agora);
  const lista = Array.isArray(agentesVisiveis) ? agentesVisiveis : Array.isArray(sdkInit?.agents) ? sdkInit.agents : null;
  const tipos = {};
  const faltando = [];
  if (lista) {
    for (const papel of PAPEIS) {
      const achado = lista.find((t) => sufixo(t) === papel);
      if (achado) tipos[papel] = achado;
      else faltando.push(papel);
    }
  }
  const agentes = !lista ? 'desconhecido' : faltando.length ? 'nao' : 'sim';
  const nativo = agentes === 'sim' && PAPEIS.every((p) => String(tipos[p]).startsWith(PREFIXO_NATIVO));
  const problemas = [];
  const instrucoes = [];
  if (!hooks.ativo) {
    problemas.push(`os hooks do plugin não registraram atividade${hooks.idadeSegundos === null ? '' : ` (último carimbo há ${hooks.idadeSegundos}s)`}`);
    instrucoes.push(
      'Claude Code CLI: confirme "claude plugin details workflow-ia@fabriki" (4 hooks) e abra uma sessão NOVA no projeto. RM Code/Agent SDK: o host precisa carregar o plugin (plugins:[{type:"local"}]) ou ligar os hooks pelo adaptador; veja docs/hosts/rmcode.md.'
    );
  }
  if (agentes === 'nao') {
    problemas.push(`faltam os subagentes: ${faltando.join(', ')}`);
    instrucoes.push(
      `Claude Code CLI: o plugin precisa estar instalado e habilitado (${PAPEIS.length} agentes). RM Code/Agent SDK: registre os papéis com "wf exportar-agentes --formato sdk" (opção "agents" do query) ou carregue o plugin pela opção "plugins"; veja docs/hosts/rmcode.md.`
    );
  } else if (agentes === 'desconhecido') {
    problemas.push('não sei quais subagentes o host expõe (rode "wf ambiente --agentes-visiveis <tipos que você vê na ferramenta Agent>")');
    instrucoes.push('Liste na opção --agentes-visiveis os tipos de subagente que aparecem na descrição da ferramenta Agent, separados por vírgula.');
  }
  if (sdkInit?.plugin_errors?.length) {
    problemas.push(`o host reportou erro ao carregar plugin: ${sdkInit.plugin_errors.map((e) => `${e.plugin || '?'} [${e.type || 'erro'}] ${e.message || ''}`.trim()).join('; ')}`);
  }
  const ok = hooks.ativo && agentes === 'sim' && !sdkInit?.plugin_errors?.length;
  // Avisos não bloqueiam: o pipeline funciona, mas o humano vai ver efeitos colaterais de outro plugin.
  const avisos = [avisoSecurityGuidance(securityGuidance({ raiz, env }), { sessao })].filter(Boolean);
  return {
    ok,
    modo: ok ? (nativo ? 'nativo' : 'host-provido') : 'bloqueado',
    hooks: hooks.ativo ? 'sim' : 'nao',
    batimento: hooks.em ? { em: hooks.em, idadeSegundos: hooks.idadeSegundos } : null,
    agentes,
    tipos,
    faltando,
    ci: !!ci,
    motivo: ok ? null : `AMBIENTE: ${problemas.join('; ')}.`,
    instrucoes: ok ? [] : instrucoes,
    avisos,
    em: agoraISO(),
  };
}

export function gravarAmbiente(raiz, resultado) {
  gravarJSON(caminhos(raiz).ambiente, resultado);
}

/** O F0 só prossegue com um "wf ambiente" aprovado e recente, e com os hooks vivos agora. */
export function exigirAmbiente(raiz, config, agora = Date.now()) {
  const a = lerJSON(caminhos(raiz).ambiente, null);
  const validade = config.host?.validadeAmbienteSegundos ?? 600;
  if (!a) return { ok: false, motivo: 'AMBIENTE: o ambiente ainda não foi avaliado (rode "wf ambiente --agentes-visiveis ..." antes de criar a task).' };
  if (agora - Date.parse(a.em) > validade * 1000) return { ok: false, motivo: `AMBIENTE: a avaliação do ambiente tem mais de ${Math.round(validade / 60)} min; rode "wf ambiente" de novo.` };
  if (!a.ok) return { ok: false, motivo: a.motivo || 'AMBIENTE: o ambiente não sustenta o pipeline.', instrucoes: a.instrucoes };
  const h = hooksAtivos(raiz, config, agora);
  if (!h.ativo) return { ok: false, motivo: 'AMBIENTE: os hooks deixaram de registrar atividade desde a avaliação do ambiente.', instrucoes: a.instrucoes };
  return { ok: true, ambiente: a };
}

/**
 * Cria a task já encerrada pelo ambiente: o mesmo formato do caso real (BLOQUEADA, motivo AMBIENTE:), mas emitido
 * no F0, sem nunca entrar na F1. O orquestrador só escreve o report.md e roda "wf encerrar".
 */
export function bloquearPorAmbiente(raiz, id, titulo, motivo) {
  validarIdTask(id);
  return comLock(raiz, () => {
    const c = caminhos(raiz, id);
    if (existe(c.estado)) throw new Error(`A task ${id} já existe.`);
    for (const d of [c.task, c.revisoes, c.evidencias]) fs.mkdirSync(d, { recursive: true });
    const e = estadoInicial(id, titulo || '', 'task');
    e.veredito = 'BLOQUEADA';
    e.status = 'BLOQUEADA';
    e.motivo = motivo;
    // Desbloqueada (o humano resolveu o host), a task recomeça no F0: "wf ambiente" confere de novo.
    e.bloqueio = { fase: 'intake', commit: null, codigo: 'AMBIENTE', em: agoraISO() };
    e.fase = 'entrega';
    e.historicoFases.push({ fase: 'entrega', em: agoraISO(), veredito: 'BLOQUEADA', origem: 'F0-ambiente' });
    gravarEstado(raiz, e);
    marcarRegistro(raiz, id, { criadoEm: e.criadoEm, encerradaEm: null, modo: 'task', veredito: 'BLOQUEADA' });
    definirTaskAtiva(raiz, id);
    return e;
  });
}
