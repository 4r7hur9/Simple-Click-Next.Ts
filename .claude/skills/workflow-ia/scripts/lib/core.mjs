// Núcleo do Workflow IA: caminhos, configuração, estado da task, git e utilitários.
// Sem dependências externas (Node >= 18).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const DIR = '.workflow-ia';

export const FASES = [
  'intake',
  'spec',
  'plano',
  'setup',
  'testes',
  'implementacao',
  'loop',
  'verificacao',
  'entrega',
  'encerrada',
];

export const SEVERIDADES = ['urgente', 'alto', 'medio', 'baixo'];

export const STATUS_FINDING = [
  'aberto',
  'corrigido',
  'verificado',
  'reaberto',
  'falso-positivo',
  'aceito-risco',
  'divida-tecnica',
];

export const VEREDITOS = ['CONCLUIDA', 'BLOQUEADA', 'INTERROMPIDA'];

/** SAST padrão quando o semgrep está instalado. "--config auto" exige métricas ligadas, então usa o pacote p/default. */
export const SAST_PADRAO = 'semgrep scan --config p/default --error --quiet --metrics=off';

// ---------------------------------------------------------------------------
// Configuração padrão. O instalador grava .workflow-ia/config.json a partir
// disto + detecção do stack. O que estiver no arquivo do projeto prevalece.
// ---------------------------------------------------------------------------
export const CONFIG_PADRAO = {
  versao: 10,
  projeto: {
    nome: '',
    stack: '',
    gerenciadorPacotes: 'npm',
  },
  board: {
    tipo: 'manual', // manual | notion | linear | github | jira | trello
    statusEntrada: 'Pronto p/ agente',
    statusEmAndamento: 'Em andamento (agente)',
    statusConcluida: 'Concluída pelo agente — aguardando PR',
    statusBloqueada: 'Bloqueada (agente)',
    statusInterrompida: 'Precisa de humano',
    statusDividaTecnica: 'Backlog',
    idPrefixo: '',
    observacoes: '',
  },
  git: {
    branchBase: 'main',
    remoto: 'origin',
    branchesProtegidos: ['main', 'master', 'develop', 'production', 'release'],
    padraoBranch: '{tipo}/{id}-{slug}',
    pushBranch: true,
  },
  comandos: {
    instalar: '',
    typecheck: '',
    lint: '',
    lintArquivo: '',
    formatarArquivo: '',
    testeUnitario: '',
    testeIntegracao: '',
    testeE2E: '',
    testeArquivo: '',
    build: '',
    sast: '',
    dependencias: '',
    segredos: '',
    // Execução focada (0.6.0). {arquivos} = lista com aspas de shell; vazio = cai no comando inteiro.
    testeArquivos: '', // vários arquivos de teste de uma vez (wf red focado), ex.: "npx vitest run {arquivos}"
    testeE2EArquivos: '', // testes E2E da task, quando provas.exigirE2E pede, ex.: "npx playwright test {arquivos}"
    typecheckArquivos: '', // typecheck só do app dos arquivos (wf checar); vazio = @typecheck inteiro
    testesRelacionados: '', // testes ligados aos arquivos (wf checar), ex.: "npx vitest related --run {arquivos}"
  },
  gate: {
    timeoutSegundos: 900,
    etapas: [
      { nome: 'typecheck', comando: '@typecheck', obrigatoria: true },
      { nome: 'lint', comando: '@lint', obrigatoria: true },
      { nome: 'teste-unitario', comando: '@testeUnitario', obrigatoria: true },
      { nome: 'teste-integracao', comando: '@testeIntegracao', obrigatoria: true },
      { nome: 'teste-e2e', comando: '@testeE2E', obrigatoria: true },
      { nome: 'build', comando: '@build', obrigatoria: true },
      { nome: 'sast', comando: '@sast', obrigatoria: false },
      { nome: 'dependencias', comando: '@dependencias', obrigatoria: false },
      // Depende do histórico ({base}..HEAD): um commit que acrescenta e outro que remove o segredo não mudam o diff
      // líquido, então nunca vem do cache do loop.
      { nome: 'segredos', comando: '@segredos', obrigatoria: true, cacheavel: false },
    ],
    // Por etapa (0.6.0): custo baixo|medio|alto (padrão medio), timeoutSegundos (sobrepõe o global), pesada (pega
    // vaga de recurso), paralela: false (roda sozinha). Os padrões abaixo deixam o gate igual ao de antes.
    // dependeDe (0.7.0, opcional): nomes de etapas ou grupos de que a etapa depende; se uma não passar, ela fica
    // "pulada-por-dependencia" (não pega vaga, não roda e o gate reprova). Sem dependeDe, nada muda.
    falharRapido: false, // ondas por custo: etapa obrigatória que falha numa onda corta as seguintes (a verificação ignora)
    repetirPorCarga: 0, // repetições automáticas de uma etapa que falhou por carga (timeout, porta, memória, banco)
    paralelismo: 1, // etapas da mesma onda rodando ao mesmo tempo
    // Gate incremental no loop (0.6.0): etapa com "insumos" (globs) que passou é reaproveitada enquanto eles não
    // mudarem; sem "insumos", sempre roda. Sub-etapas "nome:app" (monorepo) têm cache próprio. Nunca vale na verificação.
    cacheEntreIteracoes: true,
    insumosGlobais: [], // globs que, se mudarem, invalidam o cache inteiro (além do config.json e dos lockfiles)
  },
  hooks: {
    lintAoEditar: true,
    typecheckAoEditar: false,
    timeoutPosEdicaoSegundos: 60,
  },
  // Limites do pipeline. Não há teto de tokens: o consumo é medido e mostrado, nunca interrompe a task.
  limites: {
    // Rodadas de code review no loop (gate → correção → gate não conta; só a revisão triada conta).
    maxIteracoes: 5,
    // Rodadas do plan-reviewer antes de PLANO_REPROVADO.
    maxRodadasPlano: 3,
    // Vezes que o mesmo finding de revisão pode voltar depois de corrigido (OSCILACAO).
    maxReaberturasMesmoFinding: 3,
    // Falhas seguidas da mesma etapa do gate até GATE_TRAVADO.
    maxFalhasGateSeguidas: 5,
    // Rodadas de revisão seguidas sem queda de bloqueantes abertos até SEM_PROGRESSO.
    semProgressoPor: 2,
    maxBloqueiosDeParada: 4,
    // Minutos que um subagente disparado (em segundo plano) segura a parada sem contar como "parada sem progresso".
    esperaSubagenteMin: 180,
  },
  severidades: {
    bloqueiam: ['urgente', 'alto'],
    corrigirNoLoop: ['medio'],
    apenasRegistrar: ['baixo'],
  },
  // Revisão do loop. O ops-reviewer (categoria operacao/) é condicional: entra na 1ª rodada quando o diff toca
  // migration, arquivo de ambiente ou algum dos gatilhos abaixo, ou quando o spec marca "Dados pessoais: sim".
  revisao: {
    operacao: 'condicional', // condicional | sempre
    gatilhosOperacao: [
      // Containers e deploy
      '**/dockerfile*',
      '**/*.dockerfile',
      '**/containerfile*',
      '**/docker-compose*',
      '**/compose.y*ml',
      '**/.dockerignore',
      '**/k8s/**',
      '**/kubernetes/**',
      '**/helm/**',
      '**/*.tf',
      '**/fly.toml',
      '**/vercel.json',
      '**/railway.{json,toml}',
      '**/render.yaml',
      '**/procfile',
      // CI
      '**/.github/workflows/**',
      '**/.gitlab-ci.yml',
      // Migrations de outros stacks (prisma/migrations, migrations, drizzle e db/migrations vêm de protecoes.diretoriosMigrations)
      '**/db/migrate/**',
      '**/db/migration/**',
      '**/alembic/versions/**',
      '**/migration/**',
      '**/*.migration.{ts,js,mjs,cjs}',
      '**/flyway/**',
      '**/liquibase/**',
      // Logs, observabilidade e config
      '**/logger*',
      '**/logging/**',
      '**/instrumentation*',
      '**/sentry*.config.*',
      '**/env.{ts,mjs,js,cjs}',
      '**/env/**',
      // Processamento assíncrono e integrações recebidas
      '**/workers/**',
      '**/jobs/**',
      '**/queues/**',
      '**/webhooks/**',
      '**/webhook/**',
      // Health check
      '**/health{,check,z}.{ts,js,mjs,cjs}',
      '**/health{,check,z}/**',
    ],
  },
  provas: {
    exigirE2E: 'quando-houver-ui', // sempre | quando-houver-ui | nunca
    exigirCI: false,
    urlPreview: '', // ex.: https://{branch}-meuapp.vercel.app
    // "wf red" focado (0.6.0): só os testes da task. Instalação nova grava true; a migração 6→7 grava false (o RED
    // continua completo como antes até o humano ligar). Só vale com config.versao >= 7.
    redFocado: true,
  },
  // Modo CI opcional (0.7.0): com ativo=true, nas fases listadas (padrão: só a verificação final) uma etapa sintética
  // "teste-ci" faz push do branch da task, dispara o workflow do GitHub Actions e espera o run; as etapas de "etapas"
  // são lidas do resultado do run do mesmo SHA em vez de rodar na máquina. Desligado, nada muda (tudo local).
  // Só o humano liga ("wf ci ativar"); o yml é proposto pelo plugin ("wf ci gerar") e copiado pelo humano.
  ci: {
    ativo: false,
    provedor: 'github-actions', // único provedor hoje (interface em lib/ci.mjs)
    workflow: 'CI', // "name:" do workflow (ou o arquivo, ex.: ci.yml) que o gh dispara
    fases: ['verificacao'], // fases em que o CI vale; WF_GATE_CI=1 força em qualquer fase
    etapas: ['typecheck', 'teste-unitario', 'teste-integracao', 'build'], // grupos do gate lidos do CI
    e2e: false, // teste-e2e no CI (opt-in: navegador, servidor e seed são caros e instáveis lá)
    apps: {}, // { "pdv-web": { "dir": "apps/pdv-web", "banco": true, "shards": 4, "entradas": ["docs/pdv"] } } (wf ci gerar detecta; entradas: o que o app lê fora da pasta)
    compartilhado: ['packages/**', 'tooling/**', 'package.json', 'pnpm-workspace.yaml', 'turbo.json', 'tsconfig*.json'], // mudou → todos os apps
    fallback: 'local', // local: WF_GATE_CI_FALLBACK=local roda tudo na máquina; nenhum: o fallback é recusado
    timeoutMin: 30, // espera máxima pelo run (estourou: cancela e fica CI-INDISPONIVEL)
    pollSegundos: 15, // intervalo das leituras do run
    // CI econômico (0.8.0): antes de disparar, a teste-ci procura um run do mesmo SHA (dispatch, ou PR com a base contida)
    // que já prove o commit e o reaproveita (anexa se estiver em andamento; dispara só os apps que faltam).
    // WF_GATE_CI_NOVO=1 força um disparo novo.
    reaproveitar: true,
    // Vezes que um run que falhou numa verificação anterior do mesmo commit repete só os jobs reprovados
    // (gh run rerun --failed), contadas pelo attempt do run. 0 desliga. O run disparado no próprio gate nunca é repetido.
    repetirFalhas: 1,
    // Critério do reaproveitamento (0.9.0): "commit" (0.8.0: só o run do mesmo SHA; na PR, só com a base contida) ou
    // "conteudo" (por app: um dispatch verde de outro commit da mesma branch vale quando o hash do conteúdo do app e o do
    // workflow são iguais). Instalação nova grava "conteudo"; a migração 9→10 grava "commit" (nada muda sem o humano pedir).
    criterioReaproveitar: 'conteudo',
  },
  // Capacidades do host (ver docs/portabilidade-hosts.md). Os hooks são a única fonte de identidade dos
  // subagentes (agent_type) e de várias travas: sem eles a task não roda. Estes são só os prazos.
  host: {
    janelaBatimentoSegundos: 120, // idade máxima do carimbo do hook PreToolUse(Bash) que prova que os hooks estão vivos
    validadeAmbienteSegundos: 600, // quanto tempo vale um "wf ambiente" aprovado antes do init-task
  },
  // Vagas de recurso da máquina (0.6.0): etapas "pesada" só rodam com uma vaga; as tasks esperam numa fila justa.
  recursos: {
    vagasPesadas: 0, // 0 = desligado
    dir: '/tmp/workflow-ia-vagas', // compartilhado entre as tasks da máquina
    esperaMaxMin: 120,
    reservaSegundos: 300, // "wf aguardar-vaga" reserva a vez para o próximo gate da mesma task por este tempo
  },
  // Git hooks gerenciados (pre-commit/pre-push): segunda linha de defesa quando os hooks do plugin não existem.
  githooks: {
    instalar: true,
  },
  // Decisão humana (wf decisao): quando a task para por algo que só o humano decide, o agente da sessão pergunta
  // (AskUserQuestion), aplica a resposta atestada pelos hooks e retoma a mesma task. Sem humano (CI), relatório e encerrar.
  interacao: {
    perguntarAoHumano: true,
    maxDecisoes: 5, // decisões humanas por task (evita o ciclo pedir → continuar → bloquear sem fim)
    exigirTranscript: true, // a resposta também precisa estar no transcript da sessão (segunda âncora contra forja)
  },
  protecoes: {
    arquivosBloqueados: ['.env', '.env.*', '**/.env', '**/.env.*'],
    excecoesArquivos: ['.env.example', '.env.sample', '.env.template', '**/.env.example', '**/.env.sample', '**/.env.template'],
    diretoriosMigrations: ['prisma/migrations', 'migrations', 'drizzle', 'db/migrations'],
    arquivosSomenteHumano: [
      '.github/workflows/**',
      '.husky/**',
      '.claude/settings.json',
      '.claude/settings.local.json',
      '.workflow-ia/config.json',
      '.workflow-ia/wf',
    ],
    lockfiles: ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock'],
    padroesTeste: [
      '**/*.test.*',
      '**/*.spec.*',
      '**/__tests__/**',
      'e2e/**',
      'tests/**',
      'test/**',
    ],
    // Testes E2E: o "wf red" focado só os inclui quando provas.exigirE2E pede.
    padroesE2E: ['e2e/**', '**/e2e/**', '**/*.e2e.*'],
  },
};

// ---------------------------------------------------------------------------
// Utilitários gerais
// ---------------------------------------------------------------------------

export function agoraISO() {
  return new Date().toISOString();
}

export function lerJSON(arquivo, padrao = undefined) {
  try {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch (e) {
    if (padrao !== undefined) return padrao;
    throw new Error(`Não foi possível ler JSON em ${arquivo}: ${e.message}`);
  }
}

export function gravarJSON(arquivo, dados) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const tmp = `${arquivo}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2) + '\n');
  fs.renameSync(tmp, arquivo);
}

// ---------------------------------------------------------------------------
// Lock de escrita do projeto: serializa ler-modificar-gravar de state.json e
// findings.json entre processos (CLI e hooks). Reentrante no mesmo processo.
// ---------------------------------------------------------------------------
const locksDetidos = new Set();
const ESPERA = new Int32Array(new SharedArrayBuffer(4));

function dormir(ms) {
  Atomics.wait(ESPERA, 0, 0, ms);
}

function lockAbandonado(arquivo) {
  try {
    const [pid] = fs.readFileSync(arquivo, 'utf8').split(' ');
    const idade = Date.now() - fs.statSync(arquivo).mtimeMs;
    // Quem segura o lock só grava JSON (gate e testes rodam fora dele): 2 min já é abandono.
    if (idade > 2 * 60 * 1000) return true;
    if (Number(pid) > 0) {
      try {
        process.kill(Number(pid), 0);
      } catch (e) {
        if (e.code === 'ESRCH') return true;
      }
    }
  } catch {
    return true;
  }
  return false;
}

export function comLock(raiz, fn, { esperaMs = 60000 } = {}) {
  const arquivo = path.join(raiz, DIR, 'runtime', 'wf.lock');
  if (locksDetidos.has(arquivo)) return fn();
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const limite = Date.now() + esperaMs;
  for (;;) {
    try {
      const fd = fs.openSync(arquivo, 'wx');
      fs.writeSync(fd, `${process.pid} ${new Date().toISOString()}`);
      fs.closeSync(fd);
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (lockAbandonado(arquivo)) {
        try {
          fs.unlinkSync(arquivo);
        } catch {
          /* outro processo já removeu */
        }
        continue;
      }
      if (Date.now() > limite) throw new Error('Outro comando do Workflow IA está gravando o estado desta task. Tente de novo em instantes.');
      dormir(50);
    }
  }
  locksDetidos.add(arquivo);
  const liberar = () => {
    if (!locksDetidos.has(arquivo)) return;
    locksDetidos.delete(arquivo);
    try {
      fs.unlinkSync(arquivo);
    } catch {
      /* já removido */
    }
  };
  // saida()/falha() chamam process.exit dentro de fn: o lock é liberado no 'exit'.
  process.once('exit', liberar);
  try {
    return fn();
  } finally {
    liberar();
  }
}

// ---------------------------------------------------------------------------
// Caminhos reais e arquivos protegidos
// ---------------------------------------------------------------------------

/** Resolve symlinks do trecho existente do caminho (o resto é anexado como está). */
export function realpathParcial(abs) {
  let atual = path.resolve(abs);
  const resto = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(atual), ...resto.reverse());
    } catch {
      const pai = path.dirname(atual);
      if (pai === atual) return path.resolve(abs);
      resto.push(path.basename(atual));
      atual = pai;
    }
  }
}

export function expandirHome(t) {
  return String(t).replace(/^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/, os.homedir());
}

/**
 * Caminho relativo à raiz (com "/"), resolvendo "..", "//", symlinks e o
 * diretório de trabalho informado. Devolve null se estiver fora do projeto.
 */
export function relativoReal(raiz, alvo, cwd = raiz) {
  if (!alvo) return null;
  const abs = realpathParcial(path.resolve(cwd, expandirHome(alvo)));
  const base = realpathParcial(raiz);
  const rel = path.relative(base, abs);
  if (rel === '') return '.';
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

// Arquivos que só a CLI (ou o humano) altera. Comparação sem maiúsculas: no
// macOS o sistema de arquivos não distingue ".ENV" de ".env".
const RX_ESTADO = [
  /^\.workflow-ia$/,
  /^\.workflow-ia\/(?:config\.json|wf)$/,
  /^\.workflow-ia\/runtime(?:\/|$)/,
  /^\.workflow-ia\/tasks$/,
  /^\.workflow-ia\/tasks\/[^/]+$/,
  /^\.workflow-ia\/tasks\/[^/]+\/(?:state|findings|verificacao|manifest)\.json$/,
  /^\.workflow-ia\/tasks\/[^/]+\/evidencias(?:\/|$)/,
  /^\.workflow-ia\/tasks\/[^/]+\/revisoes$/,
  // Proposta do modo CI (wf ci gerar): só a CLI grava; o humano copia o yml para .github/workflows/.
  /^\.workflow-ia\/ci(?:\/|$)/,
];
const RX_CONFIG_HUMANA = [/^\.claude\/settings(?:\.local)?\.json$/, /^\.github\/workflows(?:\/|$)/, /^\.husky(?:\/|$)/, /^\.git(?:\/|$)/];

export function ehEstadoProtegido(rel) {
  if (!rel) return false;
  const r = rel.toLowerCase().replace(/\/+$/, '');
  return RX_ESTADO.some((rx) => rx.test(r));
}

export function ehConfigHumana(rel) {
  if (!rel) return false;
  const r = rel.toLowerCase().replace(/\/+$/, '');
  return RX_CONFIG_HUMANA.some((rx) => rx.test(r));
}

/** Arquivos da pasta da task que só um subagente específico grava. */
export function donoDoArquivoDaTask(rel) {
  if (!rel) return null;
  const r = rel.toLowerCase();
  let m = r.match(/^\.workflow-ia\/tasks\/[^/]+\/plano-revisao\.json$/);
  if (m) return 'plan-reviewer';
  m = r.match(/^\.workflow-ia\/tasks\/[^/]+\/verificacao-julgamento\.json$/);
  if (m) return 'verificador-final';
  m = r.match(/^\.workflow-ia\/tasks\/[^/]+\/revisoes\/iter-\d+\/([a-z-]+)\.json$/);
  if (m) return m[1] === 'triagem' ? 'triager' : m[1];
  // Análise de um ajuste pós-entrega (documentação e pontos do feedback do humano): só o spec-analyst.
  m = r.match(/^\.workflow-ia\/tasks\/[^/]+\/ajustes\/a-\d+\.(?:json|md)$/);
  if (m) return 'spec-analyst';
  return null;
}

/** agent_type do hook ("workflow-ia:verificador-final") casa com o dono esperado? */
export function agenteEh(agentType, nome) {
  return !!agentType && String(agentType).split(':').pop() === nome;
}

export function ehArquivoEnv(rel, config) {
  if (!rel) return false;
  const r = rel.toLowerCase();
  const base = r.split('/').pop();
  if (!/^\.env/.test(base)) return false;
  const p = config.protecoes;
  return casaAlgum(r, p.arquivosBloqueados) && !casaAlgum(r, p.excecoesArquivos);
}

export function ehMigration(rel, config) {
  if (!rel) return false;
  const r = `/${rel.toLowerCase()}`;
  if (/migration_lock\.toml$/.test(r)) return false;
  return config.protecoes.diretoriosMigrations.some((d) => r.includes(`/${d.toLowerCase().replace(/^\/+|\/+$/g, '')}/`));
}

export function existe(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

export function sha256(conteudo) {
  return crypto.createHash('sha256').update(conteudo).digest('hex');
}

export function sha1Curto(texto) {
  return crypto.createHash('sha1').update(texto).digest('hex').slice(0, 12);
}

export function mesclarProfundo(base, extra) {
  if (Array.isArray(base) || Array.isArray(extra)) return extra !== undefined ? extra : base;
  if (typeof base !== 'object' || base === null) return extra !== undefined ? extra : base;
  const out = { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    out[k] = k in base ? mesclarProfundo(base[k], v) : v;
  }
  return out;
}

export function slugify(texto, max = 48) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

/**
 * Executa um comando de shell. Retorna { exit, stdout, stderr, saida, duracaoMs, timeout }.
 */
export function sh(comando, { cwd, timeoutSegundos = 600, env } = {}) {
  const inicio = Date.now();
  const r = spawnSync(comando, {
    cwd,
    shell: process.platform === 'win32' ? true : '/bin/bash',
    encoding: 'utf8',
    timeout: timeoutSegundos * 1000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CI: process.env.CI || '1', FORCE_COLOR: '0', ...env },
  });
  const timeout = r.error && r.error.code === 'ETIMEDOUT';
  const stdout = r.stdout || '';
  const stderr = r.stderr || '';
  return {
    exit: typeof r.status === 'number' ? r.status : timeout ? 124 : 1,
    stdout,
    stderr,
    saida: stdout + (stderr ? `\n${stderr}` : ''),
    duracaoMs: Date.now() - inicio,
    timeout,
    erro: r.error && !timeout ? r.error.message : undefined,
  };
}

export function ultimasLinhas(texto, n = 40) {
  const linhas = String(texto || '').split('\n');
  return linhas.slice(Math.max(0, linhas.length - n)).join('\n');
}

// Glob simples: **, *, ?, {a,b} (as opções aceitam curingas e chaves aninhadas). Caminhos sempre com "/".
// Chave sem fechar é literal. Nunca lança nem entra em laço: um glob que não vira regex não casa nada.
const cacheGlob = new Map();
const NUNCA_CASA = /(?!)/;
const escaparRx = (c) => c.replace(/[.+^$()|[\]\\*?{}]/g, '\\$&');

/** Índice da "}" que fecha a "{" em i (respeitando aninhamento), ou -1. */
export function fimDaChave(glob, i) {
  let nivel = 0;
  for (let j = i; j < glob.length; j += 1) {
    if (glob[j] === '{') nivel += 1;
    else if (glob[j] === '}') {
      nivel -= 1;
      if (nivel === 0) return j;
    }
  }
  return -1;
}

/** Divide as opções de dentro de uma chave pelas vírgulas do nível de cima. */
export function opcoesDaChave(interno) {
  const opcoes = [];
  let nivel = 0;
  let atual = '';
  for (const c of interno) {
    if (c === '{') nivel += 1;
    if (c === '}') nivel -= 1;
    if (c === ',' && nivel === 0) {
      opcoes.push(atual);
      atual = '';
    } else atual += c;
  }
  opcoes.push(atual);
  return opcoes;
}

function corpoDoGlob(glob, profundidade = 0) {
  if (profundidade > 20) throw new Error('chaves aninhadas demais');
  let re = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // "**/" casa zero ou mais diretórios
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 3;
        } else {
          re += '.*';
          i += 2;
        }
      } else {
        re += '[^/]*';
        i += 1;
      }
    } else if (c === '?') {
      re += '[^/]';
      i += 1;
    } else if (c === '{') {
      const fim = fimDaChave(glob, i);
      if (fim < 0) {
        // Chave sem fechar: literal (antes, indexOf devolvia -1 e o laço nunca terminava).
        re += '\\{';
        i += 1;
      } else {
        re += `(?:${opcoesDaChave(glob.slice(i + 1, fim)).map((o) => corpoDoGlob(o, profundidade + 1)).join('|')})`;
        i = fim + 1;
      }
    } else {
      re += escaparRx(c);
      i += 1;
    }
  }
  return re;
}

export function globParaRegex(glob) {
  if (cacheGlob.has(glob)) return cacheGlob.get(glob);
  let rx;
  try {
    rx = new RegExp(`^${corpoDoGlob(String(glob))}$`);
  } catch {
    rx = NUNCA_CASA;
  }
  cacheGlob.set(glob, rx);
  return rx;
}

/** Problema de um glob (para o doctor), ou null: vazio, chave sem fechar ou que não vira expressão regular. */
export function validarGlob(glob) {
  if (typeof glob !== 'string' || !glob.trim()) return 'glob vazio';
  let nivel = 0;
  for (const c of glob) {
    if (c === '{') nivel += 1;
    else if (c === '}') nivel -= 1;
    if (nivel < 0) return `"}" sem "{" em "${glob}"`;
  }
  if (nivel !== 0) return `chave sem fechar em "${glob}"`;
  try {
    new RegExp(`^${corpoDoGlob(glob)}$`);
  } catch (e) {
    return `glob inválido "${glob}" (${e.message})`;
  }
  return null;
}

export function casaAlgum(caminhoRel, globs = []) {
  const p = caminhoRel.split(path.sep).join('/').replace(/^\.\//, '');
  return globs.some((g) => globParaRegex(g).test(p));
}

// ---------------------------------------------------------------------------
// Projeto e caminhos
// ---------------------------------------------------------------------------

export function acharRaizProjeto(inicio = process.cwd()) {
  let atual = path.resolve(inicio);
  for (;;) {
    if (existe(path.join(atual, DIR, 'config.json'))) return atual;
    const pai = path.dirname(atual);
    if (pai === atual) return null;
    atual = pai;
  }
}

export function caminhos(raiz, idTask) {
  const base = path.join(raiz, DIR);
  const c = {
    raiz,
    base,
    config: path.join(base, 'config.json'),
    runtime: path.join(base, 'runtime'),
    pluginRoot: path.join(base, 'runtime', 'plugin-root'),
    sessao: path.join(base, 'runtime', 'session.json'),
    taskAtiva: path.join(base, 'runtime', 'active-task'),
    guardaParada: path.join(base, 'runtime', 'stop-guard.json'),
    registro: path.join(base, 'runtime', 'registro-tasks.json'),
    batimento: path.join(base, 'runtime', 'heartbeat.json'),
    batimentoBash: path.join(base, 'runtime', 'heartbeat-bash.json'),
    ambiente: path.join(base, 'runtime', 'ambiente.json'),
    subagentes: path.join(base, 'runtime', 'subagentes.jsonl'),
    subagentesFim: path.join(base, 'runtime', 'subagentes-fim.jsonl'),
    subagentesCorte: path.join(base, 'runtime', 'subagentes-corte.json'),
    respostasHumano: path.join(base, 'runtime', 'respostas-humano.jsonl'),
    tasks: path.join(base, 'tasks'),
  };
  if (idTask) {
    const t = path.join(c.tasks, idTask);
    Object.assign(c, {
      task: t,
      card: path.join(t, 'card.md'),
      spec: path.join(t, 'spec.md'),
      plano: path.join(t, 'plan.md'),
      planoRevisao: path.join(t, 'plano-revisao.json'),
      decisoes: path.join(t, 'decisoes.md'),
      estado: path.join(t, 'state.json'),
      findings: path.join(t, 'findings.json'),
      revisoes: path.join(t, 'revisoes'),
      evidencias: path.join(t, 'evidencias'),
      red: path.join(t, 'evidencias', 'red.json'),
      baselineTestes: path.join(t, 'evidencias', 'baseline-testes.json'),
      testesDiff: path.join(t, 'evidencias', 'testes-diff.json'),
      edicoesTestes: path.join(t, 'evidencias', 'edicoes-testes.jsonl'),
      julgamento: path.join(t, 'verificacao-julgamento.json'),
      verificacao: path.join(t, 'verificacao.json'),
      manifest: path.join(t, 'manifest.json'),
      pr: path.join(t, 'pr.md'),
      relatorio: path.join(t, 'report.md'),
      relatorios: path.join(t, 'relatorios'),
      ajustes: path.join(t, 'ajustes'),
      entregas: path.join(t, 'evidencias', 'entregas'),
    });
  }
  return c;
}

export function carregarConfig(raiz) {
  const c = caminhos(raiz);
  const doArquivo = lerJSON(c.config, {});
  return mesclarProfundo(CONFIG_PADRAO, doArquivo);
}

export function resolverComando(config, comando) {
  if (!comando) return '';
  if (comando.startsWith('@')) return (config.comandos || {})[comando.slice(1)] || '';
  return comando;
}

// ---------------------------------------------------------------------------
// Task ativa e estado
// ---------------------------------------------------------------------------

export function idTaskAtiva(raiz) {
  const c = caminhos(raiz);
  try {
    const id = fs.readFileSync(c.taskAtiva, 'utf8').trim();
    return id || null;
  } catch {
    return null;
  }
}

export function definirTaskAtiva(raiz, id) {
  const c = caminhos(raiz);
  fs.mkdirSync(c.runtime, { recursive: true });
  if (id) fs.writeFileSync(c.taskAtiva, `${id}\n`);
  else if (existe(c.taskAtiva)) fs.unlinkSync(c.taskAtiva);
}

// Registro das execuções de task (em runtime/, que só a CLI e os hooks alteram).
// Impede que apagar a pasta de uma task em andamento "zere" iterações e orçamento.
export function lerRegistro(raiz) {
  return lerJSON(caminhos(raiz).registro, {});
}

export function marcarRegistro(raiz, id, dados) {
  const reg = lerRegistro(raiz);
  reg[id] = { ...(reg[id] || {}), ...dados };
  gravarJSON(caminhos(raiz).registro, reg);
}

/** Subagentes iniciados (registrados pelo hook PreToolUse de Task/Agent). */
export function lerSubagentes(raiz) {
  return lerJsonl(caminhos(raiz).subagentes);
}

/** Subagentes que terminaram (registrados pelo hook SubagentStop). */
export function lerFinsDeSubagentes(raiz) {
  return lerJsonl(caminhos(raiz).subagentesFim);
}

/**
 * Subagentes que a sessão principal disparou na task e que ainda não terminaram. Cada fim casa com o disparo
 * mais antigo do mesmo papel (FIFO). Não contam: disparos sem fim mais velhos que esperaMaxMin (o SubagentStop
 * pode ter se perdido, ou a chamada nem chegou a rodar) e disparos anteriores ao último início de processo
 * (runtime/subagentes-corte.json, gravado no SessionStart): subagentes em segundo plano morrem com o processo.
 */
export function subagentesEmAndamento(raiz, idTask, { esperaMaxMin = 180, agora = Date.now() } = {}) {
  const papel = (t) => String(t || '').split(':').pop();
  // Antes de casar: o que é de um processo anterior não casa com nada deste (nem disparo, nem fim).
  const inicioProcesso = Date.parse(lerJSON(caminhos(raiz).subagentesCorte, {}).em || 0) || 0;
  const desteProcesso = (r) => r.task === idTask && Date.parse(r.em) >= inicioProcesso;
  const pendentes = lerSubagentes(raiz).filter((r) => desteProcesso(r) && (r.chamador || 'principal') === 'principal');
  for (const f of lerFinsDeSubagentes(raiz).filter(desteProcesso)) {
    const i = pendentes.findIndex((r) => (!f.tipo || papel(r.tipo) === papel(f.tipo)) && Date.parse(r.em) <= Date.parse(f.em));
    if (i >= 0) pendentes.splice(i, 1);
  }
  return pendentes.filter((r) => Date.parse(r.em) >= agora - esperaMaxMin * 60000);
}

function lerJsonl(arquivo) {
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
    return [];
  }
}

export function validarIdTask(id) {
  if (!id || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id)) {
    throw new Error(`ID de task inválido: "${id}". Use letras, números, ponto, hífen ou sublinhado (ex.: VST-123).`);
  }
  return id;
}

export function estadoInicial(id, titulo, modo = 'task') {
  const agora = agoraISO();
  return {
    id,
    titulo: titulo || '',
    modo, // task | revisao
    criadoEm: agora,
    atualizadoEm: agora,
    fase: 'intake',
    historicoFases: [{ fase: 'intake', em: agora }],
    status: 'em_andamento',
    meta: {
      complexidade: 'M',
      risco: 'medio',
      ui: null,
      dadosPessoais: false,
      branch: null,
      tipo: 'feat',
      fonte: null,
      cardUrl: null,
    },
    iteracao: 0,
    iteracoes: [],
    orcamento: { sessoes: {}, tokensUsados: 0, atualizadoEm: null },
    ultimoGate: null,
    veredito: null,
    motivo: null,
    pausada: false,
    encerradaEm: null,
  };
}

export function lerEstado(raiz, id) {
  const c = caminhos(raiz, id);
  if (!existe(c.estado)) throw new Error(`Task ${id} não encontrada em ${c.task}. Rode "wf init-task ${id}".`);
  return lerJSON(c.estado);
}

export function gravarEstado(raiz, estado) {
  const c = caminhos(raiz, estado.id);
  estado.atualizadoEm = agoraISO();
  gravarJSON(c.estado, estado);
}

export function limitesDaTask(config, estado) {
  const comp = ['P', 'M', 'G'].includes(estado?.meta?.complexidade) ? estado.meta.complexidade : 'M';
  const l = { ...CONFIG_PADRAO.limites, ...(config.limites || {}) };
  // Extensões concedidas pelo humano numa decisão (wf decisao aplicar): somam ao limite, nunca zeram o que foi feito.
  const extra = estado?.limitesExtra || {};
  return {
    complexidade: comp,
    maxIteracoes: l.maxIteracoes + (extra.iteracoes || 0),
    maxRodadasPlano: l.maxRodadasPlano,
    maxReaberturas: l.maxReaberturasMesmoFinding + (extra.reaberturas || 0),
    maxFalhasGate: l.maxFalhasGateSeguidas + (extra.falhasGate || 0),
    semProgressoPor: Math.max(1, l.semProgressoPor ?? 2),
    maxBloqueiosDeParada: l.maxBloqueiosDeParada,
  };
}

/** Rodadas de code review feitas (iterações com triagem). É o que conta para LIMITE_ITERACOES. */
export function rodadasRevisao(estado) {
  return (estado?.iteracoes || []).filter((i) => i.triagem).length;
}

/**
 * Volta uma task encerrada (ou parada por veredito) a trabalhar na fase indicada, sem perder nada do que foi
 * feito: zera veredito e encerramento, reativa a task e registra o evento. Usada pela decisão humana
 * (desbloqueio) e pelo ajuste pós-entrega.
 */
export function reabrirEstado(raiz, estado, { fase, evento, retomada = null }) {
  const agora = agoraISO();
  estado.bloqueio = null;
  estado.veredito = null;
  estado.status = 'em_andamento';
  estado.motivo = null;
  estado.encerradaEm = null;
  estado.alertaParada = null;
  // Reabrir é pedido do humano (decisão ou ajuste): a task volta a andar sozinha, mesmo que estivesse pausada.
  estado.pausada = false;
  estado.fase = fase;
  if (retomada) estado.retomada = { ...retomada, fase: retomada.fase || fase, em: agora };
  estado.historicoFases.push({ fase, em: agora, evento });
  marcarRegistro(raiz, estado.id, { encerradaEm: null, veredito: null });
  definirTaskAtiva(raiz, estado.id);
  try {
    fs.unlinkSync(caminhos(raiz, estado.id).guardaParada);
  } catch {
    /* sem guarda de parada */
  }
}

// ---------------------------------------------------------------------------
// Git
// ---------------------------------------------------------------------------

export function git(raiz, args) {
  const r = spawnSync('git', args, { cwd: raiz, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { exit: r.status ?? 1, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

export function gitHead(raiz) {
  const r = git(raiz, ['rev-parse', 'HEAD']);
  return r.exit === 0 ? r.out : null;
}

export function gitBranchAtual(raiz) {
  const r = git(raiz, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return r.exit === 0 ? r.out : null;
}

export function gitLimpo(raiz) {
  const r = git(raiz, ['status', '--porcelain', '--untracked-files=all']);
  if (r.exit !== 0) return { limpo: false, sujos: ['(git status falhou: ' + r.err + ')'] };
  const sujos = r.out
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3))
    .filter((f) => !f.startsWith(`${DIR}/tasks/`) && !f.startsWith(`${DIR}/runtime/`) && !f.startsWith(`${DIR}/ci/`));
  return { limpo: sujos.length === 0, sujos };
}

export function gitArquivosRastreados(raiz) {
  const r = git(raiz, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  if (r.exit !== 0) return [];
  return r.out.split('\0').filter(Boolean);
}

/** Referência do branch base para diffs: prefere origin/<base> (atualizado pelo fetch) ao branch local. */
export function refBase(raiz, base) {
  for (const ref of [`origin/${base}`, base]) {
    if (git(raiz, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).exit === 0) return ref;
  }
  return base;
}

/** Branch base da task: a escolhida no init-task/"wf base", a da revisão ou a do projeto (git.branchBase). */
export function baseDaTask(estado, config) {
  return estado?.base || (estado?.modo === 'revisao' && estado?.baseRevisao) || config?.git?.branchBase || 'main';
}

/**
 * Nome de ref ou sha aceito como base: letras, números, ".", "_", "/" e "-", sem começar por "-" ou "." e sem "..".
 * Só caracteres seguros para o shell: {base} entra nos comandos do gate sem aspas (o padrão de segredos já usa
 * "{base}..HEAD" entre aspas duplas) e nunca leva sintaxe de revisão como ":/regex", "^" ou "@{".
 */
export function refSegura(b) {
  return typeof b === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(b) && !b.includes('..') && !b.endsWith('/') && !b.endsWith('.lock');
}

/** Sha do commit de uma ref, ou null. */
export function shaDaRef(raiz, ref) {
  const r = git(raiz, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  return r.exit === 0 ? r.out : null;
}

/**
 * Confere a base da task antes de gate, RED e verificação: o nome é uma ref segura e, quando há motivo, a base não
 * contém o HEAD ({base}..HEAD vazio deixaria cegos o gitleaks, o diff dos revisores, o RED e a regra de migration).
 * Há motivo no loop e na verificação (a task já tem commits) ou quando a base própria da task (≠ git.branchBase)
 * andou desde que foi validada (estado.baseValidada.sha). Nas fases testes/implementação, sem commit próprio ainda,
 * {base}..HEAD vazio é legítimo.
 */
export function conferirBase(raiz, estado, config) {
  const nome = baseDaTask(estado, config);
  if (!refSegura(nome)) return { ok: false, codigo: 'BASE_INVALIDA', mensagem: `Base da task inválida ("${nome}"): só nome de branch ou sha (letras, números, ".", "_", "/" e "-"). Corrija com "wf base <branch> --motivo ...".` };
  const ref = refBase(raiz, nome);
  if (!gitHead(raiz)) return { ok: true, ref };
  const branchBase = config?.git?.branchBase;
  const validada = estado?.baseValidada;
  const movida = !!(estado?.base && estado.base !== branchBase && validada?.sha && shaDaRef(raiz, ref) !== validada.sha);
  if (!['loop', 'verificacao'].includes(estado?.fase) && !movida) return { ok: true, ref };
  const n = git(raiz, ['rev-list', '--count', `${ref}..HEAD`]);
  if (n.exit === 0 && Number(n.out) === 0) {
    return {
      ok: false,
      codigo: 'BASE_CONTEM_HEAD',
      mensagem: `A base da task (${ref}) contém o HEAD: ${ref}..HEAD está vazio${movida ? ` e a ref mudou desde que foi validada (${String(validada.sha).slice(0, 7)})` : ''}. Gate, RED, revisores e a regra de migration ficariam cegos. Se a branch-mãe foi mergeada, troque a base com "wf base <branch> --motivo ..."; não aponte a base para os commits da task.`,
    };
  }
  return { ok: true, ref };
}

/** Arquivos rastreados alterados (git status sem os não rastreados): muda se algo for editado durante um gate. */
export function estadoRastreados(raiz) {
  const r = git(raiz, ['status', '--porcelain', '--untracked-files=no']);
  return r.exit === 0 ? r.out : `(git status falhou: ${r.err})`;
}

export function gitExisteNoBase(raiz, base, arquivoRel) {
  for (const ref of [base, `origin/${base}`]) {
    const r = git(raiz, ['cat-file', '-e', `${ref}:${arquivoRel}`]);
    if (r.exit === 0) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Saída padronizada da CLI
// ---------------------------------------------------------------------------

export function saida(obj, codigo = 0) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  process.exit(codigo);
}

export function falha(mensagem, extra = {}, codigo = 1) {
  saida({ ok: false, mensagem, ...extra }, codigo);
}
