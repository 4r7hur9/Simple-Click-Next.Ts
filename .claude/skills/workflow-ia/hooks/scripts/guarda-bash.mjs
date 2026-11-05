#!/usr/bin/env node
// PreToolUse (Bash): cercas que nenhuma instrução do card, do código ou do
// próprio agente libera.
//  - PR e merge são do humano (gh pr create/merge, API REST/GraphQL de pulls)
//  - nada de push/commit/merge em branch protegido, force push ou --no-verify
//  - push só do branch da task ativa; aliases e configs de push não contornam
//  - nada de comandos destrutivos no banco, rm -rf amplo, deploy em produção
//  - nada de ler/despejar segredos (.env, env, printenv) no transcript
//  - estado/provas do Workflow IA só mudam pela CLI wf; migrations aplicadas não mudam
//
// É uma cerca, não um sandbox: scripts arbitrários (node/python lendo ou
// escrevendo arquivos por conta própria) continuam fora do alcance.

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { contexto, negar, taskEmExecucao } from './_comum.mjs';
import {
  casaAlgum,
  globParaRegex,
  gitBranchAtual,
  git,
  lerJSON,
  relativoReal,
  realpathParcial,
  expandirHome,
  ehEstadoProtegido,
  ehConfigHumana,
  ehArquivoEnv,
  ehMigration,
  gitExisteNoBase,
  baseDaTask,
  donoDoArquivoDaTask,
  agenteEh,
} from '../../scripts/lib/core.mjs';

const { entrada, raiz, config, estado } = contexto();
if (entrada.tool_name && entrada.tool_name !== 'Bash') process.exit(0);
const comando = String(entrada.tool_input?.command || '');
if (!comando.trim()) process.exit(0);

const agente = entrada.agent_type || null;
const cwdInicial = entrada.cwd && fs.existsSync(entrada.cwd) ? entrada.cwd : raiz;
const HOME = realpathParcial(os.homedir());
const RAIZ_REAL = realpathParcial(raiz);

// ---------------------------------------------------------------------------
// Heredocs: o corpo é dado, não comando. Sai da análise de comandos, mas entra
// na análise de SQL (psql <<SQL ... SQL).
// ---------------------------------------------------------------------------
function separarHeredocs(texto) {
  const linhas = texto.split('\n');
  const fora = [];
  const corpos = [];
  let delim = null;
  let corpo = [];
  for (const l of linhas) {
    if (delim) {
      if (l.replace(/^\t+/, '').trim() === delim) {
        corpos.push(corpo.join('\n'));
        corpo = [];
        delim = null;
        fora.push('');
      } else corpo.push(l);
      continue;
    }
    fora.push(l);
    const m = l.match(/<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1/);
    if (m && !/<<</.test(l.slice(0, m.index + 3))) delim = m[2];
  }
  if (corpo.length) corpos.push(corpo.join('\n'));
  return { comandos: fora.join('\n'), corpos };
}

// ---------------------------------------------------------------------------
// Tokenização simplificada de shell: respeita aspas e separa comandos por
// operadores (&&, ||, ;, |, &, quebra de linha, parênteses, chaves).
// ---------------------------------------------------------------------------
function segmentar(texto) {
  const segs = [];
  let atual = [];
  let tok = '';
  let temTok = false;
  let i = 0;
  const empurraTok = () => {
    if (temTok) atual.push(tok);
    tok = '';
    temTok = false;
  };
  const empurraSeg = () => {
    empurraTok();
    if (atual.length) segs.push(atual);
    atual = [];
  };
  while (i < texto.length) {
    const c = texto[i];
    if (c === "'") {
      const fim = texto.indexOf("'", i + 1);
      tok += fim === -1 ? texto.slice(i + 1) : texto.slice(i + 1, fim);
      temTok = true;
      i = fim === -1 ? texto.length : fim + 1;
    } else if (c === '"') {
      i += 1;
      while (i < texto.length && texto[i] !== '"') {
        if (texto[i] === '\\' && i + 1 < texto.length) {
          tok += texto[i + 1];
          i += 2;
        } else {
          tok += texto[i];
          i += 1;
        }
      }
      temTok = true;
      i += 1;
    } else if (c === '\\' && i + 1 < texto.length) {
      if (texto[i + 1] === '\n') {
        i += 2;
      } else {
        tok += texto[i + 1];
        temTok = true;
        i += 2;
      }
    } else if (c === '$' && texto[i + 1] === '{') {
      const fim = texto.indexOf('}', i);
      tok += fim === -1 ? texto.slice(i) : texto.slice(i, fim + 1);
      temTok = true;
      i = fim === -1 ? texto.length : fim + 1;
    } else if (c === '$' && texto[i + 1] === '(') {
      empurraSeg();
      i += 2;
    } else if (c === ' ' || c === '\t') {
      empurraTok();
      i += 1;
    } else if (c === '\n' || c === ';' || c === '(' || c === ')' || c === '{' || c === '}') {
      empurraSeg();
      i += 1;
    } else if (c === '&' || c === '|') {
      if (texto[i + 1] === '>' && c === '&') {
        // &> redirecionamento
        empurraTok();
        atual.push('>');
        i += texto[i + 2] === '>' ? 3 : 2;
      } else {
        empurraSeg();
        i += texto[i + 1] === c ? 2 : 1;
      }
    } else if (c === '>' || c === '<') {
      // "2>" e "1>": o número não é argumento
      if (/^\d$/.test(tok) && temTok) {
        tok = '';
        temTok = false;
      }
      empurraTok();
      let op = c;
      let n = 1;
      if (texto[i + 1] === c) {
        op += c;
        n = 2;
        if (texto[i + 2] === c) n = 3; // <<< here-string
      } else if (c === '>' && (texto[i + 1] === '|' || texto[i + 1] === '&')) {
        n = 2; // >| (força sobrescrita) e >& são redirecionamentos, não pipe
      }
      atual.push(op === '<<' ? '<<' : op);
      i += n;
    } else if (c === '`') {
      empurraSeg();
      i += 1;
    } else {
      tok += c;
      temTok = true;
      i += 1;
    }
  }
  empurraSeg();
  return segs;
}

const ehAtribuicao = (t) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(t);
const INVOLUCROS = new Set(['sudo', 'command', 'env', 'time', 'nohup', 'exec', 'builtin', 'xargs', 'watch', 'nice', 'stdbuf', 'caffeinate', 'npx', 'bunx']);

// Quem chama por xargs completa os argumentos em tempo de execução: o destino fica desconhecido.
let viaXargs = false;

function normalizar(argv) {
  viaXargs = false;
  let a = [...argv];
  // remove atribuições VAR=valor, invólucros e executores de pacote
  for (;;) {
    if (!a.length) break;
    if (ehAtribuicao(a[0])) {
      a = a.slice(1);
      continue;
    }
    if (a[0] === 'timeout') {
      a = a.slice(1);
      while (a.length && a[0].startsWith('-')) a = a.slice(1);
      a = a.slice(1); // duração
      continue;
    }
    if (INVOLUCROS.has(a[0])) {
      if (a[0] === 'xargs') viaXargs = true;
      a = a.slice(1);
      while (a.length && (a[0].startsWith('-') || ehAtribuicao(a[0]))) a = a.slice(1);
      continue;
    }
    if ((a[0] === 'pnpm' || a[0] === 'yarn') && ['exec', 'dlx'].includes(a[1])) {
      a = a.slice(2);
      continue;
    }
    if (a[0] === 'npm' && a[1] === 'exec') {
      a = a.slice(2);
      while (a.length && (a[0].startsWith('-') || a[0] === '--')) a = a.slice(1);
      continue;
    }
    break;
  }
  if (a.length) a[0] = a[0].split('/').pop();
  return a;
}

// ---------------------------------------------------------------------------
// Contexto da task e de git
// ---------------------------------------------------------------------------
const protegidos = new Set(config.git.branchesProtegidos || []);
const branchTask = estado && taskEmExecucao(estado) ? estado.meta?.branch : null;
let branchSimulado = gitBranchAtual(raiz);

// Configurações de git que redirecionam push, executam comandos ou desligam hooks.
const RX_GIT_CONFIG_PERIGOSA = /^(?:alias\..+|core\.hookspath|core\.sshcommand|remote\..+\.(?:push|pushurl|mirror|receivepack)|remote\.pushdefault|push\..+|branch\..+\.(?:merge|remote|pushremote)|url\..+\.(?:insteadof|pushinsteadof))$/i;

const GIT_BUILTINS = new Set(
  'add am annotate apply archive bisect blame branch bundle cat-file check-attr check-ignore check-mailmap checkout checkout-index cherry cherry-pick citool clean clone commit commit-graph commit-tree config count-objects credential describe diff diff-files diff-index diff-tree difftool fetch fetch-pack filter-branch for-each-ref format-patch fsck gc grep hash-object help http-push init interpret-trailers log ls-files ls-remote ls-tree maintenance merge merge-base merge-file merge-tree mergetool mktag mktree mv name-rev notes pack-objects prune pull push range-diff read-tree rebase receive-pack reflog remote repack replace request-pull rerere reset restore rev-list rev-parse revert rm send-email send-pack shortlog show show-branch show-ref sparse-checkout stash status stripspace submodule switch symbolic-ref tag unpack-objects update-index update-ref var verify-commit verify-pack verify-tag version whatchanged worktree write-tree'.split(' ')
);

function destino(ref) {
  let r = ref.replace(/^\+/, '');
  if (r.includes(':')) r = r.split(':').pop();
  if (!r) return r;
  r = path.posix.normalize(r).replace(/^\/+/, '');
  // "heads/main" e "refs/heads/main" apontam para refs/heads/main no remoto
  return r.replace(/^(?:refs\/)?heads\//, '');
}

// ---------------------------------------------------------------------------
// Arquivos: resolução e proteção
// ---------------------------------------------------------------------------
function absDe(t, ctx) {
  return realpathParcial(path.resolve(ctx.cwd, expandirHome(t)));
}

function relDe(t, ctx) {
  return relativoReal(raiz, t, ctx.cwd);
}

const pareceCaminho = (t) => !!t && !t.startsWith('-') && !/\s/.test(t) && !/^[a-z][\w+.-]*:\/\//i.test(t);

// Escrita proibida para o agente (independe do comando usado).
function motivoEscritaProibida(t, ctx) {
  if (!pareceCaminho(t)) return null;
  const abs = absDe(t, ctx);
  if (abs === path.join(HOME, '.gitconfig') || abs.startsWith(path.join(HOME, '.claude') + path.sep) || abs.startsWith(path.join(HOME, '.config', 'git') + path.sep) || abs.startsWith(path.join(HOME, '.config', 'gh') + path.sep)) {
    return 'configuração global do git, do gh ou do Claude Code';
  }
  const rel = relDe(t, ctx);
  if (!rel) return null;
  if (ehArquivoEnv(rel, config)) return 'arquivo de segredos (.env)';
  if (ehEstadoProtegido(rel)) return 'estado/provas do Workflow IA';
  if (ehConfigHumana(rel)) return 'configuração de repositório (CI, hooks git, settings do Claude, .git)';
  const dono = donoDoArquivoDaTask(rel);
  if (dono && !agenteEh(agente, dono)) return `arquivo que só o subagente ${dono} grava`;
  if (ehMigration(rel, config) && (gitExisteNoBase(raiz, config.git.branchBase, rel) || gitExisteNoBase(raiz, baseDaTask(estado, config), rel))) return 'migration já aplicada (existe no branch base)';
  return null;
}

const MSG_ESTADO =
  'Arquivos de estado/provas do Workflow IA (config.json, wf, runtime/, tasks/<ID>/{state,findings,verificacao,manifest}.json, evidencias/ e a própria pasta da task), configuração do repositório (.claude/settings, .github/workflows, .husky, .git), migrations já aplicadas e os arquivos de outros subagentes (plano-revisao.json, verificacao-julgamento.json, revisoes/) não podem ser alterados por este comando. Use a CLI ".workflow-ia/wf"; mudanças de configuração são decisão humana.';

function negarEscrita(t, ctx) {
  const m = motivoEscritaProibida(t, ctx);
  if (m) negar(`"${t}": ${m}. ${MSG_ESTADO}`);
}

// Leitura de .env: resolve globs contra o diretório real.
function tokenApontaParaEnv(t, ctx) {
  if (!t || t.startsWith('-') || /\s/.test(t)) return false;
  let valor = t.includes('=') && !t.startsWith('.') ? t.slice(t.indexOf('=') + 1) : t;
  // "<rev>:<caminho>" (git show HEAD:.env, git show :.env)
  if (valor.includes(':') && !/^[a-z][\w+.-]*:\/\//i.test(valor)) valor = valor.slice(valor.lastIndexOf(':') + 1);
  if (!valor) return false;
  if (/[*?[]/.test(valor)) {
    const dirAbs = absDe(path.dirname(valor) || '.', ctx);
    const padrao = path.basename(valor);
    let nomes = [];
    try {
      nomes = fs.readdirSync(dirAbs);
    } catch {
      return false;
    }
    const rx = globParaRegex(padrao);
    return nomes.some((n) => (n.startsWith('.') ? padrao.startsWith('.') : true) && rx.test(n) && ehArquivoEnv(relativoReal(raiz, path.join(dirAbs, n)) || n, config));
  }
  const rel = relDe(valor, ctx);
  return ehArquivoEnv(rel || valor.split('/').pop(), config);
}

function dirTemEnv(abs, profundidade = 5) {
  if (profundidade < 0) return false;
  let entradas = [];
  try {
    entradas = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const e of entradas) {
    if (e.isDirectory()) {
      if (['node_modules', '.git', '.next', 'dist', 'build'].includes(e.name)) continue;
      if (dirTemEnv(path.join(abs, e.name), profundidade - 1)) return true;
    } else {
      const rel = relativoReal(raiz, path.join(abs, e.name));
      if (rel && ehArquivoEnv(rel, config)) return true;
    }
  }
  return false;
}

const MSG_ENV = 'contém segredos e não pode ser lido, copiado, listado em conteúdo nem movido pelo agente. Use .env.example para saber quais variáveis existem.';
const LEITORES = new Set(['cat', 'less', 'more', 'head', 'tail', 'jq', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'ls', 'wc', 'diff', 'stat', 'file', 'bat', 'test', '[', 'sha256sum', 'shasum', 'md5', 'md5sum', 'tree', 'realpath', 'readlink', 'basename', 'dirname', 'echo', 'printf']);
const SEM_LEITURA_ENV = new Set(['ls', 'test', '[', 'stat', 'file', 'realpath', 'readlink', 'basename', 'dirname', 'tree', 'echo', 'printf']);
const INTERPRETADORES = new Set(['node', 'python', 'python3', 'ruby', 'perl', 'deno', 'bun', 'php']);

// ---------------------------------------------------------------------------
// SQL destrutivo (analisado no comando inteiro, heredocs e arquivos -f)
// ---------------------------------------------------------------------------
const DB_CLIS = new Set(['psql', 'mysql', 'mariadb', 'sqlite3', 'mongosh', 'mongo', 'redis-cli', 'pgcli', 'mycli', 'clickhouse-client']);
let usaBanco = false;
const textosSql = [];

function sqlDestrutivo(texto) {
  const limpo = String(texto)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  if (/\bflush(?:all|db)\b|\bdropdatabase\s*\(|\.drop\s*\(\s*\)/.test(limpo)) return 'FLUSH/dropDatabase';
  for (const st of limpo.split(';')) {
    if (/\bdrop\s+(?:database|schema|table|owned|view|materialized\s+view|column|type|function|extension|role|user)\b/.test(st)) return 'DROP';
    if (/\btruncate\b/.test(st)) return 'TRUNCATE';
    if (/\balter\s+table\b.*\b(?:drop|rename)\b/.test(st)) return 'ALTER TABLE ... DROP/RENAME';
    if (/\bdelete\s+from\b/.test(st) && !/\bwhere\b/.test(st)) return 'DELETE sem WHERE';
    if (/\bupdate\s+[\w".]+\s+set\b/.test(st) && !/\bwhere\b/.test(st)) return 'UPDATE sem WHERE';
  }
  return null;
}

function lerArquivoPequeno(t, ctx) {
  try {
    const abs = absDe(t, ctx);
    if (fs.statSync(abs).size > 2 * 1024 * 1024) return '';
    return fs.readFileSync(abs, 'utf8');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Scripts do package.json (npm run x, pnpm x, yarn x, bun run x)
// ---------------------------------------------------------------------------
const PM_BUILTINS = new Set(['install', 'i', 'add', 'remove', 'rm', 'uninstall', 'update', 'up', 'upgrade', 'ci', 'audit', 'outdated', 'list', 'ls', 'why', 'init', 'create', 'publish', 'pack', 'link', 'unlink', 'config', 'set', 'store', 'cache', 'dedupe', 'prune', 'rebuild', 'import', 'patch', 'patch-commit', 'info', 'view', 'version', 'help', 'login', 'logout', 'whoami', 'env', 'root', 'bin', 'licenses', 'fetch', 'deploy', 'setup', 'dlx', 'exec', 'x']);

function scriptDoPacote(a, ctx) {
  const [pm, ...args] = a;
  let nome = null;
  if (pm === 'npm') {
    if (['run', 'run-script', 'rum', 'urn'].includes(args[0])) nome = args.find((t, i) => i > 0 && !t.startsWith('-'));
    else if (['test', 't', 'start', 'stop', 'restart'].includes(args[0])) nome = { t: 'test' }[args[0]] || args[0];
  } else if (['pnpm', 'yarn', 'bun'].includes(pm)) {
    if (args[0] === 'run') nome = args.find((t, i) => i > 0 && !t.startsWith('-'));
    else if (args[0] && !args[0].startsWith('-') && !PM_BUILTINS.has(args[0]) && pm !== 'bun') nome = args[0];
    else if (pm === 'bun' && args[0] === 'test') nome = null;
  }
  if (!nome) return [];
  let dir = ctx.cwd;
  for (;;) {
    const pkg = lerJSON(path.join(dir, 'package.json'), null);
    if (pkg?.scripts) {
      return [`pre${nome}`, nome, `post${nome}`].map((n) => pkg.scripts[n]).filter(Boolean);
    }
    const pai = path.dirname(dir);
    if (pai === dir || !realpathParcial(pai).startsWith(RAIZ_REAL)) return [];
    dir = pai;
  }
}

function receitasMake(cmd, args, ctx) {
  const arquivo = cmd === 'just' ? ['justfile', 'Justfile', '.justfile'] : ['GNUmakefile', 'makefile', 'Makefile'];
  const idxF = args.findIndex((t) => t === '-f' || t === '--file');
  const nomes = idxF > -1 ? [args[idxF + 1]] : arquivo;
  let texto = '';
  for (const n of nomes) {
    texto = lerArquivoPequeno(n, ctx);
    if (texto) break;
  }
  if (!texto) return [];
  const alvos = args.filter((t, i) => !t.startsWith('-') && !t.includes('=') && args[i - 1] !== '-f' && args[i - 1] !== '--file');
  const linhas = texto.split('\n');
  const out = [];
  const coletar = (alvo) => {
    const i = linhas.findIndex((l) => new RegExp(`^${alvo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`).test(l));
    if (i < 0) return;
    for (let j = i + 1; j < linhas.length && /^(\t| {2,})/.test(linhas[j]); j += 1) out.push(linhas[j].trim().replace(/^[@-]+/, ''));
  };
  if (alvos.length) alvos.forEach(coletar);
  else {
    const primeiro = linhas.find((l) => /^[A-Za-z0-9_.-]+\s*:(?!=)/.test(l) && !l.startsWith('.'));
    if (primeiro) coletar(primeiro.split(':')[0].trim());
  }
  return out;
}

// ---------------------------------------------------------------------------
// Análise de um comando simples
// ---------------------------------------------------------------------------
function analisarTexto(texto, ctx, modo, profundidade) {
  if (profundidade > 4) return;
  const { comandos: semCorpos, corpos } = separarHeredocs(texto);
  textosSql.push(...corpos);
  for (const seg of segmentar(semCorpos)) analisar(seg, ctx, modo, profundidade);
}

function analisarGit(args, ctx, modo, profundidade) {
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    const op = args[i];
    if (op === '-c' || op.startsWith('--config-env')) {
      const kv = op === '-c' ? args[i + 1] || '' : op.split('=')[1] || args[i + 1] || '';
      const chave = kv.split('=')[0];
      if (RX_GIT_CONFIG_PERIGOSA.test(chave)) negar(`"git -c ${chave}=..." não é permitido: aliases e configurações de push/hooks podem contornar as cercas (push em branch protegido, verificação desligada).`);
    }
    i += ['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--exec-path'].includes(op) ? 2 : 1;
  }
  const sub = args[i];
  const resto = args.slice(i + 1);
  if (!sub) return;

  // Aliases: expandem para o comando real, que é analisado de novo.
  if (!GIT_BUILTINS.has(sub)) {
    const al = git(raiz, ['config', '--get', `alias.${sub}`]);
    if (al.exit === 0 && al.out) {
      if (al.out.startsWith('!')) analisarTexto(`${al.out.slice(1)} ${resto.join(' ')}`, ctx, modo, profundidade + 1);
      else {
        const exp = segmentar(al.out)[0] || [];
        analisarGit([...exp, ...resto], ctx, modo, profundidade + 1);
      }
      return;
    }
  }

  if (sub === 'worktree' && resto[0] === 'add' && resto.slice(1).some((t) => protegidos.has(t))) {
    negar('"git worktree add" com branch protegido não é permitido: seria um jeito de commitar nele fora do branch da task.');
  }
  if (['send-pack', 'http-push'].includes(sub)) negar(`"git ${sub}" envia refs direto ao remoto sem as regras de push. Use "git push" do branch da task.`);

  const flagsCurtas = resto.filter((t) => /^-[a-zA-Z]+$/.test(t));
  if (resto.includes('--no-verify') || (sub === 'commit' && flagsCurtas.some((t) => t.includes('n')))) {
    negar('--no-verify pula os hooks de verificação (lint, testes, secret scan). Corrija o problema em vez de pular a verificação.');
  }

  if (sub === 'config') {
    const leitura = resto.some((t) => ['--get', '--get-all', '--get-regexp', '--list', '-l', '--get-urlmatch', '--show-origin', '--show-scope'].includes(t) || /^(get|list)$/.test(t));
    const chave = resto.find((t) => !t.startsWith('-') && !['set', 'unset', 'get', 'list', 'edit'].includes(t));
    if (!leitura && chave && RX_GIT_CONFIG_PERIGOSA.test(chave)) {
      negar(`"git config ${chave}" não é permitido: aliases, hooksPath e configurações de push podem contornar as cercas. Mudança de configuração é decisão humana.`);
    }
  }

  if ((sub === 'checkout' || sub === 'switch') && !resto.includes('--')) {
    const alvo = resto.filter((t) => !t.startsWith('-'))[0];
    const criando = resto.some((t) => ['-b', '-B', '-c', '-C', '--create', '--force-create', '--orphan'].includes(t));
    if (alvo && (criando || git(raiz, ['show-ref', '--verify', '--quiet', `refs/heads/${alvo}`]).exit === 0 || git(raiz, ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${alvo}`]).exit === 0)) {
      branchSimulado = alvo;
    }
  }

  // Subcomandos que escrevem nos arquivos passados como argumento.
  if (['rm', 'mv', 'restore'].includes(sub) || (sub === 'checkout' && resto.includes('--'))) {
    const alvos = sub === 'checkout' ? resto.slice(resto.indexOf('--') + 1) : resto.filter((t) => !t.startsWith('-'));
    for (const t of alvos) negarEscrita(t, ctx);
  }
  if (sub === 'clean' && resto.some((t) => /^-[a-zA-Z]*[xX]/.test(t))) {
    negar('"git clean -x/-X" apaga arquivos ignorados pelo git, incluindo o estado e as provas do Workflow IA. Remova arquivos específicos.');
  }

  if (sub === 'push' && ctx.viaXargs) negar('"git push" por xargs não é permitido: o destino só é conhecido em tempo de execução. Rode "git push <remoto> <branch-da-task>" direto.');
  if (sub === 'push') {
    if (config.git.pushBranch === false) negar('Push desativado na configuração (git.pushBranch=false). O humano faz o push.');
    const flagsPush = resto.filter((t) => t.startsWith('-'));
    const proibidas = ['--force', '-f', '--force-with-lease', '--force-if-includes', '--mirror', '--delete', '-d', '--all', '--prune'];
    const achada = flagsPush.find((f) => proibidas.includes(f) || f.startsWith('--force-with-lease=') || f.startsWith('--repo') || (/^-[a-zA-Z]+$/.test(f) && /[fd]/.test(f.slice(1))));
    if (achada) negar(`"git push ${achada}" não é permitido (reescreve, apaga ou redireciona histórico remoto).`);
    const posicionais = resto.filter((t) => !t.startsWith('-'));
    const remoto = posicionais[0] || config.git.remoto || 'origin';
    const refspecs = posicionais.slice(1);
    if (refspecs.some((r) => r.startsWith(':') || r.startsWith('+'))) negar('Refspec de exclusão (":branch") ou forçado ("+branch") não é permitido.');
    let destinos;
    if (refspecs.length) destinos = refspecs.map(destino);
    else {
      // Sem refspec, o git usa remote.<r>.push, push.default e o upstream: descobre o destino real.
      destinos = [branchSimulado];
      const cfg = git(raiz, ['config', '--get-all', `remote.${remoto}.push`]);
      if (cfg.exit === 0 && cfg.out) destinos.push(...cfg.out.split('\n').filter(Boolean).map(destino));
      const up = git(raiz, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', `${branchSimulado}@{push}`]);
      if (up.exit === 0 && up.out) destinos.push(up.out.replace(new RegExp(`^${remoto}/`), ''));
    }
    const resolvidos = destinos.map((d) => (d === 'HEAD' || d === '@' ? branchSimulado : d));
    const protegido = resolvidos.find((d) => protegidos.has(d));
    if (protegido) negar(`Push para o branch protegido "${protegido}" não é permitido. O agente só envia o branch da task; o merge é do humano.`);
    if (branchTask) {
      const outro = resolvidos.find((d) => d && d !== branchTask && !d.startsWith('refs/tags/'));
      if (outro) negar(`Durante a task, só é permitido push do branch da task ("${branchTask}"), não de "${outro}".`);
    }
  }

  if (estado && estado.fase !== 'encerrada') {
    if (['commit', 'merge', 'rebase', 'cherry-pick', 'revert', 'am', 'pull'].includes(sub) && protegidos.has(branchSimulado)) {
      negar(`"git ${sub}" no branch protegido "${branchSimulado}" não é permitido enquanto houver task aberta. Trabalhe no branch da task.`);
    }
  }
  if (sub === 'branch' && resto.some((t) => ['-D', '-d', '--delete', '-m', '-M', '--move', '-f', '--force'].includes(t))) {
    const alvo = resto.filter((t) => !t.startsWith('-'));
    if (alvo.some((b) => protegidos.has(b))) negar('Apagar, renomear ou forçar um branch protegido não é permitido.');
  }
  if (sub === 'update-ref' && resto.some((t) => [...protegidos].some((p) => t === `refs/heads/${p}` || t === p))) negar('Alterar a referência de um branch protegido não é permitido.');
}

const RX_MUTACAO_PR = /\b(?:createPullRequest|mergePullRequest|enablePullRequestAutoMerge|markPullRequestReadyForReview|reopenPullRequest|mergeBranch)\b/;
const GH_FLAGS_COM_VALOR = new Set(['-R', '--repo', '--hostname', '-H', '--header', '-X', '--method', '-f', '-F', '--field', '--raw-field', '--input', '-q', '--jq', '-t', '--template', '--cache', '-p', '--preview']);

function aliasesGh() {
  try {
    const r = spawnSync('gh', ['alias', 'list'], { encoding: 'utf8', timeout: 3000 });
    if (r.status !== 0) return {};
    const out = {};
    for (const l of r.stdout.split('\n')) {
      const m = l.match(/^\s*([\w-]+):\s*(.+)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^'(.*)'$/, '$1');
    }
    return out;
  } catch {
    return {};
  }
}

const GH_COMANDOS = new Set('alias api attestation auth browse cache co codespace completion config extension gist gpg-key help issue label org pr project release repo ruleset run search secret ssh-key status variable workflow copilot preview agent-task'.split(' '));

function analisarGh(args, raw, ctx, profundidade = 0) {
  if (ctx?.viaXargs) negar('"gh" por xargs não é permitido: os argumentos só são conhecidos em tempo de execução.');
  const pos = [];
  for (let i = 0; i < args.length; i += 1) {
    const t = args[i];
    if (t.startsWith('-')) {
      if (GH_FLAGS_COM_VALOR.has(t)) i += 1;
      continue;
    }
    pos.push(t);
  }
  if (pos[0] === 'alias' && ['set', 'import'].includes(pos[1])) negar('Criar alias do gh não é permitido: aliases podem esconder "pr create"/"pr merge".');
  if (pos[0] && !GH_COMANDOS.has(pos[0]) && profundidade < 3) {
    const exp = aliasesGh()[pos[0]];
    if (exp) {
      if (exp.startsWith('!')) analisarTexto(`${exp.slice(1)} ${args.slice(1).join(' ')}`, ctx, 'agente', profundidade + 1);
      else analisarGh([...(segmentar(exp)[0] || []), ...args.slice(args.indexOf(pos[0]) + 1)], raw + ' ' + exp, ctx, profundidade + 1);
      return;
    }
  }
  if (pos[0] === 'pr' && ['create', 'new', 'merge', 'ready', 'reopen'].includes(pos[1])) {
    negar('Abrir, reabrir, marcar como pronto ou fazer merge de PR é decisão exclusiva do humano. Deixe o texto do PR em .workflow-ia/tasks/<ID>/pr.md.');
  }
  if (pos[0] === 'pr' && pos[1] === 'review' && args.some((t) => ['--approve', '-a'].includes(t))) negar('Aprovar PR é decisão exclusiva do humano.');
  if (pos[0] === 'api') {
    const endpoint = pos[1] || '';
    if (/graphql/.test(endpoint) && RX_MUTACAO_PR.test(raw)) negar('Criar/alterar PRs ou merges pela API GraphQL do GitHub é decisão exclusiva do humano.');
    if (/\/pulls\b|\/merges\b|\/merge\b/.test(endpoint)) {
      const escreve = args.some((t) => ['-X', '--method', '-f', '-F', '--field', '--raw-field', '--input'].includes(t) || /^-X(POST|PUT|PATCH|DELETE)$/i.test(t) || /^--method=/i.test(t));
      if (escreve) negar('Criar/alterar PRs ou merges pela API do GitHub é decisão exclusiva do humano.');
    }
  }
}

function analisar(argv, ctx, modo = 'agente', profundidade = 0) {
  if (profundidade > 4 || !argv.length) return;
  const atribuicoes = [];
  for (const t of argv) {
    if (ehAtribuicao(t)) atribuicoes.push(t);
    else break;
  }
  const semAtrib = argv.slice(atribuicoes.length);
  const a = normalizar(argv);
  ctx.viaXargs = viaXargs;
  const [cmd, ...args] = a;
  const raw = argv.join(' ');

  // --- Segredos: despejo do ambiente ---
  if (modo === 'agente') {
    if (semAtrib[0] === 'env' && semAtrib.slice(1).every((t) => t.startsWith('-') || ehAtribuicao(t))) {
      negar('Não despeje variáveis de ambiente no transcript: elas podem conter segredos. Consulte uma variável específica e não sensível, se precisar.');
    }
    if (cmd === 'printenv' || (cmd === 'export' && (args.length === 0 || args.includes('-p'))) || (cmd === 'set' && args.length === 0) || (['declare', 'typeset'].includes(cmd) && (args.length === 0 || args.some((t) => /^-[a-zA-Z]*[px]/.test(t))))) {
      negar('Não despeje variáveis de ambiente no transcript: elas podem conter segredos. Consulte uma variável específica e não sensível, se precisar.');
    }
  }
  if (!cmd) return;

  // Variáveis que desligam hooks do git (husky, pre-commit, lefthook).
  const desligaHooks = (t) => /^(?:HUSKY|HUSKY_SKIP_HOOKS|SKIP|SKIP_HOOKS|LEFTHOOK|GIT_HOOKS_SKIP)=/.test(t);
  if (atribuicoes.some(desligaHooks) || (cmd === 'export' && args.some(desligaHooks))) {
    negar('Desligar os hooks do git (HUSKY=0, SKIP=..., LEFTHOOK=0) equivale a --no-verify. Corrija o problema em vez de pular a verificação.');
  }

  // --- cd: acompanha o diretório para resolver caminhos relativos ---
  if (cmd === 'cd' || cmd === 'pushd') {
    const alvo = args.find((t) => !t.startsWith('-'));
    ctx.cwd = alvo ? path.resolve(ctx.cwd, expandirHome(alvo)) : os.homedir();
    return;
  }

  // --- Shell aninhado e eval ---
  if (['bash', 'sh', 'zsh', 'dash', 'ksh'].includes(cmd)) {
    const idx = args.findIndex((t) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(t));
    if (idx > -1 && args[idx + 1] !== undefined) analisarTexto(args[idx + 1], ctx, modo, profundidade + 1);
    else {
      const script = args.find((t) => !t.startsWith('-'));
      if (script && /\.(?:sh|bash)$/.test(script)) analisarTexto(lerArquivoPequeno(script, ctx), { ...ctx }, 'script', profundidade + 1);
    }
  }
  if (cmd === 'eval') analisarTexto(args.join(' '), ctx, modo, profundidade + 1);

  // Redirecionamentos valem para qualquer comando, inclusive o wf.
  const alvosRedir = a.filter((t, i) => i > 0 && (a[i - 1] === '>' || a[i - 1] === '>>'));
  for (const t of alvosRedir) negarEscrita(t, ctx);

  // --- CLI do Workflow IA: comandos reservados ao humano ou a um subagente ---
  const ehWf = (semAtrib[0] || '').endsWith('.workflow-ia/wf') || (cmd === 'node' && /scripts\/wf\.mjs$/.test(args[0] || ''));
  if (ehWf) {
    const wfArgs = cmd === 'node' ? args.slice(1) : semAtrib.slice(1);
    const wfPos = wfArgs.filter((t) => !t.startsWith('-'));
    if (wfPos[0] === 'spec' && wfPos[1] === 'recongelar') negar('Recongelar o spec é decisão humana (rode no seu terminal, fora do Claude Code).');
    if (wfPos[0] === 'red' && wfArgs.includes('--refazer')) negar('Refazer o RED é decisão humana (rode no seu terminal, fora do Claude Code).');
    if (wfPos[0] === 'verificacao' && wfPos[1] === 'registrar' && !agenteEh(agente, 'verificador-final')) {
      negar('Só o subagente workflow-ia:verificador-final registra a verificação. Delegue a ele.');
    }
    return;
  }

  // --- Instalador/config durante a task: configuração é decisão humana ---
  if (cmd === 'node' && /scripts\/instalar\.mjs$/.test(args[0] || '') && estado && taskEmExecucao(estado)) {
    negar('Rodar o instalador (e alterar a config) durante uma task não é permitido. Se a task exige outra configuração, encerre como BLOQUEADA descrevendo a mudança.');
  }

  // --- Proteção de arquivos: alvos de escrita ---
  const posicionais = args.filter((t, i) => !t.startsWith('-') && !['>', '>>', '<', '<<'].includes(t) && !['>', '>>', '<', '<<'].includes(args[i - 1]));
  const valorDe = (...nomes) => {
    const out = [];
    args.forEach((t, i) => {
      for (const n of nomes) {
        if (t === n && args[i + 1]) out.push(args[i + 1]);
        else if (t.startsWith(`${n}=`)) out.push(t.slice(n.length + 1));
      }
    });
    return out;
  };
  if (['rm', 'rmdir', 'unlink', 'truncate', 'touch', 'chmod', 'chown', 'shred', 'tee', 'mkfifo'].includes(cmd)) posicionais.forEach((t) => negarEscrita(t, ctx));
  if (['mv'].includes(cmd)) posicionais.forEach((t) => negarEscrita(t, ctx));
  if (['cp', 'rsync', 'install', 'scp', 'ln'].includes(cmd)) {
    const alvo = valorDe('-t', '--target-directory')[0] || posicionais[posicionais.length - 1];
    if (alvo) negarEscrita(alvo, ctx);
  }
  if (cmd === 'dd') args.filter((t) => t.startsWith('of=')).forEach((t) => negarEscrita(t.slice(3), ctx));
  if ((cmd === 'sed' || cmd === 'perl') && args.some((t) => /^-[a-zA-Z]*i/.test(t) || t.startsWith('--in-place'))) posicionais.slice(cmd === 'sed' ? 1 : 0).forEach((t) => negarEscrita(t, ctx));
  if (['curl', 'wget'].includes(cmd)) valorDe('-o', '--output', '-O', '--output-document').forEach((t) => negarEscrita(t, ctx));
  if (['unzip', 'tar'].includes(cmd)) valorDe('-d', '-C', '--directory').forEach((t) => negarEscrita(t, ctx));
  if (cmd === 'find' && args.some((t) => ['-delete', '-exec', '-execdir', '-ok'].includes(t))) {
    const dirs = [];
    for (const t of args) {
      if (t.startsWith('-')) break;
      dirs.push(t);
    }
    for (const d of dirs.length ? dirs : ['.']) {
      const abs = absDe(d, ctx);
      if (abs === RAIZ_REAL || RAIZ_REAL.startsWith(abs + path.sep) || abs === HOME || abs === '/') negar(`"find ${d} ... -delete/-exec" sobre a raiz do projeto é amplo demais. Restrinja a uma pasta específica.`);
      negarEscrita(d, ctx);
    }
  }
  // Qualquer outro comando (scripts, interpretadores) com arquivo de estado como
  // argumento, inclusive citado dentro de código inline (python -c "open('...')").
  if (!LEITORES.has(cmd) && cmd !== 'git' && !['cp', 'rsync', 'install', 'scp', 'ln'].includes(cmd)) {
    for (const t of args) {
      const candidatos = [t.includes('=') ? t.slice(t.indexOf('=') + 1) : t];
      for (const m of t.matchAll(/(?:^|[\s'"`(=,:])((?:\.\/)?\.(?:workflow-ia|claude|github|husky|git)(?:\/[^\s'"`),;]*)?)/gi)) candidatos.push(m[1]);
      for (const v of candidatos) {
        if (!pareceCaminho(v)) continue;
        const rel = relDe(v, ctx);
        if (rel && (ehEstadoProtegido(rel) || ehConfigHumana(rel) || donoDoArquivoDaTask(rel))) {
          const dono = donoDoArquivoDaTask(rel);
          if (dono && agenteEh(agente, dono)) continue;
          negar(`"${v}": ${MSG_ESTADO}`);
        }
      }
    }
  }

  // --- Segredos: leitura de .env por qualquer comando ---
  if (modo === 'agente') {
    const alvosLeitura = [...args, ...a.filter((t, i) => i > 0 && a[i - 1] === '<')];
    const gitSemLeitura = cmd === 'git' && ['check-ignore', 'status', 'ls-files'].includes(args.find((t) => !t.startsWith('-')));
    const findSemExec = cmd === 'find' && !args.some((t) => ['-exec', '-execdir', '-ok', '-fprint', '-fls'].includes(t));
    if (!SEM_LEITURA_ENV.has(cmd) && !gitSemLeitura && !findSemExec) {
      const alvoEnv = alvosLeitura.find((t) => tokenApontaParaEnv(t, ctx));
      if (alvoEnv) negar(`"${alvoEnv}" ${MSG_ENV}`);
    }
    // grep/rg recursivos passam por dentro do .env
    const recursivo = (['grep', 'egrep', 'fgrep'].includes(cmd) && args.some((t) => /^-[a-zA-Z]*[rR]/.test(t) || t === '--recursive' || t === '--dereference-recursive')) || (['rg', 'ag'].includes(cmd) && args.some((t) => ['--hidden', '-.', '--no-ignore', '-u', '-uu', '-uuu', '--unrestricted'].includes(t)));
    if (recursivo && !args.some((t) => /exclude.*\.env|!\.env|-g.*\.env|--glob.*\.env/.test(t))) {
      const dirs = posicionais.slice(1).filter((t) => {
        try {
          return fs.statSync(absDe(t, ctx)).isDirectory();
        } catch {
          return false;
        }
      });
      for (const d of dirs.length ? dirs : ['.']) {
        if (dirTemEnv(absDe(d, ctx))) negar(`Busca recursiva em "${d}" lê arquivos .env com segredos. Use --exclude='.env*' (grep) ou restrinja a pasta.`);
      }
    }
    if (INTERPRETADORES.has(cmd)) {
      const idx = args.findIndex((t) => ['-e', '-p', '-c', '--eval', '--print', 'eval', '-E', '-r'].includes(t));
      const script = idx > -1 ? args[idx + 1] || '' : '';
      if (/(^|[^\w.-])\.env(?![\w-]*\.(?:example|sample|template))(?:\.[\w.-]+)?(?=[^\w.-]|$)/i.test(script) || args.some((t) => /^--env-file(=|$)/.test(t))) {
        negar(`O script lê um arquivo .env, que ${MSG_ENV}`);
      }
    }
  }

  // --- GitHub: PR e merge são do humano ---
  if (cmd === 'gh') analisarGh(args, raw, ctx, profundidade);
  if (cmd === 'hub' && args.some((t) => ['pull-request', 'merge'].includes(t))) negar('Abrir PR ou fazer merge é decisão exclusiva do humano.');
  if (['curl', 'wget', 'http', 'https', 'xh'].includes(cmd) && /api\.github\.com\/repos\/[^\s]+\/(?:pulls|merges)/.test(raw) && /(?:-X|--request)\s*(?:POST|PUT|PATCH)|--data\b|--data-[\w-]+|--json\b|(?:^|\s)-d|(?:^|\s)-F\b|--form\b|--post-data/.test(raw)) {
    negar('Criar/alterar PRs ou merges pela API do GitHub é decisão exclusiva do humano.');
  }

  // --- Git ---
  if (cmd === 'git') analisarGit(args, ctx, modo, profundidade);

  // --- Alvos do Makefile / justfile ---
  if (['make', 'gmake', 'just'].includes(cmd)) {
    for (const receita of receitasMake(cmd, args, ctx)) analisarTexto(receita, { ...ctx }, 'script', profundidade + 1);
  }

  // --- Scripts do package.json ---
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(cmd)) {
    for (const s of scriptDoPacote(a, ctx)) analisarTexto(s, { ...ctx }, 'script', profundidade + 1);
  }

  // --- Banco de dados ---
  const lower = a.map((t) => t.toLowerCase());
  if (DB_CLIS.has(cmd) || (['docker', 'podman', 'kubectl'].includes(cmd) && lower.some((t) => DB_CLIS.has(t))) || (lower.includes('prisma') && lower.includes('execute'))) {
    usaBanco = true;
    textosSql.push(raw);
    for (const f of valorDe('-f', '--file')) textosSql.push(lerArquivoPequeno(f, ctx));
    for (const f of a.filter((t, i) => i > 0 && a[i - 1] === '<')) textosSql.push(lerArquivoPequeno(f, ctx));
    if (lower.includes('--file') || lower.includes('--stdin')) {
      for (const f of valorDe('--file')) textosSql.push(lerArquivoPequeno(f, ctx));
    }
  }
  if (lower.includes('prisma')) {
    const p = lower.slice(lower.indexOf('prisma') + 1);
    if (p[0] === 'migrate' && p[1] === 'reset') negar('"prisma migrate reset" apaga o banco. Não permitido ao agente (use banco descartável de teste via Testcontainers).');
    if (p[0] === 'db' && p[1] === 'push' && p.some((t) => ['--force-reset', '--accept-data-loss'].includes(t))) negar('"prisma db push" com perda de dados não é permitido. Crie uma migration expand/contract.');
  }
  if (cmd === 'supabase' && lower.includes('db') && lower.includes('reset')) negar('"supabase db reset" apaga o banco. Não permitido ao agente.');
  if (cmd === 'drizzle-kit' && lower.includes('drop')) negar('"drizzle-kit drop" apaga migrations. Não permitido ao agente.');
  if (['dropdb', 'dropuser'].includes(cmd)) negar(`"${cmd}" não é permitido ao agente.`);
  if (['docker', 'podman'].includes(cmd)) {
    const volumes = lower.some((t) => ['-v', '--volumes'].includes(t));
    if ((lower.includes('down') && volumes) || (lower.includes('volume') && lower.some((t) => ['rm', 'prune'].includes(t))) || (lower.includes('prune') && volumes)) {
      negar('Remover volumes do Docker apaga dados de banco. Não permitido ao agente.');
    }
  }

  // --- Remoção ampla ---
  if (cmd === 'rm') {
    const recursivo = args.some((t) => /^-[a-zA-Z]*[rR]/.test(t) || t === '--recursive');
    if (recursivo) {
      for (const t of posicionais) {
        const abs = absDe(t, ctx);
        const amplo = abs === '/' || abs === HOME || abs === RAIZ_REAL || RAIZ_REAL.startsWith(abs + path.sep) || HOME.startsWith(abs + path.sep);
        const globNaRaiz = /[*?[]/.test(path.basename(t)) && [RAIZ_REAL, HOME, '/'].includes(absDe(path.dirname(t) || '.', ctx));
        if (amplo || globNaRaiz || /^\$\w/.test(t)) negar(`"rm -r ${t}" é amplo demais. Remova apenas arquivos específicos do projeto.`);
      }
    }
  }

  // --- Deploy/publicação em produção ---
  if (cmd === 'vercel' && args.some((t) => /^--prod(?:uction)?(?:=|$)/.test(t) || t === 'promote')) negar('Deploy em produção não faz parte do trabalho do agente.');
  if (cmd === 'railway' && args.some((t) => ['up', 'deploy', 'redeploy'].includes(t))) negar('Deploy pelo Railway não faz parte do trabalho do agente.');
  if (['fly', 'flyctl'].includes(cmd) && args.includes('deploy')) negar('Deploy não faz parte do trabalho do agente.');
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(cmd) && args[0] === 'publish') negar('Publicar pacote não faz parte do trabalho do agente.');
}

// ---------------------------------------------------------------------------
// Checagens no texto bruto: construções que a tokenização não enxerga.
// ---------------------------------------------------------------------------
if (RX_MUTACAO_PR.test(comando)) negar('Criar ou fazer merge de PR pela API do GitHub é decisão exclusiva do humano.');
if (/\$\(|`|\$\{?[A-Za-z_]|\beval\b/.test(comando) && /\bpr\s+(?:create|new|merge|ready|reopen)\b/.test(comando)) {
  negar('Abrir ou fazer merge de PR é decisão exclusiva do humano (também por comando montado com variáveis ou substituição).');
}

// Comandos da CLI reservados ao humano ou ao verificador-final: checagem no texto
// bruto, para não depender de como o "wf" foi chamado (invólucros, variáveis,
// cd, caminho com "//", --task antes do subcomando, --flag=valor).
if (/\brecongelar\b/.test(comando) || /--refazer\b/.test(comando)) {
  negar('"wf spec recongelar" e "wf red --refazer" são decisão humana: rode no seu terminal, fora do Claude Code.');
}
if (/\bverificacao\s+registrar\b/.test(comando) && !agenteEh(agente, 'verificador-final')) {
  negar('Só o subagente workflow-ia:verificador-final registra a verificação. Delegue a ele.');
}

const ctx = { cwd: cwdInicial };
analisarTexto(comando, ctx, 'agente', 0);

if (usaBanco) {
  textosSql.push(comando);
  for (const t of textosSql) {
    const tipo = sqlDestrutivo(t);
    if (tipo) negar(`Comando destrutivo de banco (${tipo}) não é permitido ao agente. Use migrations expand/contract e banco descartável de teste.`);
  }
}
process.exit(0);
