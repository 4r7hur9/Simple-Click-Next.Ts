// Provedor "github-actions" do modo CI (ver lib/ci.mjs): tudo pela CLI `gh`, chamada sem shell (execFile) e sem
// prompt. `gh` é injetável: os testes passam um falso (ou um script no PATH) e nunca tocam a rede.
//
// Comandos usados (todos liberados pelo guarda-bash, que só nega pr create/merge e mutações):
//   gh --version; gh auth status --hostname github.com; gh workflow view <wf> --json name,state,path
//   gh workflow run <wf> --ref <branch> -f apps=<csv|todos>
//   gh run list --workflow <wf> --branch <branch> --event workflow_dispatch --limit 20 --json ...
//   gh run view <id> --json status,conclusion,url,createdAt,updatedAt,headSha,number,jobs
//   gh run view <id> --job <jobId> --log-failed; gh run cancel <id>
//   (0.8.0) gh run list --workflow <wf> --branch <branch> --limit 50 --json ... (todos os eventos: reaproveitar o run
//   do mesmo SHA); gh api repos/<o>/<r>/actions/runs/<id> (base.sha do run de pull_request); gh run rerun <id> --failed
//   (0.9.0, critério "conteudo") gh run list --workflow <wf> --branch <branch> --event workflow_dispatch --limit 30
//   (dispatches concluídos de qualquer commit do branch); gh run view <id> --json jobs (lerJobs)

import { execFile, spawnSync } from 'node:child_process';
import { classificarIndisponivel } from './ci.mjs';

const CAMPOS_RUN = 'databaseId,number,headSha,status,conclusion,createdAt,updatedAt,url,event';
const CAMPOS_RUN_SHA = `${CAMPOS_RUN},attempt,headBranch`;
const CAMPOS_VIEW = 'databaseId,number,status,conclusion,url,createdAt,updatedAt,headSha,jobs';
// "attempt" só quando a tentativa importa (runs do mesmo SHA e espera de rerun): o fluxo de disparo da 0.7.0 não depende dele.
const CAMPOS_VIEW_TENTATIVA = `${CAMPOS_VIEW},attempt`;
// Eventos cujo run pode provar o commit (ver lib/ci.mjs, aceitarRun): o disparo do próprio commit e a PR.
const EVENTOS_PROVA = new Set(['workflow_dispatch', 'pull_request']);

/** gh de verdade: execFile sem shell, sem prompt, sem cor. Devolve { exit, stdout, stderr }. */
export function ghPadrao(raiz) {
  return (args, { timeoutSegundos = 60 } = {}) =>
    new Promise((resolve) => {
      execFile('gh', args, { cwd: raiz, timeout: timeoutSegundos * 1000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1', GH_PAGER: 'cat', GH_NO_UPDATE_NOTIFIER: '1' } }, (err, stdout, stderr) => {
        if (err && err.code === 'ENOENT') resolve({ exit: 127, stdout: '', stderr: 'ENOENT: gh não encontrado no PATH' });
        else resolve({ exit: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') });
      });
    });
}

const json = (texto, padrao) => {
  try {
    return JSON.parse(texto);
  } catch {
    return padrao;
  }
};
const ms = (iso) => (iso ? Date.parse(iso) : NaN);

function normalizarRun(r) {
  if (!r) return null;
  return { id: r.databaseId ?? r.id ?? null, numero: r.number ?? null, sha: r.headSha || null, status: r.status || null, conclusao: r.conclusion || null, url: r.url || null, criadoEm: r.createdAt || null, atualizadoEm: r.updatedAt || null, evento: r.event || null, tentativa: Number.isInteger(r.attempt) ? r.attempt : r.attempt != null && /^\d+$/.test(String(r.attempt)) ? Number(r.attempt) : 1, duracaoMs: r.createdAt && r.updatedAt ? Math.max(0, ms(r.updatedAt) - ms(r.createdAt)) : null };
}

function normalizarJob(j) {
  return { id: j.databaseId ?? j.id ?? null, nome: String(j.name || ''), status: j.status || null, conclusao: j.conclusion || null, iniciadoEm: j.startedAt || null, concluidoEm: j.completedAt || null, duracaoMs: j.startedAt && j.completedAt ? Math.max(0, ms(j.completedAt) - ms(j.startedAt)) : 0, url: j.url || null };
}

/**
 * criarProvedor({ raiz, config, gh?, dormir?, agora? }) → interface do provedor (ver lib/ci.mjs).
 * Toda falha de infraestrutura volta como { ok:false, motivo, classe } (classe de classificarIndisponivel).
 */
export function criarProvedor({ raiz, config, repo = null, gh = ghPadrao(raiz), dormir = (t) => new Promise((r) => setTimeout(r, t)), agora = () => Date.now() } = {}) {
  const host = config?.ci?.host || 'github.com';
  // --repo <owner/repo> (derivado do remoto) em todo comando que fala com um repositório: nunca o "repositório atual"
  // adivinhado pelo gh (S3). Sem repo derivável (remoto local ou de outro host), o gh resolve pelo cwd.
  const comRepo = (args) => (repo ? [...args, '--repo', repo] : args);
  const erro = (r, fase) => {
    const texto = `${r.stderr || ''}\n${r.stdout || ''}`.trim();
    return { ok: false, motivo: `${fase}: ${texto.split('\n').slice(-3).join(' ').trim() || `exit ${r.exit}`}`, classe: classificarIndisponivel(texto) || 'infra', saida: texto };
  };
  return {
    nome: 'github-actions',

    async disponivel() {
      const v = await gh(['--version'], { timeoutSegundos: 20 });
      if (v.exit !== 0) return { ok: false, motivo: 'gh (GitHub CLI) não está instalado ou não roda (brew install gh)', classe: 'gh-ausente' };
      const a = await gh(['auth', 'status', '--hostname', host], { timeoutSegundos: 30 });
      if (a.exit !== 0) return { ok: false, motivo: `gh sem autenticação em ${host} (gh auth login)`, classe: 'sem-auth', saida: a.stderr };
      return { ok: true, detalhe: `gh ${(v.stdout.split('\n')[0] || '').replace(/^gh version\s*/, '').trim()} autenticado em ${host}` };
    },

    async workflowExiste(workflow) {
      const r = await gh(comRepo(['workflow', 'view', workflow, '--json', 'name,state,path']), { timeoutSegundos: 30 });
      if (r.exit !== 0) return { ...erro(r, 'workflow view'), classe: classificarIndisponivel(`${r.stderr}\n${r.stdout}`) || 'workflow-ausente' };
      const w = json(r.stdout, {});
      if (w.state && w.state !== 'active') return { ok: false, motivo: `workflow "${workflow}" está ${w.state} (não active)`, classe: 'workflow-ausente', arquivo: w.path };
      return { ok: true, arquivo: w.path || null, nome: w.name || workflow, state: w.state || null };
    },

    async disparar({ workflow, ref, apps }) {
      const args = comRepo(['workflow', 'run', workflow, '--ref', ref, '-f', `apps=${apps || 'todos'}`]);
      const r = await gh(args, { timeoutSegundos: 60 });
      const comando = `gh ${args.join(' ')}`;
      if (r.exit !== 0) {
        const e = erro(r, 'gh workflow run');
        const semWorkflow = /could not find any workflows|HTTP 404|not found/i.test(e.saida) && !/HTTP 422/i.test(e.saida);
        return { ...e, comando, classe: semWorkflow ? 'workflow-ausente' : e.classe, motivo: semWorkflow ? `o GitHub não achou o workflow "${workflow}" (o arquivo precisa existir no branch padrão para o gh achá-lo pelo nome; veja "wf ci ativar")` : e.motivo };
      }
      return { ok: true, comando, em: new Date(agora()).toISOString() };
    },

    /** Ids dos runs workflow_dispatch já existentes no branch: a lista de exclusão do localizarRun (M2). */
    async listarRuns({ workflow, branch }) {
      const r = await gh(comRepo(['run', 'list', '--workflow', workflow, '--branch', branch, '--event', 'workflow_dispatch', '--limit', '50', '--json', CAMPOS_RUN]), { timeoutSegundos: 60 });
      if (r.exit !== 0) return { ...erro(r, 'gh run list'), ids: [] };
      return { ok: true, ids: (json(r.stdout, []) || []).map(normalizarRun).filter(Boolean).map((x) => x.id) };
    },

    // O gh não filtra run por SHA em todas as versões: lista os workflow_dispatch do branch e filtra no JSON. Um run
    // que já existia antes do nosso disparo (ignorarIds), mesmo do mesmo SHA, nunca é o nosso (M2).
    async localizarRun({ workflow, branch, sha, desdeMs = 0, ignorarIds = new Set(), timeoutMs = 180000, pollMs = 5000 }) {
      const limite = agora() + timeoutMs;
      let ultimoErro = null;
      for (;;) {
        const r = await gh(comRepo(['run', 'list', '--workflow', workflow, '--branch', branch, '--event', 'workflow_dispatch', '--limit', '20', '--json', CAMPOS_RUN]), { timeoutSegundos: 60 });
        if (r.exit === 0) {
          const runs = (json(r.stdout, []) || []).map(normalizarRun).filter((x) => x && x.sha === sha && !ignorarIds.has(x.id) && (!desdeMs || !x.criadoEm || ms(x.criadoEm) >= desdeMs));
          runs.sort((a, b) => (ms(b.criadoEm) || 0) - (ms(a.criadoEm) || 0));
          if (runs.length) return { ok: true, run: runs[0] };
        } else ultimoErro = erro(r, 'gh run list');
        if (agora() >= limite) return ultimoErro ? { ...ultimoErro, classe: ultimoErro.classe } : { ok: false, motivo: `nenhum run do workflow "${workflow}" apareceu para o SHA ${String(sha).slice(0, 7)} no branch ${branch} em ${Math.round(timeoutMs / 1000)}s`, classe: 'run-nao-encontrado' };
        await dormir(pollMs);
      }
    },

    // A cada leitura o headSha do run é reconferido com o SHA pedido: um run de outro commit nunca vira prova (M1).
    // tentativaMinima (0.8.0): depois de um "gh run rerun --failed", a leitura imediata ainda pode devolver a tentativa
    // anterior já concluída; só vale a tentativa nova concluída.
    async esperarRun(runId, { timeoutMs = 1800000, pollMs = 15000, aoAtualizar, sha = null, tentativaMinima = 0 } = {}) {
      const limite = agora() + timeoutMs;
      let falhasSeguidas = 0;
      let ultimo = null;
      for (;;) {
        const r = await gh(comRepo(['run', 'view', String(runId), '--json', tentativaMinima ? CAMPOS_VIEW_TENTATIVA : CAMPOS_VIEW]), { timeoutSegundos: 60 });
        if (r.exit === 0) {
          const d = json(r.stdout, null);
          if (d && typeof d === 'object' && !Array.isArray(d)) {
            falhasSeguidas = 0;
            ultimo = { ...normalizarRun(d), jobs: (d.jobs || []).map(normalizarJob) };
            if (sha && ultimo.sha && ultimo.sha !== sha) return { ok: false, run: ultimo, timeout: false, motivo: `o run ${runId} é do SHA ${String(ultimo.sha).slice(0, 7)}, não do ${String(sha).slice(0, 7)} pedido`, classe: 'sha-divergente' };
            if (typeof aoAtualizar === 'function') aoAtualizar(ultimo);
            if (ultimo.status === 'completed' && (ultimo.tentativa || 1) >= tentativaMinima) return { ok: true, run: ultimo, timeout: false };
          } else {
            falhasSeguidas += 1;
            if (falhasSeguidas >= 5) return { ok: false, run: ultimo, timeout: false, motivo: 'gh run view devolveu JSON inesperado 5 vezes seguidas', classe: 'infra' };
          }
        } else {
          falhasSeguidas += 1;
          // Leituras falhando em sequência (rede, cota): não é o run que está lento.
          if (falhasSeguidas >= 5) return { ...erro(r, 'gh run view'), run: ultimo, timeout: false };
        }
        if (agora() >= limite) return { ok: false, run: ultimo, timeout: true, motivo: 'tempo máximo de espera esgotado' };
        await dormir(pollMs);
      }
    },

    async lerJobs(runId, runLido) {
      if (runLido && Array.isArray(runLido.jobs)) return { ok: true, jobs: runLido.jobs };
      const r = await gh(comRepo(['run', 'view', String(runId), '--json', 'jobs']), { timeoutSegundos: 60 });
      if (r.exit !== 0) return erro(r, 'gh run view --json jobs');
      return { ok: true, jobs: ((json(r.stdout, {}) || {}).jobs || []).map(normalizarJob) };
    },

    // Recorte do log de cada job reprovado (últimas 120 linhas); sem --job, cai no log-failed do run inteiro.
    async logFalhas(runId, jobs) {
      const recortes = {};
      const comandos = [];
      for (const j of jobs || []) {
        const args = comRepo(j.id != null ? ['run', 'view', String(runId), '--job', String(j.id), '--log-failed'] : ['run', 'view', String(runId), '--log-failed']);
        comandos.push(`gh ${args.join(' ')}`);
        const r = await gh(args, { timeoutSegundos: 120 });
        const texto = r.exit === 0 ? r.stdout : `${r.stdout}\n${r.stderr}`;
        recortes[j.nome] = texto.split('\n').slice(-120).join('\n').trim();
      }
      return { comando: comandos.join(' && '), recortes };
    },

    /**
     * Runs do workflow neste branch com headSha == sha (workflow_dispatch e pull_request), do mais novo para o mais
     * antigo: os concluídos com os jobs (última tentativa de cada job) e os de PR com a base (pull_requests[0].base.sha).
     * O filtro de SHA é no JSON (nem todo gh tem --commit). Usado para reaproveitar a prova do mesmo commit (0.8.0).
     */
    async runsDoSha({ workflow, branch, sha, limite = 10, evento = null }) {
      const r = await gh(comRepo(['run', 'list', '--workflow', workflow, '--branch', branch, ...(evento ? ['--event', evento] : []), '--limit', evento ? '10' : '50', '--json', CAMPOS_RUN_SHA]), { timeoutSegundos: 60 });
      if (r.exit !== 0) return { ...erro(r, 'gh run list'), runs: [] };
      // JSON inesperado (não lista): nenhum run conhecido; o gate segue para o disparo normal.
      const bruto = json(r.stdout, []);
      const lista = (Array.isArray(bruto) ? bruto : []).map(normalizarRun).filter((x) => x && x.id != null && x.sha === sha && EVENTOS_PROVA.has(x.evento) && (!evento || x.evento === evento));
      lista.sort((a, b) => (ms(b.criadoEm) || 0) - (ms(a.criadoEm) || 0) || Number(b.id) - Number(a.id));
      const runs = [];
      for (const run of lista.slice(0, limite)) {
        let atual = { ...run, jobs: [] };
        const v = await gh(comRepo(['run', 'view', String(run.id), '--json', CAMPOS_VIEW_TENTATIVA]), { timeoutSegundos: 60 });
        const d = v.exit === 0 ? json(v.stdout, null) : null;
        if (d && typeof d === 'object' && !Array.isArray(d)) atual = { ...atual, ...normalizarRun({ ...d, event: run.evento }), jobs: (d.jobs || []).map(normalizarJob) };
        else atual.erroLeitura = v.exit === 0 ? 'JSON inesperado' : erro(v, 'gh run view').motivo;
        if (atual.evento === 'pull_request') {
          const a = await gh(['api', `repos/${repo || '{owner}/{repo}'}/actions/runs/${run.id}`], { timeoutSegundos: 60 });
          const dados = a.exit === 0 ? json(a.stdout, null) : null;
          atual.baseSha = dados?.pull_requests?.[0]?.base?.sha || null;
          atual.prs = Array.isArray(dados?.pull_requests) ? dados.pull_requests.length : 0;
          atual.pr = dados?.pull_requests?.[0]?.number ?? null;
        }
        runs.push(atual);
      }
      return { ok: true, runs, consultados: lista.length };
    },

    /**
     * 0.9.0 (critério "conteudo"): workflow_dispatch CONCLUÍDOS do workflow neste branch, de qualquer commit, do mais
     * novo para o mais antigo, sem os jobs (o chamador lê com lerJobs só os que precisa).
     */
    async runsDaBranch({ workflow, branch, limite = 30 }) {
      const r = await gh(comRepo(['run', 'list', '--workflow', workflow, '--branch', branch, '--event', 'workflow_dispatch', '--limit', String(limite), '--json', CAMPOS_RUN_SHA]), { timeoutSegundos: 60 });
      if (r.exit !== 0) return { ...erro(r, 'gh run list'), runs: [] };
      const bruto = json(r.stdout, []);
      const runs = (Array.isArray(bruto) ? bruto : []).map(normalizarRun).filter((x) => x && x.id != null && x.evento === 'workflow_dispatch' && x.status === 'completed');
      runs.sort((a, b) => (ms(b.atualizadoEm) || ms(b.criadoEm) || 0) - (ms(a.atualizadoEm) || ms(a.criadoEm) || 0) || Number(b.id) - Number(a.id));
      return { ok: true, runs };
    },

    /** PR aberta com este branch como head (gh pr list): { ok, numero, base } ou { ok, numero: null }. */
    async prAberta({ branch }) {
      const r = await gh(comRepo(['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number,baseRefName']), { timeoutSegundos: 60 });
      if (r.exit !== 0) return { ...erro(r, 'gh pr list'), numero: null };
      const l = json(r.stdout, []) || [];
      return { ok: true, numero: l[0]?.number ?? null, base: l[0]?.baseRefName ?? null };
    },

    /** "gh run rerun <id> --failed": nova tentativa só dos jobs reprovados (e dos que dependem deles). */
    async rerunFalhas(runId) {
      const args = comRepo(['run', 'rerun', String(runId), '--failed']);
      const r = await gh(args, { timeoutSegundos: 60 });
      return r.exit === 0 ? { ok: true, comando: `gh ${args.join(' ')}` } : { ...erro(r, 'gh run rerun --failed'), comando: `gh ${args.join(' ')}` };
    },

    async cancelar(runId) {
      const r = await gh(comRepo(['run', 'cancel', String(runId)]), { timeoutSegundos: 60 });
      return { ok: r.exit === 0 };
    },

    /** Cancelamento síncrono para o handler de SIGINT/SIGTERM (o processo vai morrer: não dá para esperar promessa). */
    cancelarSync(runId) {
      try {
        const r = spawnSync('gh', comRepo(['run', 'cancel', String(runId)]), { cwd: raiz, encoding: 'utf8', timeout: 30000, env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' } });
        return { ok: r.status === 0 };
      } catch {
        return { ok: false };
      }
    },

    classificarErro(texto) {
      return classificarIndisponivel(texto) || 'infra';
    },
  };
}
