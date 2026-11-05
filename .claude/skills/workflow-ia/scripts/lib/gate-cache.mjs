// Gate incremental entre iterações do loop (0.6.0): reaproveita o resultado de uma etapa que passou quando a
// impressão digital dos insumos dela não mudou. Só vale dentro do loop; "wf verificar-limpo" nunca usa cache.
//
// Regras da prova:
// - sem "insumos" declarados no config, a etapa sempre roda (padrão conservador, igual ao de antes);
// - etapa que falhou na última execução sempre roda de novo, inclusive quando a falha ficou fora do cache (finding
//   gate:<etapa> aberto, falha no último gate com rótulo ou na verificação mais nova que a entrada do cache);
// - etapa que depende do histórico (cacheavel: false, {base}/WF_BASE no comando, "segredos") nunca vem do cache;
// - glob dos insumos que não casa nenhum arquivo do HEAD faz a etapa rodar (erro de digitação não vira cache eterno);
// - o cache só é aceito se o commit dele é ancestral do HEAD, se nenhum arquivo dos insumos mudou entre os dois
//   (git diff --name-only --no-renames), se o hash dos insumos recalculado no HEAD confere e se os arquivos
//   ignorados pelo git que casam os insumos não mudaram (diretórios ignorados inteiros não entram: limitação);
// - config.json, lockfiles, insumos globais, merge-base com a base (merge de base nova), commit de merge no
//   intervalo, rebase e ajuste diferente invalidam o cache inteiro.
// Um erro aqui nunca derruba o gate: o cache fica desligado e a etapa roda.
//
// Este módulo só decide e registra: quem roda as etapas é o laço de rodarGate (provas.mjs).

import path from 'node:path';
import fs from 'node:fs';
import { caminhos, lerJSON, gravarJSON, agoraISO, git, gitHead, gitLimpo, globParaRegex, validarGlob, refBase, baseDaTask, resolverComando, sha256 } from './core.mjs';
import { lerFindings, ABERTOS } from './findings.mjs';

const ARQUIVO_CONFIG = '.workflow-ia/config.json';
// Status de etapa que não rodou porque uma dependência (dependeDe) não passou (ver gate.mjs).
const PULADA = 'pulada-por-dependencia';
// Status da teste-ci (modo CI) quando o CI não respondeu: infraestrutura, não resultado do código.
const CI_INDISPONIVEL = 'ci-indisponivel';

/** "pulada (dependência: teste-ci falhou)" — tabela do gate, pendências e manifest. */
export function textoPulada(e) {
  return `pulada (dependência: ${e?.causaRaiz?.texto || e?.dependencia?.etapa || '?'})`;
}

// --------------------------------------------------------------------------- sub-etapas ("prefixo:sufixo")

/** "teste-e2e:pdv-web" → "teste-e2e". Sub-etapas são etapas normais; só o manifest e o --etapas agrupam. */
export function grupoDaEtapa(nome) {
  return String(nome).split(':')[0];
}

export function etapaDoGrupo(nome, grupo) {
  return nome === grupo || String(nome).startsWith(`${grupo}:`);
}

/** Nome do arquivo de log da etapa (":" não é aceito em todo sistema de arquivos). */
export function nomeArquivoEtapa(nome) {
  return String(nome).replaceAll(':', '--');
}

/** Expande os nomes do --etapas: "teste-e2e" seleciona também as sub-etapas "teste-e2e:*". */
export function expandirSelecao(config, nomes) {
  if (!nomes) return nomes;
  const todas = (config.gate?.etapas || []).map((e) => e.nome);
  const saida = new Set();
  for (const n of nomes) {
    const casadas = todas.filter((t) => etapaDoGrupo(t, n));
    if (casadas.length) casadas.forEach((t) => saida.add(t));
    else saida.add(n);
  }
  return [...saida];
}

/** Junta as etapas de um grupo (etapa única ou sub-etapas) num resultado só, para o manifest. */
export function agregarGrupo(etapas, grupo) {
  const doGrupo = (etapas || []).filter((e) => etapaDoGrupo(e.nome, grupo));
  if (!doGrupo.length) return null;
  if (doGrupo.length === 1) return doGrupo[0];
  const configuradas = doGrupo.filter((e) => e.status !== 'nao-configurado');
  const ruim = configuradas.find((e) => e.status !== 'ok');
  // Sub-etapa obrigatória sem comando não some do grupo: o grupo fica "nao-configurado" e obrigatório (faltando).
  const obrigatoriaSemComando = doGrupo.find((e) => e.obrigatoria && e.status === 'nao-configurado');
  return {
    nome: grupo,
    obrigatoria: doGrupo.some((e) => e.obrigatoria),
    status: !configuradas.length || (!ruim && obrigatoriaSemComando) ? 'nao-configurado' : ruim ? ruim.status : 'ok',
    origem: doGrupo.some((e) => e.origem === 'cache') ? 'cache' : doGrupo.some((e) => e.origem === 'ci') ? 'ci' : 'execucao',
    // Sub-etapas lidas do CI: o grupo carrega o run (sha, url) da que reprovou ou da primeira, para a prova do manifest.
    ...(doGrupo.some((e) => e.origem === 'ci') ? { ci: (ruim?.origem === 'ci' ? ruim : doGrupo.find((e) => e.origem === 'ci')).ci || null } : {}),
    duracaoMs: doGrupo.reduce((t, e) => t + (e.duracaoMs || 0), 0),
    log: (ruim || configuradas[0] || doGrupo[0]).log || null,
    subEtapas: doGrupo.map((e) => e.nome),
    // Sub-etapa pulada por dependência: o grupo não está comprovado, e a causa raiz é a dependência.
    ...(ruim?.causaRaiz ? { motivo: ruim.motivo, causaRaiz: ruim.causaRaiz } : {}),
  };
}

// --------------------------------------------------------------------------- arquivo do cache

export function caminhoCache(raiz, id) {
  return path.join(caminhos(raiz, id).evidencias, 'gate-cache.json');
}

export function lerCache(raiz, id) {
  const d = lerJSON(caminhoCache(raiz, id), null);
  if (!d || d.versao !== 1 || !d.etapas || typeof d.etapas !== 'object' || Array.isArray(d.etapas)) return { versao: 1, etapas: {}, economia: [] };
  // Item de economia malformado (arquivo editado à mão ou corrompido) é descartado: nunca derruba o manifest.
  d.economia = (Array.isArray(d.economia) ? d.economia : []).filter(
    (x) => x && typeof x === 'object' && Array.isArray(x.etapas) && x.etapas.every((n) => typeof n === 'string') && Number.isFinite(Number(x.ms ?? 0)) && Number.isFinite(Number(x.iteracao))
  );
  return d;
}

const ehLista = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string' && x.trim());
const curto = (sha) => String(sha || '').slice(0, 7);

/** "./src/" → "src/**"; "./a" → "a". Um glob sem curinga casa o próprio caminho e tudo abaixo dele (ver casaInsumo). */
export function normalizarGlob(g) {
  let s = String(g).trim();
  while (s.startsWith('./')) s = s.slice(2);
  if (s.endsWith('/')) s = `${s.replace(/\/+$/, '')}/**`;
  return s;
}

const temCuringa = (g) => /[*?{]/.test(g);

/**
 * Um caminho casa algum dos insumos? "src" (sem curinga) casa "src" e "src/...", como "src/**"; "x/**" também casa o
 * próprio "x" (gitlink de submódulo, que é uma entrada só na árvore).
 */
export function casaInsumo(caminho, globs) {
  const p = String(caminho).replace(/^\.\//, '');
  return globs.some((g) => {
    if (!temCuringa(g)) return p === g || p.startsWith(`${g}/`);
    if (g.endsWith('/**') && p === g.slice(0, -3)) return true;
    return globParaRegex(g).test(p);
  });
}

/**
 * Insumos efetivos de uma etapa: os declarados nela ou, numa sub-etapa sem "insumos", os de
 * gate.insumosPadrao[grupo]; "{app}" vira o sufixo da sub-etapa (teste-e2e:pdv-web → apps/pdv-web/**).
 * Única expansão usada no hash, no diff de invalidação e no registro. "{app}" em etapa sem sufixo é erro:
 * a etapa fica sem insumos (sempre roda) e o doctor acusa.
 */
export function insumosDaEtapa(config, etapa) {
  const nome = String(etapa?.nome || '');
  const sufixo = nome.includes(':') ? nome.slice(nome.indexOf(':') + 1) : '';
  const padrao = config?.gate?.insumosPadrao;
  let brutos = [];
  if (etapa && 'insumos' in etapa) brutos = ehLista(etapa.insumos) ? etapa.insumos : [];
  else if (sufixo && padrao && typeof padrao === 'object' && ehLista(padrao[grupoDaEtapa(nome)])) brutos = padrao[grupoDaEtapa(nome)];
  if (!brutos.some((g) => g.includes('{app}'))) return { globs: brutos.map(normalizarGlob), erro: null };
  if (!sufixo) return { globs: [], erro: `"{app}" nos insumos exige sub-etapa (prefixo:sufixo)` };
  return { globs: brutos.map((g) => normalizarGlob(g.replaceAll('{app}', sufixo))), erro: null };
}

/**
 * A etapa depende do histórico (não só do conteúdo do HEAD) e nunca vem do cache: cacheavel: false, ou {base}/WF_BASE
 * no comando, ou o grupo "segredos" (gitleaks em {base}..HEAD), salvo cacheavel: true explícito.
 */
export function dependeDoHistorico(config, etapa) {
  if (etapa?.cacheavel === false) return true;
  if (etapa?.cacheavel === true) return false;
  const bruto = etapa?.comandoBruto ?? resolverComando(config, etapa?.comando || '');
  return grupoDaEtapa(etapa?.nome || '') === 'segredos' || /\{base\}|\bWF_BASE\b/.test(String(bruto || ''));
}

const insumosDa = (config, etapa) => insumosDaEtapa(config, etapa).globs;

// --------------------------------------------------------------------------- impressão digital

/** Linhas "modo tipo blob\tcaminho" do HEAD (um ls-tree por gate, reaproveitado entre as etapas). */
function arvoreHead(raiz) {
  const r = git(raiz, ['ls-tree', '-r', '-z', '--full-tree', 'HEAD']);
  if (r.exit !== 0) return null;
  return r.out
    .split('\0')
    .filter(Boolean)
    .map((linha) => ({ linha, caminho: linha.slice(linha.indexOf('\t') + 1) }));
}

function hashDe(arvore, casa) {
  return sha256(
    arvore
      .filter((x) => casa(x.caminho))
      .map((x) => x.linha)
      .join('\n')
  );
}

function ehLockfile(config, arquivo) {
  return (config.protecoes?.lockfiles || []).includes(path.posix.basename(arquivo));
}

/**
 * Entradas ignoradas pelo git (git ls-files --ignored --directory): arquivos soltos e diretórios inteiros
 * ("node_modules/"). .workflow-ia/ fica de fora (tasks/ e runtime/ mudam a cada comando).
 */
function listarIgnorados(raiz) {
  const r = git(raiz, ['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--directory']);
  if (r.exit !== 0) return [];
  return r.out.split('\0').filter((f) => f && !f.startsWith('.workflow-ia/'));
}

/**
 * Impressão digital dos arquivos ignorados que casam os globs (ex.: .env, código gerado não versionado): caminho e
 * conteúdo (arquivos grandes: tamanho e mtime). Diretórios ignorados inteiros não entram (limitação documentada).
 */
function hashIgnorados(ctx, globs) {
  if (!globs.length || !ctx.ignorados.length) return sha256('');
  const chave = JSON.stringify(globs);
  if (ctx.memoIgnorados.has(chave)) return ctx.memoIgnorados.get(chave);
  const partes = [];
  for (const f of ctx.ignorados) {
    if (f.endsWith('/') || !casaInsumo(f, globs)) continue;
    try {
      const abs = path.join(ctx.raiz, f);
      const st = fs.statSync(abs);
      partes.push(`${f}:${st.size}:${st.size <= 1024 * 1024 ? sha256(fs.readFileSync(abs)) : Math.round(st.mtimeMs)}`);
    } catch {
      partes.push(`${f}:sumiu`);
    }
  }
  const h = sha256(partes.join('\n'));
  ctx.memoIgnorados.set(chave, h);
  return h;
}

/** Última falha conhecida de cada etapa fora do gate-cache.json: findings gate:<etapa> abertos e gates gravados. */
function falhasConhecidas(raiz, estado) {
  const abertas = new Map();
  try {
    for (const f of lerFindings(raiz, estado.id).itens || []) {
      if (String(f.fingerprint || '').startsWith('gate:') && ABERTOS.includes(f.status)) abertas.set(f.fingerprint.slice(5), f.id);
    }
  } catch {
    /* sem findings */
  }
  const ultimas = new Map();
  const arquivos = [estado.ultimoGate?.arquivo ? path.join(raiz, estado.ultimoGate.arquivo) : null, path.join(caminhos(raiz, estado.id).evidencias, 'verificacao', 'gate.json')];
  for (const arq of arquivos) {
    const g = arq ? lerJSON(arq, null) : null;
    if (!g || g.invalido || !Array.isArray(g.etapas)) continue;
    for (const e of g.etapas) {
      if (!['falhou', 'timeout'].includes(e?.status) || e.origem === 'cache') continue;
      const atual = ultimas.get(e.nome);
      if (!atual || Date.parse(g.em) > Date.parse(atual.em)) ultimas.set(e.nome, { em: g.em, rotulo: g.rotulo });
    }
  }
  return { abertas, ultimas };
}

/**
 * Prepara a decisão de cache de um gate. Devolve sempre um contexto:
 * - `gravar`: as etapas executadas agora entram no cache (loop, sem rótulo, árvore limpa, cache ligado no config);
 * - `ativo`: além de gravar, o cache pode ser lido (desligado por --sem-cache);
 * - `selecao`: nomes do --etapas; com o cache ativo, as demais etapas só vêm do cache (nunca rodam);
 * - `motivo`: por que o cache está desligado, para a tabela.
 */
export function prepararCache(raiz, estado, config, opcoes = {}) {
  try {
    return prepararCacheSemProtecao(raiz, estado, config, opcoes);
  } catch (e) {
    // Erro no cache nunca derruba o gate: ele roda tudo, como sem cache.
    return { ativo: false, gravar: false, soFalhas: false, motivo: `erro no cache: ${e.message} (o gate roda todas as etapas)` };
  }
}

function prepararCacheSemProtecao(raiz, estado, config, { usarCache = true, soFalhas = false, rotulo, selecao } = {}) {
  const base = { ativo: false, gravar: false, soFalhas: false, motivo: null };
  if (rotulo) return { ...base, motivo: `gate com rótulo "${rotulo}": sem cache` };
  if (estado.fase !== 'loop') return { ...base, motivo: 'fora do loop: sem cache' };
  if (config.gate?.cacheEntreIteracoes === false) return { ...base, motivo: 'cache desligado no config (gate.cacheEntreIteracoes: false)' };
  if (!gitLimpo(raiz).limpo) return { ...base, motivo: 'alterações não commitadas: sem cache' };
  const head = gitHead(raiz);
  const arvore = head ? arvoreHead(raiz) : null;
  if (!head || !arvore) return { ...base, motivo: 'git sem HEAD: sem cache' };
  const globais = (ehLista(config.gate?.insumosGlobais) ? config.gate.insumosGlobais : []).map(normalizarGlob);
  const mb = git(raiz, ['merge-base', 'HEAD', refBase(raiz, baseDaTask(estado, config))]);
  let textoConfig = '';
  try {
    textoConfig = fs.readFileSync(path.join(raiz, ARQUIVO_CONFIG), 'utf8');
  } catch {
    textoConfig = JSON.stringify(config);
  }
  const ultima = (estado.iteracoes || [])[(estado.iteracoes || []).length - 1];
  const ctx = {
    ativo: usarCache !== false,
    gravar: true,
    soFalhas: !!soFalhas && usarCache !== false,
    selecao: selecao && usarCache !== false ? new Set(selecao) : null,
    motivo: usarCache === false ? 'cache ignorado nesta execução' : null,
    raiz,
    config,
    head,
    arvore,
    globais,
    ignorados: listarIgnorados(raiz),
    memoIgnorados: new Map(),
    memoVazio: new Map(),
    hashConfig: sha256(textoConfig),
    hashLockfiles: hashDe(arvore, (f) => ehLockfile(config, f)),
    mergeBase: mb.exit === 0 ? mb.out : null,
    ajuste: estado.ajuste?.id || null,
    iteracao: estado.iteracao || 0,
    tentativa: (ultima?.tentativasGate || 0) + 1,
    dados: lerCache(raiz, estado.id),
    falhas: falhasConhecidas(raiz, estado),
    memo: new Map(),
    naoCobertas: new Set(),
  };
  // Insumos globais: arquivos versionados e também os ignorados que casam (ex.: ".env*" em insumosGlobais).
  ctx.hashGlobais = sha256(`${hashDe(arvore, (f) => globais.length > 0 && casaInsumo(f, globais))}\n${hashIgnorados(ctx, globais)}`);
  return ctx;
}

/**
 * Insumos que, juntos, não casam nenhum arquivo do HEAD (erro de digitação, {app} errado): a impressão digital seria
 * a de um conjunto vazio e a etapa viveria no cache para sempre. Devolve os globs, ou null. Um glob vazio entre outros
 * que casam é legítimo (ex.: "e2e/{app}/**" num app sem e2e): só o doctor avisa.
 */
function globSemArquivo(ctx, globs) {
  const vazio = (g) => {
    if (!ctx.memoVazio.has(g)) ctx.memoVazio.set(g, !ctx.arvore.some((x) => casaInsumo(x.caminho, [g])));
    return ctx.memoVazio.get(g);
  };
  return globs.length && globs.every(vazio) ? globs.join(', ') : null;
}

/** O que mudou entre o commit do cache e o HEAD (memorizado por commit: várias etapas costumam ter o mesmo). */
function intervalo(ctx, commit) {
  if (ctx.memo.has(commit)) return ctx.memo.get(commit);
  let r;
  if (!/^[0-9a-f]{40}$/.test(String(commit || ''))) r = { erro: `commit do cache inválido (${curto(commit) || 'vazio'})` };
  else if (git(ctx.raiz, ['merge-base', '--is-ancestor', commit, 'HEAD']).exit !== 0) r = { erro: `commit do cache (${curto(commit)}) não é ancestral do HEAD (rebase ou prova adulterada)` };
  else {
    const merges = git(ctx.raiz, ['rev-list', '--merges', `${commit}..HEAD`]);
    // --no-renames: um arquivo movido para fora dos insumos aparece pelo caminho antigo também.
    const diff = git(ctx.raiz, ['diff', '--name-only', '--no-renames', '-z', commit, 'HEAD']);
    if (merges.exit !== 0 || diff.exit !== 0) r = { erro: 'git não conseguiu comparar o commit do cache com o HEAD' };
    else if (merges.out) r = { erro: `houve merge entre ${curto(commit)} e o HEAD: cache inteiro invalidado` };
    else r = { arquivos: diff.out.split('\0').filter(Boolean) };
  }
  ctx.memo.set(commit, r);
  return r;
}

/**
 * Decide uma etapa configurada: { acao: 'executar' | 'cache' | 'nao-coberta', motivo, cache? }.
 * Com --so-falhas, a etapa que passou e não foi invalidada pelo diff, mas não tem cache (sem insumos ou sem
 * execução anterior), vira 'nao-coberta': não roda e o gate não conta como completo.
 * Com --etapas (ctx.selecao), a etapa pedida roda; as demais só vêm do cache válido, senão viram 'nao-coberta'.
 */
export function decidirEtapa(etapa, comando, ctx) {
  if (!ctx?.ativo) return { acao: 'executar', motivo: ctx?.motivo || 'sem cache' };
  try {
    return decidirEtapaSemProtecao(etapa, comando, ctx);
  } catch (e) {
    // Erro no cache nunca derruba o gate: a etapa roda.
    return { acao: 'executar', motivo: `erro no cache: ${e.message} (a etapa roda)` };
  }
}

function decidirEtapaSemProtecao(etapa, comando, ctx) {
  if (ctx.selecao) {
    if (ctx.selecao.has(etapa.nome)) return { acao: 'executar', motivo: 'pedida no --etapas' };
    const d = decidirPeloCache(etapa, comando, ctx, false);
    if (d.acao === 'cache') return d;
    ctx.naoCobertas.add(etapa.nome);
    return { acao: 'nao-coberta', motivo: `${d.motivo} (fora do --etapas: não roda)` };
  }
  return decidirPeloCache(etapa, comando, ctx, ctx.soFalhas);
}

function decidirPeloCache(etapa, comando, ctx, soFalhas) {
  const anterior = ctx.dados.etapas[etapa.nome];
  const naoCoberta = (motivo) => {
    if (!soFalhas) return { acao: 'executar', motivo };
    ctx.naoCobertas.add(etapa.nome);
    return { acao: 'nao-coberta', motivo: `${motivo} (--so-falhas não roda)` };
  };
  const executar = (motivo) => ({ acao: 'executar', motivo });
  if (anterior && anterior.status !== 'ok') return executar(`falhou na execução anterior (iteração ${anterior.iteracao}, ${curto(anterior.commit)})`);
  // Falha registrada fora do cache: finding do gate aberto, ou falha num gate gravado (rótulo, verificação) mais nova.
  const aberto = ctx.falhas?.abertas.get(etapa.nome);
  if (aberto) return executar(`finding ${aberto} (gate:${etapa.nome}) aberto: a etapa roda até passar`);
  const ultimaFalha = ctx.falhas?.ultimas.get(etapa.nome);
  if (ultimaFalha && (!anterior || Date.parse(ultimaFalha.em) > Date.parse(anterior.em))) return executar(`falhou depois do cache (gate "${ultimaFalha.rotulo}" às ${horaLocal(ultimaFalha.em)})`);
  if (dependeDoHistorico(ctx.config, etapa)) return naoCoberta('depende do histórico ({base}..HEAD, segredos ou cacheavel: false): sempre roda');
  const { globs: insumos, erro } = insumosDaEtapa(ctx.config, etapa);
  if (erro) return naoCoberta(`${erro}: sempre roda`);
  if (!insumos.length) return naoCoberta('sem insumos declarados: sempre roda');
  const vazio = globSemArquivo(ctx, insumos);
  if (vazio) return naoCoberta(`insumos não casam nenhum arquivo: "${vazio}" (confira o glob): sempre roda`);
  if (!anterior) return naoCoberta('sem execução anterior no loop');
  if (anterior.comando !== comando) return executar('o comando da etapa mudou');
  if (JSON.stringify(anterior.insumos || []) !== JSON.stringify(insumos)) return executar('os insumos declarados mudaram');
  if (anterior.hashConfig !== ctx.hashConfig) return executar('config.json mudou: cache inteiro invalidado');
  if (anterior.hashLockfiles !== ctx.hashLockfiles) return executar('lockfile mudou: cache inteiro invalidado');
  if (anterior.hashGlobais !== ctx.hashGlobais) return executar('insumo global mudou: cache inteiro invalidado');
  if ((anterior.ajuste || null) !== ctx.ajuste) return executar('cache de outro ajuste: invalidado');
  const iv = intervalo(ctx, anterior.commit);
  if (iv.erro) return executar(iv.erro);
  if ((anterior.mergeBase || null) !== ctx.mergeBase) return executar('a base mudou (merge-base diferente): cache inteiro invalidado');
  const global = iv.arquivos.find((f) => f === ARQUIVO_CONFIG || ehLockfile(ctx.config, f) || (ctx.globais.length && casaInsumo(f, ctx.globais)));
  if (global) return executar(`insumo global mudou: ${global}`);
  const mudou = iv.arquivos.find((f) => casaInsumo(f, insumos));
  if (mudou) return executar(`insumo mudou: ${mudou}`);
  if (hashDe(ctx.arvore, (f) => casaInsumo(f, insumos)) !== anterior.hashInsumos) return executar('a impressão digital dos insumos não confere (prova adulterada?)');
  if (hashIgnorados(ctx, insumos) !== anterior.hashIgnorados) return executar('arquivo ignorado pelo git que casa os insumos mudou');
  return {
    acao: 'cache',
    motivo: `insumos sem mudança desde a iteração ${anterior.iteracao} (${curto(anterior.commit)})`,
    cache: { iteracao: anterior.iteracao, tentativa: anterior.tentativa, commit: anterior.commit, em: anterior.em, rotulo: anterior.rotulo, duracaoMs: anterior.duracaoMs || 0, log: anterior.log || null },
  };
}

/** Etapa do resultado do gate que veio do cache (não rodou agora). */
export function etapaDoCache(etapa, comando, decisao) {
  return { nome: etapa.nome, comando, obrigatoria: !!etapa.obrigatoria, status: 'ok', exit: 0, duracaoMs: 0, log: decisao.cache.log, origem: 'cache', motivo: decisao.motivo, cache: decisao.cache };
}

/** Etapa que o --so-falhas não cobriu (contrato 0.6.0: status nao-executada, sem origem): o gate não conta como completo. */
export function etapaNaoCoberta(etapa, comando, decisao) {
  return { nome: etapa.nome, comando, obrigatoria: !!etapa.obrigatoria, status: 'nao-executada', exit: null, duracaoMs: 0, log: null, motivo: decisao.motivo };
}

// --------------------------------------------------------------------------- registro (sob o lock)

/**
 * Grava no cache cada etapa executada agora (ok ou falha) e soma a economia das que vieram do cache.
 * Chamar sob comLock (aplicarGate), com o estado relido. Não grava se o HEAD mudou durante o gate.
 */
export function registrarExecucoes(raiz, estado, r) {
  const ctx = r._ctxCache;
  const etapas = r._etapasCompletas || r.etapas || [];
  const doCache = etapas.filter((e) => e.origem === 'cache');
  const economiaMs = doCache.reduce((t, e) => t + (e.cache?.duracaoMs || 0), 0);
  if (!ctx?.gravar) return { gravadas: [], economiaMs };
  if (r.invalido || gitHead(raiz) !== ctx.head) return { gravadas: [], economiaMs: 0, aviso: 'o HEAD mudou durante o gate: nada foi gravado no cache' };
  if (r.arvoreMudou || !gitLimpo(raiz).limpo) return { gravadas: [], economiaMs: 0, aviso: 'arquivos mudaram durante o gate: nada foi gravado no cache' };
  const dados = lerCache(raiz, estado.id);
  const gravadas = [];
  const porNome = new Map((ctx.config.gate?.etapas || []).map((e) => [e.nome, e]));
  for (const e of etapas) {
    // Etapa lida do CI não entra no cache local: o resultado é do run, não desta máquina.
    if (e.origem === 'cache' || e.origem === 'ci' || !['ok', 'falhou', 'timeout'].includes(e.status)) continue;
    const insumos = insumosDa(ctx.config, porNome.get(e.nome));
    dados.etapas[e.nome] = {
      status: e.status,
      commit: ctx.head,
      iteracao: ctx.iteracao,
      tentativa: ctx.tentativa,
      rotulo: r.rotulo,
      em: r.em || agoraISO(),
      duracaoMs: e.duracaoMs || 0,
      comando: e.comando,
      insumos,
      hashInsumos: hashDe(ctx.arvore, (f) => insumos.length > 0 && casaInsumo(f, insumos)),
      hashIgnorados: hashIgnorados(ctx, insumos),
      hashConfig: ctx.hashConfig,
      hashLockfiles: ctx.hashLockfiles,
      hashGlobais: ctx.hashGlobais,
      mergeBase: ctx.mergeBase,
      ajuste: ctx.ajuste,
      log: e.log || null,
      ...(e.porCarga ? { porCarga: true, motivoCarga: e.motivoCarga || null } : {}),
    };
    gravadas.push(e.nome);
  }
  if (doCache.length) {
    dados.economia.push({ rotulo: r.rotulo, iteracao: ctx.iteracao, em: r.em || agoraISO(), etapas: doCache.map((e) => e.nome), ms: economiaMs });
    const eg = estado.economiaGate || { gates: 0, etapasDoCache: 0, ms: 0 };
    estado.economiaGate = { gates: eg.gates + 1, etapasDoCache: eg.etapasDoCache + doCache.length, ms: eg.ms + economiaMs };
  }
  gravarJSON(caminhoCache(raiz, estado.id), dados);
  return { gravadas, economiaMs };
}

/** Resumo para o manifest e o report.md. */
export function resumoEconomia(raiz, estado) {
  const { economia } = lerCache(raiz, estado.id);
  const porIteracao = new Map();
  for (const x of economia) {
    const p = porIteracao.get(x.iteracao) || { iteracao: x.iteracao, gates: 0, etapas: 0, ms: 0 };
    p.gates += 1;
    p.etapas += x.etapas.length;
    p.ms += x.ms || 0;
    porIteracao.set(x.iteracao, p);
  }
  return {
    etapasReaproveitadas: economia.reduce((t, x) => t + x.etapas.length, 0),
    tempoEconomizadoMs: economia.reduce((t, x) => t + (x.ms || 0), 0),
    porIteracao: [...porIteracao.values()].sort((a, b) => a.iteracao - b.iteracao),
  };
}

// --------------------------------------------------------------------------- pendências (wf proximo / wf status)

function horaLocal(iso) {
  const d = new Date(iso || '');
  if (Number.isNaN(d.getTime())) return '?';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function situacaoDa(etapa, decisao, ctx, doUltimo) {
  const anterior = ctx.dados.etapas[etapa.nome];
  if (anterior && anterior.status !== 'ok') {
    const como = anterior.status === 'timeout' ? 'deu timeout' : `falhou${anterior.porCarga ? ' (por carga)' : ''}`;
    return { situacao: 'falhou', motivo: `${como} às ${horaLocal(anterior.em)} (iteração ${anterior.iteracao}, ${curto(anterior.commit)})` };
  }
  const mudou = /^insumo mudou: (.+)$/.exec(decisao.motivo || '');
  if (mudou) {
    const lg = git(ctx.raiz, ['log', '-1', '--format=%h', `${anterior.commit}..HEAD`, '--', mudou[1]]);
    return { situacao: 'invalidada', motivo: `insumos mudaram em ${lg.exit === 0 && lg.out ? lg.out : 'HEAD'} (${mudou[1]})` };
  }
  const { globs, erro } = insumosDaEtapa(ctx.config, etapa);
  if (erro || !globs.length) return { situacao: 'sem-cache', motivo: `${erro || 'sem insumos declarados'}: roda em todo gate` };
  if (!anterior) {
    const u = doUltimo.get(etapa.nome);
    if (u?.status === PULADA) return { situacao: 'pulada', motivo: `${textoPulada(u)} no último gate` };
    if (u?.status === CI_INDISPONIVEL) return { situacao: 'ci-indisponivel', motivo: `CI indisponível no último gate${u.motivo ? ` (${u.motivo})` : ''}` };
    if (u && (u.status === 'nao-executada' || u.status === 'sem-vaga')) return { situacao: 'nao-executada', motivo: `${u.status === 'sem-vaga' ? 'sem vaga' : 'não executada'} no último gate${u.motivo ? ` (${u.motivo})` : ''}` };
    return { situacao: 'pendente', motivo: 'ainda não rodou no loop' };
  }
  return { situacao: 'invalidada', motivo: decisao.motivo };
}

/**
 * O que falta para o gate da iteração ficar verde, por etapa obrigatória e com o porquê. Só lê (git, o
 * gate-cache.json e o último gate.json); vazio fora do loop, depois da triagem ou com o gate da iteração verde
 * no HEAD atual (verde num commit anterior não vale: o código mudou depois).
 * Devolve { pendencias: [{ etapa, situacao, motivo, obrigatoria }], cacheAtivo, cobreResto, sugestao, motivoSemCache }:
 * com o cache cobrindo o resto, `sugestao` é "wf gate --etapas <pendentes>" (fecha a iteração); senão "wf gate".
 */
export function pendenciasDoGate(raiz, estado, config) {
  try {
    return pendenciasSemProtecao(raiz, estado, config);
  } catch (e) {
    // "wf status" e "wf proximo" nunca caem por causa do cache.
    return { pendencias: [], cacheAtivo: false, cobreResto: false, sugestao: 'wf gate', motivoSemCache: `erro no cache: ${e.message}` };
  }
}

function pendenciasSemProtecao(raiz, estado, config) {
  const vazio = { pendencias: [], cacheAtivo: false, cobreResto: false, sugestao: null, motivoSemCache: null };
  const it = (estado.iteracoes || [])[(estado.iteracoes || []).length - 1];
  if (estado.fase !== 'loop' || !it || it.triagem) return vazio;
  if (it.gate === 'ok' && (it.commitGate || it.commitGateRodado) === gitHead(raiz)) return vazio;
  const etapas = (config.gate?.etapas || []).filter((e) => e.obrigatoria && resolverComando(config, e.comando));
  if (!etapas.length) return vazio;
  const ultimo = estado.ultimoGate?.arquivo ? lerJSON(path.join(raiz, estado.ultimoGate.arquivo), null) : null;
  const doUltimo = new Map((ultimo?.etapas || []).map((e) => [e.nome, e]));
  const ctx = prepararCache(raiz, estado, config);
  if (!ctx.ativo) {
    // Sem cache (árvore suja, cache desligado): o próximo gate roda tudo; mostra o que o último gate deixou.
    const pendencias = etapas
      .map((e) => doUltimo.get(e.nome))
      .filter((u) => u && !['ok', 'nao-configurado'].includes(u.status))
      .map((u) => (u.status === PULADA ? { etapa: u.nome, obrigatoria: true, situacao: 'pulada', motivo: `${textoPulada(u)} no último gate` } : u.status === CI_INDISPONIVEL ? { etapa: u.nome, obrigatoria: true, situacao: 'ci-indisponivel', motivo: `CI indisponível no último gate${u.motivo ? ` (${u.motivo})` : ''}` } : {
        etapa: u.nome,
        obrigatoria: true,
        situacao: ['nao-executada', 'sem-vaga'].includes(u.status) ? 'nao-executada' : 'falhou',
        motivo: ['nao-executada', 'sem-vaga'].includes(u.status) ? `${u.status === 'sem-vaga' ? 'sem vaga' : 'não executada'} no último gate${u.motivo ? ` (${u.motivo})` : ''}` : `${u.status === 'timeout' ? 'deu timeout' : `falhou${u.porCarga ? ' (por carga)' : ''}`} às ${horaLocal(ultimo?.em)}`,
      }));
    return { ...vazio, pendencias, sugestao: 'wf gate', motivoSemCache: ctx.motivo };
  }
  const base = refBase(raiz, baseDaTask(estado, config));
  const pendencias = [];
  let cobertas = 0;
  for (const e of etapas) {
    const comando = resolverComando(config, e.comando).replaceAll('{base}', base);
    const d = decidirPeloCache(e, comando, ctx, false);
    if (d.acao === 'cache') cobertas += 1;
    else pendencias.push({ etapa: e.nome, obrigatoria: true, ...situacaoDa(e, d, ctx, doUltimo) });
  }
  const cobreResto = cobertas > 0 && pendencias.length > 0;
  return { pendencias, cacheAtivo: true, cobreResto, sugestao: cobreResto ? `wf gate --etapas ${pendencias.map((p) => p.etapa).join(',')}` : 'wf gate', motivoSemCache: null };
}

/** "teste-e2e — falhou (por carga) às 18:10; typecheck — insumos mudaram em abc1234 (apps/a/x.ts)". */
export function textoPendencias(pendencias) {
  return (pendencias || []).map((p) => `${p.etapa} — ${p.motivo}`).join('; ');
}

// --------------------------------------------------------------------------- transparência

export function duracaoLegivel(ms) {
  const s = Math.round((ms || 0) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}min`;
}

/** Tabela "etapa | rodou ou cache | duração | motivo" (markdown). */
export function tabelaGate(etapas) {
  const linhas = ['| etapa | rodou ou cache | duração | motivo |', '| --- | --- | --- | --- |'];
  for (const e of etapas || []) {
    let como;
    let duracao = duracaoLegivel(e.duracaoMs);
    if (e.origem === 'cache') {
      como = `ok (cache, iteração ${e.cache?.iteracao}, ${curto(e.cache?.commit)})`;
      duracao = `0s (economizou ${duracaoLegivel(e.cache?.duracaoMs)})`;
    } else if (e.status === 'nao-configurado') {
      como = 'não configurada';
      duracao = '—';
    } else if (e.status === 'nao-executada' || e.status === 'sem-vaga') {
      como = e.status === 'sem-vaga' ? 'sem vaga' : 'não executada';
      duracao = '—';
    } else if (e.status === PULADA) {
      como = textoPulada(e);
      duracao = '—';
    } else if (e.status === CI_INDISPONIVEL) {
      como = `CI indisponível${e.classe ? ` (${e.classe})` : ''}`;
      duracao = '—';
    } else if (e.origem === 'ci') {
      como = `${e.status} (CI${e.ci?.runNumero != null ? `, run #${e.ci.runNumero}` : ''}${e.ci?.sha ? `, ${curto(e.ci.sha)}` : ''})`;
    } else como = `rodou (${e.status})`;
    linhas.push(`| ${e.nome} | ${como} | ${duracao} | ${String(e.motivo || '').replaceAll('|', '/')} |`);
  }
  return linhas.join('\n');
}

// --------------------------------------------------------------------------- doctor

/** Problemas do config do cache (insumos, sub-etapas, globais). Lista vazia = ok. */
export function problemasConfigCache(config) {
  const g = config.gate || {};
  const problemas = [];
  if ('cacheEntreIteracoes' in g && typeof g.cacheEntreIteracoes !== 'boolean') problemas.push('gate.cacheEntreIteracoes deve ser true ou false');
  if ('insumosGlobais' in g && !(Array.isArray(g.insumosGlobais) && (g.insumosGlobais.length === 0 || ehLista(g.insumosGlobais)))) problemas.push('gate.insumosGlobais deve ser uma lista de globs');
  if ('insumosPadrao' in g && !(g.insumosPadrao && typeof g.insumosPadrao === 'object' && !Array.isArray(g.insumosPadrao) && Object.values(g.insumosPadrao).every((v) => Array.isArray(v) && (v.length === 0 || ehLista(v))))) {
    problemas.push('gate.insumosPadrao deve ser um mapa grupo → lista de globs (ex.: {"teste-e2e": ["apps/{app}/**"]})');
  }
  const nomes = (g.etapas || []).map((e) => e.nome);
  for (const e of g.etapas || []) {
    if ('insumos' in e && !(Array.isArray(e.insumos) && (e.insumos.length === 0 || ehLista(e.insumos)))) problemas.push(`etapa "${e.nome}": insumos deve ser uma lista de globs`);
    else if (!String(e.nome || '').includes(':') && ehLista(e.insumos) && e.insumos.some((x) => x.includes('{app}'))) problemas.push(`etapa "${e.nome}": "{app}" nos insumos só vale em sub-etapa (prefixo:sufixo); sem sufixo a etapa sempre roda`);
    if (!/^[a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)?$/i.test(String(e.nome || ''))) problemas.push(`etapa "${e.nome}": nome inválido (use letras, números, ponto, hífen e no máximo um ":" para sub-etapa)`);
    if ('cacheavel' in e && typeof e.cacheavel !== 'boolean') problemas.push(`etapa "${e.nome}": cacheavel deve ser true ou false`);
  }
  const repetidos = nomes.filter((n, i) => nomes.indexOf(n) !== i);
  if (repetidos.length) problemas.push(`etapas com nome repetido: ${[...new Set(repetidos)].join(', ')}`);
  // Globs que não viram expressão (chave sem fechar etc.): antes travavam o gate; agora não casam nada, então acusa.
  const todos = [
    ...(ehLista(g.insumosGlobais) ? g.insumosGlobais.map((x) => ['gate.insumosGlobais', x]) : []),
    ...Object.entries(g.insumosPadrao && typeof g.insumosPadrao === 'object' ? g.insumosPadrao : {}).flatMap(([k, v]) => (ehLista(v) ? v.map((x) => [`gate.insumosPadrao.${k}`, x]) : [])),
    ...(g.etapas || []).flatMap((e) => (ehLista(e.insumos) ? e.insumos.map((x) => [`etapa "${e.nome}"`, x]) : [])),
  ];
  for (const [onde, glob] of todos) {
    const erro = validarGlob(glob);
    if (erro) problemas.push(`${onde}: ${erro}`);
  }
  return problemas;
}

/**
 * Avisos do cache que dependem do repositório (não reprovam o doctor): glob dos insumos que não casa nenhum arquivo
 * versionado (a etapa vai rodar sempre) e insumo que casa caminho ignorado pelo git (diretório ignorado inteiro não
 * entra na impressão digital; arquivo ignorado solto entra).
 */
export function avisosConfigCache(raiz, config) {
  const avisos = [];
  const r = git(raiz, ['ls-files', '-z']);
  if (r.exit !== 0) return avisos;
  const versionados = r.out.split('\0').filter(Boolean);
  const ignorados = listarIgnorados(raiz);
  for (const e of config.gate?.etapas || []) {
    const { globs } = insumosDaEtapa(config, e);
    for (const g of globs) {
      if (validarGlob(g)) continue;
      if (!versionados.some((f) => casaInsumo(f, [g]))) avisos.push(`etapa "${e.nome}": o insumo "${g}" não casa nenhum arquivo versionado (a etapa sempre roda; confira o glob)`);
      const dirIgnorado = ignorados.find((f) => f.endsWith('/') && (casaInsumo(f.slice(0, -1), [g]) || casaInsumo(`${f}x`, [g])));
      if (dirIgnorado) avisos.push(`etapa "${e.nome}": o insumo "${g}" alcança o diretório ignorado "${dirIgnorado}", que não entra na impressão digital do cache (mudanças nele não invalidam; ponha o que importa em gate.insumosGlobais ou use cacheavel: false)`);
    }
  }
  return avisos;
}

export function etapasSemInsumos(config) {
  return (config.gate?.etapas || []).filter((e) => !insumosDa(config, e).length).map((e) => e.nome);
}
