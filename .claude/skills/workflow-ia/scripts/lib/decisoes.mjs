// Decisão humana: quando a task para por algo que só o humano decide (BLOQUEADA) ou por um limite
// (INTERROMPIDA), o agente da sessão pergunta ao humano (AskUserQuestion), aplica a resposta e a mesma
// task continua de onde parou — sem refazer spec, plano ou testes.
//
// Quem atesta que a resposta veio do humano não é o agente:
//  - o hook PreToolUse(AskUserQuestion) só deixa passar as perguntas exatas da decisão pendente (hash) e
//    nega respostas pré-preenchidas; o PostToolUse grava a resposta em runtime/ (só hooks e CLI escrevem ali);
//  - a CLI confere a mesma resposta no transcript da sessão (segunda âncora: forjar exigiria editar os dois).
// O agente não escolhe efeitos: a pergunta "Como seguir?" e suas opções saem daqui, a partir do código do motivo.

import fs from 'node:fs';
import path from 'node:path';
import {
  caminhos,
  existe,
  lerJSON,
  agoraISO,
  sha256,
  limitesDaTask,
  rodadasRevisao,
  definirTaskAtiva,
  idTaskAtiva,
  gitBranchAtual,
  reabrirEstado,
  FASES,
} from './core.mjs';
import { ajusteAtivo, opcoesAjuste, aplicarEfeitoAjuste, assinaturaAjuste, CODIGO_DECISAO_AJUSTE } from './ajustes.mjs';

export const PERGUNTA_COMO_SEGUIR = 'Como seguir?';
const CODIGOS_ITERACAO = ['LIMITE_ITERACOES', 'SEM_PROGRESSO', 'OSCILACAO', 'VERIFICACAO_REPROVADA'];
const CODIGOS_AMBIENTE = ['AMBIENTE', 'WORKING_TREE_SUJO', 'CONFLITO_COM_BASE', 'CONFIGURACAO_HUMANA'];

/** Código do motivo: o primeiro token em maiúsculas ("PLANO_REPROVADO: ..." ou "PLANO_REPROVADO — ..."). */
export function codigoDoMotivo(motivo) {
  const m = String(motivo || '')
    .trim()
    .match(/^([A-Z][A-Z0-9_]+)(?![a-z])/);
  return m ? m[1] : 'OUTRO';
}

/** Fase em que a task parou. Tasks anteriores a este registro: a última fase de trabalho do histórico. */
export function faseDoBloqueio(estado) {
  if (estado.bloqueio?.fase) return estado.bloqueio.fase;
  const fases = (estado.historicoFases || []).map((h) => h.fase).filter((f) => FASES.includes(f) && !['entrega', 'encerrada'].includes(f));
  return fases[fases.length - 1] || 'intake';
}

/** Forma canônica das perguntas (o que o humano vê), para o hash que amarra pergunta, hook e CLI. */
export function hashPerguntas(questions) {
  const norm = (Array.isArray(questions) ? questions : []).map((q) => ({
    question: String(q?.question ?? ''),
    header: String(q?.header ?? ''),
    multiSelect: !!q?.multiSelect,
    options: (Array.isArray(q?.options) ? q.options : []).map((o) => ({ label: String(o?.label ?? ''), description: String(o?.description ?? '') })),
  }));
  return sha256(JSON.stringify(norm));
}

/** Opções fixas de "Como seguir?" para o código do motivo. Efeitos: continuar | ajustar-spec | encerrar | ajuste-*. */
export function opcoesComoSeguir(codigo, estado, config) {
  if (codigo === CODIGO_DECISAO_AJUSTE) return opcoesAjuste(estado);
  const lim = limitesDaTask(config, estado);
  const fase = faseDoBloqueio(estado);
  // Rodadas de revisão esgotadas: continuar sem mais uma cairia de novo em LIMITE_ITERACOES. A extensão já vem embutida.
  const iterAuto = rodadasRevisao(estado) >= lim.maxIteracoes && FASES.indexOf(fase) >= FASES.indexOf('loop') ? 1 : 0;
  const continuar = (label, texto, extra = {}) => {
    const efeito = { tipo: 'continuar', fase, iteracoes: iterAuto, ...extra };
    const partes = [`continua na fase "${fase}"`];
    if (efeito.iteracoes) partes.push(`+${efeito.iteracoes} rodada(s) de revisão`);
    if (efeito.falhasGate) partes.push(`+${efeito.falhasGate} tentativas do gate`);
    return { label, description: `${texto} [efeito: ${partes.join('; ')}]`, efeito };
  };
  const encerrar = { label: 'Encerrar a task', description: 'A task termina com o veredito atual e o relatório. [efeito: encerra]', efeito: { tipo: 'encerrar' } };

  if (codigo === 'PLANO_REPROVADO') {
    return [continuar('Refazer o plano com minhas respostas', `O arquiteto refaz o plano usando suas respostas e o plan-reviewer ganha um ciclo novo de ${lim.maxRodadasPlano} rodadas.`), encerrar];
  }
  if (codigo === 'SPEC_MUDOU') {
    const ajustar = continuar('Ajustar o spec com minhas respostas', 'O spec é ajustado conforme suas respostas e recongelado uma única vez como nova Definition of Done.');
    ajustar.efeito.tipo = 'ajustar-spec';
    ajustar.description = ajustar.description.replace('[efeito: ', '[efeito: autoriza recongelar o spec; ');
    return [ajustar, continuar('Manter o spec e continuar', 'Segue com o spec congelado atual; o agente restaura qualquer edição.'), encerrar];
  }
  if (CODIGOS_ITERACAO.includes(codigo)) {
    return [
      continuar('Continuar com +1 rodada', 'Mais uma rodada de correção e code review.', { iteracoes: 1 }),
      continuar('Continuar com +2 rodadas', 'Mais duas rodadas de correção e code review.', { iteracoes: 2 }),
      encerrar,
    ];
  }
  if (codigo === 'GATE_TRAVADO') {
    const n = config.limites?.maxFalhasGateSeguidas || 5;
    return [continuar(`Continuar com mais ${n} tentativas`, 'O fixer tenta de novo a etapa do gate usando suas respostas como orientação.', { falhasGate: n }), encerrar];
  }
  if (CODIGOS_AMBIENTE.includes(codigo)) {
    return [continuar('Já resolvi: continuar', 'Você já corrigiu o que impedia a task; o agente confere de novo antes de seguir.'), encerrar];
  }
  return [continuar('Continuar com minhas respostas', 'O agente segue de onde parou usando suas respostas como decisão.'), encerrar];
}

function validarPergunta(q, i) {
  const erros = [];
  const onde = `pergunta ${i + 1}`;
  if (!q || typeof q !== 'object') return [`${onde}: objeto inválido.`];
  if (typeof q.question !== 'string' || !q.question.trim()) erros.push(`${onde}: "question" vazio.`);
  if (typeof q.header !== 'string' || !q.header.trim() || q.header.length > 12) erros.push(`${onde}: "header" obrigatório, até 12 caracteres.`);
  const ops = Array.isArray(q.options) ? q.options : [];
  if (ops.length < 2 || ops.length > 4) erros.push(`${onde}: de 2 a 4 opções.`);
  const labels = new Set();
  for (const o of ops) {
    if (typeof o?.label !== 'string' || !o.label.trim()) erros.push(`${onde}: opção sem "label".`);
    else if (o.label.includes(', ')) erros.push(`${onde}: o label "${o.label}" não pode conter ", " (é o separador das respostas múltiplas).`);
    else if (labels.has(o.label)) erros.push(`${onde}: label repetido "${o.label}".`);
    labels.add(o?.label);
    if (o?.description !== undefined && typeof o.description !== 'string') erros.push(`${onde}: "description" deve ser texto.`);
  }
  const texto = JSON.stringify(q);
  if (/\[efeito:|\[H-\d+\]/i.test(texto)) erros.push(`${onde}: "[efeito: ...]" e "[H-n]" são marcadores da CLI e não podem vir do agente.`);
  return erros;
}

/** Monta e registra a decisão pendente. Devolve as perguntas exatas para o AskUserQuestion. */
export function pedirDecisao(raiz, estado, config, { contexto = [], recomendar, retomada = false } = {}) {
  const inter = config.interacao || {};
  // perguntarAoHumano=false vale para a parada automática do pipeline. Na retomada (/workflow-ia:retomar) o humano
  // pediu para continuar e está presente: pergunta. No CI nunca há humano.
  if (process.env.WORKFLOW_IA_CI === '1' || (inter.perguntarAoHumano === false && !retomada)) {
    return { ok: false, semHumano: true, mensagem: 'Sem humano nesta execução (CI ou interacao.perguntarAoHumano=false): escreva report.md com as opções para o humano e rode "wf encerrar". Ele retoma depois com /workflow-ia:retomar (que pergunta com "wf decisao pedir --retomada").' };
  }
  // Ajuste pós-entrega com pontos que mudam o comportamento combinado: o humano decide sem veredito (a task segue ativa).
  const aj = ajusteAtivo(estado);
  const doAjuste = !estado.veredito && aj?.status === 'aguardando-decisao';
  if (!doAjuste && !['BLOQUEADA', 'INTERROMPIDA'].includes(estado.veredito)) {
    return { ok: false, mensagem: 'Decisão humana só depois do veredito: rode "wf veredito BLOQUEADA|INTERROMPIDA --motivo \'<CÓDIGO>: ...\'" e então "wf decisao pedir".' };
  }
  if (!doAjuste && codigoDoMotivo(estado.motivo).startsWith('AJUSTE_')) {
    return { ok: false, mensagem: 'Os códigos AJUSTE_* são reservados à decisão do ajuste pós-entrega (a CLI os emite). Use o código real do motivo do veredito.' };
  }
  const ativa = idTaskAtiva(raiz);
  if (ativa && ativa !== estado.id) {
    const outra = lerJSON(caminhos(raiz, ativa).estado, null);
    if (outra && outra.fase !== 'encerrada') return { ok: false, mensagem: `Há outra task ativa não encerrada (${ativa}). Termine-a antes de retomar ${estado.id}.` };
  }
  let p = estado.decisaoPendente;
  // Pendente de outro contexto (outro ajuste, ou de travamento quando agora é ajuste): não vale aqui, é refeita.
  if (p && (p.ajuste || null) !== (doAjuste ? aj.id : null)) p = null;
  if (p && doAjuste && p.assinaturaAjuste !== assinaturaAjuste(aj)) p = null;
  if (p && respostasAtestadas(raiz, estado).length) {
    return { ok: false, mensagem: `A decisão ${p.id} já tem resposta do humano: rode "wf decisao aplicar".` };
  }
  const feitas = (estado.decisoes || []).length;
  // Decisões de ajuste vêm de pedido explícito do humano (/workflow-ia:ajustar), não de travamento: não contam no
  // limite. Só conta como de ajuste a decisão que a CLI criou para um ajuste ativo (campo "ajuste"), não o código.
  const travamentos = (estado.decisoes || []).filter((d) => !d.ajuste).length;
  const max = inter.maxDecisoes ?? 5;
  if (!p && !doAjuste && travamentos >= max) {
    return { ok: false, mensagem: `Limite de ${max} decisões humanas nesta task atingido (interacao.maxDecisoes). Escreva report.md e rode "wf encerrar".` };
  }
  const lista = Array.isArray(contexto) ? contexto : Array.isArray(contexto?.perguntas) ? contexto.perguntas : null;
  if (!lista) return { ok: false, mensagem: '--contexto deve ser um array de perguntas (ou { "perguntas": [...] }).' };
  if (lista.length > 3) return { ok: false, mensagem: 'No máximo 3 perguntas de contexto: a CLI acrescenta a "Como seguir?" (o AskUserQuestion aceita 4).' };
  const erros = lista.flatMap(validarPergunta);
  if (erros.length) return { ok: false, mensagem: 'Perguntas de contexto inválidas.', erros };

  const id = p?.id || `H-${feitas + 1}`;
  const codigo = doAjuste ? CODIGO_DECISAO_AJUSTE : codigoDoMotivo(estado.motivo);
  let opcoes = opcoesComoSeguir(codigo, estado, config);
  if (recomendar) {
    const alvo = String(recomendar).toLowerCase();
    const i = opcoes.findIndex((o) => o.label.toLowerCase() === alvo || o.efeito.tipo === alvo);
    if (i < 0) return { ok: false, mensagem: `--recomendar não casa com nenhuma opção: ${opcoes.map((o) => `"${o.label}"`).join(', ')}.` };
    opcoes = [opcoes[i], ...opcoes.filter((_, j) => j !== i)];
  }
  opcoes[0] = { ...opcoes[0], label: `${opcoes[0].label} (Recomendado)` };
  const comoSeguir = doAjuste
    ? `[${id}] ${PERGUNTA_COMO_SEGUIR} No ajuste ${estado.ajuste.id} da task ${estado.id}, há pontos que mudam o comportamento combinado no spec.`
    : `[${id}] ${PERGUNTA_COMO_SEGUIR} A task ${estado.id} parou (${codigo}) na fase "${faseDoBloqueio(estado)}".`;
  const questions = [
    ...lista.map((q) => ({
      question: `[${id}] ${q.question.trim()}`,
      header: q.header.trim(),
      multiSelect: !!q.multiSelect,
      options: q.options.map((o) => ({ label: o.label.trim(), description: (o.description || '').trim() })),
    })),
    { question: comoSeguir, header: 'Como seguir', multiSelect: false, options: opcoes.map((o) => ({ label: o.label, description: o.description })) },
  ];
  const textos = questions.map((q) => q.question);
  if (new Set(textos).size !== textos.length) return { ok: false, mensagem: 'Perguntas repetidas: cada texto precisa ser único (as respostas são indexadas pelo texto).' };

  estado.decisaoPendente = {
    id,
    codigo,
    motivo: doAjuste ? `${CODIGO_DECISAO_AJUSTE}: ${estado.ajuste.id}` : estado.motivo,
    fase: doAjuste ? estado.fase : faseDoBloqueio(estado),
    ajuste: doAjuste ? aj.id : null,
    assinaturaAjuste: doAjuste ? assinaturaAjuste(aj) : null,
    criadaEm: p?.criadaEm || agoraISO(),
    atualizadaEm: agoraISO(),
    questions,
    perguntaComoSeguir: comoSeguir,
    efeitos: Object.fromEntries(opcoes.map((o) => [o.label, o.efeito])),
    sha256: hashPerguntas(questions),
    respostasLivres: p?.respostasLivres || [],
  };
  definirTaskAtiva(raiz, estado.id);
  return {
    ok: true,
    decisao: id,
    questions,
    instrucao: doAjuste
      ? `Chame a ferramenta AskUserQuestion com exatamente estas "questions" (sem alterar texto nem ordem e sem preencher "answers"). Depois rode "wf decisao aplicar". Se o humano não responder ou a ferramenta não existir neste host, pare aqui: a task fica ativa com a decisão ${id} pendente; ele responde no chat ("${id}: <opção>") ou retoma com /workflow-ia:retomar ${estado.id}.`
      : `Chame a ferramenta AskUserQuestion com exatamente estas "questions" (sem alterar texto nem ordem e sem preencher "answers"). Depois rode "wf decisao aplicar". Se o humano não responder ou a ferramenta não existir neste host, escreva report.md e rode "wf encerrar": a decisão ${id} fica pendente para /workflow-ia:retomar.`,
  };
}

// ---------------------------------------------------------------------------
// Respostas atestadas (gravadas pelos hooks em runtime/respostas-humano.jsonl)
// ---------------------------------------------------------------------------

export function lerRespostas(raiz) {
  try {
    return fs
      .readFileSync(caminhos(raiz).respostasHumano, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Grava um registro dos hooks (pergunta emitida, resposta, mensagem do chat). Só os hooks chamam isto. */
export function registrarResposta(raiz, registro) {
  const c = caminhos(raiz);
  fs.mkdirSync(c.runtime, { recursive: true });
  fs.appendFileSync(c.respostasHumano, JSON.stringify({ em: agoraISO(), ...registro }) + '\n');
}

/** A pergunta da decisão pendente já foi mostrada ao humano (o hook Pre a deixou passar)? */
export function perguntaEmitida(raiz, estado) {
  const p = estado.decisaoPendente;
  if (!p) return false;
  const desde = Date.parse(p.atualizadaEm || p.criadaEm);
  return lerRespostas(raiz).some((r) => r.tipo === 'pergunta' && r.task === estado.id && r.sha256 === p.sha256 && Date.parse(r.em) >= desde);
}

function idMensagem(r) {
  return `msg:${sha256(`${r.em}|${r.prompt}`).slice(0, 16)}`;
}

// ---------------------------------------------------------------------------
// Pedido de ajuste pós-entrega: "/workflow-ia:ajustar <ID> <o que vi>" digitado pelo humano
// ---------------------------------------------------------------------------

/** Forma comparável do feedback: sem aspas e com espaços normalizados (o agente repassa o texto literal). */
export function normalizarFeedback(t) {
  return String(t || '')
    .replace(/["'“”‘’`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lê "/workflow-ia:ajustar <ID> <texto>" (ou "/ajustar ...") de uma mensagem do humano. */
export function lerPedidoAjuste(prompt) {
  const m = String(prompt || '').match(/^\s*\/(?:workflow-ia:)?ajustar\s+([A-Za-z0-9][\w.-]*)\s+([\s\S]*\S)\s*$/);
  return m ? { task: m[1], texto: m[2] } : null;
}

/**
 * O agente só reabre uma task entregue a pedido do humano: precisa haver um "/workflow-ia:ajustar <ID> <texto>"
 * registrado pelo hook UserPromptSubmit, com o mesmo texto, ainda não usado, e presente no transcript da sessão.
 */
export function atestarPedidoAjuste(raiz, estado, config, texto) {
  const alvo = normalizarFeedback(texto);
  const consumidos = new Set(estado.respostasConsumidas || []);
  const pedidos = lerRespostas(raiz)
    .filter((r) => r.tipo === 'pedido-ajuste' && r.task === estado.id && normalizarFeedback(r.texto) === alvo)
    .reverse();
  for (const r of pedidos) {
    const chave = `ajuste:${idMensagem(r)}`;
    if (consumidos.has(chave)) continue;
    if (config.interacao?.exigirTranscript !== false) {
      const t = confereNoTranscript({ ...r, origem: 'chat' }, null);
      if (!t.ok) return { ok: false, mensagem: `O pedido de ajuste não confere com o transcript da sessão: ${t.motivo}` };
    }
    return { ok: true, chave };
  }
  return {
    ok: false,
    mensagem: `Ajuste pós-entrega só a pedido do humano: não há "/workflow-ia:ajustar ${estado.id} <o que viu>" com este texto registrado nesta sessão (passe o feedback literal). O humano também pode rodar "wf ajuste abrir" no terminal dele.`,
  };
}

/** Interpreta "H-2: <opção ou número>" digitado no chat. */
export function lerMensagem(prompt, p) {
  const m = String(prompt || '').match(new RegExp(`\\b${p.id}\\b\\s*[:\\-–—]\\s*([\\s\\S]+)`, 'i'));
  if (!m) return null;
  const texto = m[1].trim();
  const primeira = texto.split('\n')[0].trim().replace(/[.!]+$/, '');
  const labels = Object.keys(p.efeitos);
  const sem = (l) => l.replace(/\s*\(Recomendado\)$/, '').toLowerCase();
  let escolhido = null;
  const num = primeira.match(/^(\d)\b/);
  if (num && labels[Number(num[1]) - 1]) escolhido = labels[Number(num[1]) - 1];
  if (!escolhido) escolhido = labels.find((l) => primeira.toLowerCase() === l.toLowerCase() || primeira.toLowerCase().startsWith(sem(l))) || null;
  return { escolhido, texto };
}

/** Respostas ainda não consumidas para a decisão pendente, da mais nova para a mais antiga. */
export function respostasAtestadas(raiz, estado) {
  const p = estado.decisaoPendente;
  if (!p) return [];
  const desde = Date.parse(p.criadaEm);
  const regs = lerRespostas(raiz).filter((r) => r.task === estado.id && Date.parse(r.em) >= desde);
  const consumidos = new Set(estado.respostasConsumidas || []);
  const perguntas = regs.filter((r) => r.tipo === 'pergunta' && r.sha256 === p.sha256);
  const achadas = [];
  for (const r of regs) {
    if (r.tipo === 'resposta') {
      if (r.sha256 !== p.sha256 || !r.tool_use_id || consumidos.has(r.tool_use_id)) continue;
      // A emissão precisa ter passado pelo hook Pre (que confere o hash e nega respostas pré-preenchidas).
      const emitida = perguntas.some((q) => (q.tool_use_id ? q.tool_use_id === r.tool_use_id : Date.parse(q.em) <= Date.parse(r.em)));
      if (emitida) achadas.push({ ...r, chave: r.tool_use_id, origem: 'AskUserQuestion' });
    } else if (r.tipo === 'mensagem') {
      const chave = idMensagem(r);
      if (consumidos.has(chave) || !lerMensagem(r.prompt, p)) continue;
      achadas.push({ ...r, chave, origem: 'chat' });
    }
  }
  return achadas.reverse();
}

// ---------------------------------------------------------------------------
// Segunda âncora: o transcript da sessão
// ---------------------------------------------------------------------------

function lerTranscript(arquivo) {
  if (!arquivo || !existe(arquivo)) return null;
  try {
    return fs
      .readFileSync(arquivo, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return null;
  }
}

function blocos(o) {
  const c = o?.message?.content;
  return Array.isArray(c) ? c : [];
}

function textoDe(v) {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : x?.text || '')).join('\n');
  return '';
}

const comoLista = (v) => (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? [v] : []);

/** O transcript tem o AskUserQuestion (mesmas perguntas) e o resultado com as mesmas respostas? */
export function confereNoTranscript(r, p) {
  const linhas = lerTranscript(r.transcript_path);
  if (!linhas) return { ok: false, motivo: `transcript da sessão não encontrado (${r.transcript_path || 'sem caminho'}).` };
  if (r.origem === 'chat') {
    const achou = linhas.some((o) => o.type === 'user' && !blocos(o).some((b) => b?.type === 'tool_result') && textoDe(o.message?.content).includes(String(r.prompt).trim()));
    return achou ? { ok: true } : { ok: false, motivo: 'a mensagem do humano não está no transcript da sessão.' };
  }
  const uso = linhas.some((o) => o.type === 'assistant' && blocos(o).some((b) => b?.type === 'tool_use' && b.id === r.tool_use_id && b.name === 'AskUserQuestion' && hashPerguntas(b.input?.questions) === p.sha256));
  if (!uso) return { ok: false, motivo: `o AskUserQuestion ${r.tool_use_id} com as perguntas da decisão ${p.id} não está no transcript.` };
  const res = linhas.find((o) => o.type === 'user' && blocos(o).some((b) => b?.type === 'tool_result' && b.tool_use_id === r.tool_use_id));
  if (!res) return { ok: false, motivo: `o resultado do AskUserQuestion ${r.tool_use_id} não está no transcript.` };
  const texto = textoDe(blocos(res).find((b) => b?.tool_use_id === r.tool_use_id)?.content);
  const doTranscript = res.toolUseResult?.answers;
  for (const [pergunta, valor] of Object.entries(r.answers || {})) {
    if (doTranscript && typeof doTranscript === 'object') {
      if (JSON.stringify(comoLista(doTranscript[pergunta])) !== JSON.stringify(comoLista(valor))) return { ok: false, motivo: `a resposta de "${pergunta}" difere do transcript.` };
    } else if (!comoLista(valor).every((v) => texto.includes(v))) {
      return { ok: false, motivo: `a resposta de "${pergunta}" não aparece no resultado do transcript.` };
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Aplicar a decisão e reabrir a task
// ---------------------------------------------------------------------------

const celula = (t) => String(t ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();

function registrarEmDecisoesMd(raiz, estado, d) {
  const c = caminhos(raiz, estado.id);
  const respostas = Object.entries(d.respostas)
    .map(([q, v]) => `${q.replace(/^\[H-\d+\]\s*/, '')} → ${comoLista(v).join(' + ') || '(sem resposta)'}`)
    .join('; ');
  const linha = `| ${d.id} | ${d.fase} | Decisão humana (${d.codigo}): ${celula(respostas)}${d.orientacao ? ` — orientação: ${celula(d.orientacao)}` : ''} | — | Respondida pelo humano via ${d.origem} (${d.chave}); efeito: ${d.efeito.tipo} | humano |`;
  try {
    const atual = existe(c.decisoes) ? fs.readFileSync(c.decisoes, 'utf8') : '';
    fs.writeFileSync(c.decisoes, `${atual}${atual && !atual.endsWith('\n') ? '\n' : ''}${linha}\n`);
  } catch {
    /* a fonte de verdade é state.json (decisoes[]); decisoes.md é a cópia para leitura */
  }
}

/** Confere a resposta atestada, registra a decisão e aplica o efeito. */
export function aplicarDecisao(raiz, estado, config) {
  const p = estado.decisaoPendente;
  if (!p) return { ok: false, mensagem: 'Não há decisão humana pendente nesta task ("wf decisao status").' };
  // Decisão de ajuste só vale para o ajuste e a análise que o humano viu. Antes de consumir qualquer resposta:
  // se o ajuste mudou (cancelado, outro ajuste, outra análise), a pergunta é descartada e precisa ser refeita.
  if (p.codigo === CODIGO_DECISAO_AJUSTE || p.ajuste) {
    const a = ajusteAtivo(estado);
    if (!a || a.status !== 'aguardando-decisao' || p.ajuste !== a.id || p.assinaturaAjuste !== assinaturaAjuste(a)) {
      estado.decisaoPendente = null;
      return {
        ok: false,
        descartada: p.id,
        mensagem: `A decisão ${p.id} foi pedida sobre ${p.ajuste || 'um ajuste'} e não vale para o estado atual${a ? ` (ajuste ${a.id}, ${a.status})` : ' (nenhum ajuste aguardando decisão)'}: foi descartada sem aplicar.${a?.status === 'aguardando-decisao' ? ' Peça de novo: "wf decisao pedir".' : ''}`,
      };
    }
  }
  const candidatas = respostasAtestadas(raiz, estado);
  if (!candidatas.length) {
    return {
      ok: false,
      mensagem: `Nenhuma resposta do humano para ${p.id} atestada pelos hooks. Chame AskUserQuestion com as perguntas de "wf decisao status" (o hook registra a resposta) ou peça ao humano para responder no chat "${p.id}: <opção>".`,
    };
  }
  const r = candidatas[0];
  if (config.interacao?.exigirTranscript !== false) {
    const t = confereNoTranscript(r, p);
    if (!t.ok) {
      estado.alertaForja = { em: agoraISO(), decisao: p.id, chave: r.chave, motivo: t.motivo };
      return { ok: false, mensagem: `Resposta de ${p.id} não confere com o transcript da sessão: ${t.motivo} A decisão não foi aplicada.`, alertaForja: true };
    }
  }
  estado.respostasConsumidas = [...(estado.respostasConsumidas || []), r.chave];

  let respostas;
  let escolhido;
  let orientacao = null;
  if (r.origem === 'chat') {
    const m = lerMensagem(r.prompt, p);
    escolhido = m.escolhido;
    orientacao = m.texto;
    respostas = { [p.perguntaComoSeguir]: escolhido || m.texto };
  } else {
    respostas = r.answers || {};
    escolhido = comoLista(respostas[p.perguntaComoSeguir])[0];
    if (r.response) orientacao = r.response;
  }
  const efeito = escolhido ? p.efeitos[escolhido] : null;
  if (!efeito) {
    // Texto livre na "Como seguir?": vale como orientação, mas o efeito (continuar/encerrar) precisa ser explícito.
    p.respostasLivres = [...(p.respostasLivres || []), { em: agoraISO(), texto: comoLista(respostas[p.perguntaComoSeguir])[0] || orientacao || '' }];
    return {
      ok: false,
      precisaConfirmar: true,
      respostaLivre: p.respostasLivres[p.respostasLivres.length - 1].texto,
      mensagem: `O humano respondeu "Como seguir?" com texto livre. Leve isso em conta e pergunte de novo (AskUserQuestion com as mesmas perguntas de "wf decisao status") para ele escolher uma das opções.`,
    };
  }
  const livres = (p.respostasLivres || []).map((x) => x.texto).filter(Boolean);
  if (livres.length) orientacao = [...livres, orientacao].filter(Boolean).join(' / ');
  const decisao = {
    id: p.id,
    codigo: p.codigo,
    motivo: p.motivo,
    fase: p.fase,
    ajuste: p.ajuste || null,
    perguntas: p.questions.map((q) => q.question),
    respostas,
    orientacao,
    efeito,
    origem: r.origem,
    chave: r.chave,
    em: agoraISO(),
  };
  estado.decisoes = [...(estado.decisoes || []), decisao];
  estado.decisaoPendente = null;
  registrarEmDecisoesMd(raiz, estado, decisao);

  if (String(efeito.tipo).startsWith('ajuste-')) {
    const r3 = aplicarEfeitoAjuste(raiz, estado, config, decisao);
    return { ...r3, ok: r3.ok, decisao: decisao.id, efeito: efeito.tipo, respostas, orientacao };
  }
  if (efeito.tipo === 'encerrar') {
    const proximo = estado.fase === 'encerrada' ? 'A task já está encerrada: nada a fazer.' : `Escreva report.md (registre a decisão ${decisao.id}) e rode "wf encerrar".`;
    return { ok: true, decisao: decisao.id, efeito: 'encerrar', respostas, proximo };
  }
  const r2 = reabrirTask(raiz, estado, decisao);
  return { ok: true, decisao: decisao.id, efeito: efeito.tipo, respostas, orientacao, ...r2 };
}

/** Volta a task (BLOQUEADA/INTERROMPIDA, encerrada ou não) para a fase em que parou, sem perder nada do que foi feito. */
export function reabrirTask(raiz, estado, decisao) {
  const c = caminhos(raiz, estado.id);
  const efeito = decisao.efeito;
  const fase = efeito.fase || faseDoBloqueio(estado);
  fs.mkdirSync(c.relatorios, { recursive: true });
  const arquivados = [];
  const proximoNumero = (prefixo, ext) => {
    let n = 1;
    while (existe(path.join(c.relatorios, `${prefixo}-${n}.${ext}`))) n += 1;
    return path.join(c.relatorios, `${prefixo}-${n}.${ext}`);
  };
  if (existe(c.relatorio)) {
    const destino = proximoNumero('bloqueio', 'md');
    fs.renameSync(c.relatorio, destino);
    arquivados.push(path.relative(raiz, destino));
  }
  // Plano: um ciclo novo de revisão (limites.maxRodadasPlano rodadas). O histórico fica em relatorios/ para o arquiteto e o revisor.
  if (fase === 'plano' && existe(c.planoRevisao)) {
    const destino = proximoNumero('plano-revisao-ciclo', 'json');
    fs.renameSync(c.planoRevisao, destino);
    arquivados.push(path.relative(raiz, destino));
  }
  const extra = { ...(estado.limitesExtra || {}) };
  if (efeito.iteracoes) extra.iteracoes = (extra.iteracoes || 0) + efeito.iteracoes;
  if (efeito.falhasGate) extra.falhasGate = (extra.falhasGate || 0) + efeito.falhasGate;
  if (decisao.codigo === 'OSCILACAO') extra.reaberturas = (extra.reaberturas || 0) + 1;
  estado.limitesExtra = extra;
  if (CODIGOS_ITERACAO.includes(decisao.codigo)) estado.janelaProgressoDesde = estado.iteracao;
  if (efeito.tipo === 'ajustar-spec') estado.ajusteSpecAutorizado = decisao.id;

  estado.bloqueios = [...(estado.bloqueios || []), { ...(estado.bloqueio || {}), fase, veredito: estado.veredito, motivo: estado.motivo, desbloqueadoPor: decisao.id }];
  reabrirEstado(raiz, estado, { fase, evento: `desbloqueio ${decisao.id}`, retomada: { decisao: decisao.id, fase } });
  const avisos = [];
  if (FASES.indexOf(fase) >= FASES.indexOf('testes') && estado.meta?.branch && gitBranchAtual(raiz) !== estado.meta.branch) {
    avisos.push(`Volte ao branch da task antes de seguir: git switch ${estado.meta.branch}`);
  }
  return {
    reaberta: true,
    fase,
    arquivados,
    limitesExtra: extra,
    avisos,
    proximo: `Task reaberta na fase "${fase}" pela decisão ${decisao.id}. Rode "wf ambiente" (o host pode ser outro), mova o card para "em andamento" e siga "wf proximo", passando a decisão ${decisao.id} (state.json decisoes / decisoes.md) ao subagente da fase.`,
  };
}
