// Modo CI opcional (0.7.0): nas fases em que o CI vale (padrão: só a verificação final), uma etapa sintética
// "teste-ci" faz push do branch da task, dispara o workflow do provedor (GitHub Actions) e espera o run do mesmo
// SHA; as etapas de ci.etapas são lidas do resultado do run (origem 'ci') em vez de rodar na máquina. Este módulo
// não conhece o GitHub: o provedor (lib/ci-github.mjs) fica atrás de uma interface, carregado só quando preciso.
//
// Regras da prova:
// - desligado (ci ausente ou ci.ativo=false), nada muda: o gate roda tudo local e o gate.json não ganha campo novo;
// - "segredos" roda LOCAL antes do push (segredo detectado só no CI já vazou): com falha, não há push;
// - o push é sempre do branch da task, sem force e nunca em branch protegido (o pre-push gerenciado também barra);
// - a etapa só usa o run cujo headSha é o commit do início do gate; job pulado/cancelado de app alterado reprova
//   (fail-closed); job faltando para uma etapa é erro de config (finding gate/config, decisão do humano);
// - CI indisponível (gh sem auth, rede, cota, run cancelado, workflow ausente, timeout) não é defeito do código:
//   status 'ci-indisponivel' (sem finding, não conta falha seguida, não fecha a verificação), e as etapas que
//   dependiam do run ficam pulada-por-dependencia (mecanismo do dependeDe);
// - WF_GATE_CI=1 força o CI em qualquer fase; WF_GATE_CI_FALLBACK=local roda tudo na máquina (se ci.fallback permitir);
// - CI econômico (0.8.0): antes do push, um run do mesmo SHA (dispatch, ou PR com a base contida no HEAD) é
//   reaproveitado, anexado (em andamento) ou repetido só nos jobs que falharam (verificação anterior, ci.repetirFalhas);
//   só o que falta é disparado (decidirProva). WF_GATE_CI_NOVO=1 ou ci.reaproveitar=false: sempre dispara.
// - critério "conteudo" (0.9.0, ci.criterioReaproveitar): um dispatch verde de um commit ANTERIOR da mesma branch prova
//   o app com o mesmo conteúdo (hash dos caminhos do app e do workflow; lib/ci-conteudo.mjs). A prova guarda o SHA do run
//   e os hashes, e o registrar/manifest reconferem (provaCIValeParaHead). Com "commit" (ou ausente), tudo é da 0.8.0.

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { git, gitHead, gitBranchAtual, gitLimpo, refBase, baseDaTask, resolverComando, casaAlgum, agoraISO, gravarJSON, lerJSON, caminhos, ultimasLinhas, validarGlob, existe, FASES } from './core.mjs';
import { shAsync, resultadoEtapa, CI_INDISPONIVEL } from './gate.mjs';
import { grupoDaEtapa, nomeArquivoEtapa } from './gate-cache.mjs';
import { criterioDe, compararConteudo, provaCIValeParaHead, CRITERIOS, WORKFLOWS_PADRAO } from './ci-conteudo.mjs';

export const NOME_TESTE_CI = 'teste-ci';
export const FALLBACKS = ['local', 'nenhum'];
// Provedores conhecidos, carregados só quando o CI vale (o gate sem CI nunca importa o módulo do GitHub).
export const PROVEDORES = { 'github-actions': () => import('./ci-github.mjs') };
// Jobs de infraestrutura do workflow proposto: não mapeiam etapa nenhuma.
// "reaproveitar" (0.8.0): no run da PR, decide se a prova do dispatch do mesmo head SHA vale (ver lib/ci-gerar.mjs).
const JOBS_INFRA = new Set(['mudancas', 'reaproveitar', 'ci-ok']);
// "<app> (<etapa>)" ou "<app> (<etapa> 2/4)" (shard): a convenção dos nomes de job do workflow proposto.
// Um job de matriz pulado (needs) chega com o placeholder não expandido ("${{ matrix.shard }}/4"): o nome ainda é lido.
export const RX_NOME_JOB = /^(?<app>[^()]+?) \((?<etapa>[a-z0-9][a-z0-9._-]*)(?: (?<i>\d+|\$\{\{[^}]*\}\})\/(?<n>\d+))?\)$/;
const curto = (sha) => String(sha || '').slice(0, 7);

/** "owner/repo" a partir da URL do remoto do GitHub (https, ssh ou git@); null para remotos locais ou de outro host. */
export function repoDaUrl(url) {
  const u = String(url || '').trim();
  const m = /^(?:https?:\/\/|ssh:\/\/)?(?:[^@/]+@)?(?:www\.)?github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(u);
  return m ? `${m[1]}/${m[2]}` : null;
}

/** Repositório (owner/repo) do remoto configurado, para o --repo de todo comando gh. */
export function repoDoRemoto(raiz, config) {
  const r = git(raiz, ['remote', 'get-url', config.git?.remoto || 'origin']);
  return r.exit === 0 ? repoDaUrl(r.out) : null;
}

// --------------------------------------------------------------------------- plano (vale ou não nesta fase?)

/**
 * Decide se o CI vale para este gate: { ativo, modo, etapasCI, motivo, erro? }.
 * modo: 'local' (desligado/fora da fase), 'ci', 'forcado' (WF_GATE_CI=1), 'fallback-local' (WF_GATE_CI_FALLBACK=local).
 * Um config inválido com o CI pedido vira erro CI-ESTADO (nada roda até o humano corrigir; "wf doctor" lista).
 */
export function planoCI(config, estado, env = process.env) {
  const ci = config?.ci;
  const configurado = !!ci && typeof ci === 'object';
  const local = (motivo) => ({ ativo: false, modo: 'local', etapasCI: new Set(), motivo });
  if (String(env.WF_GATE_CI_FALLBACK || '').toLowerCase() === 'local') {
    if (!configurado || ci.ativo !== true) return local('CI desligado');
    if (ci.fallback === 'nenhum') return { ...local('fallback recusado'), erro: { codigo: 'CI-ESTADO', mensagem: 'WF_GATE_CI_FALLBACK=local foi pedido, mas ci.fallback é "nenhum": o fallback local está desligado no config (decisão do humano).' } };
    return { ativo: false, modo: 'fallback-local', etapasCI: new Set(), motivo: 'WF_GATE_CI_FALLBACK=local: todas as etapas rodam na máquina' };
  }
  const forcado = String(env.WF_GATE_CI || '') === '1';
  if (!forcado) {
    if (!configurado || ci.ativo !== true) return local('CI desligado');
    if (estado?.modo === 'revisao') return local('modo revisão: sem CI');
    const fases = Array.isArray(ci.fases) ? ci.fases : [];
    if (!fases.includes(estado?.fase)) return local(`fora das fases do CI (${estado?.fase || '?'}; ci.fases: ${fases.join(', ') || 'nenhuma'})`);
  } else if (!configurado) {
    return { ...local('sem bloco ci'), erro: { codigo: 'CI-ESTADO', mensagem: 'WF_GATE_CI=1 foi pedido, mas o config não tem o bloco "ci" (rode /workflow-ia:atualizar).' } };
  }
  const v = validarConfigCI(config);
  if (v.erros.length) return { ...local('config ci inválido'), erro: { codigo: 'CI-ESTADO', mensagem: `Config do CI inválido: ${v.erros.join('; ')}. Corrija o .workflow-ia/config.json (só o humano) e rode "wf doctor".` } };
  const etapasCI = new Set([...(ci.etapas || []), ...(ci.e2e === true ? ['teste-e2e'] : [])]);
  return { ativo: true, modo: forcado ? 'forcado' : 'ci', etapasCI, motivo: forcado ? 'WF_GATE_CI=1' : `ci.ativo nas fases ${ci.fases.join(', ')}` };
}

/** Onde cada etapa do gate roda neste plano: [{ etapa, onde: 'local' | 'CI' }] (mais a teste-ci quando ativo). */
export function planoDasEtapas(config, plano) {
  const linhas = (config.gate?.etapas || []).map((e) => ({ etapa: e.nome, onde: plano?.ativo && plano.etapasCI.has(grupoDaEtapa(e.nome)) ? 'CI' : 'local' }));
  if (plano?.ativo) linhas.unshift({ etapa: NOME_TESTE_CI, onde: 'CI' });
  return linhas;
}

// --------------------------------------------------------------------------- pré-voo (CI-ESTADO)

/**
 * Conferência antes de rodar qualquer coisa: árvore limpa, branch da task fora dos protegidos, remoto alcançável e
 * sem commits à frente do local, apps configurados. Devolve { ok, codigo, mensagem, checks }. Nada do gh aqui: gh
 * ausente ou sem auth é CI-INDISPONIVEL em runtime (não é estado do repositório).
 */
export function conferirPreVoo(raiz, estado, config, { fetch = true, base = null } = {}) {
  const checks = [];
  const add = (nome, ok, detalhe) => checks.push({ nome, ok, detalhe });
  let codigo = 'CI-ESTADO';
  const limpo = gitLimpo(raiz);
  add('arvore-limpa', limpo.limpo, limpo.limpo ? 'sem alterações pendentes' : `alterações não commitadas: ${limpo.sujos.slice(0, 5).join(', ')} (faça commit antes)`);
  // O modo CI faz push: com git.pushBranch=false (o humano faz o push), ele não pode valer.
  add('push-permitido', config.git?.pushBranch !== false, config.git?.pushBranch !== false ? 'git.pushBranch permite o push do branch da task' : 'git.pushBranch=false: o modo CI precisa fazer push do branch da task (ligue git.pushBranch ou desligue ci.ativo)');
  const branch = gitBranchAtual(raiz);
  const daTask = estado?.meta?.branch;
  const protegidos = config.git?.branchesProtegidos || [];
  const ehBase = !!branch && branch === config.git?.branchBase;
  const branchOk = !!branch && branch !== 'HEAD' && !protegidos.includes(branch) && !ehBase && (!daTask || daTask === branch);
  add('branch', branchOk, !branch || branch === 'HEAD' ? 'HEAD solto: faça checkout do branch da task' : protegidos.includes(branch) || ehBase ? `"${branch}" é ${ehBase ? 'o branch base' : 'branch protegido'}: o CI do Workflow IA roda no branch da task` : daTask && daTask !== branch ? `branch atual "${branch}" não é o da task ("${daTask}")` : `branch da task: ${branch}`);
  // O run executa o workflow do próprio branch: se a task mexeu em .github/, a prova do CI não vale (S2).
  const refDaBase = base || (estado ? refBase(raiz, baseDaTask(estado, config)) : null);
  if (refDaBase) {
    const d = git(raiz, ['diff', '--name-only', '--no-renames', `${refDaBase}...HEAD`, '--', '.github']);
    const tocados = d.exit === 0 ? d.out.split('\n').filter(Boolean) : [];
    add('workflow-intocado', !tocados.length, tocados.length ? `workflow alterado nesta task: a prova do CI não vale; revise e integre o workflow antes (${tocados.slice(0, 5).join(', ')})` : '.github/ não mudou nesta task');
  }
  const remoto = config.git?.remoto || 'origin';
  const url = git(raiz, ['remote', 'get-url', remoto]);
  add('remoto', url.exit === 0, url.exit === 0 ? `${remoto} → ${url.out}` : `remoto "${remoto}" não existe (git.remoto)`);
  if (url.exit === 0 && branchOk && fetch) {
    const f = git(raiz, ['fetch', '--quiet', remoto, branch]);
    if (f.exit !== 0 && /couldn't find remote ref|fatal: Remote branch .* not found/i.test(f.err)) add('remoto-sincronizado', true, `"${branch}" ainda não existe no remoto: o push vai criá-lo`);
    else if (f.exit !== 0) {
      codigo = 'CI-INDISPONIVEL';
      add('remoto-sincronizado', false, `não consegui buscar ${remoto}/${branch}: ${ultimasLinhas(f.err, 3)}`);
    } else {
      const atras = git(raiz, ['rev-list', '--count', `HEAD..${remoto}/${branch}`]);
      const n = Number(atras.out) || 0;
      add('remoto-sincronizado', n === 0, n === 0 ? `${remoto}/${branch} não tem commits que faltam aqui` : `${remoto}/${branch} tem ${n} commit(s) que o local não tem: rode "git pull --ff-only ${remoto} ${branch}" (ou rebase) antes`);
    }
  }
  // Base desatualizada (0.8.0): só aviso. A verificação prova o commit; o run da PR testa o merge com a base e, se a base
  // andou, roda de novo sobre o código integrado (o job "reaproveitar" exige a base contida no head).
  const avisos = [];
  if (url.exit === 0 && fetch && estado) {
    const nomeBase = baseDaTask(estado, config);
    const fb = git(raiz, ['fetch', '--quiet', remoto, nomeBase]);
    const refRemota = `${remoto}/${nomeBase}`;
    if (fb.exit === 0 && git(raiz, ['rev-parse', '--verify', '--quiet', `${refRemota}^{commit}`]).exit === 0) {
      const contida = git(raiz, ['merge-base', '--is-ancestor', refRemota, 'HEAD']).exit === 0;
      if (!contida) avisos.push(criterioDe(config) === 'conteudo' ? `a base andou: ${refRemota} tem commits que o branch da task não tem; no run da PR, só os apps cujo conteúdo a base mudou rodam de novo (critério "conteudo")` : `a base andou: ${refRemota} tem commits que o branch da task não tem; o run da PR vai rodar de novo sobre o código integrado (atualize o branch com a base para a PR reaproveitar a verificação)`);
      checks.push({ nome: 'base-contida', ok: true, aviso: !contida, detalhe: contida ? `${refRemota} está contida no HEAD` : avisos[avisos.length - 1] });
    }
  }
  const apps = config.ci?.apps && typeof config.ci.apps === 'object' ? Object.entries(config.ci.apps) : [];
  const semDir = apps.filter(([, a]) => !existe(path.join(raiz, String(a?.dir || '')))).map(([n, a]) => `${n} (${a?.dir})`);
  add('apps', apps.length > 0 && !semDir.length, !apps.length ? 'ci.apps vazio: rode "wf ci gerar" para detectar os apps' : semDir.length ? `pasta inexistente: ${semDir.join(', ')}` : `${apps.length} app(s): ${apps.map(([n]) => n).join(', ')}`);
  const falhas = checks.filter((c) => !c.ok);
  return { ok: falhas.length === 0, codigo: falhas.length ? codigo : null, mensagem: falhas.length ? `${codigo}: ${falhas.map((c) => c.detalhe).join('; ')}.` : 'pré-voo ok', checks, avisos, branch, remoto };
}

// --------------------------------------------------------------------------- apps alterados

/**
 * Apps tocados pelo diff base...HEAD, por prefixo de ci.apps[*].dir. Arquivo em ci.compartilhado (ou lockfile), fora
 * de qualquer app ou lista vazia → todos (fail-closed). .workflow-ia/** e *.md não contam.
 */
export function appsAlterados(raiz, config, base) {
  const apps = Object.entries(config.ci?.apps || {});
  const compartilhado = [...(config.ci?.compartilhado || []), ...(config.protecoes?.lockfiles || []).map((l) => `**/${l}`), ...(config.protecoes?.lockfiles || [])];
  const d = git(raiz, ['diff', '--name-only', '--no-renames', `${base}...HEAD`]);
  if (d.exit !== 0) return { apps: apps.map(([n]) => n), todos: true, motivo: `git diff falhou (${ultimasLinhas(d.err, 1)}): todos os apps`, arquivos: 0 };
  const arquivos = d.out.split('\n').filter(Boolean);
  const alterados = new Set();
  let todos = false;
  let motivo = '';
  // ci.apps.X.entradas (0.9.0): o que o app lê fora da pasta dele também o seleciona (mesmo .md); não tira o "todos"
  // de um arquivo compartilhado.
  const comEntradas = apps.filter(([, a]) => Array.isArray(a?.entradas) && a.entradas.length);
  for (const f of arquivos) {
    const leitores = comEntradas.filter(([, a]) => a.entradas.some((g) => {
      const p = String(g).replace(/\/+$/, '');
      return casaAlgum(f, [p, `${p}/**`]);
    }));
    for (const [n] of leitores) alterados.add(n);
    if (f.startsWith('.workflow-ia/') || /\.md$/i.test(f)) continue;
    if (casaAlgum(f, compartilhado)) {
      todos = true;
      motivo = `${f} é compartilhado`;
      break;
    }
    const app = apps.find(([, a]) => a?.dir === '.' || f === a?.dir || f.startsWith(`${String(a?.dir || '').replace(/\/+$/, '')}/`));
    if (app) alterados.add(app[0]);
    else if (leitores.length) continue;
    else {
      todos = true;
      motivo = `${f} está fora de qualquer app`;
      break;
    }
  }
  if (!todos && !alterados.size) {
    todos = true;
    motivo = arquivos.length ? 'nenhum app tocado pelo diff (só docs ou .workflow-ia): por segurança, todos' : 'diff vazio: todos';
  }
  return { apps: todos ? apps.map(([n]) => n) : [...alterados], todos, motivo: todos ? motivo : `apps tocados pelo diff: ${[...alterados].join(', ')}`, arquivos: arquivos.length };
}

// --------------------------------------------------------------------------- classificação do CI indisponível

const CLASSES = [
  ['gh-ausente', /ENOENT|command not found|not found: gh|gh: No such file/i],
  ['sem-auth', /not logged in|gh auth login|authentication required|HTTP 401|bad credentials/i],
  ['cota', /rate limit|HTTP 403.*(?:rate|abuse)|secondary rate/i],
  ['workflow-ausente', /could not find any workflows named|HTTP 404|workflow .* not found|no workflow/i],
  ['github-fora', /HTTP 5\d\d|Service Unavailable|bad gateway/i],
  ['rede', /could not resolve host|connection (?:refused|reset)|network is unreachable|TLS|EOF|dial tcp|i\/o timeout|timed out|ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i],
];

/** Classe do CI indisponível a partir da saída do gh/git, ou null quando não parece infraestrutura. */
export function classificarIndisponivel(texto) {
  const t = String(texto || '');
  for (const [classe, rx] of CLASSES) if (rx.test(t)) return classe;
  return null;
}

// --------------------------------------------------------------------------- mapeamento job → etapa

/** Parte do nome do job: { app, etapa, shard: { i, n } | null } ou null quando não segue a convenção. */
export function parsearNomeJob(nome) {
  const m = RX_NOME_JOB.exec(String(nome || '').trim());
  if (!m) return null;
  return { app: m.groups.app.trim(), etapa: m.groups.etapa, shard: m.groups.i ? { i: /^\d+$/.test(m.groups.i) ? Number(m.groups.i) : null, n: Number(m.groups.n) } : null };
}

/**
 * Lê os jobs do run para as etapas do gate marcadas ci:true. Por etapa: ok sse todos os jobs dos apps considerados
 * (os alterados, ou todos) concluíram "success" e todos os shards estão presentes; qualquer outra conclusão (skipped,
 * cancelled, failure, timed_out…) de app considerado reprova (fail-closed); sem job para a etapa é erro de config.
 * Devolve { porEtapa, naoMapeados, infra }.
 */
export function mapearJobs(jobs, { config, apps, etapas }) {
  const configurados = Object.keys(config.ci?.apps || {});
  const considerados = apps?.todos ? configurados : (apps?.apps || []).filter((a) => configurados.includes(a));
  const lidos = (jobs || []).map((j) => ({ ...j, meta: parsearNomeJob(j.nome) }));
  const infra = lidos.filter((j) => JOBS_INFRA.has(String(j.nome || '').trim()));
  const usados = new Set();
  const porEtapa = {};
  for (const nome of etapas) {
    const grupo = grupoDaEtapa(nome);
    const sufixo = nome.includes(':') ? nome.slice(nome.indexOf(':') + 1) : null;
    const alvo = sufixo ? considerados.filter((a) => a === sufixo) : considerados;
    const r = { status: 'ok', jobs: [], duracaoMs: 0, motivo: '' };
    const motivos = [];
    if (sufixo && !configurados.includes(sufixo)) {
      // Sub-etapa de um app que o config não conhece: nenhum job a prova; é erro de config, nunca "não aplicável" (C1).
      r.status = 'falhou';
      r.erroConfig = `a sub-etapa "${nome}" é de um app ("${sufixo}") que não está em ci.apps: nenhum job do run a prova (declare o app ou tire a etapa de ci.etapas)`;
      r.motivo = r.erroConfig;
      porEtapa[nome] = r;
      continue;
    }
    if (sufixo && !considerados.includes(sufixo)) {
      // Sub-etapa de app configurado que o diff não tocou: o CI a pulou de propósito; nada a provar nesta etapa.
      r.motivo = `app ${sufixo} não foi alterado: job pulado no CI, sem efeito nesta etapa`;
      r.naoAplicavel = true;
      porEtapa[nome] = r;
      continue;
    }
    for (const app of alvo) {
      const doApp = lidos.filter((j) => j.meta && j.meta.app === app && j.meta.etapa === grupo);
      if (!doApp.length) {
        r.status = 'falhou';
        r.erroConfig = `o run não tem o job "${app} (${grupo})" (confira ci.etapas, ci.apps e os nomes dos jobs do workflow)`;
        motivos.push(r.erroConfig);
        continue;
      }
      doApp.forEach((j) => usados.add(j));
      r.jobs.push(...doApp.map((j) => j.nome));
      r.duracaoMs += doApp.reduce((t, j) => t + (Number(j.duracaoMs) || 0), 0);
      // Job pulado porque o typecheck do app falhou (needs): consequência da falha de código, não erro de config (M5).
      const typecheckFalhou = grupo !== 'typecheck' && lidos.some((j) => j.meta && j.meta.app === app && j.meta.etapa === 'typecheck' && j.conclusao && j.conclusao !== 'success' && j.conclusao !== 'skipped');
      const ruins = doApp.filter((j) => j.conclusao !== 'success');
      if (ruins.length) {
        r.status = 'falhou';
        motivos.push(...ruins.map((j) => `job "${j.nome}" ${j.conclusao === 'skipped' && typecheckFalhou ? `foi pulado porque "${app} (typecheck)" falhou (needs): corrija o typecheck` : j.conclusao === 'skipped' || j.conclusao === 'cancelled' ? `foi ${j.conclusao === 'skipped' ? 'pulado' : 'cancelado'} para app alterado: reprova` : `terminou ${j.conclusao || j.status || '?'}`}`));
      }
      // Shards (B3): os jobs "i/N" precisam cobrir 1..N, com N igual a ci.apps[app].shards (quando > 1); placeholder de
      // matriz não expandido (job pulado) não conta como shard presente.
      const comShard = doApp.filter((j) => j.meta.shard);
      if (comShard.length) {
        const esperado = Math.max(1, Number(config.ci?.apps?.[app]?.shards) || 1);
        const ns = [...new Set(comShard.map((j) => j.meta.shard.n))];
        const n = ns.length === 1 ? ns[0] : null;
        const presentes = new Set(comShard.map((j) => j.meta.shard.i).filter((i) => Number.isInteger(i)));
        const foraDaFaixa = [...presentes].filter((i) => i < 1 || (n != null && i > n));
        const faltam = n != null ? Array.from({ length: n }, (_, k) => k + 1).filter((i) => !presentes.has(i)) : [];
        if (ns.length !== 1 || n !== esperado) {
          r.status = 'falhou';
          motivos.push(`${app} (${grupo}): shards do run (${ns.join(', ') || '?'}) ≠ ci.apps.${app}.shards (${esperado})`);
        }
        if (foraDaFaixa.length) {
          r.status = 'falhou';
          motivos.push(`${app} (${grupo}): shard fora da faixa 1..${n}: ${foraDaFaixa.join(', ')}`);
        }
        if (faltam.length && !ruins.some((j) => j.meta.shard && j.meta.shard.i == null)) {
          r.status = 'falhou';
          motivos.push(`${app} (${grupo}): ${presentes.size} de ${n} shards no run (faltam ${faltam.join(', ')})`);
        }
      } else if (Math.max(1, Number(config.ci?.apps?.[app]?.shards) || 1) > 1 && ['teste-unitario', 'teste-integracao', 'teste-e2e'].includes(grupo)) {
        r.status = 'falhou';
        motivos.push(`${app} (${grupo}): ci.apps.${app}.shards = ${config.ci.apps[app].shards}, mas o run não tem jobs "i/N"`);
      }
    }
    r.motivo = motivos.length ? motivos.join('; ') : `${r.jobs.length} job(s) do run concluíram success`;
    porEtapa[nome] = r;
  }
  // Job reprovado que nenhuma etapa deste gate lê (fora da convenção, de app fora de ci.apps ou não considerado, ou
  // de etapa fora de ci.etapas): fail-closed na teste-ci (A1). Pulado não reprova (o CI o pulou de propósito).
  const naoMapeados = lidos.filter((j) => !usados.has(j) && !JOBS_INFRA.has(String(j.nome || '').trim()) && j.conclusao !== 'success' && j.conclusao !== 'skipped').map((j) => ({ nome: j.nome, conclusao: j.conclusao }));
  const falhasMapeadas = Object.values(porEtapa).some((r) => r.status === 'falhou' && !r.erroConfig);
  return { porEtapa, naoMapeados, infra: infra.map((j) => ({ nome: j.nome, conclusao: j.conclusao })), considerados, falhasMapeadas };
}

// --------------------------------------------------------------------------- reaproveitamento (0.8.0)

/** Ids de runs anexados que estouraram o prazo em verificações anteriores deste SHA (de todos os ci.json da task). */
export function travadosDoSha(raiz, estado, sha) {
  const ids = new Set();
  try {
    const ev = caminhos(raiz, estado.id).evidencias;
    for (const d of fs.readdirSync(ev, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const j = lerJSON(path.join(ev, d.name, 'ci.json'), null);
      if (j && j.sha === sha) for (const id of j.anexadosTravados || []) ids.add(id);
    }
  } catch {
    /* sem evidências: nenhum */
  }
  return [...ids];
}

/** Provas por conteúdo (0.9.0) dos apps lidos de runs de outro commit nesta verificação: [{ app, run, sha, hash, ... }]. */
function provasDoConteudo(dados) {
  const usados = new Set((dados.runs || []).filter((r) => r.porConteudo).flatMap((r) => (r.apps || []).map((a) => `${a}@${r.id}`)));
  return Object.values(dados.conteudo?.apps || {}).filter((e) => usados.has(`${e.app}@${e.run}`));
}

/** Jobs com os campos da convenção (app, etapa, shard) e o id do run de onde vieram. */
export function comMeta(jobs, runId = null) {
  return (jobs || []).map((j) => ({ ...j, ...(parsearNomeJob(j.nome) || {}), ...(runId != null ? { runId } : {}) }));
}

/**
 * Um run prova este commit? headSha == HEAD sempre; workflow_dispatch é o workflow do próprio commit; pull_request só
 * quando o head está numa só PR e o merge dela (refs/pull/<n>/merge, buscado no remoto) tem a árvore do HEAD e o 1º pai
 * igual ao base.sha do run: aí o merge testado é o próprio commit. Sem como conferir, o run não vale (na dúvida, roda).
 */
export function aceitarRunDoSha(raiz, config, run, sha, estado = null) {
  if (!run || run.sha !== sha) return { ok: false, motivo: `headSha ${curto(run?.sha)} ≠ HEAD ${curto(sha)}` };
  if (run.status === 'completed' && run.erroLeitura) return { ok: false, motivo: `leitura do run falhou (${run.erroLeitura})` };
  if (run.evento === 'workflow_dispatch') return { ok: true };
  if (run.evento !== 'pull_request') return { ok: false, motivo: `evento ${run.evento || '?'} não prova o commit` };
  if (Number(run.prs) > 1) return { ok: false, motivo: `o head está em ${run.prs} PRs: não dá para saber qual base o run testou` };
  const b = String(run.baseSha || '');
  if (!/^[0-9a-f]{7,64}$/i.test(b)) return { ok: false, motivo: 'run de pull_request sem base.sha legível' };
  // O base.sha da API pode estar desatualizado (revisão 5): confere o merge que o GitHub testa, refs/pull/<n>/merge.
  // Ele só prova este commit com a MESMA árvore do HEAD e o 1º pai igual ao base.sha do run (a base que o run usou);
  // sem como conferir, o run da PR é recusado.
  if (run.pr == null || !/^\d+$/.test(String(run.pr))) return { ok: false, motivo: 'run de pull_request sem o número da PR: não dá para conferir o merge testado' };
  const f = git(raiz, ['fetch', '--quiet', '--no-tags', config.git?.remoto || 'origin', `refs/pull/${run.pr}/merge`]);
  if (f.exit !== 0) return { ok: false, motivo: `não consegui buscar refs/pull/${run.pr}/merge (${ultimasLinhas(f.err, 1)}): o merge testado não foi conferido` };
  const ref = git(raiz, ['rev-parse', 'FETCH_HEAD']).out;
  const arvore = (x) => git(raiz, ['rev-parse', `${x}^{tree}`]).out;
  if (!ref || arvore(ref) !== arvore('HEAD')) return { ok: false, motivo: `o merge da PR #${run.pr} (${curto(ref)}) não tem a árvore do HEAD: o run testou o merge com outro código (a base andou?)` };
  const pai = git(raiz, ['rev-parse', `${ref}^1`]).out;
  if (!pai || !pai.startsWith(b) && !b.startsWith(pai)) return { ok: false, motivo: `o merge atual da PR #${run.pr} parte da base ${curto(pai)}, não da ${curto(b)} que o run usou: não dá para conferir o que ele testou` };
  return { ok: true };
}

const FALHA_DE_JOB = ['failure', 'timed_out'];

/**
 * Estado de um app num run concluído: 'falhou' (job do app reprovado), 'ok' (todas as etapas do app ok, com shards e
 * "mudancas" ok, mesmo que o run tenha reprovado por causa de OUTRO app) ou 'ausente' (pulado, cancelado, incompleto).
 */
export function estadoDoApp(run, app, { config, etapas }) {
  if (!run || run.status !== 'completed') return 'ausente';
  const doApp = comMeta(run.jobs).filter((j) => j.app === app);
  if (!doApp.length || doApp.every((j) => j.conclusao === 'skipped')) return 'ausente';
  if (doApp.some((j) => FALHA_DE_JOB.includes(j.conclusao))) return 'falhou';
  if ((run.jobs || []).some((j) => String(j.nome || '').trim() === 'mudancas' && j.conclusao !== 'success')) return 'ausente';
  const m = mapearJobs(run.jobs, { config, apps: { apps: [app], todos: false }, etapas });
  // Só os jobs deste app contam aqui: job reprovado de outro app ou fora da convenção é julgado no veredito final.
  return Object.values(m.porEtapa).every((r) => r.status === 'ok') && !m.naoMapeados.some((j) => parsearNomeJob(j.nome)?.app === app) ? 'ok' : 'ausente';
}

// Mais novo primeiro pelo resultado (atualizadoEm: um rerun dá resultado novo a um run criado antes), depois pela criação.
const quando = (r) => Date.parse(r.atualizadoEm || '') || Date.parse(r.criadoEm || '') || 0;
const ordenarRuns = (runs) => [...runs].sort((a, b) => quando(b) - quando(a) || (Date.parse(b.criadoEm || '') || 0) - (Date.parse(a.criadoEm || '') || 0) || Number(b.id) - Number(a.id));

/**
 * Decide o que fazer com os runs do mesmo SHA (pura): { acao: 'anexar' | 'rerun-falhas' | 'disparar' | 'usar', motivo,
 * run?, runs?, apps?, escolhidos?, jobs?, appsDoRun? }. A última palavra sobre cada app é do run concluído mais novo
 * que o testou (falha mais nova nunca é encoberta por verde antigo). Ordem: todos os apps provados pelos concluídos →
 * usar (run em andamento não segura o gate); em andamento → anexar; um único run com app reprovado e repetições do
 * commit sobrando (soma de attempt-1 de todos os runs do SHA < repetirFalhas, fora de semRerun) → rerun-falhas; app sem
 * prova e podeDisparar → disparar só os faltantes; senão → usar (jobs de cada app do run escolhido para ele).
 */
export function decidirProva({ runs = [], considerados = [], inputTodos = 'todos', config, etapas = [], repetirFalhas = 1, podeDisparar = true, semRerun = new Set(), anexados = new Set(), preferido = null }) {
  // Barreira (revisão 1): o run concluído mais novo que não terminou success, ou que não deu para ler, invalida tudo o que é
  // mais antigo que ele. Um verde antigo nunca vira prova por cima de um resultado mais novo que não é verde.
  const barreiras = runs.filter((r) => r.status === 'completed' && (r.soBarreira || r.erroLeitura || r.conclusao !== 'success'));
  const corte = barreiras.length ? Math.max(...barreiras.map(quando)) : -Infinity;
  const validos = runs.filter((r) => !r.soBarreira && !r.erroLeitura && (r.status !== 'completed' || quando(r) >= corte));
  const ordenados = ordenarRuns(validos);
  const andamento = ordenados.filter((r) => r.status !== 'completed' && !anexados.has(r.id));
  const concluidos = ordenados.filter((r) => r.status === 'completed');
  const porApp = {};
  for (const app of considerados) {
    porApp[app] = { estado: 'ausente', run: null };
    for (const r of concluidos) {
      const st = estadoDoApp(r, app, { config, etapas });
      if (st !== 'ausente') {
        porApp[app] = { estado: st, run: r };
        break;
      }
    }
  }
  const tudoProvado = considerados.length > 0 && considerados.every((a) => porApp[a].estado === 'ok');
  if (!tudoProvado && andamento.length) return { acao: 'anexar', run: andamento[0], motivo: `run #${andamento[0].numero ?? andamento[0].id} do mesmo SHA em andamento: anexa (um disparo novo o cancelaria)` };
  const falhos = considerados.filter((a) => porApp[a].estado === 'falhou');
  const runsFalhos = [...new Map(falhos.map((a) => [porApp[a].run.id, porApp[a].run])).values()];
  // O limite é do commit: as tentativas extras já feitas em QUALQUER run deste SHA contam (um rerun por vez).
  // Run de outro commit provado por conteúdo (0.9.0) não conta: as tentativas dele são de outro commit.
  const rerunsDoCommit = runs.filter((r) => !r.porConteudo).reduce((t, r) => t + Math.max(0, (Number(r.tentativa) || 1) - 1), 0);
  const podeRepetir = (r) => !semRerun.has(r.id) && rerunsDoCommit < repetirFalhas;
  if (runsFalhos.length === 1 && podeRepetir(runsFalhos[0])) return { acao: 'rerun-falhas', runs: runsFalhos, motivo: `${falhos.join(', ')} reprovado(s) no run ${runsFalhos.map((r) => `#${r.numero ?? r.id} (tentativa ${r.tentativa || 1})`).join(', ')}: repete só os jobs que falharam` };
  const ausentes = considerados.filter((a) => porApp[a].estado === 'ausente');
  if ((ausentes.length || !considerados.length) && podeDisparar) {
    const todosFaltam = ausentes.length === considerados.length;
    return { acao: 'disparar', apps: todosFaltam ? inputTodos : ausentes.join(','), faltantes: ausentes, motivo: todosFaltam ? (runs.length ? 'nenhum run do mesmo SHA prova os apps desta verificação' : 'nenhum run do mesmo SHA') : `sem prova para ${ausentes.join(', ')}: dispara só esses apps` };
  }
  // usar: app ainda sem prova (só depois do disparo deste gate) lê os jobs do run mais novo que os tem (o disparado primeiro).
  const comJobsDe = (app) => {
    const pref = concluidos.find((r) => r.id === preferido);
    const tem = (r) => comMeta(r.jobs).some((j) => j.app === app);
    return pref && tem(pref) ? pref : concluidos.find(tem) || pref || null;
  };
  const appsDoRun = {};
  const escolhidosMap = new Map();
  for (const app of considerados) {
    const r = porApp[app].run || comJobsDe(app);
    if (!r) continue;
    escolhidosMap.set(r.id, r);
    (appsDoRun[r.id] = appsDoRun[r.id] || []).push(app);
  }
  if (!escolhidosMap.size) {
    const r = concluidos.find((x) => x.id === preferido) || concluidos[0];
    if (r) escolhidosMap.set(r.id, r);
  }
  const escolhidos = ordenarRuns([...escolhidosMap.values()]);
  const consid = new Set(considerados);
  const configurados = new Set(Object.keys(config?.ci?.apps || {}));
  // Run que já existia (reaproveitado, anexado, rerun) pode ter testado apps que esta verificação não considera (o
  // "mudancas" da PR calcula contra a base da PR, ou o disparo foi com "todos"): esses jobs ficam de fora, como ficariam
  // pulados num disparo desta verificação. Jobs fora da convenção ou de app fora de ci.apps entram sempre (fail-closed).
  // "ci-ok" reprovado de um run assim só entra quando o run é a última palavra de um app reprovado aqui; no run
  // disparado neste gate, tudo entra como na 0.7.0.
  const fonteDeFalha = new Set(considerados.filter((a) => porApp[a].estado === 'falhou').map((a) => porApp[a].run.id));
  const jobs = [];
  for (const r of escolhidos) {
    const doGate = r.origem === 'disparado';
    for (const j of comMeta(r.jobs, r.id)) {
      if (j.app && consid.has(j.app)) {
        if ((appsDoRun[r.id] || []).includes(j.app)) jobs.push(j);
      } else if (!doGate && j.app && configurados.has(j.app)) continue;
      else if (!doGate && String(j.nome || '').trim() === 'ci-ok' && j.conclusao !== 'success' && !fonteDeFalha.has(r.id)) continue;
      else jobs.push(j);
    }
  }
  const motivo = falhos.length ? `${falhos.join(', ')} reprovado(s) sem repetição disponível: usa a falha (sem gastar)` : ausentes.length ? `sem prova para ${ausentes.join(', ')} mesmo depois do disparo: lê o que o run tem` : `todos os apps provados por run(s) do mesmo SHA`;
  return { acao: 'usar', escolhidos, jobs, appsDoRun, porApp: Object.fromEntries(Object.entries(porApp).map(([a, v]) => [a, { estado: v.estado, run: v.run?.id ?? null }])), motivo };
}

// --------------------------------------------------------------------------- reaproveitamento por conteúdo (0.9.0)

/**
 * Critério "conteudo": para cada app considerado, o workflow_dispatch CONCLUÍDO mais novo da branch (de outro commit)
 * que testou o app (algum job dele não pulado) decide: verde no run inteiro, com o app provado (estadoDoApp ok) e o
 * mesmo conteúdo do app e do workflow no commit do run e no HEAD (compararConteudo) → o app fica provado por ele.
 * Qualquer outra coisa (vermelho, cancelado, cobertura incompleta, commit que não dá para buscar, hash diferente) → o
 * app fica sem essa prova (e os dispatches mais antigos não contam para ele). Devolve { virtuais, registro }: os runs
 * "virtuais" levam só os jobs dos apps provados (mais o "mudancas") e entram no decidirProva como reaproveitados.
 */
export async function provasPorConteudo({ raiz, config, provedor, workflow, branch, sha, considerados = [], etapas = [], remoto = null, log = () => {}, comparar = compararConteudo }) {
  const registro = { workflow: null, consultados: 0, apps: {}, recusados: {} };
  if (!considerados.length || typeof provedor?.runsDaBranch !== 'function') return { virtuais: [], registro };
  const lista = await provedor.runsDaBranch({ workflow, branch });
  if (!lista.ok) {
    registro.erro = lista.motivo || 'consulta falhou';
    log(`conteúdo: não consegui listar os dispatches da branch (${registro.erro}); os apps seguem sem essa prova`);
    return { virtuais: [], registro };
  }
  const runs = ordenarRuns((lista.runs || []).filter((r) => r && r.id != null && r.evento === 'workflow_dispatch' && r.status === 'completed' && r.sha && r.sha !== sha));
  registro.consultados = runs.length;
  let arquivo = null;
  if (typeof provedor.workflowExiste === 'function') {
    const w = await provedor.workflowExiste(workflow);
    if (w?.ok && w.arquivo) arquivo = w.arquivo;
  }
  registro.workflow = arquivo || WORKFLOWS_PADRAO;
  const cache = new Map();
  const jobsDe = async (r) => {
    if (!cache.has(r.id)) {
      const l = Array.isArray(r.jobs) && r.jobs.length ? { ok: true, jobs: r.jobs } : await provedor.lerJobs(r.id, null);
      cache.set(r.id, l?.ok ? comMeta(l.jobs, r.id) : null);
    }
    return cache.get(r.id);
  };
  const provados = new Map();
  for (const app of considerados) {
    let decidido = false;
    for (const r of runs) {
      const jobs = await jobsDe(r);
      const rotulo = `#${r.numero ?? r.id} (${curto(r.sha)})`;
      if (!jobs) {
        registro.recusados[app] = `não consegui ler os jobs do dispatch ${rotulo}`;
        decidido = true;
        break;
      }
      const doApp = jobs.filter((j) => j.app === app);
      if (!doApp.length || doApp.every((j) => j.conclusao === 'skipped')) continue;
      decidido = true;
      if (r.conclusao !== 'success') {
        registro.recusados[app] = `o dispatch mais novo que testou ${app}, ${rotulo}, terminou ${r.conclusao || r.status || '?'}`;
        break;
      }
      if (estadoDoApp({ ...r, jobs }, app, { config, etapas }) !== 'ok') {
        registro.recusados[app] = `o dispatch ${rotulo} não tem todos os jobs de ${app} em success`;
        break;
      }
      const c = comparar(raiz, config, { app, sha: r.sha, head: sha, workflow: arquivo, remoto });
      if (!c.ok) {
        registro.recusados[app] = `${c.motivo} (dispatch ${rotulo})`;
        break;
      }
      registro.apps[app] = { app, run: r.id, numero: r.numero ?? null, url: r.url || null, sha: r.sha, hash: c.hash, hashHead: c.hashHead, hashWorkflow: c.hashWorkflow, workflow: c.workflow, caminhos: c.caminhos };
      if (!provados.has(r.id)) provados.set(r.id, { run: r, jobs, apps: [] });
      provados.get(r.id).apps.push(app);
      break;
    }
    if (!decidido) registro.recusados[app] = 'nenhum workflow_dispatch concluído da branch testou o app';
  }
  for (const [app, m] of Object.entries(registro.apps)) log(`conteúdo: ${app} provado pelo dispatch #${m.numero ?? m.run} (${curto(m.sha)}), mesmo conteúdo ${m.hash.slice(0, 12)}`);
  for (const [app, m] of Object.entries(registro.recusados)) log(`conteúdo: ${app} sem prova por conteúdo (${m})`);
  const virtuais = [...provados.values()].map(({ run, jobs, apps }) => ({ ...run, tentativa: run.tentativa || 1, jobs: jobs.filter((j) => apps.includes(j.app) || String(j.nome || '').trim() === 'mudancas'), origem: 'reaproveitado', porConteudo: true, appsConteudo: apps }));
  return { virtuais, registro };
}

// --------------------------------------------------------------------------- etapa sintética teste-ci

function execFileAsync(cmd, args, { cwd, timeoutMs = 120000, env } = {}) {
  const inicio = Date.now();
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...(env || {}) } }, (err, stdout, stderr) => {
      resolve({ exit: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') + (err && err.code === 'ENOENT' ? ` ENOENT: ${cmd}` : ''), duracaoMs: Date.now() - inicio });
    });
  });
}

/** Arquivos de .github/workflows no HEAD (caminho e blob): o run executa o yml do próprio branch (S2). */
export function workflowsDoHead(raiz) {
  const r = git(raiz, ['ls-tree', '-r', 'HEAD', '--', '.github/workflows']);
  if (r.exit !== 0 || !r.out) return [];
  return r.out.split('\n').filter(Boolean).map((l) => {
    const m = /^\d+ blob ([0-9a-f]+)\t(.+)$/.exec(l);
    return m ? { caminho: m[2], blob: m[1] } : null;
  }).filter(Boolean);
}

async function carregarProvedor(nome, opcoes) {
  const fabrica = PROVEDORES[nome];
  if (!fabrica) return null;
  const m = await fabrica();
  return m.criarProvedor(opcoes);
}

/**
 * Contexto do CI para um gate: a etapa sintética "teste-ci" (com executor) e o resolvedor das etapas ci:true, que
 * compartilham o resultado do run. `deps` injeta provedor, git, shAsync, dormir e agora (os testes usam falsos).
 */
export function criarContextoCI({ raiz, estado, config, base, dirEv, rotulo, plano, avisos = [], deps = {} }) {
  const ci = config.ci;
  let resultadoRun = null; // preenchido pelo executor; lido pelo resolvedor
  const arquivoCi = path.join(dirEv, 'ci.json');
  const arquivoRel = path.relative(raiz, arquivoCi);

  const etapa = {
    nome: NOME_TESTE_CI,
    comando: `ci:${ci.provedor}:${ci.workflow}`,
    obrigatoria: true,
    custo: 'alto',
    pesada: false,
    cacheavel: false,
    sintetica: true,
    timeoutSegundos: Math.max(60, (Number(ci.timeoutMin) || 30) * 60 + 300),
    executor: () => executarTesteCI(),
  };

  async function executarTesteCI() {
    const inicio = Date.now();
    const narrativa = [];
    const log = (l) => narrativa.push(`[${new Date().toISOString().slice(11, 19)}] ${l}`);
    const sha = gitHead(raiz);
    const branch = gitBranchAtual(raiz);
    const remoto = config.git?.remoto || 'origin';
    const repo = deps.repo !== undefined ? deps.repo : repoDoRemoto(raiz, config);
    const dados = { versao: 1, provedor: ci.provedor, workflow: ci.workflow, repo, rotulo, task: estado?.id || null, em: agoraISO(), modo: plano?.modo || 'ci', status: null, fase: 'inicio', motivo: null, classe: null, sha, branch, base, remoto, workflows: workflowsDoHead(raiz), apps: null, segredos: null, push: null, disparo: null, run: null, jobs: [], porEtapa: {}, naoMapeados: [], logFalhas: null, espera: null, origemRun: null, tentativa: null, runs: [], avisos: [...avisos] };
    const gravar = () => {
      try {
        gravarJSON(arquivoCi, dados);
      } catch {
        /* melhor esforço: a prova principal é o gate.json */
      }
    };
    const fim = (status, { motivo, classe = null, resumoFalha, erroConfig } = {}) => {
      dados.status = status;
      dados.motivo = motivo || null;
      dados.classe = classe;
      dados.duracaoMs = Date.now() - inicio;
      gravar();
      resultadoRun = status === CI_INDISPONIVEL ? null : dados;
      // sha = HEAD local no início do gate; headSha = o que o provedor diz que o run testou (M1): os dois têm de bater.
      const resumo = { sha, headSha: dados.run?.sha ?? null, runId: dados.run?.id ?? null, runNumero: dados.run?.numero ?? null, url: dados.run?.url ?? null, conclusao: dados.run?.conclusao ?? null, apps: dados.apps?.apps || [], jobs: dados.jobs.length, arquivo: arquivoRel, fase: dados.fase, ...(dados.origemRun ? { origemRun: dados.origemRun, tentativa: dados.tentativa, runs: dados.runs.map((r) => ({ id: r.id, numero: r.numero, url: r.url, sha: r.sha, evento: r.evento, tentativa: r.tentativa, origem: r.origem, ...(r.porConteudo ? { porConteudo: true } : {}) })) } : {}), ...(dados.criterio === 'conteudo' ? { criterio: 'conteudo', conteudo: provasDoConteudo(dados) } : {}), ...(classe ? { classe } : {}) };
      return { exit: status === 'ok' ? 0 : 1, saida: narrativa.join('\n'), duracaoMs: dados.duracaoMs, timeout: false, status, motivo, classe, ci: { resumo, arquivo: arquivoRel }, resumoFalha, ...(erroConfig ? { erroConfig } : {}) };
    };
    const indisponivel = (fase, texto, classe) => {
      dados.fase = fase;
      log(`CI indisponível (${classe || 'infra'}): ${texto}`);
      return fim(CI_INDISPONIVEL, { motivo: `CI indisponível em ${fase}: ${texto}`, classe: classe || 'infra', resumoFalha: `${texto}\nIsto é infraestrutura do CI, não um defeito do código: repita o gate ou rode com WF_GATE_CI_FALLBACK=local (ci.fallback).` });
    };
    // Erro de configuração do repositório/workflow (permissão, input, hook): decisão do humano, nunca finding de código.
    const erroDeConfig = (fase, texto, instrucao) => {
      dados.fase = fase;
      log(`erro de config em ${fase}: ${texto}`);
      return fim('falhou', { motivo: `erro de config em ${fase}: ${texto}`, classe: 'config', erroConfig: `${texto}: ${instrucao}`, resumoFalha: `${texto}\n${instrucao}` });
    };
    let provedor = null;
    let runId = null;
    // Ctrl+C ou kill no meio da espera: cancela o run para não gastar minutos do Actions à toa (B4).
    const aoSinal = () => {
      if (runId != null && provedor && typeof provedor.cancelarSync === 'function') provedor.cancelarSync(runId);
    };
    const registrarSinal = deps.registrarSinal || ((fn) => {
      process.once('SIGINT', fn);
      process.once('SIGTERM', fn);
      return () => {
        process.off('SIGINT', fn);
        process.off('SIGTERM', fn);
      };
    });
    const soltarSinal = registrarSinal(aoSinal);
    try {
      // 1) apps alterados
      dados.fase = 'apps';
      dados.apps = appsAlterados(raiz, config, base);
      dados.apps.input = dados.apps.todos ? 'todos' : dados.apps.apps.join(',');
      log(`apps: ${dados.apps.input} (${dados.apps.motivo})`);

      // 2) segredos local, ANTES do push
      dados.fase = 'segredos';
      const cmdSegredos = resolverComando(config, '@segredos');
      if (cmdSegredos) {
        const cmd = cmdSegredos.replaceAll('{base}', base);
        const rodar = deps.shAsync || shAsync;
        const r = await rodar(cmd, { cwd: raiz, timeoutSegundos: 300, env: { WF_BASE: base, WF_TASK: estado?.id || '' } });
        dados.segredos = { comando: cmd, exit: r.exit, duracaoMs: r.duracaoMs };
        if (r.exit !== 0) {
          log(`segredos: FALHOU (exit ${r.exit}); push não feito`);
          return fim('falhou', { motivo: 'segredo detectado antes do push (comandos.segredos): push não feito', resumoFalha: `${ultimasLinhas(r.saida, 40)}\nO push não foi feito. Remova o segredo (e reescreva o commit, se preciso) antes de repetir.` });
        }
        log('segredos: ok');
      } else {
        log('segredos: comandos.segredos não configurado (sem checagem antes do push)');
      }

      // 3) provedor disponível ANTES do push (B4): sem gh/auth, não adianta publicar o branch.
      dados.fase = 'disponibilidade';
      provedor = deps.provedor || (await carregarProvedor(ci.provedor, { raiz, config, repo, gh: deps.gh, dormir: deps.dormir, agora: deps.agora }));
      if (!provedor) return fim('falhou', { motivo: `provedor desconhecido: ${ci.provedor}`, resumoFalha: `ci.provedor "${ci.provedor}" não é suportado (só ${Object.keys(PROVEDORES).join(', ')}).` });
      const disp = await provedor.disponivel();
      if (!disp.ok) return indisponivel('disponibilidade', disp.motivo, disp.classe);
      log(`${ci.provedor}: ${disp.detalhe || 'disponível'}${repo ? ` (repo ${repo})` : ''}`);

      // 4) runs do mesmo commit (0.8.0): a prova que já existe é reaproveitada (sem push e sem disparo), o run em
      // andamento é anexado e o run que falhou numa verificação anterior repete só os jobs reprovados (gh run rerun
      // --failed), no máximo ci.repetirFalhas vez(es) por commit. Só falta → dispara só os apps que faltam. Um run
      // disparado NESTE gate nunca é repetido aqui: falhou, o veredito é o da falha (rerun só numa próxima verificação).
      const etapasCI = [...(plano?.etapasCI || [])];
      const nomesCI = (config.gate?.etapas || []).map((e) => e.nome).filter((n) => etapasCI.includes(grupoDaEtapa(n)));
      const consideradosApps = mapearJobs([], { config, apps: dados.apps, etapas: [] }).considerados;
      const repetirFalhas = Number.isInteger(ci.repetirFalhas) ? ci.repetirFalhas : 1;
      const env = deps.env || process.env;
      const novoForcado = String(env.WF_GATE_CI_NOVO || '') === '1';
      const reaproveitar = ci.reaproveitar !== false && !novoForcado && typeof provedor.runsDoSha === 'function';
      dados.reaproveitamento = { ativo: reaproveitar, motivo: reaproveitar ? 'runs do mesmo SHA consultados antes do push' : novoForcado ? 'WF_GATE_CI_NOVO=1: disparo novo forçado' : ci.reaproveitar === false ? 'ci.reaproveitar = false' : 'provedor sem consulta de runs', consultados: 0, aceitos: [], rejeitados: [], decisoes: [] };
      const conhecidos = new Map(); // id → run (com jobs, tentativa e origem)
      const semRerun = new Set(); // runs disparados ou já repetidos neste gate
      const anexados = new Set();
      // Prazo ÚNICO da teste-ci (revisão 3): anexar, rerun, a espera da PR, o localizar e o disparo dividem o
      // ci.timeoutMin, em vez de cada espera ter o seu.
      const relogio = deps.agora || Date.now;
      const dormirFn = deps.dormir || ((t) => new Promise((r) => setTimeout(r, t)));
      const timeoutMs = (Number(ci.timeoutMin) || 30) * 60000;
      const prazo = relogio() + timeoutMs;
      const resta = () => prazo - relogio();
      // Run anexado que estourou o prazo numa verificação anterior deste SHA (queued sem runner, esperando aprovação):
      // não é anexado de novo; os apps dele ficam sem prova e são disparados (revisão 4).
      dados.anexadosTravados = travadosDoSha(raiz, estado, sha);
      for (const id of dados.anexadosTravados) anexados.add(id);
      if (dados.anexadosTravados.length) log(`runs anexados que travaram antes neste SHA (não anexa de novo): ${dados.anexadosTravados.join(', ')}`);
      let disparadoId = null;
      let rerunFeito = null;
      if (reaproveitar) {
        dados.fase = 'reaproveitar';
        const achados = await provedor.runsDoSha({ workflow: ci.workflow, branch, sha });
        if (!achados.ok) log(`runs do mesmo SHA: consulta falhou (${achados.motivo}); segue com disparo novo`);
        dados.reaproveitamento.consultados = achados.consultados ?? (achados.runs || []).length;
        for (const run of achados.runs || []) {
          const a = aceitarRunDoSha(raiz, config, run, sha, estado);
          const resumoRun = { id: run.id, numero: run.numero, evento: run.evento, status: run.status, conclusao: run.conclusao, tentativa: run.tentativa || 1, url: run.url };
          if (a.ok) {
            conhecidos.set(run.id, { ...run, tentativa: run.tentativa || 1, jobs: comMeta(run.jobs, run.id), origem: 'reaproveitado' });
            dados.reaproveitamento.aceitos.push(resumoRun);
          } else {
            dados.reaproveitamento.rejeitados.push({ ...resumoRun, motivo: a.motivo });
            // Rejeitado como prova, mas do mesmo SHA e de evento que prova: concluído sem success (ou ilegível), ele é
            // uma barreira: nada mais antigo que ele vale (decidirProva). Na dúvida, roda de novo.
            if (run.sha === sha && ['workflow_dispatch', 'pull_request'].includes(run.evento) && run.status === 'completed' && (run.erroLeitura || run.conclusao !== 'success')) conhecidos.set(run.id, { ...run, tentativa: run.tentativa || 1, jobs: [], soBarreira: true, origem: 'barreira' });
          }
        }
        log(`runs do mesmo SHA (${curto(sha)}): ${dados.reaproveitamento.aceitos.length} aceito(s), ${dados.reaproveitamento.rejeitados.length} rejeitado(s)`);
      } else log(`reaproveitamento desligado: ${dados.reaproveitamento.motivo}`);

      // 0.9.0, critério "conteudo": dispatches verdes de commits anteriores da mesma branch provam os apps de mesmo
      // conteúdo. Só com o reaproveitamento ligado (WF_GATE_CI_NOVO=1 e ci.reaproveitar=false desligam também este).
      const criterio = criterioDe(config);
      if (criterio === 'conteudo') dados.criterio = criterio;
      if (reaproveitar && criterio === 'conteudo') {
        dados.fase = 'conteudo';
        // App já provado por um run do mesmo SHA não precisa da busca (nem das chamadas ao gh).
        const doSha = [...conhecidos.values()].filter((r) => !r.soBarreira);
        const faltam = consideradosApps.filter((app) => !doSha.some((r) => estadoDoApp(r, app, { config, etapas: nomesCI }) === 'ok'));
        const pc = faltam.length ? await provasPorConteudo({ raiz, config, provedor, workflow: ci.workflow, branch, sha, considerados: faltam, etapas: nomesCI, remoto, log }) : { virtuais: [], registro: { workflow: null, consultados: 0, apps: {}, recusados: {}, motivo: 'todos os apps já provados por runs do mesmo SHA' } };
        dados.conteudo = pc.registro;
        for (const v of pc.virtuais) if (!conhecidos.has(v.id)) conhecidos.set(v.id, v);
      }

      const pollMs = Math.max(1000, (Number(ci.pollSegundos) || 15) * 1000);
      // Espera um run (nosso, de rerun ou anexado) e lê os jobs. { fim } quando a prova não sai deste run.
      const esperar = async (run, { nosso, tentativaMinima = 0 }) => {
        dados.fase = 'espera';
        let leituras = 0;
        dados.run = { ...(dados.run || {}), ...run };
        const esperado = resta() <= 0 ? { ok: false, timeout: true, run: null } : await provedor.esperarRun(run.id, {
          timeoutMs: resta(),
          pollMs,
          sha,
          ...(tentativaMinima ? { tentativaMinima } : {}),
          aoAtualizar: (r) => {
            leituras += 1;
            dados.run = { ...dados.run, ...r };
            gravar();
          },
        });
        dados.espera = { pollSegundos: pollMs / 1000, leituras, timeoutMin: timeoutMs / 60000, estourou: !!esperado.timeout };
        if (esperado.run) dados.run = { ...dados.run, ...esperado.run };
        if (esperado.timeout) {
          // Run anexado não é nosso (ex.: o da PR): nunca o cancelamos.
          if (nosso) await provedor.cancelar(run.id);
          else if (anexados.has(run.id) && !dados.anexadosTravados.includes(run.id)) dados.anexadosTravados.push(run.id);
          return { fim: indisponivel('espera', `o run não terminou em ${timeoutMs / 60000} min, o prazo da teste-ci (${nosso ? 'cancelado' : 'run anexado: não cancelado; a próxima verificação não o anexa de novo e dispara os apps que faltam'}): ${run.url}`, 'timeout') };
        }
        if (!esperado.ok) return { fim: indisponivel('espera', esperado.motivo, esperado.classe) };
        if (!dados.run.sha || dados.run.sha !== sha) return { fim: indisponivel('espera', `o run lido (#${dados.run.numero}) tem headSha ${curto(dados.run.sha)}, diferente do HEAD ${curto(sha)}: não prova este commit`, 'sha-divergente') };
        // jobs → etapas (antes de julgar um run "cancelled": um job que estourou timeout-minutes também sai cancelled)
        dados.fase = 'leitura';
        const lidos = await provedor.lerJobs(run.id, esperado.run);
        if (!lidos.ok) return { fim: indisponivel('leitura', lidos.motivo, lidos.classe) };
        return { run: { ...run, ...esperado.run, tentativa: esperado.run?.tentativa || run.tentativa || 1, jobs: comMeta(lidos.jobs, run.id) } };
      };

      // Disparo novo (o fluxo da 0.7.0): push, disparo, localizar o run deste SHA (M2) e esperar.
      const dispararEsperar = async (appsInput) => {
        dados.fase = 'push';
        if (!branch || branch === 'HEAD' || (config.git?.branchesProtegidos || []).includes(branch) || branch === config.git?.branchBase) {
          return { fim: fim('falhou', { motivo: `push recusado: "${branch || 'HEAD'}" não é um branch de task`, resumoFalha: 'O modo CI só faz push do branch da task (nunca da base nem de um branch protegido).' }) };
        }
        const remotoAntes = git(raiz, ['rev-parse', '--verify', '--quiet', `${remoto}/${branch}`]).out || null;
        const argsPush = ['push', '--set-upstream', remoto, `${branch}:${branch}`];
        const push = deps.git ? await deps.git(argsPush) : await execFileAsync('git', argsPush, { cwd: raiz, timeoutMs: 180000, env: { GIT_TERMINAL_PROMPT: '0' } });
        dados.push = { comando: `git ${argsPush.join(' ')}`, exit: push.exit, duracaoMs: push.duracaoMs };
        if (push.exit !== 0) {
          const texto = ultimasLinhas(`${push.stdout || ''}\n${push.stderr || ''}`, 5).trim();
          if (/\[remote rejected\]|pre-push hook declined|hook declined|protected branch/i.test(texto)) return { fim: erroDeConfig('push', `push recusado pelo remoto ou por um hook (${texto})`, 'confira a proteção do branch no GitHub e os hooks do repositório; o Workflow IA só faz push do branch da task') };
          if (/permission (?:to \S+ )?denied|\b403\b|not permitted|could not read Username|Authentication failed|Repository not found/i.test(texto)) return { fim: erroDeConfig('push', `sem permissão de push (${texto})`, 'autentique o git neste remoto (gh auth setup-git ou credencial) com permissão de escrita no repositório') };
          if (/non-fast-forward|fetch first|\[rejected\]/i.test(texto)) return { fim: indisponivel('push', `push rejeitado (${texto}); rode "git pull --ff-only ${remoto} ${branch}" ou rebase e repita`, 'remoto-atras') };
          return { fim: indisponivel('push', `push falhou: ${texto}`, classificarIndisponivel(texto) || 'rede') };
        }
        log(`push: ${remoto} ${branch} (${curto(sha)})`);

        // PR aberta: o push acabou de disparar o run de pull_request (synchronize) deste SHA. Anexar a ele evita um
        // segundo run completo (o "reaproveitar" desse run não acha a verificação, que ainda nem disparou).
        // Base não contida (aviso do pré-voo): o run da PR testa outro código e seria recusado; não adianta esperar.
        const baseAndou = (dados.avisos || []).some((a) => /a base andou/.test(a));
        if (reaproveitar && remotoAntes !== sha && !baseAndou && typeof provedor.prAberta === 'function') {
          const pr = await provedor.prAberta({ branch });
          if (pr.ok && pr.numero != null) {
            dados.fase = 'aguardar-pr';
            const limite = relogio() + Math.min(90000, Math.max(0, resta()));
            for (;;) {
              // Consulta enxuta: só pull_request, só os 2 mais novos.
              const achados = await provedor.runsDoSha({ workflow: ci.workflow, branch, sha, evento: 'pull_request', limite: 2 });
              const daPr = (achados.runs || []).find((r) => r.evento === 'pull_request' && !conhecidos.has(r.id) && aceitarRunDoSha(raiz, config, r, sha, estado).ok);
              if (daPr) {
                log(`PR #${pr.numero} aberta: o push criou o run #${daPr.numero} (pull_request) deste SHA; anexa a ele em vez de disparar`);
                return { anexar: { ...daPr, tentativa: daPr.tentativa || 1, jobs: comMeta(daPr.jobs, daPr.id), origem: 'anexado' } };
              }
              if (relogio() >= limite) break;
              await dormirFn(10000);
            }
            log(`PR #${pr.numero} aberta, mas nenhum run de pull_request deste SHA apareceu em 90 s: dispara`);
          }
        }

        // Os runs que já existiam antes entram numa lista de exclusão: o nosso é o mais novo fora dela (M2).
        dados.fase = 'dispatch';
        const disparoEm = Date.now();
        const antes = typeof provedor.listarRuns === 'function' ? await provedor.listarRuns({ workflow: ci.workflow, branch }) : { ok: false, ids: [] };
        const ignorarIds = new Set(antes.ok ? antes.ids : []);
        for (const id of conhecidos.keys()) ignorarIds.add(id);
        const disparo = await provedor.disparar({ workflow: ci.workflow, ref: branch, apps: appsInput });
        dados.disparo = { comando: disparo.comando, em: agoraISO(), exit: disparo.ok ? 0 : 1, apps: appsInput, runsAnteriores: [...ignorarIds] };
        if (!disparo.ok) {
          if (/HTTP 422|Unexpected inputs|unexpected inputs/i.test(disparo.saida || disparo.motivo || '')) return { fim: erroDeConfig('dispatch', `o workflow "${ci.workflow}" não aceita o input "apps" (${disparo.motivo})`, 'o workflow precisa de workflow_dispatch com o input apps (veja a proposta de "wf ci gerar")') };
          return { fim: indisponivel('dispatch', disparo.motivo, disparo.classe) };
        }
        log(`disparo: ${disparo.comando}`);

        dados.fase = 'localizar-run';
        const achado = await provedor.localizarRun({ workflow: ci.workflow, branch, sha, desdeMs: disparoEm - 60000, ignorarIds, timeoutMs: Math.min(180000, Math.max(1000, resta())) });
        if (!achado.ok) return { fim: indisponivel('localizar-run', achado.motivo, achado.classe || 'run-nao-encontrado') };
        if (achado.run.sha && achado.run.sha !== sha) return { fim: indisponivel('localizar-run', `o run encontrado (#${achado.run.numero}) é do SHA ${curto(achado.run.sha)}, não do HEAD ${curto(sha)}`, 'sha-divergente') };
        dados.run = achado.run;
        runId = achado.run.id;
        log(`run #${achado.run.numero} (${achado.run.id}): ${achado.run.url}`);
        const e = await esperar(achado.run, { nosso: true });
        if (e.fim) return e;
        const m = mapearJobs(e.run.jobs, { config, apps: dados.apps, etapas: nomesCI });
        const considerados = new Set(m.considerados);
        const jobReprovou = e.run.jobs.some((j) => j.app && considerados.has(j.app) && ['failure', 'timed_out'].includes(j.conclusao));
        if (e.run.conclusao === 'cancelled' && !jobReprovou && !m.naoMapeados.length) {
          // Cancelamento vindo de fora (concurrency, humano, o nosso cancelar) sem nenhum job reprovado: não é prova (S1).
          return { fim: indisponivel('espera', `run cancelado sem nenhum job reprovado: ${achado.run.url}`, 'cancelado') };
        }
        return { run: { ...e.run, origem: 'disparado' } };
      };

      let usar = null;
      for (let rodada = 0; rodada < 8 && !usar; rodada += 1) {
        const d = decidirProva({ runs: [...conhecidos.values()], considerados: consideradosApps, inputTodos: dados.apps.input, config, etapas: nomesCI, repetirFalhas, podeDisparar: disparadoId == null, semRerun, anexados, preferido: disparadoId });
        dados.reaproveitamento.decisoes.push({ acao: d.acao, motivo: d.motivo, ...(d.run ? { run: d.run.id } : {}), ...(d.runs ? { runs: d.runs.map((r) => r.id) } : {}), ...(d.apps ? { apps: d.apps } : {}) });
        log(`decisão: ${d.acao} (${d.motivo})`);
        if (d.acao === 'anexar') {
          anexados.add(d.run.id);
          // Falha de um run anexado é falha NOVA (deste gate): o rerun fica para uma próxima verificação.
          semRerun.add(d.run.id);
          // tentativaMinima = a tentativa listada: a leitura pede o attempt (um anexado pode ser um rerun em andamento).
          const e = await esperar(d.run, { nosso: false, tentativaMinima: d.run.tentativa || 1 });
          if (e.fim) return e.fim;
          conhecidos.set(d.run.id, { ...e.run, origem: 'anexado' });
        } else if (d.acao === 'rerun-falhas') {
          for (const r of d.runs) {
            semRerun.add(r.id);
            dados.fase = 'rerun';
            const jobsFalhos = (r.jobs || []).filter((j) => ['failure', 'timed_out', 'cancelled'].includes(j.conclusao)).map((j) => j.nome);
            const rr = await provedor.rerunFalhas(r.id);
            if (!rr.ok) {
              if (['rede', 'cota', 'sem-auth', 'github-fora', 'gh-ausente'].includes(rr.classe)) return indisponivel('rerun', rr.motivo, rr.classe);
              log(`rerun --failed do run #${r.numero} recusado (${rr.motivo}): a falha fica como está`);
              dados.rerunRecusado = { run: r.id, numero: r.numero ?? null, motivo: rr.motivo, dica: /403|not accessible|permission/i.test(rr.motivo || '') ? 'o token do gh precisa de actions:write no repositório' : /month|30 days|too old/i.test(rr.motivo || '') ? 'o GitHub só repete runs com até 30 dias' : null };
              continue;
            }
            log(`rerun: ${rr.comando} (tentativa ${r.tentativa || 1} → ${(r.tentativa || 1) + 1}; jobs: ${jobsFalhos.join(', ') || '?'})`);
            // Só o run de workflow_dispatch é "nosso" (cancelável no timeout e no SIGINT); o da PR, nunca.
            const nosso = r.evento === 'workflow_dispatch';
            if (nosso) runId = r.id;
            const e = await esperar(r, { nosso, tentativaMinima: (r.tentativa || 1) + 1 });
            if (e.fim) return e.fim;
            rerunFeito = { run: r.id, comando: rr.comando, de: r.tentativa || 1, para: e.run.tentativa, jobs: jobsFalhos };
            conhecidos.set(r.id, { ...e.run, origem: 'rerun-falhas' });
          }
        } else if (d.acao === 'disparar') {
          const e = await dispararEsperar(d.apps);
          if (e.fim) return e.fim;
          if (e.anexar) {
            // O run da PR entra como conhecido em andamento: a próxima decisão o anexa (sem disparo neste passo).
            conhecidos.set(e.anexar.id, e.anexar);
            dados.reaproveitamento.aceitos.push({ id: e.anexar.id, numero: e.anexar.numero, evento: e.anexar.evento, status: e.anexar.status, conclusao: e.anexar.conclusao, tentativa: e.anexar.tentativa, url: e.anexar.url, depoisDoPush: true });
            continue;
          }
          disparadoId = e.run.id;
          semRerun.add(e.run.id);
          conhecidos.set(e.run.id, e.run);
        } else usar = d;
      }
      if (!usar) return indisponivel('interno', 'a decisão sobre os runs do mesmo SHA não convergiu', 'erro-interno');

      // 5) jobs combinados → etapas
      dados.fase = 'leitura';
      const escolhidos = usar.escolhidos;
      dados.run = { ...escolhidos[0] };
      delete dados.run.jobs;
      delete dados.run.origem;
      delete dados.run.appsConteudo;
      dados.runs = escolhidos.map((r) => ({ id: r.id, atualizadoEm: r.atualizadoEm || null, numero: r.numero, url: r.url, sha: r.sha, evento: r.evento || null, tentativa: r.tentativa || 1, conclusao: r.conclusao, apps: usar.appsDoRun[r.id] || [], origem: r.origem, ...(r.porConteudo ? { porConteudo: true } : {}) }));
      dados.origemRun = rerunFeito && escolhidos.some((r) => r.id === rerunFeito.run) ? 'rerun-falhas' : escolhidos.some((r) => r.origem === 'disparado') ? 'disparado' : escolhidos.some((r) => r.origem === 'anexado') ? 'anexado' : 'reaproveitado';
      dados.tentativa = dados.run.tentativa || 1;
      if (rerunFeito) dados.rerun = rerunFeito;
      if (dados.origemRun !== 'disparado') log(`prova do CI ${dados.origemRun}: ${dados.runs.map((r) => `run #${r.numero} (${r.evento || '?'}, tentativa ${r.tentativa}) ${r.url}`).join('; ')}`);
      dados.jobs = usar.jobs;
      const mapa = mapearJobs(dados.jobs, { config, apps: dados.apps, etapas: nomesCI });
      dados.porEtapa = mapa.porEtapa;
      dados.naoMapeados = mapa.naoMapeados;
      dados.infra = mapa.infra;
      const reprovados = dados.jobs.filter((j) => j.conclusao && j.conclusao !== 'success' && j.conclusao !== 'skipped');
      if (reprovados.length) {
        const comandos = [];
        const recortes = {};
        for (const r of escolhidos) {
          const doRun = reprovados.filter((j) => j.runId === r.id).slice(0, 5);
          if (!doRun.length) continue;
          const lf = await provedor.logFalhas(r.id, doRun);
          if (lf?.comando) comandos.push(lf.comando);
          Object.assign(recortes, lf?.recortes || {});
        }
        dados.logFalhas = { comando: comandos.join(' && '), recortes };
      }
      dados.fase = 'concluido';
      const rotuloRun = escolhidos.length > 1 ? `runs ${escolhidos.map((r) => `#${r.numero}`).join(' + ')}` : `run #${dados.run.numero}`;
      log(`${rotuloRun} concluído: ${escolhidos.map((r) => r.conclusao).join(', ')}; jobs: ${dados.jobs.length}; etapas lidas: ${nomesCI.join(', ') || 'nenhuma'}`);
      for (const [n, r] of Object.entries(mapa.porEtapa)) log(`  ${n}: ${r.status} (${r.motivo})`);
      if (mapa.naoMapeados.length) log(`  jobs reprovados fora das etapas deste gate: ${mapa.naoMapeados.map((j) => `${j.nome} (${j.conclusao})`).join(', ')}`);
      // Veredito da teste-ci (A1): runs success → ok. Run não-success → ok só se TODO job reprovado está numa etapa deste
      // gate (a falha aparece uma vez, na etapa certa); job reprovado que ninguém lê, "mudancas" reprovado ou "ci-ok"
      // reprovado sem nenhuma falha mapeada reprovam a teste-ci (fail-closed).
      const okRun = escolhidos.every((r) => r.conclusao === 'success');
      const mudancasRuim = mapa.infra.some((j) => j.nome === 'mudancas' && j.conclusao !== 'success');
      const ciOkRuim = mapa.infra.some((j) => j.nome === 'ci-ok' && j.conclusao && j.conclusao !== 'success');
      const motivosTc = [];
      if (mapa.naoMapeados.length) motivosTc.push(`${mapa.naoMapeados.map((j) => `${j.nome} (${j.conclusao})`).join(', ')} fora das etapas deste gate`);
      if (mudancasRuim) motivosTc.push('o job "mudancas" não concluiu success');
      if (ciOkRuim && !mapa.falhasMapeadas && !mapa.naoMapeados.length) motivosTc.push('o job "ci-ok" reprovou sem nenhuma falha mapeada numa etapa');
      const sobreRerun = dados.rerunRecusado ? `; rerun --failed do run #${dados.rerunRecusado.numero ?? dados.rerunRecusado.run} recusado pelo GitHub (${dados.rerunRecusado.motivo}${dados.rerunRecusado.dica ? `: ${dados.rerunRecusado.dica}` : ''}), a falha anterior ficou como prova` : '';
      if (okRun || !motivosTc.length) return fim('ok', { motivo: (okRun ? `${rotuloRun} success (${dados.jobs.length} jobs${dados.origemRun !== 'disparado' ? `, ${dados.origemRun}` : ''})` : `${rotuloRun} ${dados.run.conclusao}; cada falha está na etapa correspondente`) + sobreRerun });
      const recorte = Object.values(dados.logFalhas?.recortes || {}).join('\n---\n');
      return fim('falhou', { motivo: `${rotuloRun} ${dados.run.conclusao}: ${motivosTc.join('; ')}${sobreRerun}`, resumoFalha: `${dados.run.url}\n${motivosTc.join('\n')}\n${ultimasLinhas(recorte, 40)}` });
    } catch (err) {
      // Exceção ou JSON inesperado: infraestrutura, nunca finding de código; cancela o run se ele já existe (B4).
      if (runId != null && provedor) {
        try {
          await provedor.cancelar(runId);
        } catch {
          /* melhor esforço */
        }
      }
      return indisponivel(dados.fase || 'interno', `erro interno ao falar com o CI: ${err?.message || err}`, 'erro-interno');
    } finally {
      soltarSinal();
    }
  }

  /** Etapa ci:true lida do run (origem 'ci'): sem vaga, sem executar. null quando a teste-ci não trouxe resultado. */
  function resolver(e, porNome) {
    const tc = porNome.get(NOME_TESTE_CI);
    if (!tc || !resultadoRun || !resultadoRun.porEtapa) return null;
    const r = resultadoRun.porEtapa[e.nome];
    if (!r) return null;
    // Etapa provada por um run só (jobs combinados de runs diferentes, 0.8.0): o run citado é o dela.
    const idsDaEtapa = [...new Set((resultadoRun.jobs || []).filter((j) => r.jobs.includes(j.nome) && j.runId != null).map((j) => j.runId))];
    const runDaEtapa = idsDaEtapa.length === 1 ? (resultadoRun.runs || []).find((x) => x.id === idsDaEtapa[0]) : null;
    const run = runDaEtapa ? { ...resultadoRun.run, ...runDaEtapa } : resultadoRun.run || {};
    const logAbs = path.join(dirEv, `${nomeArquivoEtapa(e.nome)}.log`);
    const jobs = (resultadoRun.jobs || []).filter((j) => r.jobs.includes(j.nome));
    const recortes = Object.entries(resultadoRun.logFalhas?.recortes || {}).filter(([nome]) => r.jobs.includes(nome));
    const linhas = [
      `# etapa ${e.nome} lida do CI (${resultadoRun.provedor}, workflow ${resultadoRun.workflow}${resultadoRun.repo ? `, repo ${resultadoRun.repo}` : ''})`,
      `# run: ${run.url || '?'} (#${run.numero ?? '?'}, id ${run.id ?? '?'})`,
      `# sha local: ${resultadoRun.sha}  headSha do run: ${run.sha || '?'}  branch: ${resultadoRun.branch}  conclusão do run: ${run.conclusao || '?'}`,
      `# apps: ${resultadoRun.apps?.input || '?'}`,
      `# status da etapa: ${r.status} (${r.motivo})`,
      '',
      '| job | conclusão | duração | url |',
      '| --- | --- | --- | --- |',
      ...jobs.map((j) => `| ${j.nome} | ${j.conclusao || j.status || '?'} | ${Math.round((j.duracaoMs || 0) / 1000)}s | ${j.url || ''} |`),
      ...(recortes.length ? ['', '## gh run view --log-failed', ...recortes.flatMap(([nome, texto]) => [`### ${nome}`, texto, ''])] : []),
    ];
    try {
      fs.writeFileSync(logAbs, `${linhas.join('\n')}\n`);
    } catch {
      /* melhor esforço */
    }
    const resumoFalha = r.status === 'ok' ? undefined : `${run.url || ''}\n${r.motivo}\n${ultimasLinhas(recortes.map(([, t]) => t).join('\n---\n'), 40)}`;
    // 0.9.0: a etapa diz de que commits vieram os jobs (shas) e, para os de outro commit, a prova por conteúdo.
    function conteudoDaEtapa(ids, runEtapa) {
      if (resultadoRun.criterio !== 'conteudo') return {};
      const shas = [...new Set(ids.map((id) => (resultadoRun.runs || []).find((x) => x.id === id)?.sha).filter(Boolean))];
      const provas = provasDoConteudo(resultadoRun).filter((p) => shas.includes(p.sha) || p.sha === runEtapa.sha);
      return { criterio: 'conteudo', shas, conteudo: provas };
    }
    return resultadoEtapa(e, {
      status: r.naoAplicavel ? 'ok' : r.status,
      origem: 'ci',
      motivo: `resultado do CI (run #${run.numero ?? '?'}): ${r.motivo}`,
      exit: r.naoAplicavel || r.status === 'ok' ? 0 : 1,
      duracaoMs: r.duracaoMs || 0,
      log: path.relative(raiz, logAbs),
      resumoFalha,
      ci: { sha: resultadoRun.sha, headSha: run.sha || null, runId: run.id ?? null, runNumero: run.numero ?? null, url: run.url || null, jobs: jobs.map((j) => ({ nome: j.nome, conclusao: j.conclusao || null, duracaoMs: j.duracaoMs || 0, url: j.url || null })), ...conteudoDaEtapa(idsDaEtapa, run) },
      ...(r.erroConfig ? { erroConfig: r.erroConfig } : {}),
    });
  }

  return { etapa, resolver, arquivo: arquivoRel, ultimo: () => resultadoRun };
}

// --------------------------------------------------------------------------- provas gravadas

/** Último ci.json da task (o mais novo por `em`), para "wf ci status". */
export function lerUltimoCi(raiz, estado) {
  if (!estado?.id) return null;
  const ev = caminhos(raiz, estado.id).evidencias;
  let melhor = null;
  let pastas = [];
  try {
    pastas = fs.readdirSync(ev, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return null;
  }
  for (const p of pastas) {
    const d = lerJSON(path.join(ev, p, 'ci.json'), null);
    if (d && (!melhor || Date.parse(d.em) > Date.parse(melhor.em))) melhor = { ...d, arquivo: path.relative(raiz, path.join(ev, p, 'ci.json')) };
  }
  return melhor;
}

// --------------------------------------------------------------------------- doctor

const ehLista = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string' && x.trim());

/** Problemas do bloco ci do config: erros reprovam o doctor (e barram o CI); avisos só informam. */
export function validarConfigCI(config) {
  const erros = [];
  const avisos = [];
  const ci = config?.ci;
  if (ci === undefined) return { erros: [], avisos: ['bloco "ci" ausente (rode /workflow-ia:atualizar): modo CI indisponível'] };
  if (!ci || typeof ci !== 'object' || Array.isArray(ci)) return { erros: ['ci deve ser um objeto'], avisos };
  if ('ativo' in ci && typeof ci.ativo !== 'boolean') erros.push('ci.ativo deve ser true ou false');
  if (!Object.keys(PROVEDORES).includes(ci.provedor)) erros.push(`ci.provedor "${ci.provedor}" desconhecido (use ${Object.keys(PROVEDORES).join(', ')})`);
  if (typeof ci.workflow !== 'string' || !ci.workflow.trim()) erros.push('ci.workflow deve ser o nome (ou o arquivo) do workflow');
  if (!ehLista(ci.fases) || ci.fases.some((f) => !FASES.includes(f))) erros.push(`ci.fases deve ser uma lista de fases (${FASES.join(', ')})`);
  const grupos = new Set((config.gate?.etapas || []).map((e) => grupoDaEtapa(e.nome)));
  if (!Array.isArray(ci.etapas) || (ci.etapas.length && !ehLista(ci.etapas))) erros.push('ci.etapas deve ser uma lista de etapas do gate');
  else {
    for (const e of ci.etapas) {
      if (e === 'segredos') erros.push('ci.etapas não pode conter "segredos": segredos roda sempre local, antes do push');
      else if (e === NOME_TESTE_CI) erros.push(`ci.etapas não pode conter "${NOME_TESTE_CI}" (etapa sintética)`);
      // Etapa que o gate não tem: erro só com o CI ligado (desligado, o bloco padrão não pode reprovar um gate enxuto).
      else if (!grupos.has(e)) (ci.ativo === true ? erros : avisos).push(`ci.etapas cita "${e}", que não é etapa nem grupo do gate`);
    }
  }
  if ('e2e' in ci && typeof ci.e2e !== 'boolean') erros.push('ci.e2e deve ser true ou false');
  if (!ci.apps || typeof ci.apps !== 'object' || Array.isArray(ci.apps)) erros.push('ci.apps deve ser um mapa app → { dir, banco, shards }');
  else {
    for (const [nome, a] of Object.entries(ci.apps)) {
      if (!/^[a-z0-9][a-z0-9._-]*$/i.test(nome)) erros.push(`ci.apps: nome de app inválido "${nome}"`);
      if (!a || typeof a !== 'object') {
        erros.push(`ci.apps.${nome} deve ser um objeto { dir, banco, shards }`);
        continue;
      }
      const dir = String(a.dir ?? '');
      if (!dir || dir.split(/[\\/]/).includes('..') || path.isAbsolute(dir)) erros.push(`ci.apps.${nome}.dir deve ser uma pasta relativa ao projeto (sem "..")`);
      if ('banco' in a && typeof a.banco !== 'boolean') erros.push(`ci.apps.${nome}.banco deve ser true ou false`);
      if ('shards' in a && !(Number.isInteger(a.shards) && a.shards >= 1)) erros.push(`ci.apps.${nome}.shards deve ser um inteiro >= 1`);
      // entradas (0.9.0): o que o app lê fora da pasta dele (globs relativos à raiz).
      if ('entradas' in a) {
        if (!Array.isArray(a.entradas) || (a.entradas.length && !ehLista(a.entradas))) erros.push(`ci.apps.${nome}.entradas deve ser uma lista de caminhos ou globs`);
        else for (const g of a.entradas) {
          if (String(g).split(/[\\/]/).includes('..') || path.isAbsolute(String(g))) erros.push(`ci.apps.${nome}.entradas: "${g}" deve ser relativo ao projeto (sem "..")`);
          else if (validarGlob(g)) erros.push(`ci.apps.${nome}.entradas: ${validarGlob(g)}`);
        }
      }
      if (ci.criterioReaproveitar === 'conteudo' && String(a.dir || '').replace(/\/+$/, '') === '.') avisos.push(`ci.apps.${nome}.dir é "." : com o critério "conteudo" o app só é reaproveitado com o repositório inteiro igual`);
    }
  }
  if ('compartilhado' in ci) {
    if (!Array.isArray(ci.compartilhado) || (ci.compartilhado.length && !ehLista(ci.compartilhado))) erros.push('ci.compartilhado deve ser uma lista de globs');
    else for (const g of ci.compartilhado) if (validarGlob(g)) erros.push(`ci.compartilhado: ${validarGlob(g)}`);
  }
  if (!FALLBACKS.includes(ci.fallback)) erros.push(`ci.fallback deve ser ${FALLBACKS.map((f) => `"${f}"`).join(' ou ')}`);
  if (!(Number.isInteger(ci.timeoutMin) && ci.timeoutMin >= 1 && ci.timeoutMin <= 360)) erros.push('ci.timeoutMin deve ser um inteiro entre 1 e 360');
  if (!(Number.isInteger(ci.pollSegundos) && ci.pollSegundos >= 5 && ci.pollSegundos <= 120)) erros.push('ci.pollSegundos deve ser um inteiro entre 5 e 120');
  if ('reaproveitar' in ci && typeof ci.reaproveitar !== 'boolean') erros.push('ci.reaproveitar deve ser true ou false');
  if ('repetirFalhas' in ci && !(Number.isInteger(ci.repetirFalhas) && ci.repetirFalhas >= 0 && ci.repetirFalhas <= 3)) erros.push('ci.repetirFalhas deve ser um inteiro entre 0 e 3');
  if ('criterioReaproveitar' in ci && !CRITERIOS.includes(ci.criterioReaproveitar)) erros.push(`ci.criterioReaproveitar deve ser ${CRITERIOS.map((c) => `"${c}"`).join(' ou ')}`);
  if (ci.criterioReaproveitar === 'conteudo' && ci.reaproveitar === false) avisos.push('ci.criterioReaproveitar = "conteudo" com ci.reaproveitar = false: a verificação não reaproveita nada (só o job da PR usa o critério)');
  if (ci.ativo === true) {
    // Com o CI desligado, "teste-ci" é uma etapa comum do humano (o exemplo do dependeDe); ligado, o nome é da sintética (M4).
    if ((config.gate?.etapas || []).some((e) => e.nome === NOME_TESTE_CI)) erros.push(`gate.etapas não pode declarar "${NOME_TESTE_CI}" com o modo CI ativo: é a etapa sintética do modo CI (renomeie a sua ou desligue ci.ativo)`);
    if (ci.apps && typeof ci.apps === 'object' && !Object.keys(ci.apps).length) erros.push('ci.ativo = true exige ci.apps com ao menos um app (rode "wf ci gerar")');
    if (Array.isArray(ci.etapas) && !ci.etapas.length) erros.push('ci.ativo = true exige ao menos uma etapa em ci.etapas');
    if (config.git?.pushBranch === false) erros.push('ci.ativo = true exige git.pushBranch = true: o modo CI faz push do branch da task (M3)');
    // Sub-etapa de grupo do CI cujo app não está em ci.apps: nenhum job a provaria (C1).
    const grupos = new Set([...(Array.isArray(ci.etapas) ? ci.etapas : []), ...(ci.e2e === true ? ['teste-e2e'] : [])]);
    const apps = ci.apps && typeof ci.apps === 'object' ? Object.keys(ci.apps) : [];
    for (const e of config.gate?.etapas || []) {
      const n = String(e.nome || '');
      if (!n.includes(':') || !grupos.has(grupoDaEtapa(n))) continue;
      const sufixo = n.slice(n.indexOf(':') + 1);
      if (!apps.includes(sufixo)) erros.push(`a sub-etapa "${n}" é de um app ("${sufixo}") que não está em ci.apps: declare o app ou tire "${grupoDaEtapa(n)}" de ci.etapas`);
    }
  }
  if (config.provas?.exigirCI === true) avisos.push('provas.exigirCI não é lido por nada: o modo CI é ligado por ci.ativo');
  return { erros, avisos };
}

export { baseDaTask, refBase };

export { provaCIValeParaHead, criterioDe };
