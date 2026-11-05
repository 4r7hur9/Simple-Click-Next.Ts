// Cópia do plugin dentro do repositório do projeto (.claude/skills/workflow-ia/).
//
// Uma pasta com .claude-plugin/plugin.json em .claude/skills/ é um "plugin de skills-directory" do Claude Code:
// vai no git, chega a quem clona e carrega no lugar (workflow-ia@skills-dir) depois que a pessoa confia na
// pasta, sem marketplace nem "claude plugin install". Numa máquina com workflow-ia@fabriki instalado, o do
// marketplace tem precedência e esta cópia fica como "Not loaded" no /plugin (sem hooks em dobro).
//
// Destinos: a raiz do projeto (se estiver num git) e cada sub-repositório abaixo dela (pasta com .git
// própria), para o caso de uma raiz que agrupa vários repositórios lado a lado.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const PASTA_EMBUTIDA = path.join('.claude', 'skills', 'workflow-ia');
/** O que o plugin usa em tempo de execução. Fora: testes/, .git, CHANGELOG, marketplace.json. */
const ITENS = [path.join('.claude-plugin', 'plugin.json'), 'agents', 'commands', 'hooks', 'scripts', 'skills', 'templates', 'docs', 'README.md'];
const LIXO = new Set(['.DS_Store', 'node_modules']);
/** Pastas onde não se procura sub-repositório. */
const NAO_DESCER = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', 'vendor', 'target', 'tmp']);

const git = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
const lerVersao = (raiz) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(raiz, '.claude-plugin', 'plugin.json'), 'utf8')).version || null;
  } catch {
    return null;
  }
};

function listar(base, rel, saida) {
  const abs = path.join(base, rel);
  let st;
  try {
    st = fs.lstatSync(abs);
  } catch {
    return saida;
  }
  if (st.isDirectory()) {
    for (const n of fs.readdirSync(abs).sort()) if (!LIXO.has(n)) listar(base, path.join(rel, n), saida);
  } else if (st.isFile()) saida.push(rel);
  return saida;
}
const arquivosDoPlugin = (raiz) => ITENS.flatMap((i) => listar(raiz, i, [])).sort();
const arquivosDaCopia = (pasta) => (fs.existsSync(pasta) ? listar(pasta, '', []).sort() : []);

function ehWorktreeLigado(dir) {
  const r = git(dir, ['rev-parse', '--git-dir', '--git-common-dir']);
  if (r.status !== 0) return false;
  const [gitDir, comum] = r.stdout.trim().split('\n').map((p) => path.resolve(dir, p));
  return gitDir !== comum;
}

/** Repositórios git que recebem a cópia: a raiz (se estiver num git) e cada sub-repositório até 2 níveis abaixo. */
export function destinosDaCopia(projeto) {
  const destinos = [];
  if (git(projeto, ['rev-parse', '--is-inside-work-tree']).status === 0) destinos.push({ dir: projeto, rotulo: '.' });
  const visitar = (dir, nivel) => {
    if (nivel > 2) return;
    let itens;
    try {
      itens = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const it of itens) {
      if (!it.isDirectory() || it.name.startsWith('.') || NAO_DESCER.has(it.name)) continue;
      const sub = path.join(dir, it.name);
      // .git pasta (clone) ou arquivo (submódulo): repositório próprio. Não desce dentro dele. Worktree ligado
      // (git worktree add) é o mesmo repositório em outro branch: não recebe cópia.
      if (fs.existsSync(path.join(sub, '.git'))) {
        if (!ehWorktreeLigado(sub)) destinos.push({ dir: sub, rotulo: path.relative(projeto, sub) });
      } else visitar(sub, nivel + 1);
    }
  };
  visitar(projeto, 1);
  return destinos;
}

/**
 * Copia o plugin para <destino>/.claude/skills/workflow-ia, só se o conteúdo for diferente.
 * Devolve { acao: 'criado' | 'atualizado' | null, de, para }.
 */
export function embutirPlugin({ pluginRoot, destino, simular }) {
  const alvo = path.join(destino, PASTA_EMBUTIDA);
  const para = lerVersao(pluginRoot);
  const de = lerVersao(alvo);
  // Rodando a partir da própria cópia (outro dev atualizando com o plugin embutido): nada a copiar.
  if (fs.existsSync(alvo) && fs.realpathSync(alvo) === fs.realpathSync(pluginRoot)) return { acao: null, de, para };
  const origem = arquivosDoPlugin(pluginRoot);
  const atuais = arquivosDaCopia(alvo);
  const igual =
    atuais.length === origem.length &&
    origem.every((f, i) => atuais[i] === f && fs.readFileSync(path.join(alvo, f)).equals(fs.readFileSync(path.join(pluginRoot, f))));
  if (igual) return { acao: null, de, para };
  if (!simular) {
    fs.rmSync(alvo, { recursive: true, force: true });
    for (const f of origem) {
      const src = path.join(pluginRoot, f);
      const dst = path.join(alvo, f);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      fs.chmodSync(dst, fs.statSync(src).mode & 0o777);
    }
  }
  return { acao: atuais.length ? 'atualizado' : 'criado', de, para };
}

const ignorado = (destino) => git(destino, ['check-ignore', '-q', path.join(PASTA_EMBUTIDA, '.claude-plugin', 'plugin.json')]).status === 0;
// Reabre só a cópia: ".claude/" volta a ser visitada, mas todo o resto dentro dela continua ignorado.
const REGRAS = ['!.claude/', '.claude/*', '!.claude/skills/', '.claude/skills/*', '!.claude/skills/workflow-ia/'];
const MARCA = '# Workflow IA: versiona só o plugin em .claude/skills/workflow-ia (o resto de .claude/ segue ignorado)';

/**
 * Garante que a cópia entra no git: se o .gitignore do repositório a ignora (ex.: ".claude/"), acrescenta regras
 * que reabrem só ela. Devolve { gitignore: 'atualizado' | 'criado' | null, pendencia }.
 */
export function garantirVersionavel(destino, { simular }) {
  if (!ignorado(destino)) return { gitignore: null, pendencia: null };
  const gi = path.join(destino, '.gitignore');
  const atual = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  const aviso = `${PASTA_EMBUTIDA} continua ignorado pelo git (alguma regra do .gitignore ou de .git/info/exclude vence as do Workflow IA): ajuste para versioná-la.`;
  if (atual.includes(MARCA)) return { gitignore: null, pendencia: aviso };
  if (simular) return { gitignore: atual ? 'atualizado' : 'criado', pendencia: null };
  fs.writeFileSync(gi, `${atual}${atual && !atual.endsWith('\n') ? '\n' : ''}\n${MARCA}\n${REGRAS.join('\n')}\n`);
  return { gitignore: atual ? 'atualizado' : 'criado', pendencia: ignorado(destino) ? aviso : null };
}

// Sem .semgrepignore o semgrep usa uma lista padrão; ao criar o arquivo essa lista some, então ela vai junto.
const SEMGREPIGNORE_NOVO = `# Criado pelo Workflow IA. Sem este arquivo o semgrep usa a lista padrão abaixo; com ele, só o que está aqui.
:include .gitignore

node_modules/
build/
dist/
vendor/
.env/
.venv/
.tox/
*.min.js
.npm/
.yarn/
.semgrep
.semgrep_logs/

# Código do plugin Workflow IA (não é código do projeto)
${PASTA_EMBUTIDA}/
`;

/** O SAST do gate não deve analisar o código do plugin. Devolve 'criado' | 'atualizado' | null. */
export function ignorarNoSemgrep(destino, { simular }) {
  const f = path.join(destino, '.semgrepignore');
  if (!fs.existsSync(f)) {
    if (!simular) fs.writeFileSync(f, SEMGREPIGNORE_NOVO);
    return 'criado';
  }
  const atual = fs.readFileSync(f, 'utf8');
  const linha = `${PASTA_EMBUTIDA}/`;
  if (atual.split('\n').some((x) => [linha, PASTA_EMBUTIDA].includes(x.trim()))) return null;
  if (!simular) fs.writeFileSync(f, `${atual}${atual && !atual.endsWith('\n') ? '\n' : ''}\n# Código do plugin Workflow IA (não é código do projeto)\n${linha}\n`);
  return 'atualizado';
}

/** Estado das cópias para o doctor: [{ repo, existe, versao }]. */
export function estadoDasCopias(projeto) {
  return destinosDaCopia(projeto).map(({ dir, rotulo }) => {
    const alvo = path.join(dir, PASTA_EMBUTIDA);
    return { repo: rotulo, existe: fs.existsSync(path.join(alvo, 'scripts', 'wf.mjs')), versao: lerVersao(alvo) };
  });
}
