// Reaproveitamento da verificação do CI por CONTEÚDO de cada app (0.9.0, ci.criterioReaproveitar = "conteudo").
//
// Um run verde de workflow_dispatch de um commit ANTERIOR da mesma branch prova o app X no commit atual quando o
// conteúdo que X lê é o mesmo nos dois commits. "Conteúdo" é a lista do `git ls-tree -r` (modo, tipo, id do blob e
// caminho; nunca mtime) dos caminhos de X: ci.apps.X.dir, ci.compartilhado, ci.apps.X.entradas (o que o app lê fora
// da pasta dele) e os lockfiles da raiz. O workflow (o arquivo do run e .github/actions/) tem hash à parte: mudou,
// nada é reaproveitado. Na dúvida (commit que não dá para buscar, git falhou, app sem dir), o app roda.
//
// O mesmo cálculo existe em bash no job "reaproveitar" do yml gerado (lib/ci-gerar.mjs): a expressão regular dos
// caminhos (ERE POSIX que o awk e o RegExp do JS leem igual) é gerada aqui e vai pronta para o yml; o hash é o
// sha256 das linhas casadas, cada uma terminada em "\n" (o que `awk ... | sha256sum` calcula).

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fimDaChave, opcoesDaChave, validarGlob } from './core.mjs';

export const CRITERIOS = ['commit', 'conteudo'];
export const LOCKFILES_PADRAO = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock'];
// Sem o arquivo do workflow (o gh não disse qual é), vale a pasta inteira: qualquer workflow mudou, nada reaproveita.
export const WORKFLOWS_PADRAO = '.github/workflows';
export const ACOES_LOCAIS = '.github/actions';
const VAZIO = createHash('sha256').update('').digest('hex');

/** Critério do reaproveitamento: "conteudo" só quando pedido; ausente ou qualquer outro valor é o da 0.8.0 ("commit"). */
export function criterioDe(config) {
  return config?.ci?.criterioReaproveitar === 'conteudo' ? 'conteudo' : 'commit';
}

// --------------------------------------------------------------------------- caminhos → expressão regular

// Literal em ERE que o awk (mawk/gawk) e o RegExp do JS entendem igual: metacaracteres entre colchetes; os que não
// podem ir num colchete compatível com os dois ([ ] ^ \) com barra.
const EM_COLCHETE = new Set(['.', '+', '(', ')', '{', '}', '|', '$', '*', '?']);
function literalEre(texto) {
  return [...String(texto)].map((c) => (EM_COLCHETE.has(c) ? `[${c}]` : '[]^\\'.includes(c) ? `\\${c}` : c)).join('');
}

/** Glob (mesma semântica do casaAlgum: * não cruza "/", ** cruza, {a,b} são opções) em ERE sem âncoras. */
export function globParaEre(glob, profundidade = 0) {
  if (profundidade > 20) throw new Error('chaves aninhadas demais');
  const g = String(glob);
  let re = '';
  let i = 0;
  while (i < g.length) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        if (g[i + 2] === '/') {
          re += '(.*/)?';
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
      const fim = fimDaChave(g, i);
      if (fim < 0) {
        re += '[{]';
        i += 1;
      } else {
        const opcoes = opcoesDaChave(g.slice(i + 1, fim)).map((o) => globParaEre(o, profundidade + 1));
        const cheias = opcoes.filter(Boolean);
        // Opção vazia ({,x}) vira grupo opcional: alternativa vazia não é ERE portável.
        re += cheias.length ? `(${cheias.join('|')})${cheias.length < opcoes.length ? '?' : ''}` : '';
        i = fim + 1;
      }
    } else {
      re += literalEre(c);
      i += 1;
    }
  }
  return re;
}

const limparCaminho = (p) => String(p || '').trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');

/**
 * Caminhos que o app X lê: { caminhos: [texto para humanos], rx } ou null quando o app não tem dir no config (nunca
 * reaproveita). Cada caminho casa ele mesmo e tudo debaixo dele ("docs" = docs e docs/**).
 */
export function caminhosDoApp(config, app, { compartilhado = null } = {}) {
  const a = config?.ci?.apps?.[app];
  if (!a || typeof a !== 'object') return null;
  if (typeof a.dir !== 'string' || !a.dir.trim()) return null;
  const dir = limparCaminho(a.dir) || '.';
  const comp = Array.isArray(compartilhado) ? compartilhado : Array.isArray(config.ci.compartilhado) ? config.ci.compartilhado : [];
  const entradas = Array.isArray(a.entradas) ? a.entradas : [];
  const locks = Array.isArray(config?.protecoes?.lockfiles) && config.protecoes.lockfiles.length ? config.protecoes.lockfiles : LOCKFILES_PADRAO;
  const itens = [];
  if (dir === '.') itens.push({ texto: '. (o repositório inteiro)', ere: '.*' });
  else itens.push({ texto: `${dir}/`, ere: literalEre(dir) });
  for (const g of [...comp, ...entradas]) {
    const limpo = limparCaminho(g);
    if (!limpo || validarGlob(limpo)) continue;
    itens.push({ texto: limpo, ere: globParaEre(limpo) });
  }
  for (const l of [...new Set(locks)]) itens.push({ texto: l, ere: literalEre(l) });
  const unicos = [...new Map(itens.map((x) => [x.ere, x])).values()];
  const alternativas = unicos.flatMap((x) => (x.ere === '.*' ? ['.*'] : [x.ere, `${x.ere}/.*`]));
  // Aspas opcionais no começo: o git cita caminho com caractere de controle mesmo com core.quotepath=off.
  return { caminhos: unicos.map((x) => x.texto), rx: `^"?(${alternativas.join('|')})$` };
}

// --------------------------------------------------------------------------- hash do conteúdo

// Só SHA hexadecimal ou HEAD chega ao git (um valor lido de JSON nunca vira opção da linha de comando).
const refValida = (sha) => sha === 'HEAD' || /^[0-9a-f]{7,64}$/i.test(String(sha || ''));

function lsTree(raiz, sha, pathspecs = []) {
  if (!refValida(sha)) return { ok: false, motivo: `SHA ilegível: ${sha}` };
  const r = spawnSync('git', ['-c', 'core.quotepath=off', 'ls-tree', '-r', '--full-tree', sha, ...(pathspecs.length ? ['--', ...pathspecs] : [])], { cwd: raiz, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  return r.status === 0 ? { ok: true, saida: r.stdout || '' } : { ok: false, motivo: (r.stderr || `git ls-tree ${sha} falhou`).trim().split('\n').pop() };
}

const sha256 = (texto) => createHash('sha256').update(texto).digest('hex');

/** Hash do conteúdo dos caminhos (rx de caminhosDoApp) no commit: { ok, hash, arquivos } ou { ok:false, motivo }. */
export function hashConteudo(raiz, sha, rx) {
  const l = lsTree(raiz, sha);
  if (!l.ok) return l;
  let re;
  try {
    re = new RegExp(rx);
  } catch (e) {
    return { ok: false, motivo: `expressão dos caminhos inválida (${e.message})` };
  }
  const casadas = l.saida.split('\n').filter((linha) => {
    const t = linha.indexOf('\t');
    return t > 0 && re.test(linha.slice(t + 1));
  });
  return { ok: true, hash: sha256(casadas.map((x) => `${x}\n`).join('')), arquivos: casadas.length };
}

/** Hash do workflow (o arquivo do run e as ações locais) no commit; `existe` diz se o arquivo do workflow está lá. */
export function hashWorkflow(raiz, sha, arquivo = null) {
  const alvo = limparCaminho(arquivo) || WORKFLOWS_PADRAO;
  const l = lsTree(raiz, sha, [alvo, ACOES_LOCAIS]);
  if (!l.ok) return l;
  const existe = l.saida.split('\n').some((linha) => {
    const p = linha.slice(linha.indexOf('\t') + 1);
    return p === alvo || p.startsWith(`${alvo}/`);
  });
  return { ok: true, hash: sha256(l.saida), existe, arquivo: alvo };
}

/** O commit está no repositório local? Senão busca do remoto (sem --depth: nunca deixa um clone completo raso). */
export function garantirCommit(raiz, sha, remoto = 'origin') {
  if (!/^[0-9a-f]{7,64}$/i.test(String(sha || ''))) return { ok: false, motivo: `SHA ilegível: ${sha}` };
  const tem = () => spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: raiz }).status === 0;
  if (tem()) return { ok: true };
  const f = spawnSync('git', ['fetch', '--quiet', '--no-tags', remoto, sha], { cwd: raiz, encoding: 'utf8', timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  if (f.status === 0 && tem()) return { ok: true, buscado: true };
  return { ok: false, motivo: `não consegui buscar o commit ${String(sha).slice(0, 7)} (${String(f.stderr || 'fetch falhou').trim().split('\n').pop()})` };
}

/**
 * O app X tem no commit `sha` (o do dispatch) o mesmo conteúdo que no `head`, e o workflow é o mesmo?
 * { ok, motivo, app, sha, hash, hashHead, hashWorkflow, workflow, caminhos }. Qualquer dúvida: ok false.
 */
export function compararConteudo(raiz, config, { app, sha, head, workflow = null, remoto = null, compartilhado = null }) {
  const base = { app, sha };
  const c = caminhosDoApp(config, app, { compartilhado });
  if (!c) return { ...base, ok: false, motivo: `ci.apps.${app} sem dir: sem caminhos de conteúdo, o app roda` };
  const g = garantirCommit(raiz, sha, remoto || config?.git?.remoto || 'origin');
  if (!g.ok) return { ...base, ok: false, motivo: g.motivo };
  const wh = hashWorkflow(raiz, head, workflow);
  const wd = hashWorkflow(raiz, sha, workflow);
  if (!wh.ok || !wd.ok) return { ...base, ok: false, motivo: `hash do workflow falhou (${(wh.ok ? wd : wh).motivo})` };
  if (!wh.existe) return { ...base, ok: false, motivo: `o workflow ${wh.arquivo} não existe no commit atual` };
  if (wh.hash !== wd.hash) return { ...base, ok: false, motivo: `o workflow (${wh.arquivo} ou ${ACOES_LOCAIS}) mudou desde ${String(sha).slice(0, 7)}`, hashWorkflow: wh.hash, hashWorkflowRun: wd.hash };
  const h = hashConteudo(raiz, head, c.rx);
  const d = hashConteudo(raiz, sha, c.rx);
  if (!h.ok || !d.ok) return { ...base, ok: false, motivo: `hash do conteúdo falhou (${(h.ok ? d : h).motivo})` };
  const dados = { ...base, hash: d.hash, hashHead: h.hash, hashWorkflow: wh.hash, workflow: wh.arquivo, caminhos: c.caminhos, arquivos: h.arquivos };
  if (h.hash !== d.hash) return { ...dados, ok: false, motivo: `o conteúdo de ${app} mudou desde ${String(sha).slice(0, 7)} (${c.caminhos.join(', ')})` };
  return { ...dados, ok: true, motivo: `conteúdo de ${app} igual ao de ${String(sha).slice(0, 7)} (${h.arquivos} arquivo(s))` };
}

/**
 * Reconferência da prova por conteúdo (wf verificacao registrar e manifest): recalcula, do config atual, os hashes
 * gravados no ci.json/gate.json. Vale só se o commit do run ainda existe aqui e tudo bate.
 */
const memoConfere = new Map();
export function provaConteudoConfere(raiz, config, entrada, head) {
  if (!entrada || typeof entrada !== 'object' || !entrada.app || !entrada.sha || !entrada.hash) return false;
  const c = caminhosDoApp(config, entrada.app);
  if (!c) return false;
  const chave = JSON.stringify([raiz, head, entrada.app, entrada.sha, entrada.hash, entrada.hashWorkflow || null, entrada.workflow || null, c.rx]);
  if (!memoConfere.has(chave)) {
    if (memoConfere.size > 500) memoConfere.clear();
    memoConfere.set(chave, reconferir(raiz, entrada, head, c));
  }
  return memoConfere.get(chave);
}

function reconferir(raiz, entrada, head, c) {
  if (!refValida(entrada.sha) || !refValida(head)) return false;
  if (spawnSync('git', ['cat-file', '-e', `${entrada.sha}^{commit}`], { cwd: raiz }).status !== 0) return false;
  const wh = hashWorkflow(raiz, head, entrada.workflow);
  const wd = hashWorkflow(raiz, entrada.sha, entrada.workflow);
  if (!wh.ok || !wd.ok || !wh.existe || wh.hash !== wd.hash || (entrada.hashWorkflow && entrada.hashWorkflow !== wh.hash)) return false;
  const h = hashConteudo(raiz, head, c.rx);
  const d = hashConteudo(raiz, entrada.sha, c.rx);
  return h.ok && d.ok && h.hash === d.hash && d.hash === entrada.hash;
}

/**
 * A prova do CI (de uma etapa, do gate.json ou do ci.json) vale para o HEAD? O SHA local tem de ser o HEAD; cada run
 * usado é do HEAD ou (0.9.0, critério "conteudo") de um commit anterior com prova por conteúdo que ainda confere.
 * { sha, headSha, shas?, criterio?, conteudo?: [entradas] }.
 */
export function provaCIValeParaHead(raiz, config, prova, head) {
  if (!prova || !head || prova.sha !== head) return false;
  // O headSha (o run citado) e todos os runs de onde vieram jobs; nenhum deles pode ficar sem prova.
  const usados = [...new Set([prova.headSha ?? null, ...(Array.isArray(prova.shas) ? prova.shas : [])])];
  if (usados.includes(null)) return false;
  const outros = usados.filter((s) => s !== head);
  if (!outros.length) return true;
  if (prova.criterio !== 'conteudo' || !Array.isArray(prova.conteudo) || !prova.conteudo.length) return false;
  const conferidas = new Map();
  const confere = (e) => {
    const k = `${e.app}@${e.sha}`;
    if (!conferidas.has(k)) conferidas.set(k, provaConteudoConfere(raiz, config, e, head));
    return conferidas.get(k);
  };
  return outros.every((s) => {
    const doSha = prova.conteudo.filter((e) => e && e.sha === s);
    return doSha.length > 0 && doSha.every(confere);
  });
}

// --------------------------------------------------------------------------- doctor

const ARQUIVOS_CONFIG_APP = /^(package\.json|tsconfig[^/]*\.json|jsconfig\.json|(vitest|vite|jest|playwright|next|nuxt|astro|svelte|webpack|rollup|tsup|esbuild|eslint|prisma)\.config\.[cm]?[jt]s|\.eslintrc[^/]*|\.env\.(test|example))$/;

/**
 * Avisos do critério "conteudo" (best effort, para o wf doctor): app cujos arquivos de config citam caminhos fora da pasta dele ("../") que nem ci.compartilhado nem
 * ci.apps.X.entradas cobrem: mudança lá não invalidaria a prova do app.
 */
export function avisosConteudo(raiz, config) {
  const avisos = [];
  const apps = config?.ci?.apps && typeof config.ci.apps === 'object' ? config.ci.apps : {};
  for (const [nome, a] of Object.entries(apps)) {
    if (typeof a?.dir !== 'string' || !a.dir.trim()) continue;
    const dir = limparCaminho(a.dir) || '.';
    // dir "." já é aviso do validarConfigCI (o app é o repositório inteiro: nada fica fora dele).
    if (dir === '.') continue;
    const c = caminhosDoApp(config, nome);
    if (!c) continue;
    const re = new RegExp(c.rx);
    let arquivos = [];
    try {
      arquivos = fs.readdirSync(path.join(raiz, dir)).filter((f) => ARQUIVOS_CONFIG_APP.test(f));
    } catch {
      continue;
    }
    const fora = new Map();
    for (const f of arquivos) {
      let texto = '';
      try {
        texto = fs.readFileSync(path.join(raiz, dir, f), 'utf8').slice(0, 200000);
      } catch {
        continue;
      }
      for (const m of texto.matchAll(/(?:^|["'`\s(=:])((?:\.\.\/)+[^"'`\s),;]*)/g)) {
        const alvo = path.posix.normalize(path.posix.join(dir, m[1]));
        if (alvo.startsWith('..') || alvo === '.' || re.test(alvo) || re.test(`${alvo}/x`)) continue;
        if (!fora.has(alvo)) fora.set(alvo, `${dir}/${f}`);
      }
    }
    if (fora.size) {
      const lista = [...fora].slice(0, 5).map(([alvo, arq]) => `${alvo} (citado em ${arq})`);
      avisos.push(`ci.apps.${nome} lê caminhos fora de "${dir}" que nem ci.compartilhado nem ci.apps.${nome}.entradas cobrem: ${lista.join(', ')}${fora.size > 5 ? ` e mais ${fora.size - 5}` : ''}. Com o critério "conteudo", mudança neles não invalidaria a prova do app: declare-os em ci.apps.${nome}.entradas`);
    }
  }
  return avisos;
}

export { VAZIO as HASH_VAZIO };
