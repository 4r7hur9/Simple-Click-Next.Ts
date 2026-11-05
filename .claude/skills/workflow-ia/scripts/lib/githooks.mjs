// Segunda linha de defesa em git: pre-commit e pre-push gerenciados pelo instalador.
//
// Os hooks do plugin (guarda-bash) só existem onde o host os carrega. Estes hooks do git valem em qualquer host:
// bloqueiam commit/push em branch protegido e conferem segredos no que vai ser commitado. O humano no terminal,
// sem task aberta, não é afetado (ele precisa commitar a instalação, por exemplo).
//
// Regra (espelha o guarda-bash): bloqueia quando o chamador é um agente (CLAUDECODE/CLAUDE_CODE_*, ou CI do
// Workflow IA) OU há uma task em execução. Não é sandbox: "git commit --no-verify" é negado pelo guarda-bash
// quando ele existe; sem ele, a barreira final é o branch protegido no GitHub.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { git, idTaskAtiva, caminhos, lerJSON, gitBranchAtual } from './core.mjs';

export const MARCADOR = '# workflow-ia:githook';
export const NOMES = ['pre-commit', 'pre-push'];

function conteudoShim(nome) {
  return `#!/bin/sh
${MARCADOR} (gerenciado pelo instalador do Workflow IA; rode "node <plugin>/scripts/instalar.mjs --atualizar" para renovar)
RAIZ="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
if [ -x "$RAIZ/.workflow-ia/wf" ]; then
  "$RAIZ/.workflow-ia/wf" githook ${nome} "$@" || exit $?
fi
exit 0
`;
}

/** Onde o git procura os hooks deste repositório (respeita core.hooksPath). */
export function pastaDeHooks(projeto) {
  const hp = git(projeto, ['config', '--get', 'core.hooksPath']);
  const r = git(projeto, ['rev-parse', '--git-path', 'hooks']);
  if (r.exit !== 0) return { pasta: null, hooksPath: hp.out || null };
  return { pasta: path.resolve(projeto, r.out), hooksPath: hp.exit === 0 ? hp.out : null };
}

/** Instala (ou renova) os shims. Nunca sobrescreve hook alheio nem mexe em pasta de hooks versionada (husky). */
export function instalarGitHooks(projeto, { simular = false } = {}) {
  const acoes = [];
  const avisos = [];
  const { pasta, hooksPath } = pastaDeHooks(projeto);
  if (!pasta) return { acoes, avisos: ['Sem repositório git: os git hooks de proteção não foram instalados.'] };
  if (hooksPath) {
    // core.hooksPath costuma apontar para uma pasta versionada (ex.: .husky): não alteramos arquivos do time.
    avisos.push(`core.hooksPath=${hooksPath}: os git hooks do Workflow IA não foram instalados (a pasta é do time). Chame ".workflow-ia/wf githook pre-commit" e ".workflow-ia/wf githook pre-push" nos hooks de lá.`);
    return { acoes, avisos };
  }
  for (const nome of NOMES) {
    const alvo = path.join(pasta, nome);
    const existente = fs.existsSync(alvo) ? fs.readFileSync(alvo, 'utf8') : null;
    if (existente !== null && !existente.includes(MARCADOR)) {
      avisos.push(`.git/hooks/${nome} já existe e não é do Workflow IA: mantido. Chame ".workflow-ia/wf githook ${nome}" dentro dele para ter a proteção.`);
      acoes.push({ arquivo: `.git/hooks/${nome}`, acao: 'mantido (hook alheio)' });
      continue;
    }
    const novo = conteudoShim(nome);
    if (existente === novo) {
      acoes.push({ arquivo: `.git/hooks/${nome}`, acao: 'mantido (já atualizado)' });
      continue;
    }
    if (!simular) {
      fs.mkdirSync(pasta, { recursive: true });
      fs.writeFileSync(alvo, novo, { mode: 0o755 });
      fs.chmodSync(alvo, 0o755);
    }
    acoes.push({ arquivo: `.git/hooks/${nome}`, acao: existente === null ? 'criado' : 'atualizado' });
  }
  return { acoes, avisos };
}

function taskEmExecucao(raiz) {
  const id = idTaskAtiva(raiz);
  if (!id) return null;
  const e = lerJSON(caminhos(raiz, id).estado, null);
  return e && e.fase !== 'encerrada' && !e.pausada && e.modo !== 'revisao' ? e.id : null;
}

function conferirSegredos(raiz) {
  const bin = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['gitleaks'], { encoding: 'utf8' });
  if (bin.status !== 0) return { ok: true, aviso: 'gitleaks não instalado: segredos não conferidos no commit (brew install gitleaks).' };
  let r = spawnSync('gitleaks', ['git', '--staged', '--redact', '--no-banner'], { cwd: raiz, encoding: 'utf8' });
  if (r.status !== 0 && /unknown (sub)?command/i.test(`${r.stderr}${r.stdout}`)) {
    r = spawnSync('gitleaks', ['protect', '--staged', '--redact', '--no-banner'], { cwd: raiz, encoding: 'utf8' });
  }
  return r.status === 0 ? { ok: true } : { ok: false, saida: `${r.stdout || ''}${r.stderr || ''}`.trim() };
}

/** Decide se o git hook libera. Devolve { ok, motivo? , aviso? }. */
export function verificarGitHook(raiz, config, nome, { agente, stdin = '' }) {
  const protegidos = new Set(config.git?.branchesProtegidos || []);
  const tarefa = taskEmExecucao(raiz);
  const restrito = agente || !!tarefa;
  const porque = tarefa ? `há a task ${tarefa} em execução` : 'o chamador é um agente (Claude Code/SDK/CI)';

  if (nome === 'pre-commit') {
    const branch = gitBranchAtual(raiz);
    if (restrito && branch && protegidos.has(branch)) {
      return { ok: false, motivo: `commit no branch protegido "${branch}" não é permitido: ${porque}. Trabalhe no branch da task; o merge é do humano.` };
    }
    const s = conferirSegredos(raiz);
    if (!s.ok) return { ok: false, motivo: `gitleaks encontrou segredo no que vai ser commitado:\n${s.saida}` };
    return { ok: true, aviso: s.aviso };
  }

  if (nome === 'pre-push') {
    // stdin do git: "<ref local> <sha local> <ref remota> <sha remoto>" por linha.
    for (const linha of stdin.split('\n').filter(Boolean)) {
      const remota = (linha.split(/\s+/)[2] || '').replace(/^refs\/heads\//, '');
      if (restrito && protegidos.has(remota)) {
        return { ok: false, motivo: `push para o branch protegido "${remota}" não é permitido: ${porque}. O agente só envia o branch da task; o merge é do humano.` };
      }
    }
    return { ok: true };
  }
  return { ok: true };
}
