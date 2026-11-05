// Máquina de estados do pipeline: fases, limites do loop, próximo passo,
// verificação independente, manifest de provas e veredito.

import path from 'node:path';
import {
  caminhos,
  lerJSON,
  gravarJSON,
  existe,
  agoraISO,
  FASES,
  VEREDITOS,
  limitesDaTask,
  rodadasRevisao,
  gitHead,
  gitLimpo,
  gitBranchAtual,
  definirTaskAtiva,
  refBase,
  baseDaTask,
  comLock,
  lerEstado,
  gravarEstado,
  lerSubagentes,
  marcarRegistro,
  sha256,
  git,
  CONFIG_PADRAO,
  casaAlgum,
  ehMigration,
} from './core.mjs';
import fs from 'node:fs';
import { ABERTOS, resumoFindings, lerFindings, marcarVerificados, reabrir, mesclar, prefixo, REVISOR_POR_PREFIXO, validarItem } from './findings.mjs';
import { criteriosDoSpec, criteriosDaTask, specIntegro, hashSpec, matrizRastreabilidade, diffTestes, rodarGate, aplicarGate, metaDoSpec } from './provas.mjs';
import { codigoDoMotivo } from './decisoes.mjs';
import { ajusteAtivo, ajusteEmAndamento, ajusteComMudanca, ajusteDaEntrega, pontosDoAjuste, exigeRedAjuste, itensParaJulgar, caminhoRedAjuste, concluirAjuste, commitDaUltimaEntrega } from './ajustes.mjs';
import { agregarGrupo, resumoEconomia, pendenciasDoGate, textoPendencias, textoPulada } from './gate-cache.mjs';
import { provaCIValeParaHead } from './ci-conteudo.mjs';

/** Prova do ci.json (ou do gate.json.ci) no formato de provaCIValeParaHead: SHA local, run e (0.9.0) prova por conteúdo. */
function provaDoCiJson(ciJson) {
  if (!ciJson) return null;
  return { sha: ciJson.sha, headSha: ciJson.run?.sha ?? null, shas: (ciJson.runs || []).map((r) => r.sha).filter(Boolean), criterio: ciJson.criterio, conteudo: Array.isArray(ciJson.conteudo) ? ciJson.conteudo : Object.values(ciJson.conteudo?.apps || {}) };
}

function mtime(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Fases
// ---------------------------------------------------------------------------

export function prerequisitosFase(raiz, estado, fase) {
  const c = caminhos(raiz, estado.id);
  const faltas = [];
  const exige = (cond, msg) => {
    if (!cond) faltas.push(msg);
  };
  switch (fase) {
    case 'spec':
      exige(existe(c.card), 'card.md não existe (salve o card original na pasta da task).');
      break;
    case 'plano':
      exige(existe(c.spec), 'spec.md não existe.');
      if (ajusteAtivo(estado)) {
        exige(estado.ajuste.status === 'em-andamento', `a análise do ajuste ${estado.ajuste.id} ainda não foi registrada e decidida ("wf ajuste registrar" e, se houver mudança de comportamento, a decisão do humano).`);
        exige(!estado.ajusteSpecAutorizado, `o spec ainda não recebeu os critérios aprovados na decisão ${estado.ajusteSpecAutorizado} ("wf spec aceitar-ajuste").`);
      }
      exige(criteriosDoSpec(raiz, estado.id).length > 0, 'spec.md não tem critérios de aceite identificados como CA-1, CA-2...');
      break;
    case 'setup': {
      exige(existe(c.plano), 'plan.md não existe.');
      const rev = lerJSON(c.planoRevisao, null);
      exige(rev && rev.aprovado === true, 'plano-revisao.json ausente ou não aprovado pelo plan-reviewer.');
      exige(!rev || mtime(c.planoRevisao) >= mtime(c.plano), 'plan.md mudou depois da revisão: peça nova revisão ao plan-reviewer.');
      break;
    }
    case 'testes':
      exige(!!estado.meta.branch, 'meta.branch não definido (wf meta branch=<nome>).');
      exige(gitBranchAtual(raiz) === estado.meta.branch, `branch atual (${gitBranchAtual(raiz)}) diferente do branch da task (${estado.meta.branch}).`);
      break;
    case 'implementacao':
      exige(existe(c.red), 'RED não registrado (wf red).');
      if (exigeRedAjuste(estado)) exige(existe(caminhoRedAjuste(raiz, estado)), `RED do ajuste ${estado.ajuste.id} não registrado: testes de regressão de cada ponto (e dos critérios novos/alterados), commit e "wf red".`);
      break;
    case 'loop':
      exige(existe(c.red), 'RED não registrado (wf red).');
      break;
    case 'verificacao': {
      // No ajuste, as rodadas da entrega anterior não contam: o código do ajuste precisa da própria revisão.
      const aj = ajusteAtivo(estado);
      exige(
        !!(estado.iteracoes || []).some((i) => i.gate === 'ok' && i.triagem && (!aj || i.n > aj.desdeIteracao)),
        aj ? `nenhuma rodada de revisão do ajuste ${aj.id} com gate verde e revisão triada: rode "wf iteracao nova", o gate e a revisão antes da verificação.` : 'nenhuma iteração do loop com gate verde e revisão triada: rode o loop de qualidade antes da verificação.'
      );
      break;
    }
    case 'entrega':
      exige(!!estado.veredito, 'veredito não definido (wf veredito ...).');
      break;
    case 'encerrada':
      faltas.push('use "wf encerrar" para encerrar a task.');
      break;
    default:
      break;
  }
  return faltas;
}

// ---------------------------------------------------------------------------
// Spec congelado
// ---------------------------------------------------------------------------

/** Congela os critérios e guarda uma cópia do spec (evidencias/, só a CLI escreve). */
export function congelarSpec(raiz, estado, extra = {}) {
  const c = caminhos(raiz, estado.id);
  estado.specCongelado = { sha256: hashSpec(raiz, estado.id), criterios: criteriosDoSpec(raiz, estado.id), em: agoraISO(), ...extra };
  try {
    fs.mkdirSync(c.evidencias, { recursive: true });
    if (existe(c.spec)) fs.copyFileSync(c.spec, path.join(c.evidencias, 'spec-congelado.md'));
  } catch {
    /* melhor esforço: a integridade continua checada pelo sha256 */
  }
}

/** Task criada antes do congelamento existir: congela na primeira oportunidade depois do plano. */
export function garantirSpecCongelado(raiz, estado) {
  if (estado.modo === 'revisao' || estado.specCongelado) return;
  if (FASES.indexOf(estado.fase) > FASES.indexOf('plano') && existe(caminhos(raiz, estado.id).spec)) congelarSpec(raiz, estado, { tardio: true });
}

export function instrucaoRestaurarSpec(estado) {
  const t = `.workflow-ia/tasks/${estado.id}`;
  return `spec.md mudou depois de congelado no plano. Restaure: "cp ${t}/evidencias/spec-congelado.md ${t}/spec.md". Se o critério precisa mesmo mudar, registre em decisoes.md e encerre como BLOQUEADA (SPEC_MUDOU); o humano decide ("wf spec recongelar" no terminal dele).`;
}

// Transições permitidas: a fase seguinte, a mesma fase, ou de volta ao loop
// depois de uma verificação reprovada. Veredito e encerramento têm comando próprio.
export function transicaoPermitida(atual, alvo) {
  if (alvo === atual) return true;
  const ia = FASES.indexOf(atual);
  const ib = FASES.indexOf(alvo);
  if (['entrega', 'encerrada'].includes(alvo)) return false;
  if (atual === 'verificacao' && alvo === 'loop') return true;
  return ib === ia + 1;
}

export function mudarFase(raiz, estado, fase, { forcar = false } = {}) {
  if (!FASES.includes(fase)) throw new Error(`Fase desconhecida: ${fase}. Fases: ${FASES.join(', ')}`);
  if (estado.fase === 'encerrada') return { ok: false, mensagem: 'Task encerrada: nada mais muda nela. Para rodar o card de novo, "wf init-task <ID>".', faltas: [] };
  if (['entrega', 'encerrada'].includes(fase) && !forcar) return { ok: false, mensagem: `A fase "${fase}" não é escolhida à mão: vem de "wf veredito" (entrega) e "wf encerrar" (encerrada).`, faltas: [] };
  if (estado.modo !== 'revisao' && !forcar && !transicaoPermitida(estado.fase, fase)) {
    const idx = FASES.indexOf(estado.fase);
    return { ok: false, mensagem: `Transição "${estado.fase}" → "${fase}" não permitida. A próxima fase é "${FASES[idx + 1]}"${estado.fase === 'verificacao' ? ' (ou "loop", para corrigir o que a verificação reprovou)' : ''}; entrega e encerramento vêm de "wf veredito" e "wf encerrar".`, faltas: [] };
  }
  const faltas = estado.modo === 'revisao' || forcar ? [] : prerequisitosFase(raiz, estado, fase);
  if (faltas.length) return { ok: false, mensagem: `Não é possível entrar na fase "${fase}".`, faltas };
  if (fase === 'loop' && estado.fase === 'verificacao') {
    // Volta da verificação: os findings dela são o trabalho da próxima iteração.
    estado.janelaProgressoDesde = estado.iteracao;
    estado.retornoVerificacao = estado.iteracao + 1;
  }
  if (fase === 'plano' && estado.modo !== 'revisao' && !estado.specCongelado) {
    // Congela os critérios: depois daqui, mudar o spec (e a Definition of Done) é decisão humana.
    congelarSpec(raiz, estado);
  }
  if (estado.modo !== 'revisao' && FASES.indexOf(fase) > FASES.indexOf('plano')) {
    garantirSpecCongelado(raiz, estado);
    if (!specIntegro(raiz, estado)) return { ok: false, mensagem: `Não é possível entrar na fase "${fase}".`, faltas: [instrucaoRestaurarSpec(estado)] };
  }
  if (fase === 'verificacao') {
    // Sai do loop: fecha a iteração em aberto para que uma verificação reprovada possa abrir outra.
    const it = iteracaoAtual(estado);
    if (it && !it.correcao) {
      it.correcao = true;
      it.fim = agoraISO();
      it.fechadaPor = 'saida-para-verificacao';
    }
  }
  estado.fase = fase;
  estado.historicoFases.push({ fase, em: agoraISO() });
  return { ok: true, fase };
}

// ---------------------------------------------------------------------------
// Limites do loop
// ---------------------------------------------------------------------------

export function avaliarLimites(raiz, estado, config) {
  const lim = limitesDaTask(config, estado);
  // Tokens: só medidos e mostrados. Não há teto: o consumo nunca interrompe a task.
  const tokens = estado.orcamento?.tokensUsados || 0;
  const res = resumoFindings(raiz, estado, config);
  const rodadas = rodadasRevisao(estado);
  const motivos = [];

  // Só rodadas de code review contam: gate → correção → gate dentro da iteração não gasta iteração.
  if (rodadas >= lim.maxIteracoes) motivos.push('LIMITE_ITERACOES');
  // Só iterações comparáveis: gate verde e revisão triada. A janela recomeça quando a
  // task volta da verificação, porque a verificação traz findings novos por definição.
  const desde = estado.janelaProgressoDesde || 0;
  const hist = (estado.iteracoes || [])
    .filter((i) => i.n > desde && i.gate === 'ok' && i.triagem)
    .map((i) => i.bloqueantes)
    .filter((x) => typeof x === 'number');
  const k = lim.semProgressoPor;
  if (hist.length >= k + 1) {
    const ult = hist.slice(-(k + 1));
    let caiu = false;
    for (let i = 1; i < ult.length; i += 1) if (ult[i] < ult[i - 1]) caiu = true;
    if (!caiu && ult[ult.length - 1] > 0) motivos.push('SEM_PROGRESSO');
  }
  // Repetição no gate é GATE_TRAVADO (abaixo); OSCILACAO olha só findings de revisão.
  if (res.maxReaberturas >= lim.maxReaberturas) motivos.push('OSCILACAO');

  // Etapa do gate que falhou N vezes seguidas: para dentro da iteração, não bloqueia a próxima.
  const travada = lerFindings(raiz, estado.id)
    .itens.filter((f) => f.revisor === 'gate' && config.severidades.bloqueiam.includes(f.severidade) && ABERTOS.includes(f.status) && (f.falhasSeguidas || 0) >= lim.maxFalhasGate)
    .sort((x, y) => (y.falhasSeguidas || 0) - (x.falhasSeguidas || 0))[0];

  return {
    podeNovaIteracao: motivos.length === 0,
    motivos,
    iteracao: estado.iteracao,
    rodadasRevisao: rodadas,
    maxIteracoes: lim.maxIteracoes,
    restantes: Math.max(0, lim.maxIteracoes - rodadas),
    maxRodadasPlano: lim.maxRodadasPlano,
    maxReaberturas: lim.maxReaberturas,
    maxFalhasGate: lim.maxFalhasGate,
    gateTravado: travada ? { finding: travada.id, etapa: String(travada.categoria || '').replace(/^gate\//, ''), falhas: travada.falhasSeguidas } : null,
    tokens,
    complexidade: lim.complexidade,
    bloqueantesAbertos: res.bloqueantesAbertos.length,
    mediosAbertos: res.mediosAbertos.length,
  };
}

export function novaIteracao(raiz, estado, config) {
  const lim = avaliarLimites(raiz, estado, config);
  if (!lim.podeNovaIteracao) return { ok: false, codigo: 3, ...lim, mensagem: `Nova iteração negada: ${lim.motivos.join(', ')}.` };
  estado.iteracao += 1;
  estado.iteracoes.push({ n: estado.iteracao, inicio: agoraISO(), gate: null, tentativasGate: 0, commitGate: null, revisores: [], triagem: false, correcao: false, bloqueantes: null, comOps: true });
  return {
    ok: true,
    iteracao: estado.iteracao,
    rodada: lim.rodadasRevisao + 1,
    maxIteracoes: lim.maxIteracoes,
    restantes: lim.restantes,
    tokens: lim.tokens,
    mensagem: `Rodada de revisão ${lim.rodadasRevisao + 1}/${lim.maxIteracoes}. Rode "wf gate"; se falhar, corrija e rode "wf gate" de novo (não gasta iteração).`,
  };
}

export function iteracaoAtual(estado) {
  return (estado.iteracoes || [])[estado.iteracoes.length - 1] || null;
}

// Revisores fixos da 1ª rodada; o ops-reviewer (operacao/) entra quando opsDevido manda.
export const REVISORES_FIXOS = ['security-reviewer', 'performance-reviewer', 'quality-reviewer', 'test-reviewer'];
export const PREFIXOS_FIXOS = ['seguranca', 'performance', 'qualidade', 'testes'];
const PREFIXOS_REVISAVEIS = [...PREFIXOS_FIXOS, 'operacao'];

// Nunca são operação do projeto: estado e cópia do plugin do Workflow IA (em qualquer nível, para monorepos),
// assets estáticos, documentação e arquivos de tela do App Router (ex.: app/jobs/page.tsx é a página de vagas).
const NAO_OPERACIONAL = [
  /(^|\/)\.workflow-ia\//,
  /(^|\/)\.claude\/skills\/workflow-ia\//,
  /(^|\/)public\//,
  /\.(md|mdx|css|scss|sass|less|svg|png|jpe?g|gif|webp|ico)$/,
  /(^|\/)(page|layout|loading|error|not-found|template|default)\.[cm]?[jt]sx?$/,
];

/** Modo do revisor de operação no config ("condicional" | "sempre"), normalizado. Inválido vale "condicional" (o doctor avisa). */
export function modoRevisaoOperacao(config) {
  const v = String(config?.revisao?.operacao ?? CONFIG_PADRAO.revisao.operacao).trim().toLowerCase();
  return v === 'sempre' ? 'sempre' : 'condicional';
}

/**
 * O revisor de operação é devido? Determinístico: depende do config, do spec (congelado desde o plano) e dos
 * arquivos do diff (o HEAD está fixado pelo gate), então "wf revisores" e o merge concordam.
 * soArquivos: só os gatilhos de arquivo (re-revisão de uma rodada de correção).
 */
export function opsDevido(raiz, estado, config, refDiff, { soArquivos = false } = {}) {
  const rev = { ...CONFIG_PADRAO.revisao, ...(config?.revisao && typeof config.revisao === 'object' ? config.revisao : {}) };
  if (!soArquivos) {
    if (modoRevisaoOperacao(config) === 'sempre') return { devido: true, motivo: 'revisao.operacao = "sempre" no config' };
    // O spec congelado é a fonte; o meta é só a cópia lida por "wf meta --do-spec" (e não pode desligar o que o spec liga).
    if (estado.meta?.dadosPessoais === true || metaDoSpec(raiz, estado.id).dadosPessoais === true) {
      return { devido: true, motivo: 'o spec marca "Dados pessoais: sim"' };
    }
  }
  const r = git(raiz, ['-c', 'core.quotePath=false', 'diff', '--name-only', refDiff]);
  if (r.exit !== 0) {
    // Falha fechada: sem a lista de arquivos não dá para dispensar o revisor.
    return { devido: true, motivo: `não consegui listar os arquivos de "git diff ${refDiff}" (${(r.err || 'erro do git').split('\n')[0]}): na dúvida, o ops-reviewer revisa` };
  }
  const arquivos = r.out.split('\n').map((l) => l.trim()).filter(Boolean);
  const gatilhos = (Array.isArray(rev.gatilhosOperacao) ? rev.gatilhosOperacao : []).map((g) => String(g).toLowerCase());
  const cfg = config?.protecoes ? config : CONFIG_PADRAO;
  const casados = arquivos.filter((a) => {
    const min = a.toLowerCase();
    if (NAO_OPERACIONAL.some((rx) => rx.test(min))) return false;
    const base = min.split('/').pop();
    return ehMigration(min, cfg) || /^\.env/.test(base) || casaAlgum(min, gatilhos);
  });
  if (casados.length) {
    const lista = casados.slice(0, 5).join(', ') + (casados.length > 5 ? ` e mais ${casados.length - 5}` : '');
    return { devido: true, motivo: `o diff toca arquivos operacionais: ${lista}`, arquivos: casados };
  }
  return {
    devido: false,
    motivo: soArquivos
      ? 'as correções não tocam migration, ambiente, CI, container, logs, jobs, webhooks nem health'
      : 'o diff não toca migration, ambiente, CI, container, logs, jobs, webhooks nem health, e o spec não marca dados pessoais',
  };
}

/**
 * Findings abertos cuja correção exige mudar um arquivo que só o humano edita (protecoes.arquivosSomenteHumano:
 * CI, .husky, config do Workflow IA...). O fixer não consegue corrigi-los (os hooks negam): a task para com
 * CONFIGURACAO_HUMANA em vez de gastar rodadas. Depois que o humano decide "Já resolvi", eles seguem para a re-revisão.
 */
export function findingsDoHumano(raiz, estado, config, ids) {
  const globs = config?.protecoes?.arquivosSomenteHumano || [];
  if (!globs.length || !ids.length) return [];
  const itens = lerFindings(raiz, estado.id).itens;
  return ids.filter((id) => {
    const f = itens.find((x) => x.id === id);
    return !!f?.arquivo && casaAlgum(String(f.arquivo).replace(/^\.\//, ''), globs);
  });
}

// O humano já decidiu "Já resolvi" para CONFIGURACAO_HUMANA e nada foi decidido depois?
function humanoResolveuConfiguracao(estado) {
  const ds = estado.decisoes || [];
  const ult = ds[ds.length - 1];
  return !!ult && ult.codigo === 'CONFIGURACAO_HUMANA' && ult.efeito?.tipo === 'continuar';
}

// Iteração aberta antes da 0.5.3 (sem a marca comOps): o ops-reviewer não é exigido nela, para não travar a task
// que já tinha rodado os 4 revisores quando o plugin foi atualizado (e num host que ainda não registrou o papel novo).
function opsPermitido(estado) {
  if (estado.modo === 'revisao') return true;
  const it = (estado.iteracoes || [])[estado.iteracoes.length - 1];
  return !it || it.comOps === true;
}

function primeiraRodada(raiz, estado, config, refDiff, diff, motivo) {
  const ops = opsPermitido(estado) ? opsDevido(raiz, estado, config, refDiff) : { devido: false, motivo: 'iteração aberta antes da 0.5.3: o ops-reviewer entra a partir da próxima' };
  return {
    revisores: ops.devido ? [...REVISORES_FIXOS, 'ops-reviewer'] : [...REVISORES_FIXOS],
    prefixos: ops.devido ? [...PREFIXOS_FIXOS, 'operacao'] : [...PREFIXOS_FIXOS],
    diff,
    motivo,
    motivoOps: ops.motivo,
  };
}

/**
 * Relatórios de revisor mais velhos que o último disparo dele sobre o commit do gate (registro do hook em
 * subagentes.jsonl): são de uma rodada anterior e não valem para esta triagem. Sem disparo registrado, nada a dizer.
 */
export function relatoriosAntigos(raiz, estado, it, revisores) {
  if (!it?.commitGateRodado) return [];
  const pasta = path.join(caminhos(raiz, estado.id).revisoes, `iter-${estado.iteracao}`);
  const desde = Date.parse(it.inicio || 0) || 0;
  const papel = (t) => String(t || '').split(':').pop();
  const disparos = lerSubagentes(raiz).filter((d) => d.task === estado.id && d.head === it.commitGateRodado && Date.parse(d.em) >= desde);
  const antigos = [];
  for (const rv of revisores) {
    const ultimo = disparos.filter((d) => papel(d.tipo) === rv).reduce((m, d) => Math.max(m, Date.parse(d.em) || 0), 0);
    if (!ultimo) continue;
    let mtime = 0;
    try {
      mtime = fs.statSync(path.join(pasta, `${rv}.json`)).mtimeMs;
    } catch {
      continue; // sem relatório: é "faltando", não "antigo"
    }
    if (mtime < ultimo) antigos.push(rv);
  }
  return antigos;
}

export function revisoresAfetados(raiz, estado, config) {
  // 1a rodada de revisão: os 4 fixos (+ ops-reviewer quando devido). Depois: só os das categorias corrigidas.
  const aj = ajusteAtivo(estado);
  const anteriores = (estado.iteracoes || []).filter((i) => i.n < estado.iteracao && i.triagem && i.commitRevisado && (!aj || i.n > aj.desdeIteracao));
  const base = refBase(raiz, baseDaTask(estado, config));
  if (aj && !anteriores.length) {
    // Desde o commit que a entrega atestou: inclui os commits do humano depois dela. Se esse commit sumiu do
    // histórico do branch (rebase, force-push), a revisão volta a cobrir o branch inteiro contra a base.
    const desde = commitDaUltimaEntrega(estado);
    const valido = !!desde && git(raiz, ['merge-base', '--is-ancestor', desde, 'HEAD']).exit === 0;
    const ref = valido ? `${desde}..HEAD` : `${base}...HEAD`;
    return primeiraRodada(
      raiz,
      estado,
      config,
      ref,
      `git diff ${ref}`,
      valido
        ? `primeira revisão do ajuste ${aj.id}: completa, sobre tudo o que mudou desde a entrega anterior (inclusive commits do humano)`
        : `primeira revisão do ajuste ${aj.id}: completa, sobre o branch inteiro contra a base (o commit da entrega anterior não está mais no histórico do branch)`,
    );
  }
  if (!anteriores.length) {
    return primeiraRodada(raiz, estado, config, `${base}...HEAD`, `git diff ${base}...HEAD`, 'primeira revisão completa');
  }
  const desdeRevisao = anteriores[anteriores.length - 1].commitRevisado;
  const diff = `git diff ${desdeRevisao}..HEAD`;
  const dados = lerFindings(raiz, estado.id);
  const prefixos = new Set();
  for (const f of dados.itens) if (f.status === 'corrigido') prefixos.add(prefixo(f.categoria));
  // Se houve correção de gate ou de verificação, o test-reviewer confere se testes foram enfraquecidos.
  if (prefixos.has('gate') || prefixos.has('verificacao')) prefixos.add('testes');
  const revisores = [...new Set([...prefixos].map((p) => REVISOR_POR_PREFIXO[p]).filter((r) => r && r !== 'verificador-final'))];
  // O test-reviewer sempre olha rodadas de correção (anti-enfraquecimento).
  if (!revisores.includes('test-reviewer')) revisores.push('test-reviewer');
  // Correção que cria algo operacional (ex.: o fixer escreve uma migration para fechar outro finding): o ops revisa.
  let motivoOps = revisores.includes('ops-reviewer') ? 'há finding operacao/ corrigido para re-revisar' : null;
  if (!motivoOps && opsPermitido(estado)) {
    const ops = opsDevido(raiz, estado, config, `${desdeRevisao}..HEAD`, { soArquivos: true });
    if (ops.devido) {
      revisores.push('ops-reviewer');
      prefixos.add('operacao');
    }
    motivoOps = ops.devido ? `correções desta rodada: ${ops.motivo}` : `sem finding operacao/ corrigido; ${ops.motivo}`;
  }
  const pref = [...prefixos].filter((p) => PREFIXOS_REVISAVEIS.includes(p));
  if (!pref.includes('testes')) pref.push('testes');
  return {
    revisores,
    prefixos: pref,
    diff,
    motivo: 're-revisão focada nas categorias corrigidas (só o diff desde a última revisão)',
    motivoOps: motivoOps || 'iteração aberta antes da 0.5.3: o ops-reviewer entra a partir da próxima',
  };
}

// ---------------------------------------------------------------------------
// Próximo passo (orientação determinística para o orquestrador)
// ---------------------------------------------------------------------------

export function proximoPasso(raiz, estado, config) {
  const c = caminhos(raiz, estado.id);
  const lim = avaliarLimites(raiz, estado, config);
  const res = resumoFindings(raiz, estado, config);
  // Parada que depende do humano: depois do veredito, o agente da sessão pergunta e a mesma task continua.
  const comDecisao = (acao, instrucao) => (['bloquear', 'interromper'].includes(acao) ? `${instrucao} ${SUFIXO_DECISAO}` : instrucao);
  const passo = (acao, instrucao, extra = {}) => ({ acao, instrucao: comDecisao(acao, instrucao), fase: estado.fase, iteracao: estado.iteracao, rodadasRevisao: `${lim.rodadasRevisao}/${lim.maxIteracoes}`, tokens: lim.tokens, ...extra });

  if (estado.fase === 'encerrada') {
    return estado.decisaoPendente
      ? passo('perguntar', `Task encerrada com a decisão humana ${estado.decisaoPendente.id} pendente: chame AskUserQuestion com as perguntas de "wf decisao status" e rode "wf decisao aplicar".`)
      : passo('nenhuma', 'Task encerrada.');
  }
  if (estado.pausada) return passo('pausada', 'Task pausada pelo humano. Retome com "wf retomar".');
  if (estado.modo === 'revisao') {
    return passo('revisao', 'Modo revisão (sem alterar código): siga /workflow-ia:revisar — gate com "wf gate --rotulo revisao", os revisores de "wf revisores" em paralelo (ferramenta Agent nesta sessão, sem abrir outra sessão ou aba), triager, "wf findings merge <triagem.json> --por triager", resposta ao humano e "wf encerrar".');
  }
  if (estado.veredito) {
    if (estado.decisaoPendente) {
      return passo('perguntar', `Decisão humana ${estado.decisaoPendente.id} pendente: chame AskUserQuestion com exatamente as perguntas de "wf decisao status" e depois rode "wf decisao aplicar". Se o humano não responder ou o host não tiver a ferramenta: report.md e "wf encerrar" (a decisão fica pendente para /workflow-ia:retomar).`);
    }
    if (!existe(c.relatorio) || (estado.veredito === 'CONCLUIDA' && !existe(c.pr))) {
      return passo('entregar', 'Gere report.md (e pr.md se CONCLUIDA) com a skill entrega-relatorio, atualize o card no board e rode "wf encerrar".');
    }
    return passo('encerrar', 'Rode "wf encerrar".');
  }
  const aj = ajusteAtivo(estado);
  if (aj?.status === 'analise') {
    return passo('analisar-ajuste', `Ajuste ${aj.id} (feedback do humano depois da entrega ${aj.aposEntrega}): delegue ao spec-analyst a análise a partir do código ATUAL do branch — reproduzir o que o humano viu, achar a causa, separar os pontos e classificar cada um em correção (o critério CA-n já combinava o comportamento) ou mudança (comportamento novo/alterado, com os critérios propostos). Ele grava ajustes/${aj.id}.md (documentação) e ajustes/${aj.id}.json (pontos); depois rode "wf ajuste registrar .workflow-ia/tasks/${estado.id}/ajustes/${aj.id}.json".`, { ajuste: aj.id });
  }
  if (aj?.status === 'aguardando-decisao') {
    if (estado.decisaoPendente) {
      return passo('perguntar', `Decisão humana ${estado.decisaoPendente.id} pendente sobre o ajuste ${aj.id}: chame AskUserQuestion com exatamente as perguntas de "wf decisao status" e rode "wf decisao aplicar". Sem resposta, pare: a task fica ativa e o humano responde depois ("${estado.decisaoPendente.id}: <opção>") ou retoma com /workflow-ia:retomar.`);
    }
    const mud = aj.itens.filter((i) => i.tipo === 'mudanca' && !i.descartado).map((i) => i.id);
    return passo('pedir-decisao', `O ajuste ${aj.id} tem pontos que mudam o comportamento combinado (${mud.join(', ')}): só o humano autoriza. Escreva até 3 perguntas de contexto em decisao-contexto.json, rode "wf decisao pedir --contexto .workflow-ia/tasks/${estado.id}/decisao-contexto.json", chame AskUserQuestion com as perguntas devolvidas e rode "wf decisao aplicar".`, { ajuste: aj.id, mudancas: mud });
  }
  if (estado.ajusteSpecAutorizado) {
    const pontos = aj ? ` com os critérios aprovados para o ajuste ${aj.id} (specProposto em ajustes/${aj.id}.json; pontos ${aj.itens.filter((i) => i.tipo === 'mudanca' && !i.descartado).map((i) => i.id).join(', ')})` : '';
    return passo('ajustar-spec', `Decisão humana ${estado.ajusteSpecAutorizado} autorizou ajustar o spec: delegue ao spec-analyst a atualização de spec.md${pontos} (critérios novos ou alterados, numeração CA-n seguindo a existente) e rode "wf spec aceitar-ajuste" para recongelar.`);
  }
  if (estado.modo !== 'revisao' && estado.specCongelado && FASES.indexOf(estado.fase) >= FASES.indexOf('plano') && !specIntegro(raiz, estado)) {
    return passo('restaurar-spec', instrucaoRestaurarSpec(estado));
  }

  switch (estado.fase) {
    case 'intake':
      return existe(c.card)
        ? passo('spec', 'Rode "wf fase spec" e delegue ao agente spec-analyst a escrita de spec.md e decisoes.md.')
        : passo('intake', 'Leia o card (skill integracao-board), salve-o em card.md e rode "wf fase spec".');
    case 'spec':
      if (ajusteEmAndamento(estado)) return passo('plano', `Análise do ajuste ${estado.ajuste.id} registrada: rode "wf fase plano" e delegue ao arquiteto a seção do ajuste no plan.md.`);
      return existe(c.spec)
        ? passo('plano', 'Rode "wf meta --do-spec" para ler complexidade/risco/UI, depois "wf fase plano" e delegue ao agente arquiteto.')
        : passo('spec', 'Delegue ao spec-analyst: escrever spec.md (critérios CA-n em Gherkin) e decisoes.md.');
    case 'plano': {
      if (!existe(c.plano)) return passo('plano', 'Delegue ao arquiteto: escrever plan.md com as skills de cada etapa.');
      const rev = lerJSON(c.planoRevisao, null);
      const ret = estado.retomada;
      if (!rev && ret?.fase === 'plano' && ret.ajuste && mtime(c.plano) <= Date.parse(ret.em)) {
        return passo('plano', `Ajuste ${ret.ajuste}: delegue ao arquiteto, a partir do código atual do branch e da análise em ajustes/${ret.ajuste}.md, o acréscimo ao plan.md de uma seção "Ajuste ${ret.ajuste}" com as etapas (só o que muda; as etapas já entregues ficam como estão), skills e testes de regressão de cada ponto; depois peça ao plan-reviewer a rodada 1 do ciclo novo.`);
      }
      if (!rev && ret?.fase === 'plano' && mtime(c.plano) <= Date.parse(ret.em)) {
        return passo('plano', `Decisão humana ${ret.decisao} aplicada: devolva ao arquiteto com as respostas do humano (state.json "decisoes" / decisoes.md) e os problemas do ciclo anterior (relatorios/plano-revisao-ciclo-*.json); depois peça ao plan-reviewer a rodada 1 do ciclo novo.`);
      }
      if (!rev) return passo('revisar-plano', 'Delegue ao plan-reviewer: revisar plan.md e gravar plano-revisao.json.');
      if (mtime(c.plano) > mtime(c.planoRevisao)) return passo('revisar-plano', 'plan.md mudou depois da última revisão: delegue ao plan-reviewer uma nova rodada (plano-revisao.json).');
      if (!rev.aprovado) {
        const rodadas = rev.rodada || 1;
        return rodadas >= lim.maxRodadasPlano
          ? passo('bloquear', `Plano reprovado ${rodadas} vezes. Rode "wf veredito BLOQUEADA --motivo 'PLANO_REPROVADO: <problemas que bloqueiam>'".`)
          : passo('plano', `Plano reprovado (rodada ${rodadas}/${lim.maxRodadasPlano}). Devolva ao arquiteto com os problemas de plano-revisao.json; depois peça nova revisão (rodada ${rodadas + 1}).`);
      }
      return passo('setup', 'Rode "wf fase setup", crie o branch a partir do branch base atualizado e registre com "wf meta branch=<nome>".');
    }
    case 'setup':
      if (ajusteEmAndamento(estado) && estado.meta.branch && gitBranchAtual(raiz) === estado.meta.branch) {
        return passo('testes', `Ajuste ${estado.ajuste.id}: o branch é o mesmo da entrega (${estado.meta.branch}). Rode "wf fase testes" e delegue ao test-writer os testes do ajuste.`);
      }
      return estado.meta.branch && gitBranchAtual(raiz) === estado.meta.branch
        ? passo('testes', 'Rode "wf fase testes" e delegue ao test-writer. Depois faça commit dos testes e rode "wf red".')
        : passo('setup', `Crie/entre no branch da task (sugestão: "wf branch-sugerido") e rode "wf meta branch=<nome>".`);
    case 'testes':
      if (ajusteEmAndamento(estado) && !exigeRedAjuste(estado)) {
        return passo('implementar', `Ajuste ${estado.ajuste.id} sem pontos a provar (todos descartados pelo humano): não há RED do ajuste. Rode "wf fase implementacao" e siga para o loop e a verificação do que mudou desde a entrega.`);
      }
      if (ajusteEmAndamento(estado) && !existe(caminhoRedAjuste(raiz, estado))) {
        return passo('testes', `Ajuste ${estado.ajuste.id}: delegue ao test-writer um teste de regressão para cada ponto (reproduz o que o humano viu, com a tag do critério [CA-n] que ele viola)${ajusteComMudanca(estado) ? ' e os testes dos critérios novos ou alterados' : ''}; os testes já entregues não são enfraquecidos. Faça commit e rode "wf red" (os testes novos precisam falhar).`);
      }
      return existe(c.red)
        ? passo('implementar', 'Rode "wf fase implementacao" e delegue ao implementer, etapa por etapa do plano.')
        : passo('testes', 'Delegue ao test-writer, faça commit dos testes e rode "wf red" (precisa falhar).');
    case 'implementacao':
      if (ajusteEmAndamento(estado)) return passo('implementar', `Ajuste ${estado.ajuste.id}: delegue ao implementer as etapas da seção "Ajuste ${estado.ajuste.id}" do plan.md, etapa por etapa. Depois rode "wf fase loop" e "wf iteracao nova".`);
      return passo('implementar', 'Quando o implementer terminar todas as etapas do plano com commits, rode "wf fase loop" e "wf iteracao nova".');
    case 'loop': {
      const it = iteracaoAtual(estado);
      const abertos = [...res.bloqueantesAbertos, ...res.mediosAbertos];
      if (!it || it.correcao) {
        if (!lim.podeNovaIteracao) {
          const revisado = lim.rodadasRevisao > 0;
          if (abertos.length === 0 && revisado) {
            return passo('verificar', `Limite atingido (${lim.motivos.join(', ')}), mas não há bloqueantes nem médios abertos: rode "wf fase verificacao" e delegue ao verificador-final para confirmar as últimas correções.`);
          }
          const qual = abertos.length ? `com findings abertos (${abertos.join(', ')})` : 'sem nenhuma rodada de code review feita';
          return passo('interromper', `Limite atingido (${lim.motivos.join(', ')}) ${qual}: rode "wf veredito INTERROMPIDA --motivo ${lim.motivos[0]}".`);
        }
        return passo('iniciar-iteracao', `Rode "wf iteracao nova" (rodada de revisão ${lim.rodadasRevisao + 1}/${lim.maxIteracoes}).`);
      }
      if (!it.triagem) {
        // Retorno da verificação: o código ainda é o que a verificação reprovou. Corrige primeiro;
        // o gate e a revisão desta mesma iteração olham as correções.
        if (it.n === estado.retornoVerificacao && !it.gate && abertos.length) {
          return passo('corrigir', `Verificação reprovada: delegue ao fixer os findings (${abertos.join(', ')}), marque cada um com "wf findings status <id> corrigido", faça commit e rode "wf gate".`);
        }
        // Revisores e gate rodam JUNTOS (os revisores só leem o diff); a triagem espera os dois e junta os findings
        // de ambos, com o gate verde ou vermelho (as falhas do gate já são findings urgentes).
        const rv = revisoresAfetados(raiz, estado, config);
        const extra = { revisores: rv.revisores, revisados: rv.prefixos, diff: rv.diff, motivoOps: rv.motivoOps };
        const revisores = `os revisores ${rv.revisores.join(', ')} sobre "${rv.diff}" (em paralelo, ferramenta Agent nesta sessão, sem abrir outra sessão ou aba; cada um grava revisoes/iter-${estado.iteracao}/<revisor>.json)`;
        const merge = `wf findings merge .workflow-ia/tasks/${estado.id}/revisoes/iter-${estado.iteracao}/triagem.json --revisados ${rv.prefixos.join(',')}`;
        const cache = 'No loop o gate é incremental: as etapas que passaram e cujos insumos não mudaram vêm do cache.';
        // Gate da iteração não verde no HEAD: o que falta por etapa e o porquê; com o cache cobrindo o resto,
        // "wf gate --etapas <pendentes>" fecha o gate da iteração.
        const pg = pendenciasDoGate(raiz, estado, config);
        Object.assign(extra, { pendencias: pg.pendencias, sugestaoGate: pg.sugestao });
        let faltamGate = '';
        // Só "sempre roda" ou "ainda não rodou" (começo de iteração sem cache) não acrescenta nada à mensagem.
        if (pg.pendencias.some((p) => !['sem-cache', 'pendente'].includes(p.situacao))) faltamGate += ` Faltam: ${textoPendencias(pg.pendencias)}.`;
        if (pg.cobreResto) faltamGate += ` O cache cobre o resto: "${pg.sugestao}" fecha o gate desta iteração.`;
        // Gate sem vaga numa etapa obrigatória (capacidade da máquina): não conta; espera a vez e repete.
        const ug = estado.ultimoGate;
        if (ug?.semVaga?.length && ug.commit === gitHead(raiz) && (!it.gate || (it.commitGateRodado || it.commitGate) !== gitHead(raiz))) {
          return passo('aguardar-vaga', `O último gate ficou sem vaga de recurso em ${ug.semVaga.join(', ')} (capacidade da máquina, não defeito do código; não gasta rodada). Rode "wf aguardar-vaga" e repita "wf gate" (Bash com run_in_background); a vez fica reservada para esta task. Os revisores podem seguir sobre o mesmo commit.`, extra);
        }
        // Modo CI no loop (WF_GATE_CI=1 ou ci.fases com loop): o run não veio (infraestrutura): repete, sem gastar rodada.
        if (ug?.ciIndisponivel && ug.commit === gitHead(raiz) && (!it.gate || (it.commitGateRodado || it.commitGate) !== gitHead(raiz))) {
          return passo('repetir-gate', `O último gate ficou sem CI (${ug.ciIndisponivel}): infraestrutura, não defeito do código (não gasta rodada). Repita "wf gate" (Bash com run_in_background)${config.ci?.fallback === 'local' ? ' ou rode-o com WF_GATE_CI_FALLBACK=local' : ''}. Os revisores podem seguir sobre o mesmo commit.`, { ...extra, ciIndisponivel: ug.ciIndisponivel });
        }
        // Iteração aberta numa versão anterior (sem o commit em que o gate rodou): o gate precisa rodar de novo.
        if (it.gate && !it.commitGateRodado) {
          return passo('gate-e-revisar', `Esta iteração não registra o commit em que o gate rodou (aberta numa versão anterior do Workflow IA): rode de novo, juntos, "wf gate" (Bash com run_in_background) e ${revisores}. Depois delegue ao triager e rode "${merge}".`, extra);
        }
        if (!it.gate) {
          return passo('gate-e-revisar', `Numa única mensagem, dispare JUNTOS: "wf gate" (Bash com run_in_background) e ${revisores}. Espere os dois terminarem; aí delegue ao triager (junta os findings dos revisores com os do gate) e rode "${merge}". ${cache}${faltamGate}`, extra);
        }
        if (it.gate === 'falhou' && lim.gateTravado) {
          const g = lim.gateTravado;
          return passo('interromper', `A etapa "${g.etapa}" do gate falhou ${g.falhas} vezes seguidas (${g.finding}): rode "wf veredito INTERROMPIDA --motivo 'GATE_TRAVADO: etapa ${g.etapa} falhou ${g.falhas} vezes seguidas'". Na pergunta de contexto, mostre o erro do log.`);
        }
        const commitDoGate = it.commitGateRodado || it.commitGate;
        if (commitDoGate && commitDoGate !== gitHead(raiz)) {
          return passo('gate-e-revisar', `O código mudou depois do gate desta iteração: rode de novo, juntos, "wf gate" (Bash com run_in_background) e ${revisores}. Depois delegue ao triager e rode "${merge}".${faltamGate}`, extra);
        }
        const pasta = path.join(c.revisoes, `iter-${estado.iteracao}`);
        // Relatório anterior ao último disparo do revisor sobre o commit do gate é de outra rodada: conta como faltando.
        const antigos = relatoriosAntigos(raiz, estado, it, rv.revisores);
        const faltam = rv.revisores.filter((r) => !existe(path.join(pasta, `${r}.json`)) || antigos.includes(r));
        const situacaoGate = it.gate === 'ok' ? 'Gate verde' : 'Gate vermelho (as falhas já são findings urgentes)';
        if (faltam.length) {
          return passo('revisar', `${situacaoGate} nesta iteração. Faltam os relatórios de ${faltam.join(', ')}: se ainda não rodaram, rode ${revisores}; se estão rodando, espere. Depois delegue ao triager e rode "${merge}".`, { ...extra, faltam });
        }
        return passo('triar', `${situacaoGate} e revisores concluídos: delegue ao triager (junta os findings dos revisores com os do gate) e rode "${merge}". Depois o fixer corrige tudo de uma vez.`, extra);
      }
      if (abertos.length === 0) {
        if (it.correcaoIniciada) return passo('fechar-iteracao', 'Correções feitas nesta iteração: rode "wf iteracao fechar". A próxima iteração roda o gate e a re-revisão das correções.');
        return passo('verificar', 'Sem bloqueantes nem médios abertos (baixos ficam registrados no relatório): rode "wf fase verificacao" e delegue ao verificador-final.');
      }
      // Findings que só o humano pode corrigir (arquivo em protecoes.arquivosSomenteHumano) não vão para o fixer.
      const doHumano = findingsDoHumano(raiz, estado, config, abertos);
      const doFixer = abertos.filter((id) => !doHumano.includes(id));
      if (doHumano.length && !doFixer.length) {
        if (humanoResolveuConfiguracao(estado)) {
          return passo('corrigir', `O humano decidiu que já resolveu (${doHumano.join(', ')}): confira o arquivo, marque cada um com "wf findings status <id> corrigido" e rode "wf iteracao fechar". A re-revisão da próxima iteração confirma.`, { doHumano });
        }
        return passo('bloquear', `Os findings ${doHumano.join(', ')} exigem mudar arquivos que só o humano edita (protecoes.arquivosSomenteHumano, ex.: CI). Rode "wf veredito BLOQUEADA --motivo 'CONFIGURACAO_HUMANA: <finding, arquivo e a mudança necessária>'". Na pergunta de contexto, mostre o trecho e a correção sugerida.`, { doHumano });
      }
      const nota = doHumano.length ? ` Deixe ${doHumano.join(', ')} de fora (arquivo que só o humano edita): se continuarem abertos no fim, a task para com CONFIGURACAO_HUMANA.` : '';
      if (it.correcaoIniciada) {
        return passo('corrigir', `Termine as correções (${doFixer.join(', ')}), faça commit e rode "wf iteracao fechar". A próxima iteração roda o gate e a re-revisão das correções.${nota}`);
      }
      return passo('corrigir', `Delegue ao fixer os findings abertos (${doFixer.join(', ')}) em ordem de severidade — médios também são corrigidos; cada correção vira "wf findings status <id> corrigido". Depois "wf iteracao fechar".${nota}`);
    }
    case 'verificacao': {
      const v = lerJSON(c.verificacao, null);
      // Modo CI: a verificação ficou sem CI no HEAD (infraestrutura): repete, ou cai no fallback local (ci.fallback).
      const ugv = estado.ultimoGate;
      if (ugv?.rotulo === 'verificacao' && ugv.ciIndisponivel && ugv.commit === gitHead(raiz) && (!v || v.commit !== gitHead(raiz))) {
        const fb = config.ci?.fallback === 'local' ? ' Se o CI continuar fora, rode a verificação inteira na máquina: WF_GATE_CI_FALLBACK=local (ci.fallback).' : ' O fallback local está desligado (ci.fallback: "nenhum"): se o CI continuar fora, "wf veredito BLOQUEADA --motivo CI_INDISPONIVEL".';
        return passo('repetir-verificacao', `A verificação ficou sem CI (${ugv.ciIndisponivel}): não é defeito do código e não conta como reprovação. Delegue de novo ao verificador-final, que repete "wf verificar-limpo".${fb}`, { ciIndisponivel: ugv.ciIndisponivel });
      }
      if (!v || v.commit !== gitHead(raiz)) return passo('verificar', 'Delegue ao verificador-final (contexto limpo): ele roda "wf verificar-limpo", julga e registra com "wf verificacao registrar".');
      if (v.resultado === 'aprovado') {
        const m = construirManifest(raiz, estado, config);
        if (m.completo) return passo('veredito', 'Verificação aprovada e manifest completo: rode "wf veredito CONCLUIDA".');
        return passo('completar-provas', `Verificação aprovada, mas o manifest está incompleto (${m.faltando.join(', ')}). Corrija o que falta (ex.: decisoes.md, etapa do gate), faça commit e peça nova verificação; se não for possível, "wf veredito BLOQUEADA --motivo PROVAS_INCOMPLETAS".`, { faltando: m.faltando });
      }
      const temTrabalho = res.bloqueantesAbertos.length > 0 || res.mediosAbertos.length > 0;
      if (lim.podeNovaIteracao && temTrabalho) return passo('iniciar-iteracao', 'Verificação reprovada: rode "wf fase loop" e "wf iteracao nova" para corrigir os findings registrados pela verificação.');
      if (!temTrabalho) return passo('verificar', `Verificação reprovada sem findings abertos (${(v.motivos || []).join(' ')}). Se o motivo foi commit/alterações pendentes, faça commit e peça nova verificação; senão, registre o problema como finding em novosProblemas.`);
      return passo('interromper', `Verificação reprovada e sem margem (${lim.motivos.join(', ')}): "wf veredito INTERROMPIDA --motivo VERIFICACAO_REPROVADA", relatório e encerrar.`);
    }
    case 'entrega':
      return passo('entregar', 'Gere pr.md e report.md, faça push do branch (se configurado), atualize o card e rode "wf encerrar".');
    default:
      return passo('desconhecida', 'Estado inesperado. Rode "wf status".');
  }
}

// ---------------------------------------------------------------------------
// Verificação independente
// ---------------------------------------------------------------------------

export async function verificarLimpo(raiz, estado, config) {
  // Verificação final: todas as etapas, sem falhar rápido e sem cache (completo).
  const bruto = await rodarGate(raiz, estado, config, { rotulo: 'verificacao', exigirLimpo: true, completo: true });
  let g = bruto;
  comLock(raiz, () => {
    const atual = lerEstado(raiz, estado.id);
    g = aplicarGate(raiz, atual, config, bruto);
    gravarEstado(raiz, atual);
    Object.assign(estado, atual);
  });
  const d = diffTestes(raiz, estado, config);
  const m = matrizRastreabilidade(raiz, estado, config);
  const res = resumoFindings(raiz, estado, config);
  const dados = lerFindings(raiz, estado.id);
  return {
    gate: {
      ok: g.ok,
      commit: g.commit,
      falhas: g.falhas,
      naoConfiguradas: g.naoConfiguradas,
      ...(g.puladas ? { puladas: g.puladas, resumoPuladas: g.resumoPuladas } : {}),
      // Modo CI: CI-ESTADO (nada rodou; checks do pré-voo) ou CI-INDISPONIVEL (o run não veio; não é reprovação do código).
      ...(g.codigo ? { codigo: g.codigo } : g.ciIndisponivel ? { codigo: 'CI-INDISPONIVEL' } : {}),
      ...(g.checks ? { checks: g.checks } : {}),
      ...(g.ci ? { ci: g.ci } : {}),
      ...(g.ciIndisponivel ? { ciIndisponivel: g.ciIndisponivel } : {}),
      mensagem: g.mensagem,
      arquivo: estado.ultimoGate?.arquivo,
    },
    testesDiff: d,
    matriz: m,
    specIntegro: specIntegro(raiz, estado),
    findingsParaConfirmar: dados.itens
      .filter((f) => f.status === 'corrigido' || (f.status === 'falso-positivo' && config.severidades.bloqueiam.includes(f.severidade) && (f.confirmacaoPendente || !f.verificado)))
      .map((f) => ({ id: f.id, confirmar: f.status === 'corrigido' ? 'correcao' : 'falso-positivo', severidade: f.severidade, categoria: f.categoria, arquivo: f.arquivo, descricao: f.descricao, motivo: f.motivo || undefined })),
    bloqueantesAbertos: res.bloqueantesAbertos,
    ajuste: ajusteAtivo(estado)
      ? {
          id: estado.ajuste.id,
          feedbackDoHumano: estado.ajuste.texto,
          aposEntrega: estado.ajuste.aposEntrega,
          documentacao: estado.ajuste.documentacao || null,
          julgar: itensParaJulgar(estado).map((i) => ({ id: i.id, tipo: i.tipo, descricao: i.descricao, criterios: i.criterios, reproducao: i.reproducao })),
          instrucao: 'Julgue cada ponto em "ajustes": [{ "id": "A-n.k", "atendido": true|false, "observacao": "..." }]. O ponto só está atendido se o comportamento que o humano viu foi corrigido (ou mudado, se autorizado) e há teste que prova.',
        }
      : null,
  };
}

/** O verificador-final foi de fato iniciado (hook de subagentes) antes do gate de verificação? */
export function verificadorRegistrado(raiz, estado, gateJson) {
  if (!gateJson?.em) return false;
  const limite = Date.parse(gateJson.em);
  const desde = Date.parse(estado.criadoEm || 0);
  return lerSubagentes(raiz).some(
    (r) => r.task === estado.id && String(r.tipo || '').split(':').pop() === 'verificador-final' && Date.parse(r.em) <= limite && Date.parse(r.em) >= desde
  );
}

export function registrarVerificacao(raiz, estado, config, arquivoJulgamento) {
  const c = caminhos(raiz, estado.id);
  const j = lerJSON(arquivoJulgamento);
  const erros = [];
  if (!['aprovado', 'reprovado'].includes(j.resultado)) erros.push('resultado deve ser "aprovado" ou "reprovado".');
  if (!Array.isArray(j.criterios)) erros.push('criterios deve ser uma lista [{id, atendido, testes, observacao}].');
  (j.novosProblemas || []).forEach((p, i) => erros.push(...validarItem(p, i)));
  if (erros.length) return { ok: false, mensagem: 'Julgamento inválido.', erros };

  const head = gitHead(raiz);
  const gateJson = lerJSON(path.join(c.evidencias, 'verificacao', 'gate.json'), null);
  const motivos = [];
  if (!gateJson || gateJson.commit !== head) motivos.push('Gate de verificação não foi rodado neste commit (wf verificar-limpo).');
  else if (gateJson.ciIndisponivel) motivos.push(`A verificação ficou sem CI (${gateJson.ciIndisponivel}): nada foi provado; não é reprovação do código. Repita "wf verificar-limpo"${config.ci?.fallback === 'local' ? ' ou rode-a com WF_GATE_CI_FALLBACK=local' : ''}.`);
  else if (!gateJson.ok) motivos.push(`Gate de verificação falhou${(gateJson.falhas || []).length ? `: ${gateJson.falhas.join(', ')}` : ''}${gateJson.resumoPuladas ? ` (${gateJson.resumoPuladas}: não comprovadas)` : ''}.`);
  else if (!gateJson.limpo) motivos.push('Gate de verificação rodou com alterações não commitadas.');
  else if ((gateJson.etapas || []).some((e) => e.origem === 'cache')) motivos.push('Gate de verificação reaproveitou etapas do cache do loop: a prova final roda todas as etapas (wf verificar-limpo).');
  // Modo CI (CA-8): o resultado do CI só prova o commit verificado se o run (e o ci.json) são deste mesmo SHA.
  const doCI = (gateJson?.etapas || []).filter((e) => e.origem === 'ci');
  if (gateJson && gateJson.commit === head && doCI.length) {
    const ciJson = lerJSON(path.join(c.evidencias, 'verificacao', 'ci.json'), null);
    // sha = HEAD local no gate; headSha = o que o provedor disse que o run testou (M1): os dois precisam ser o HEAD. Desde
    // a 0.9.0 (critério "conteudo"), o run pode ser de um commit anterior com prova por conteúdo, reconferida aqui.
    const outroSha = doCI.filter((e) => !provaCIValeParaHead(raiz, config, e.ci, head)).map((e) => e.nome);
    if (outroSha.length) motivos.push(`Resultado do CI de outro SHA em ${outroSha.join(', ')}: a prova do CI só vale com o run do commit verificado (${String(head).slice(0, 7)}) ou, no critério "conteudo", com o mesmo conteúdo reconferido. Repita "wf verificar-limpo".`);
    else if (!ciJson || !provaCIValeParaHead(raiz, config, provaDoCiJson(ciJson), head)) motivos.push('evidencias/verificacao/ci.json ausente ou de outro SHA (local ou headSha do run): a prova do CI não confere com o commit verificado. Repita "wf verificar-limpo".');
  }

  if (!verificadorRegistrado(raiz, estado, gateJson)) motivos.push('Não há registro do subagente verificador-final iniciado antes do gate de verificação (o julgamento precisa ser dele).');
  const specOk = specIntegro(raiz, estado);
  if (!specOk) motivos.push('spec.md mudou depois de congelado no plano (a Definition of Done não pode mudar durante a task).');

  const doSpec = criteriosDaTask(raiz, estado);
  const matriz = matrizRastreabilidade(raiz, estado, config);
  if (matriz.semTeste.length) motivos.push(`Critérios sem teste marcado [CA-n] no branch: ${matriz.semTeste.join(', ')}.`);
  const julgados = new Map(j.criterios.map((x) => [x.id, x]));
  const faltando = doSpec.filter((ca) => !julgados.has(ca));
  if (faltando.length) motivos.push(`Critérios não julgados: ${faltando.join(', ')}.`);
  const naoAtendidos = j.criterios.filter((x) => x.atendido !== true).map((x) => x.id);
  if (naoAtendidos.length) motivos.push(`Critérios não atendidos: ${naoAtendidos.join(', ')}.`);
  // Ajuste pós-entrega: cada ponto do feedback do humano precisa ser julgado atendido.
  const pontosAjuste = itensParaJulgar(estado);
  const julgadosAjuste = new Map((Array.isArray(j.ajustes) ? j.ajustes : []).map((x) => [x.id, x]));
  const ajusteNaoAtendido = pontosAjuste.filter((i) => julgadosAjuste.get(i.id)?.atendido !== true);
  if (ajusteNaoAtendido.length) motivos.push(`Pontos do ajuste ${estado.ajuste.id} não julgados atendidos: ${ajusteNaoAtendido.map((i) => i.id).join(', ')}.`);

  const confirmados = marcarVerificados(raiz, estado, (j.findingsConfirmados || []).map(String), 'verificador-final');
  const naoConfirmados = (j.findingsNaoConfirmados || []).map((x) => (typeof x === 'string' ? { id: x } : x));
  const reabertos = [];
  for (const x of naoConfirmados) reabertos.push(...reabrir(raiz, estado, [x.id], 'verificador-final', x.motivo || 'correção/falso positivo não confirmado na verificação'));
  let novos = { novos: [] };
  if ((j.novosProblemas || []).length) {
    novos = mesclar(
      raiz,
      estado,
      j.novosProblemas.map((p) => ({ ...p, revisor: 'verificador-final' })),
      { por: 'verificador-final', bloqueiam: config.severidades.bloqueiam }
    );
  }
  const res = resumoFindings(raiz, estado, config);
  if (res.bloqueantesAbertos.length) motivos.push(`Bloqueantes abertos: ${res.bloqueantesAbertos.join(', ')}.`);
  const corrigidosPendentes = res.bloqueantesNaoVerificados.filter((id) => !res.falsosPositivosPendentes.includes(id));
  if (corrigidosPendentes.length) motivos.push(`Bloqueantes corrigidos mas não confirmados: ${corrigidosPendentes.join(', ')}.`);
  if (res.falsosPositivosPendentes.length) motivos.push(`Bloqueantes descartados como falso positivo sem confirmação do verificador: ${res.falsosPositivosPendentes.join(', ')}.`);
  const diff = lerJSON(c.testesDiff, null);
  if (diff && diff.bloqueante) motivos.push('Testes enfraquecidos (removidos, skip adicionado ou critério perdido) — ver evidencias/testes-diff.json.');
  if (diff && diff.alertaEnfraquecimento && j.testesEnfraquecidos !== false) {
    motivos.push('Há queda de asserts nos testes e o julgamento não declarou "testesEnfraquecidos": false com justificativa.');
  }

  // Todo motivo de reprovação precisa virar trabalho rastreável no loop.
  const automaticos = [];
  for (const ca of [...new Set([...faltando, ...naoAtendidos, ...matriz.semTeste])]) {
    const obs = (julgados.get(ca) || {}).observacao || '';
    automaticos.push({ fingerprint: `verificacao:criterio:${ca}`, severidade: 'urgente', categoria: 'verificacao/criterio', arquivo: null, descricao: `${ca} não foi julgado atendido pela verificação independente.${obs ? ` ${obs}` : ''}`, evidencia: 'verificacao-julgamento.json', recomendacao: `Implementar/corrigir o comportamento de ${ca} e garantir teste com a tag [${ca}] no branch.`, skill: 'testes-qualidade', revisor: 'verificador-final' });
  }
  if (diff && (diff.bloqueante || (diff.alertaEnfraquecimento && j.testesEnfraquecidos !== false))) {
    automaticos.push({ fingerprint: 'verificacao:testes-enfraquecidos', severidade: 'alto', categoria: 'testes/enfraquecimento', arquivo: null, descricao: 'Testes enfraquecidos em relação ao baseline do RED (ver evidencias/testes-diff.json).', evidencia: 'evidencias/testes-diff.json', recomendacao: 'Restaurar asserções, remover skip/only e manter as tags [CA-n]; só alterar teste que contradiz o spec, com justificativa em decisoes.md.', skill: 'testes-qualidade', revisor: 'verificador-final' });
  }
  if (j.testesAutorizacao === 'faltando') {
    motivos.push('Faltam testes de autorização.');
    automaticos.push({ fingerprint: 'verificacao:testes-autorizacao', severidade: 'urgente', categoria: 'testes/autorizacao', arquivo: null, descricao: 'Recurso com dono/tenant sem teste de acesso cruzado.', evidencia: 'verificacao-julgamento.json', recomendacao: 'Adicionar testes em que o usuário A tenta ler/alterar recurso de B e recebe 403/404.', skill: 'backend-seguranca', revisor: 'verificador-final' });
  }
  if (j.performance?.status === 'faltando' || j.performance?.status === 'problema') {
    motivos.push('Evidência de performance ausente ou com problema.');
    automaticos.push({ fingerprint: 'verificacao:performance', severidade: j.performance.status === 'problema' ? 'alto' : 'medio', categoria: 'performance/evidencia', arquivo: null, descricao: `Performance: ${j.performance.status}. ${j.performance.observacao || ''}`.trim(), evidencia: (j.performance.evidencias || []).join(', ') || 'verificacao-julgamento.json', recomendacao: 'Gerar EXPLAIN (ANALYZE, BUFFERS) das queries novas em provas-extras/ e corrigir planos ruins.', skill: 'banco-performance', revisor: 'verificador-final' });
  }
  for (const i of ajusteNaoAtendido) {
    const obs = julgadosAjuste.get(i.id)?.observacao || '';
    automaticos.push({ fingerprint: `verificacao:ajuste:${i.id}`, severidade: 'urgente', categoria: 'verificacao/ajuste', arquivo: i.arquivo || null, descricao: `${i.id} (o que o humano viu) não foi julgado atendido pela verificação independente: ${i.descricao}${obs ? ` — ${obs}` : ''}`, evidencia: 'verificacao-julgamento.json', recomendacao: `Resolver o ponto ${i.id} do ajuste ${estado.ajuste.id} e cobri-lo com teste de regressão.`, skill: 'testes-qualidade', revisor: 'verificador-final', ajuste: estado.ajuste.id });
  }
  if (!specOk) {
    automaticos.push({ fingerprint: 'verificacao:spec-alterado', severidade: 'urgente', categoria: 'verificacao/spec', arquivo: null, descricao: `spec.md foi alterado depois do congelamento (sha esperado ${String(estado.specCongelado?.sha256).slice(0, 12)}).`, evidencia: 'state.json (specCongelado)', recomendacao: instrucaoRestaurarSpec(estado), skill: 'extracao-specs', revisor: 'verificador-final' });
  }
  if (automaticos.length) {
    const r = mesclar(raiz, estado, automaticos, { por: 'verificador-final', bloqueiam: config.severidades.bloqueiam });
    novos.novos = [...(novos.novos || []), ...r.novos, ...r.reabertos];
  }

  const resultado = j.resultado === 'aprovado' && motivos.length === 0 ? 'aprovado' : 'reprovado';
  const v = {
    resultado,
    resultadoDoAgente: j.resultado,
    commit: head,
    em: agoraISO(),
    motivos,
    criterios: j.criterios,
    testesAutorizacao: j.testesAutorizacao || null,
    performance: j.performance || null,
    testesEnfraquecidos: j.testesEnfraquecidos ?? null,
    observacoes: j.observacoes || '',
    justificativaTestes: j.justificativaTestes || null,
    ajuste: pontosAjuste.length ? { id: estado.ajuste.id, pontos: j.ajustes || [] } : null,
    findings: { confirmados, reabertos, novos: novos.novos },
  };
  gravarJSON(c.verificacao, v);
  return { ok: true, ...v };
}

// ---------------------------------------------------------------------------
// Manifest (Definition of Done) e veredito
// ---------------------------------------------------------------------------

export function construirManifest(raiz, estado, config) {
  const c = caminhos(raiz, estado.id);
  garantirSpecCongelado(raiz, estado);
  const head = gitHead(raiz);
  const red = lerJSON(c.red, null);
  const v = lerJSON(c.verificacao, null);
  const gateV = lerJSON(path.join(c.evidencias, 'verificacao', 'gate.json'), null);
  const diff = lerJSON(c.testesDiff, null);
  const matriz = matrizRastreabilidade(raiz, estado, config);
  const res = resumoFindings(raiz, estado, config);
  const rel = (p) => (p ? path.relative(raiz, p) : null);
  const revPlano = lerJSON(c.planoRevisao, null);
  // Ajuste desta entrega (ativo, ou já no histórico depois do veredito): só as rodadas dele contam como revisão.
  const aj = ajusteDaEntrega(estado);
  const iteracoesRevisadas = (estado.iteracoes || []).filter((i) => i.gate === 'ok' && i.triagem && (!aj || i.n > aj.desdeIteracao));
  // Sub-etapas "nome:app" (monorepo) contam juntas: o grupo só passa com todas verdes.
  const etapaGate = (nome) => agregarGrupo(gateV?.etapas, nome);
  // O cache do gate vale só no loop: a prova final nunca aceita etapa reaproveitada.
  const etapasDoCacheNaVerificacao = (gateV?.etapas || []).filter((e) => e.origem === 'cache').map((e) => e.nome);
  // Pulada por dependência (dependeDe) nunca é prova: o detalhe aponta a causa raiz na dependência.
  const naoComprovada = (e) => (e?.causaRaiz ? `${textoPulada(e)}: não comprovada; a causa raiz está em ${e.causaRaiz.etapa}` : undefined);
  // Etapa lida do CI (origem 'ci'): só prova se o run é do mesmo commit verificado (ci.sha === head).
  // 0.9.0: run de commit anterior só vale com a prova por conteúdo reconferida (provaCIValeParaHead).
  const ciDeOutroSha = (e) => e?.origem === 'ci' && !provaCIValeParaHead(raiz, config, e.ci, head);
  const detalheCI = (e) => (e?.origem === 'ci' ? (ciDeOutroSha(e) ? `resultado do CI é do SHA ${String(e.ci?.sha || '?').slice(0, 7)}, não do HEAD verificado (${String(head || '').slice(0, 7)}): não vale como prova` : `lido do CI (run ${e.ci?.url || '?'}, SHA ${String(e.ci?.sha || '').slice(0, 7)})`) : undefined);
  const etapasCIDeOutroSha = (gateV?.etapas || []).filter(ciDeOutroSha).map((e) => e.nome);
  const ciJsonV = gateV?.ci && gateV.ci.modo !== 'fallback-local' ? lerJSON(path.join(c.evidencias, 'verificacao', 'ci.json'), null) : null;
  const itens = [];
  const add = (id, descricao, status, prova, detalhe) => itens.push({ id, descricao, status, prova, detalhe });

  add('spec', 'Spec congelado no plano e não alterado depois', estado.specCongelado && specIntegro(raiz, estado) ? 'ok' : 'faltando', rel(c.spec), estado.specCongelado ? undefined : 'spec nunca foi congelado (a task não passou pela fase plano)');
  add('plano', 'Plano revisado e aprovado pelo plan-reviewer', revPlano?.aprovado === true ? 'ok' : 'faltando', rel(c.planoRevisao));
  add('revisao', aj ? `Ao menos uma rodada de revisão do ajuste ${aj.id} com gate verde e revisão triada` : 'Ao menos uma iteração do loop com gate verde e revisão triada', iteracoesRevisadas.length ? 'ok' : 'faltando', rel(c.findings), `${iteracoesRevisadas.length} iteração(ões) revisada(s)`);
  add('criterios', 'Todo critério de aceite tem teste e foi julgado atendido', matriz.criterios.length && !matriz.semTeste.length && v?.criterios?.every((x) => x.atendido === true) ? 'ok' : 'faltando', rel(c.verificacao), matriz.semTeste.length ? `Sem teste: ${matriz.semTeste.join(', ')}` : undefined);
  add('tdd', 'Testes falharam antes da implementação (RED)', red?.ok ? 'ok' : 'faltando', rel(c.red), red ? `${red.observado} no commit ${red.commit?.slice(0, 7)}${red.motivo ? ` — ${red.motivo}` : ''}` : undefined);
  if (aj) {
    const pontos = pontosDoAjuste(aj);
    const andamento = ['em-andamento', 'concluido'].includes(aj.status);
    if (andamento && pontos.length) {
      const redPath = caminhoRedAjuste(raiz, estado, aj.id);
      const redAj = lerJSON(redPath, null);
      add(`tdd:${aj.id}`, `Testes de regressão do ajuste ${aj.id} falharam antes da implementação (RED)`, redAj?.ok && redAj.observado !== 'VERDE_ACEITO' ? 'ok' : 'faltando', rel(redPath), redAj ? `${redAj.observado} no commit ${redAj.commit?.slice(0, 7)}` : undefined);
    }
    const julgados = new Map((v?.ajuste?.pontos || []).map((x) => [x.id, x]));
    const naoAtendidos = pontos.filter((i) => julgados.get(i.id)?.atendido !== true).map((i) => i.id);
    const doc = aj.documentacao && existe(path.join(raiz, aj.documentacao));
    add('ajuste', `Ajuste ${aj.id} documentado e cada ponto do feedback do humano julgado atendido pela verificação`, andamento && doc && !naoAtendidos.length ? 'ok' : 'faltando', aj.documentacao || rel(c.verificacao), [doc ? '' : 'análise do ajuste não documentada', naoAtendidos.length ? `pontos não atendidos: ${naoAtendidos.join(', ')}` : ''].filter(Boolean).join('; ') || undefined);
  }
  add('testes-integros', 'Testes não foram enfraquecidos', diff && !diff.bloqueante && (!diff.alertaEnfraquecimento || v?.testesEnfraquecidos === false) ? 'ok' : 'faltando', rel(c.testesDiff));
  add('gate-limpo', 'Gate completo verde em checkout limpo no commit final', gateV?.ok && gateV?.limpo && gateV?.commit === head && !etapasDoCacheNaVerificacao.length && !etapasCIDeOutroSha.length ? 'ok' : 'faltando', gateV ? path.relative(raiz, path.join(c.evidencias, 'verificacao', 'gate.json')) : null, [etapasDoCacheNaVerificacao.length ? `etapas reaproveitadas do cache na verificação (não valem como prova final): ${etapasDoCacheNaVerificacao.join(', ')}` : '', gateV?.resumoPuladas ? `${gateV.resumoPuladas} (não comprovadas)` : '', gateV?.ciIndisponivel ? `CI indisponível (${gateV.ciIndisponivel}): nada provado` : '', etapasCIDeOutroSha.length ? `resultado do CI de outro SHA em ${etapasCIDeOutroSha.join(', ')}` : gateV?.ci?.etapasDoCI?.length ? `etapas do CI: ${gateV.ci.etapasDoCI.join(', ')} (run ${gateV.ci.run?.url || '?'})` : ''].filter(Boolean).join('; ') || undefined);
  if (gateV?.ci && gateV.ci.modo !== 'fallback-local') {
    const provaGate = { sha: gateV.ci.run?.shaLocal, headSha: gateV.ci.run?.sha ?? null, shas: (gateV.ci.runs || []).map((r) => r.sha).filter(Boolean), criterio: gateV.ci.criterio, conteudo: gateV.ci.conteudo };
    const gateOk = !!gateV.ci.run && provaCIValeParaHead(raiz, config, provaGate, head);
    const ciJsonOk = provaCIValeParaHead(raiz, config, provaDoCiJson(ciJsonV), head);
    const runOk = !gateV.ciIndisponivel && gateOk && ciJsonOk && !etapasCIDeOutroSha.length;
    const porConteudo = gateV.ci.criterio === 'conteudo' && (gateV.ci.conteudo || []).length ? `; ${gateV.ci.conteudo.map((p) => `${p.app} por conteúdo do ${String(p.sha || '').slice(0, 7)}`).join(', ')}` : '';
    add('ci', 'Resultado do CI do mesmo SHA do commit final (ou, no critério "conteudo", do mesmo conteúdo)', runOk ? 'ok' : 'faltando', gateV.ci.arquivo || rel(path.join(c.evidencias, 'verificacao', 'ci.json')), gateV.ciIndisponivel ? `CI indisponível: ${gateV.ciIndisponivel}` : gateV.ci.run ? `run ${gateV.ci.run.url || '?'} (headSha ${String(gateV.ci.run.sha || '').slice(0, 7)}${gateOk ? '' : ' ≠ HEAD'}${porConteudo}${ciJsonV && !ciJsonOk ? '; ci.json de outro SHA' : ''})` : 'sem run registrado');
  }
  for (const nome of ['typecheck', 'lint', 'build', 'teste-unitario', 'teste-integracao']) {
    const e = etapaGate(nome);
    add(`gate:${nome}`, `Etapa ${nome}`, !e ? 'faltando' : e.status === 'ok' && !ciDeOutroSha(e) ? 'ok' : e.status === 'nao-configurado' && !e.obrigatoria ? 'nao-configurado' : 'faltando', e?.log || null, naoComprovada(e) || detalheCI(e));
  }
  const e2e = etapaGate('teste-e2e');
  const exigeE2E = config.provas.exigirE2E === 'sempre' || (config.provas.exigirE2E === 'quando-houver-ui' && estado.meta.ui === true);
  add('gate:teste-e2e', 'Testes E2E do fluxo', e2e?.status === 'ok' && !ciDeOutroSha(e2e) ? 'ok' : exigeE2E ? 'faltando' : 'nao-aplicavel', e2e?.log || null, naoComprovada(e2e) || detalheCI(e2e));
  for (const nome of ['sast', 'dependencias', 'segredos']) {
    const e = etapaGate(nome);
    add(`seguranca:${nome}`, `Verificação de segurança: ${nome}`, e?.status === 'ok' ? 'ok' : e?.obrigatoria ? 'faltando' : !e || e.status === 'nao-configurado' ? 'nao-configurado' : 'alerta', e?.log || null, naoComprovada(e));
  }
  add('seguranca:autorizacao', 'Testes de autorização (usuário A vs. recurso de B) quando há recurso com dono/tenant', v?.testesAutorizacao === 'ok' || v?.testesAutorizacao === 'nao-aplicavel' ? (v.testesAutorizacao === 'ok' ? 'ok' : 'nao-aplicavel') : 'faltando', rel(c.verificacao));
  add('performance', 'Evidências de performance (EXPLAIN, bundle, Lighthouse) quando aplicável', v?.performance?.status === 'ok' || v?.performance?.status === 'nao-aplicavel' ? v.performance.status : 'faltando', rel(c.verificacao), (v?.performance?.evidencias || []).join(', ') || undefined);
  add('findings', 'Zero findings urgentes/altos abertos ou não confirmados; médios corrigidos ou em dívida técnica', !res.bloqueantesAbertos.length && !res.bloqueantesNaoVerificados.length && !res.mediosAbertos.length ? 'ok' : 'faltando', rel(c.findings), `abertos: ${[...res.bloqueantesAbertos, ...res.mediosAbertos].join(', ') || '—'}; sem confirmação: ${res.bloqueantesNaoVerificados.join(', ') || '—'}`);
  add('verificacao', 'Verificação independente aprovada no commit final', v?.resultado === 'aprovado' && v?.commit === head ? 'ok' : 'faltando', rel(c.verificacao), v?.motivos?.join(' ') || undefined);
  add('decisoes', 'Suposições registradas em decisoes.md', existe(c.decisoes) ? 'ok' : 'faltando', rel(c.decisoes));

  const faltando = itens.filter((i) => i.status === 'faltando').map((i) => i.id);
  const dados = lerFindings(raiz, estado.id);
  const manifest = {
    task: estado.id,
    titulo: estado.titulo,
    branch: estado.meta.branch,
    commit: head,
    em: agoraISO(),
    completo: faltando.length === 0,
    faltando,
    itens,
    matriz: matriz.linhas,
    resumo: {
      iteracoes: estado.iteracao,
      maxIteracoes: limitesDaTask(config, estado).maxIteracoes,
      rodadasRevisao: rodadasRevisao(estado),
      tokens: estado.orcamento?.tokensUsados || 0,
      entregasAnteriores: (estado.entregas || []).map((e) => ({ n: e.n, commit: e.commit, em: e.em })),
      // Ajuste desta entrega: o ativo (antes do veredito) ou o que o veredito CONCLUIDA acabou de levar ao histórico.
      ajuste: (() => {
        const x = aj;
        return x ? { id: x.id, texto: x.texto, caminho: x.caminho, documentacao: x.documentacao || null, decisao: x.decisao, aposEntrega: x.aposEntrega, pontos: x.itens.map((i) => ({ id: i.id, tipo: i.tipo, descartado: i.descartado, criterios: i.criterios, descricao: i.descricao })) } : null;
      })(),
      ajustesAnteriores: (estado.ajustes || []).map((y) => ({ id: y.id, status: y.status, entrega: y.entrega || null, texto: y.texto, documentacao: y.documentacao || null })),
      commitRed: red?.commit || null,
      findings: {
        total: dados.itens.length,
        porStatus: res.porStatus,
        porSeveridade: res.porSeveridade,
        dividaTecnica: dados.itens.filter((f) => f.status === 'divida-tecnica').map((f) => ({ id: f.id, severidade: f.severidade, descricao: f.descricao, ref: f.ref })),
        falsosPositivos: dados.itens.filter((f) => f.status === 'falso-positivo').map((f) => ({ id: f.id, motivo: f.motivo })),
      },
      gateVerificacao: gateV ? gateV.etapas.map((e) => ({ nome: e.nome, status: e.status, duracaoMs: e.duracaoMs })) : [],
      // Gate incremental no loop: etapas reaproveitadas do cache e o tempo que elas teriam levado.
      gateCache: resumoEconomia(raiz, estado),
    },
  };
  gravarJSON(c.manifest, manifest);
  return manifest;
}

const SUFIXO_DECISAO = 'Depois do veredito, peça a decisão do humano: "wf decisao pedir" (perguntas de contexto em --contexto), AskUserQuestion com as perguntas devolvidas e "wf decisao aplicar". Sem humano (CI): relatório e "wf encerrar".';

export function definirVeredito(raiz, estado, config, veredito, motivo) {
  if (!VEREDITOS.includes(veredito)) throw new Error(`Veredito inválido. Use: ${VEREDITOS.join(', ')}`);
  if (estado.fase === 'encerrada') return { ok: false, mensagem: 'Task encerrada: o veredito não muda mais.' };
  if (estado.modo === 'revisao') return { ok: false, mensagem: 'Revisão não tem veredito: responda ao humano e rode "wf encerrar".' };
  if (estado.veredito) return { ok: false, mensagem: `Veredito já definido: ${estado.veredito}.` };
  if (veredito === 'CONCLUIDA') {
    if (estado.fase !== 'verificacao') return { ok: false, mensagem: `CONCLUIDA só sai da fase "verificacao" (fase atual: ${estado.fase}).` };
    const limpeza = gitLimpo(raiz);
    if (!limpeza.limpo) return { ok: false, mensagem: 'Há alterações não commitadas; a task não pode ser concluída.', sujos: limpeza.sujos };
    const m = construirManifest(raiz, estado, config);
    if (!m.completo) return { ok: false, mensagem: 'Definition of Done incompleta. A task NÃO pode ser declarada concluída.', faltando: m.faltando, itens: m.itens.filter((i) => i.status === 'faltando') };
  } else if (!motivo) {
    return { ok: false, mensagem: `${veredito} exige --motivo.` };
  } else if (codigoDoMotivo(motivo).startsWith('AJUSTE_')) {
    return { ok: false, mensagem: 'Os códigos AJUSTE_* são reservados à decisão do ajuste pós-entrega (a CLI os emite). Use o código real do motivo.' };
  }
  if (veredito !== 'CONCLUIDA') {
    // Onde a task parou: é para cá que ela volta se o humano decidir continuar (wf decisao aplicar).
    estado.bloqueio = { fase: estado.fase, commit: gitHead(raiz), codigo: codigoDoMotivo(motivo), em: agoraISO() };
  }
  if (veredito === 'CONCLUIDA') concluirAjuste(estado);
  estado.veredito = veredito;
  estado.status = veredito;
  estado.motivo = motivo || null;
  estado.fase = 'entrega';
  estado.historicoFases.push({ fase: 'entrega', em: agoraISO(), veredito });
  return { ok: true, veredito, motivo: motivo || null };
}

export function encerrar(raiz, estado) {
  const c = caminhos(raiz, estado.id);
  if (estado.modo !== 'revisao') {
    if (!estado.veredito) return { ok: false, mensagem: 'Defina o veredito antes de encerrar.' };
    if (!existe(c.relatorio)) return { ok: false, mensagem: 'report.md não existe.' };
    if (estado.veredito === 'CONCLUIDA' && !existe(c.pr)) return { ok: false, mensagem: 'pr.md não existe (texto do PR para o humano abrir).' };
  }
  estado.fase = 'encerrada';
  estado.encerradaEm = agoraISO();
  estado.historicoFases.push({ fase: 'encerrada', em: estado.encerradaEm });
  marcarRegistro(raiz, estado.id, { encerradaEm: estado.encerradaEm, veredito: estado.veredito || null });
  definirTaskAtiva(raiz, null);
  return { ok: true, mensagem: `Task ${estado.id} encerrada com veredito ${estado.veredito || '(revisão)'}.` };
}
