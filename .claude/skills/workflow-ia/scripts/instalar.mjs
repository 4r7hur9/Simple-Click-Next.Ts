#!/usr/bin/env node
// Instalador do Workflow IA em um projeto.
//
//   node <plugin>/scripts/instalar.mjs <projeto> [opções]
//
// Opções:
//   --ci                    gera os workflows do GitHub Actions (provas no push + agente headless)
//   --compartilhar-plugin   registra o marketplace/plugin em .claude/settings.json do projeto (para o time e o CI)
//   --marketplace <fonte>   fonte do marketplace para --compartilhar-plugin e para o CI: caminho local ou owner/repo do GitHub
//   --set chave=valor       ajusta a config (ex.: --set comandos.testeE2E="pnpm test:e2e"); repetível
//   --forcar                sobrescreve config/arquivos gerados existentes (recalcula TUDO: perde ajustes do humano)
//   --atualizar             atualiza um projeto que já tem .workflow-ia/: PRESERVA os valores ajustados, preenche só chaves
//                           novas, aplica migrações do config (versao 1 → 2 ...) e renova wf, README, CLAUDE.md, .gitignore e git hooks
//   --confirmar-ci          (com --atualizar) permite sobrescrever os workflows de CI existentes; sem isso, só mostra o diff
//   --sem-githooks          não instala os git hooks de proteção (pre-commit/pre-push)
//   --manter-security-guidance  não grava ENABLE_CODE_SECURITY_REVIEW=0 no .claude/settings.json (por padrão, com o plugin
//                           security-guidance ativo, o instalador desliga as revisões por LLM dele, que abrem uma sessão por subagente)
//   --simular               só mostra o que faria
//
// Idempotente: rodar de novo preserva a config existente e completa o que faltar.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { destinosDaCopia, embutirPlugin, garantirVersionavel, ignorarNoSemgrep, PASTA_EMBUTIDA } from './lib/embutir.mjs';
import { CONFIG_PADRAO, SAST_PADRAO, mesclarProfundo, lerJSON, existe, gitLimpo, idTaskAtiva, caminhos } from './lib/core.mjs';
import { atualizarConfig } from './lib/migracoes.mjs';
import { instalarGitHooks } from './lib/githooks.mjs';
import { securityGuidance, SG_VARIAVEL } from './lib/ambiente.mjs';
import { detectarStack } from './lib/stack.mjs';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Versão do plugin que grava o config (pluginVersao). Não confundir com config.versao, que é o formato do config.
const PLUGIN_VERSAO = lerJSON(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), {}).version || null;

// --------------------------------------------------------------------------- args
const argv = process.argv.slice(2);
const flags = { set: [] };
const pos = [];
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === '--set') flags.set.push(argv[++i]);
  else if (a.startsWith('--set=')) flags.set.push(a.slice(6));
  else if (a === '--marketplace') flags.marketplace = argv[++i];
  else if (a.startsWith('--marketplace=')) flags.marketplace = a.slice(14);
  else if (a.startsWith('--')) flags[a.slice(2)] = true;
  else pos.push(a);
}
if (flags.help || flags.ajuda) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 23).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}

const projeto = path.resolve(pos[0] || process.cwd());
const simular = !!flags.simular;
const acoes = [];
const pendencias = [];
const avisos = [];

function escrever(rel, conteudo, { modo, sobrescrever = false, somenteSeDiferente = false } = {}) {
  const abs = path.join(projeto, rel);
  const existia = existe(abs);
  const igual = existia && fs.readFileSync(abs, 'utf8') === conteudo;
  if (existia && !sobrescrever) {
    acoes.push({ arquivo: rel, acao: igual ? 'mantido (já atualizado)' : 'mantido (já existia)', difere: !igual });
    return false;
  }
  if (existia && somenteSeDiferente && igual) {
    acoes.push({ arquivo: rel, acao: 'mantido (sem mudanças)' });
    return false;
  }
  if (!simular) {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, conteudo);
    if (modo) fs.chmodSync(abs, modo);
  }
  acoes.push({ arquivo: rel, acao: existia ? 'sobrescrito' : 'criado' });
  return true;
}

function which(bin) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8' });
  return r.status === 0;
}

// --------------------------------------------------------------------------- validações
if (!existe(projeto) || !fs.statSync(projeto).isDirectory()) {
  console.error(JSON.stringify({ ok: false, mensagem: `Pasta do projeto não encontrada: ${projeto}` }, null, 2));
  process.exit(1);
}
const ehGit = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: projeto, encoding: 'utf8' }).status === 0;
// Raiz sem git que agrupa vários repositórios (ex.: /projeto com api/ e web/, cada um com seu .git): vale como
// workspace; o plugin é versionado em cada sub-repositório (ver "plugin no repositório").
const subRepos = ehGit ? [] : destinosDaCopia(projeto);
if (!ehGit && subRepos.length) {
  avisos.push(`Raiz sem git com ${subRepos.length} repositório(s) dentro (${subRepos.map((d) => d.rotulo).join(', ')}): o plugin vai versionado em cada um deles; o .workflow-ia/ da raiz fica só nesta máquina.`);
} else if (!ehGit) {
  if (!flags.forcar) {
    console.error(JSON.stringify({ ok: false, mensagem: 'O projeto não é um repositório git. Rode "git init" e faça um primeiro commit antes de instalar (o Workflow IA trabalha com branches e commits). Use --forcar para instalar mesmo assim.' }, null, 2));
    process.exit(1);
  }
  avisos.push('Projeto sem git: o pipeline só funciona depois de "git init" e de um primeiro commit.');
}

// --------------------------------------------------------------------------- --atualizar: pré-condições
const atualizar = !!flags.atualizar;
const bloqueios = [];
if (atualizar) {
  if (flags.forcar) {
    console.error(JSON.stringify({ ok: false, mensagem: '--atualizar preserva o que o humano ajustou; --forcar recalcula tudo. Use um ou outro.' }, null, 2));
    process.exit(1);
  }
  if (!existe(path.join(projeto, '.workflow-ia', 'config.json'))) {
    console.error(JSON.stringify({ ok: false, mensagem: 'Este projeto não tem .workflow-ia/config.json: não há o que atualizar. Rode a instalação normal (sem --atualizar).' }, null, 2));
    process.exit(1);
  }
  const idAtiva = idTaskAtiva(projeto);
  const estadoAtivo = idAtiva ? lerJSON(caminhos(projeto, idAtiva).estado, null) : null;
  if (estadoAtivo && estadoAtivo.fase !== 'encerrada') bloqueios.push(`Há uma task ativa não encerrada (${idAtiva}, fase ${estadoAtivo.fase}). Encerre ou pause a task antes de atualizar o projeto.`);
  if (ehGit) {
    const limpo = gitLimpo(projeto);
    if (!limpo.limpo) bloqueios.push(`O working tree tem alterações pendentes (${limpo.sujos.slice(0, 5).join(', ')}). Faça commit ou stash antes: a atualização só deve mexer nos arquivos do Workflow IA.`);
  }
  if (bloqueios.length && !flags.simular) {
    console.error(JSON.stringify({ ok: false, mensagem: `Atualização recusada: ${bloqueios.join(' ')}`, bloqueios }, null, 2));
    process.exit(1);
  }
}

// --------------------------------------------------------------------------- detecção
// A detecção vive em lib/stack.mjs (o gerador do modo CI reaproveita); o instalador só consome o resultado.
const deteccao = detectarStack(projeto, { which });
const { pkg, scripts, deps, tem, pm, run, exec, install, stack, comandos, sE2E } = deteccao;

// Etapas obrigatórias só quando configuradas; o resto vira pendência explícita.
const etapas = CONFIG_PADRAO.gate.etapas.map((e) => {
  const chave = e.comando.slice(1);
  const configurado = !!comandos[chave];
  if (!configurado && e.obrigatoria) {
    const dica = {
      typecheck: 'adicione "typecheck": "tsc --noEmit" ao package.json',
      lint: 'configure o ESLint e um script "lint"',
      testeUnitario: 'configure Vitest/Jest e um script "test:unit" (sem watch)',
      testeIntegracao: 'crie um script "test:integration" (Vitest + Testcontainers/PostgreSQL recomendado)',
      testeE2E: 'configure Playwright e um script "test:e2e"',
      build: 'adicione um script "build"',
      segredos: 'instale o gitleaks (brew install gitleaks) — detecção de segredos fica desativada até lá',
    }[chave];
    pendencias.push(`Gate "${e.nome}" não configurado: ${dica || `defina comandos.${chave}`}. A etapa ficou como não obrigatória; torne-a obrigatória em gate.etapas quando configurar.`);
  }
  // Custo para o falhar rápido (baixo → medio → alto) e etapas pesadas (vaga de recurso, quando ligada).
  const custo = { typecheck: 'baixo', lint: 'baixo', segredos: 'baixo', 'teste-integracao': 'alto', 'teste-e2e': 'alto' }[e.nome] || 'medio';
  return { ...e, obrigatoria: e.obrigatoria && configurado, custo, ...(custo === 'alto' ? { pesada: true } : {}) };
});
if (!comandos.sast) pendencias.push('SAST opcional desativado: instale o semgrep (brew install semgrep ou pipx install semgrep) e rode o instalador de novo.');
if (!pkg) avisos.push('Sem package.json: detecção automática limitada. Defina os comandos em .workflow-ia/config.json.');

// --------------------------------------------------------------------------- branch base
let branchBase = 'main';
const hd = spawnSync('git', ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], { cwd: projeto, encoding: 'utf8' });
if (hd.status === 0 && hd.stdout.trim()) branchBase = hd.stdout.trim().replace(/^origin\//, '');
else {
  for (const b of ['main', 'master', 'develop']) {
    if (spawnSync('git', ['rev-parse', '--verify', '--quiet', b], { cwd: projeto }).status === 0) {
      branchBase = b;
      break;
    }
  }
}

// --------------------------------------------------------------------------- config
const cfgPath = path.join(projeto, '.workflow-ia', 'config.json');
const existente = lerJSON(cfgPath, null);
const OTIMIZACOES_LOOP = { falharRapido: true, repetirPorCarga: 1, paralelismo: 2 };
const detectado = mesclarProfundo(CONFIG_PADRAO, {
  projeto: { nome: pkg?.name || path.basename(projeto), stack: stack.join(', '), gerenciadorPacotes: pm },
  git: { branchBase },
  comandos,
  // Instalação nova já sai com as otimizações do loop ligadas; num config existente elas só aparecem como sugestão
  // (a migração deixa tudo desligado). Vagas de recurso dependem da máquina: ficam desligadas.
  gate: { etapas, ...(existente && !flags.forcar ? {} : OTIMIZACOES_LOOP) },
});
let config;
let atualizacao = null;
if (atualizar) {
  // Preserva tudo que o humano ajustou; só migra o schema e preenche o que falta. Comandos detectados
  // diferentes dos atuais entram como "sugeridos" (o humano decide com --set).
  const r = atualizarConfig(existente, { recemInstalado: mesclarProfundo(detectado, { gate: OTIMIZACOES_LOOP }) });
  config = r.config;
  atualizacao = { ...r.relatorio, bloqueios };
} else {
  config = existente && !flags.forcar ? mesclarProfundo(detectado, existente) : detectado;
  // Com config existente, preenche só comandos vazios com o detectado.
  if (existente && !flags.forcar) {
    for (const [k, v] of Object.entries(comandos)) if (!config.comandos[k] && v) config.comandos[k] = v;
  }
}
for (const par of flags.set) {
  const i = par.indexOf('=');
  if (i < 1) continue;
  const chave = par.slice(0, i);
  let valor = par.slice(i + 1);
  try {
    valor = JSON.parse(valor);
  } catch {
    /* texto */
  }
  const partes = chave.split('.');
  let alvo = config;
  for (const p of partes.slice(0, -1)) alvo = alvo[p] = alvo[p] ?? {};
  alvo[partes[partes.length - 1]] = valor;
}
if (atualizar) {
  // Pendências de uma atualização vêm do config real (e não da detecção): etapa obrigatória sem comando.
  pendencias.length = 0;
  for (const e of config.gate.etapas) {
    const cmd = e.comando.startsWith('@') ? config.comandos[e.comando.slice(1)] : e.comando;
    if (e.obrigatoria && !cmd) pendencias.push(`Gate "${e.nome}" é obrigatório e não tem comando configurado: defina comandos.${e.comando.slice(1)} (ex.: --set).`);
  }
}
// pluginVersao registra qual versão do plugin gravou o config por último: sempre a atual (não é ajuste do humano,
// nem um --set), logo depois de versao para ficar visível.
{
  const { versao, pluginVersao: _antiga, ...resto } = config;
  config = { versao, pluginVersao: PLUGIN_VERSAO, ...resto };
}
if (atualizacao) atualizacao.pluginVersao = { de: existente?.pluginVersao ?? null, para: PLUGIN_VERSAO };
escrever('.workflow-ia/config.json', JSON.stringify(config, null, 2) + '\n', { sobrescrever: true, somenteSeDiferente: atualizar });

// --------------------------------------------------------------------------- atalho wf
const shim = `#!/bin/sh
# Atalho da CLI do Workflow IA. Gerado pelo instalador; não edite.
# Ordem: WORKFLOW_IA_ROOT, caminho registrado pela última sessão, cópia do plugin
# versionada no repositório (.claude/skills/workflow-ia), caminho da instalação e,
# se o plugin foi atualizado (a pasta da versão mudou), a versão mais recente ao
# lado do caminho registrado ou da instalação.
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
valido() { [ -n "$1" ] && [ -f "$1/scripts/wf.mjs" ]; }
REGISTRADO="$(cat "$RAIZ/.workflow-ia/runtime/plugin-root" 2>/dev/null)"
INSTALACAO="${PLUGIN_ROOT.startsWith(os.homedir() + path.sep) ? `$HOME${PLUGIN_ROOT.slice(os.homedir().length)}` : PLUGIN_ROOT}"
PLUGIN=""
for C in "\${WORKFLOW_IA_ROOT:-}" "$REGISTRADO" "$RAIZ/.claude/skills/workflow-ia" "$INSTALACAO"; do
  if valido "$C"; then PLUGIN="$C"; break; fi
done
if [ -z "$PLUGIN" ]; then
  for BASE in "$REGISTRADO" "$INSTALACAO"; do
    [ -n "$BASE" ] || continue
    PASTA="$(dirname "$BASE")"
    # Versão mais nova em ordem numérica (0.10.0 depois de 0.9.0).
    PLUGIN="$(ls -1 "$PASTA" 2>/dev/null | sort -t. -k1,1n -k2,2n -k3,3n | while read -r V; do valido "$PASTA/$V" && echo "$PASTA/$V"; done | tail -1)"
    [ -n "$PLUGIN" ] && break
  done
fi
if [ -z "$PLUGIN" ]; then
  echo '{"ok":false,"mensagem":"Workflow IA: plugin não encontrado. Rode /workflow-ia:atualizar para versionar a cópia em .claude/skills/workflow-ia, abra uma sessão do Claude Code neste projeto (o hook de início registra o caminho) ou defina WORKFLOW_IA_ROOT."}'
  exit 2
fi
exec node "$PLUGIN/scripts/wf.mjs" --projeto "$RAIZ" "$@"
`;
escrever('.workflow-ia/wf', shim, { modo: 0o755, sobrescrever: true, somenteSeDiferente: atualizar });

escrever(
  '.workflow-ia/README.md',
  `# Workflow IA neste projeto

- \`config.json\`: comandos do gate, limites do pipeline, board, proteções. **Editado só por humanos.**
- \`wf\`: atalho da CLI (\`.workflow-ia/wf ajuda\`).
- \`tasks/<ID>/\`: estado, spec, plano, findings, provas e relatório de cada task (fora do git).
- \`runtime/\`: dados da sessão atual (fora do git).

Executar um card: \`/workflow-ia:task <ID | URL | texto>\` no Claude Code.
Abrir PR e fazer merge são sempre do humano.
`,
  { sobrescrever: !!flags.forcar || atualizar, somenteSeDiferente: atualizar }
);

// --------------------------------------------------------------------------- .gitignore
const giPath = path.join(projeto, '.gitignore');
const gi = existe(giPath) ? fs.readFileSync(giPath, 'utf8') : '';
// .workflow-ia/ci/ é a proposta do modo CI (wf ci gerar): artefato da CLI, fora do git como runtime/ e tasks/.
const faltamNoGitignore = ['.workflow-ia/runtime/', '.workflow-ia/tasks/', '.workflow-ia/ci/'].filter((l) => !gi.split('\n').some((x) => x.trim() === l || x.trim() === l.replace(/\/$/, '')));
if (faltamNoGitignore.length) {
  const cabecalho = gi.includes('# Workflow IA') ? '' : '\n# Workflow IA (estado local das tasks)\n';
  const bloco = `${gi && !gi.endsWith('\n') ? '\n' : ''}${cabecalho}${faltamNoGitignore.join('\n')}\n`;
  if (!simular) fs.writeFileSync(giPath, gi + bloco);
  acoes.push({ arquivo: '.gitignore', acao: gi ? 'atualizado' : 'criado' });
}

// --------------------------------------------------------------------------- plugin no repositório
// Cópia do plugin em .claude/skills/workflow-ia de cada repositório (a raiz, se for git, e cada sub-repositório):
// quem clona tem o Workflow IA sem instalar nada. Ver scripts/lib/embutir.mjs.
const commitsPorRepo = [];
{
  const destinos = destinosDaCopia(projeto);
  if (!destinos.length) avisos.push('Sem repositório git na raiz nem em subpastas: o plugin não foi copiado para dentro do projeto (não há onde versioná-lo).');
  for (const { dir, rotulo } of destinos) {
    const rel = (f) => (rotulo === '.' ? f : path.join(rotulo, f));
    const arquivos = [];
    const r = embutirPlugin({ pluginRoot: PLUGIN_ROOT, destino: dir, simular });
    if (r.acao) {
      acoes.push({ arquivo: rel(PASTA_EMBUTIDA), acao: r.acao === 'atualizado' ? `atualizado (${r.de ?? '?'} → ${r.para})` : `criado (${r.para})` });
      arquivos.push(PASTA_EMBUTIDA);
    }
    const v = garantirVersionavel(dir, { simular });
    if (v.gitignore) {
      acoes.push({ arquivo: rel('.gitignore'), acao: `${v.gitignore} (negações para versionar ${PASTA_EMBUTIDA})` });
      arquivos.push('.gitignore');
    }
    if (v.pendencia) pendencias.push(rotulo === '.' ? v.pendencia : `${rotulo}: ${v.pendencia}`);
    const sg = ignorarNoSemgrep(dir, { simular });
    if (sg) {
      acoes.push({ arquivo: rel('.semgrepignore'), acao: sg });
      arquivos.push('.semgrepignore');
    }
    if (arquivos.length) commitsPorRepo.push({ repo: rotulo, arquivos });
  }
}

// --------------------------------------------------------------------------- CLAUDE.md
const cmPath = path.join(projeto, 'CLAUDE.md');
const cm = existe(cmPath) ? fs.readFileSync(cmPath, 'utf8') : '';
const secao = fs.readFileSync(path.join(PLUGIN_ROOT, 'templates', 'CLAUDE.md.secao'), 'utf8');
if (!cm.includes('<!-- workflow-ia -->')) {
  if (!simular) fs.writeFileSync(cmPath, `${cm}${cm && !cm.endsWith('\n') ? '\n' : ''}${cm ? '\n' : ''}${secao}`);
  acoes.push({ arquivo: 'CLAUDE.md', acao: cm ? 'seção Workflow IA adicionada' : 'criado' });
} else if (atualizar) {
  // Renova só o trecho entre os marcadores; o resto do CLAUDE.md é do projeto.
  const rx = /<!-- workflow-ia -->[\s\S]*?<!-- \/workflow-ia -->\n?/;
  if (!rx.test(cm)) {
    avisos.push('CLAUDE.md tem o marcador de início do Workflow IA mas não o de fim (<!-- /workflow-ia -->): a seção não foi renovada. Substitua-a pelo modelo de templates/CLAUDE.md.secao do plugin.');
  } else if (cm.match(rx)[0] === secao) {
    acoes.push({ arquivo: 'CLAUDE.md', acao: 'mantido (seção já atualizada)' });
  } else {
    if (!simular) fs.writeFileSync(cmPath, cm.replace(rx, () => secao));
    acoes.push({ arquivo: 'CLAUDE.md', acao: 'seção Workflow IA atualizada' });
  }
}

// --------------------------------------------------------------------------- git hooks
// Segunda linha de defesa: valem em qualquer host, inclusive onde os hooks do plugin não carregam.
if (ehGit && !flags['sem-githooks'] && config.githooks?.instalar !== false) {
  const gh = instalarGitHooks(projeto, { simular });
  acoes.push(...gh.acoes);
  avisos.push(...gh.avisos);
}

// --------------------------------------------------------------------------- fonte do marketplace
function fonteMarketplace() {
  if (flags.marketplace) {
    if (/^[\w.-]+\/[\w.-]+$/.test(flags.marketplace) && !existe(flags.marketplace)) return { source: 'github', repo: flags.marketplace };
    return { source: 'directory', path: path.resolve(flags.marketplace) };
  }
  const r = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: PLUGIN_ROOT, encoding: 'utf8' });
  const m = r.status === 0 ? r.stdout.trim().match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/) : null;
  if (m) return { source: 'github', repo: m[1] };
  return { source: 'directory', path: PLUGIN_ROOT };
}
const fonte = fonteMarketplace();

// .claude/settings.json do projeto: lido uma vez, alterado pelos blocos abaixo e gravado uma vez só.
const stProjeto = lerJSON(path.join(projeto, '.claude', 'settings.json'), {});
let stMudou = false;

if (flags['compartilhar-plugin']) {
  const st = stProjeto;
  st.extraKnownMarketplaces = { ...(st.extraKnownMarketplaces || {}), fabriki: { source: fonte } };
  st.enabledPlugins = { ...(st.enabledPlugins || {}), 'workflow-ia@fabriki': true };
  stMudou = true;
  if (fonte.source === 'directory') avisos.push(`O marketplace foi registrado por caminho local (${fonte.path}); isso só funciona nesta máquina. Publique o repositório do plugin no GitHub e rode de novo com --marketplace <owner/repo> para o time e o CI.`);
}

// --------------------------------------------------------------------------- security-guidance
// Com o plugin oficial security-guidance ativo, cada subagente que termina e cada commit disparam uma revisão
// por LLM num processo "claude" filho: uma sessão nova (no RM Code, uma aba) e findings injetados fora do
// pipeline. O security-reviewer do Workflow IA já cobre isso; a variável desliga só essas revisões.
const sg = securityGuidance({ raiz: projeto });
if (sg.ativo && !flags['manter-security-guidance']) {
  const atual = stProjeto.env?.[SG_VARIAVEL];
  if (atual === undefined) {
    stProjeto.env = { ...(stProjeto.env || {}), [SG_VARIAVEL]: '0' };
    stMudou = true;
  } else if (String(atual).trim() !== '0') {
    avisos.push(`.claude/settings.json define ${SG_VARIAVEL}=${JSON.stringify(atual)}: mantido. Com isso, o plugin security-guidance abre uma sessão por subagente e por commit durante a task.`);
  }
}
if (stMudou) escrever('.claude/settings.json', JSON.stringify(stProjeto, null, 2) + '\n', { sobrescrever: true, somenteSeDiferente: true });

// --------------------------------------------------------------------------- CI
const ciExistente = ['workflow-ia-provas.yml', 'workflow-ia-agente.yml'].some((n) => existe(path.join(projeto, '.github', 'workflows', n)));
if (flags.ci || (atualizar && ciExistente)) {
  const tpl = (n) => fs.readFileSync(path.join(PLUGIN_ROOT, 'templates', 'github', n), 'utf8');
  const passos = [];
  const c = config.comandos;
  // JSON é YAML válido: aspas evitam que ": " ou "#" no comando quebrem o arquivo.
  const add = (nome, cmd) => cmd && passos.push(`      - name: ${nome}\n        run: ${JSON.stringify(cmd)}`);
  add('Typecheck', c.typecheck);
  add('Lint', c.lint);
  add('Testes unitários', c.testeUnitario);
  add('Testes de integração', c.testeIntegracao);
  add('Build', c.build);
  add('Testes E2E', c.testeE2E);
  add('Auditoria de dependências', c.dependencias);
  // pnpm/action-setup exige "version" quando o package.json não tem "packageManager".
  const versaoPnpm = () => {
    // Pelo lockfile do projeto (formato 9 → pnpm 9/10, 6 → pnpm 8, 5.x → pnpm 7); senão o pnpm local.
    const lock = existe(path.join(projeto, 'pnpm-lock.yaml')) ? fs.readFileSync(path.join(projeto, 'pnpm-lock.yaml'), 'utf8').slice(0, 200) : '';
    const m = lock.match(/lockfileVersion:\s*'?(\d+)/);
    if (m) return { 9: '9', 6: '8', 5: '7' }[m[1]] || m[1];
    const r = spawnSync('pnpm', ['--version'], { encoding: 'utf8', cwd: projeto });
    return r.status === 0 && /^\d+/.test(r.stdout.trim()) ? r.stdout.trim().split('.')[0] : '9';
  };
  const setupPm =
    pm === 'pnpm'
      ? `      - uses: pnpm/action-setup@v4\n${pkg?.packageManager ? '' : `        with:\n          version: ${versaoPnpm()}\n`}`
      : pm === 'bun'
        ? '      - uses: oven-sh/setup-bun@v2\n'
        : '';
  // setup-node falha com "cache" quando o lockfile não existe.
  const lockDoPm = { npm: ['package-lock.json', 'npm-shrinkwrap.json'], pnpm: ['pnpm-lock.yaml'], yarn: ['yarn.lock'] }[pm] || [];
  const cache = lockDoPm.some((l) => existe(path.join(projeto, l))) ? `\n          cache: ${pm}` : '';
  const e2eSetup = c.testeE2E && /playwright/.test(c.testeE2E + (scripts[sE2E] || '')) ? `      - name: Browsers do Playwright\n        run: ${exec} playwright install --with-deps chromium\n` : '';
  const provas = tpl('workflow-ia-provas.yml')
    .replaceAll('__SETUP_PM__', setupPm)
    .replaceAll('__CACHE__', cache)
    .replaceAll('__INSTALAR__', JSON.stringify(c.instalar || 'echo "defina comandos.instalar"'))
    .replaceAll('__E2E_SETUP__', e2eSetup)
    .replaceAll('__PASSOS__', passos.join('\n'));
  escrever('.github/workflows/workflow-ia-provas.yml', provas, { sobrescrever: !!flags.forcar || !!flags['confirmar-ci'] });
  const mk = fonte.source === 'github' ? fonte.repo : '<owner>/<repo-do-plugin>';
  const agente = tpl('workflow-ia-agente.yml')
    .replaceAll('__SETUP_PM__', setupPm)
    .replaceAll('__CACHE__', cache)
    .replaceAll('__INSTALAR__', JSON.stringify(c.instalar || 'echo "defina comandos.instalar"'))
    .replaceAll('__E2E_SETUP__', e2eSetup)
    .replaceAll('__MARKETPLACE__', mk)
    .replaceAll('__BRANCH_BASE__', branchBase);
  escrever('.github/workflows/workflow-ia-agente.yml', agente, { sobrescrever: !!flags.forcar || !!flags['confirmar-ci'] });
  if (atualizar) {
    // Workflow existente que difere do modelo atual: mostra o diff e só sobrescreve com --confirmar-ci.
    const novos = { '.github/workflows/workflow-ia-provas.yml': provas, '.github/workflows/workflow-ia-agente.yml': agente };
    atualizacao.ci = [];
    for (const a of acoes.filter((x) => x.difere && novos[x.arquivo])) {
      const tmp = path.join(os.tmpdir(), `wfia-ci-${process.pid}-${path.basename(a.arquivo)}`);
      fs.writeFileSync(tmp, novos[a.arquivo]);
      const d = spawnSync('git', ['diff', '--no-index', '--no-color', '--', path.join(projeto, a.arquivo), tmp], { encoding: 'utf8' });
      fs.rmSync(tmp, { force: true });
      atualizacao.ci.push({ arquivo: a.arquivo, diff: (d.stdout || '').split('\n').slice(0, 80).join('\n') });
      pendencias.push(`${a.arquivo} difere do modelo atual do plugin e NÃO foi sobrescrito. Revise o diff e, se quiser, rode de novo com --confirmar-ci.`);
    }
  }
  if (fonte.source !== 'github') pendencias.push('No workflow do agente, troque <owner>/<repo-do-plugin> pelo repositório do plugin no GitHub.');
  pendencias.push('No GitHub: crie o secret ANTHROPIC_API_KEY (ou CLAUDE_CODE_OAUTH_TOKEN) e, se usar o board no CI, os tokens do conector (ver docs/ci-headless.md do plugin).');
  pendencias.push(`No GitHub: proteja o branch "${branchBase}" (ruleset exigindo PR e revisão). É a garantia final de que nada chega à base sem o humano.`);
  if (fonte.source === 'github') pendencias.push('Se o repositório do plugin for privado, crie o secret WORKFLOW_IA_PLUGIN_TOKEN (token com leitura desse repositório).');
}

// --------------------------------------------------------------------------- saída
function commitsDosSubRepos() {
  return commitsPorRepo
    .filter((c) => c.repo !== '.')
    .map((c) => `Sub-repositório ${c.repo}: cd ${JSON.stringify(c.repo)} && git add ${c.arquivos.join(' ')} && git commit -m "chore: Workflow IA ${PLUGIN_VERSAO} no repositório"`);
}
const resultado = {
  ok: true,
  simulado: simular,
  projeto,
  plugin: PLUGIN_ROOT,
  stackDetectada: stack,
  gerenciadorPacotes: pm,
  branchBase,
  comandos: config.comandos,
  etapasObrigatorias: config.gate.etapas.filter((e) => e.obrigatoria).map((e) => e.nome),
  ...(atualizacao ? { modo: 'atualizar', atualizacao } : {}),
  pluginNoRepositorio: commitsPorRepo,
  arquivos: acoes,
  pendencias,
  avisos,
  proximosPassos: atualizacao
    ? [
        simular ? 'Isto foi só uma simulação: nada foi gravado. Se o resultado estiver certo, rode de novo sem --simular.' : 'Atualização gravada. Revise o diff do config (atualizacao.preservado / adicionado / migracoes).',
        'Rode ".workflow-ia/wf doctor" (inclui a seção host) e cada comando do gate uma vez.',
        `Faça commit dos arquivos alterados (git status)${commitsPorRepo.some((c) => c.repo === '.') ? `, incluindo ${PASTA_EMBUTIDA} (o código do plugin: quem clona só recebe a versão nova depois desse commit)` : ''} — o Workflow IA nunca faz commit.`,
        ...commitsDosSubRepos(),
        'Abra uma sessão NOVA do Claude Code no projeto para carregar a versão atual do plugin.',
      ]
    : [
    'Revise .workflow-ia/config.json (comandos, branch base, board, limites do pipeline).',
    'Rode ".workflow-ia/wf doctor" dentro do projeto.',
    `Faça commit de .workflow-ia/config.json, .workflow-ia/wf, .workflow-ia/README.md, .gitignore${stMudou ? ', .claude/settings.json' : ''}${commitsPorRepo.some((c) => c.repo === '.') ? `, ${PASTA_EMBUTIDA}` : ''} e CLAUDE.md (os git hooks ficam em .git/hooks e não são versionados).`,
    ...commitsDosSubRepos(),
    'Abra o Claude Code no projeto e rode /workflow-ia:task <card>.',
  ],
};
console.log(JSON.stringify(resultado, null, 2));
