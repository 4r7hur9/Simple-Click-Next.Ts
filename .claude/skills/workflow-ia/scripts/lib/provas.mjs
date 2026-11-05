// Geração de provas determinísticas: gate, RED (TDD), baseline e diff de testes,
// matriz de rastreabilidade critério -> teste.

import fs from 'node:fs';
import path from 'node:path';
import {
  caminhos,
  gravarJSON,
  lerJSON,
  existe,
  agoraISO,
  resolverComando,
  gitHead,
  gitLimpo,
  gitArquivosRastreados,
  casaAlgum,
  git,
  refBase,
  sha256,
  comLock,
  baseDaTask,
  conferirBase,
  estadoRastreados,
} from './core.mjs';
import { executarEtapas, shAsync, aspasShell, PULADA, CI_INDISPONIVEL, resumoPuladas } from './gate.mjs';
import { planoCI, conferirPreVoo, criarContextoCI, NOME_TESTE_CI } from './ci.mjs';
import { vagasAtivas, criarReservaVaga } from './vagas.mjs';
import { sincronizarGate } from './findings.mjs';
import { registrarExecucoes, tabelaGate, grupoDaEtapa } from './gate-cache.mjs';
import { ajusteEmAndamento, ajusteComMudanca, caminhoRedAjuste, exigeRedAjuste } from './ajustes.mjs';

// ---------------------------------------------------------------------------
// Gate determinístico
// ---------------------------------------------------------------------------

// Resultados que valem como "resultado da etapa neste commit" para o dependeDe: execução real (ok, inclusive do cache,
// falhou, timeout), sem vaga e pulada por dependência (com a causa raiz). nao-executada e nao-configurado não contam.
// Literal, não PULADA: gate.mjs e provas.mjs se importam, e uma constante de topo leria PULADA antes de existir.
const RESULTADOS_DE_COMMIT = ['ok', 'falhou', 'timeout', 'sem-vaga', 'pulada-por-dependencia'];
const MAX_COMMITS_HISTORICO = 30;

/** Histórico por commit dos resultados das etapas (evidencias/gate-resultados.json; só a CLI grava, sob o lock). */
export function caminhoResultadosPorCommit(dirEvidencias) {
  return path.join(dirEvidencias, 'gate-resultados.json');
}

const resultadoDeCommit = (e, g) => ({ status: e.status, rotulo: g.rotulo, em: g.em, ...(e.causaRaiz ? { causaRaiz: e.causaRaiz } : {}) });
// Gate que não vale como resultado de um commit: HEAD mudou, arquivos mudaram durante ele ou árvore suja.
const gateValeParaCommit = (g) => g && g.commit && !g.invalido && !g.arvoreMudou && g.limpo !== false && Array.isArray(g.etapas);

/**
 * Acrescenta ao histórico por commit as etapas deste gate com resultado (RESULTADOS_DE_COMMIT). Um "wf gate --etapas"
 * sem rótulo regrava o iter-N/gate.json com a dependência "nao-executada"; o histórico guarda o resultado real dela.
 * Chamar sob o lock (aplicarGate). O mais novo vence; ficam os MAX_COMMITS_HISTORICO commits mais recentes.
 */
export function registrarResultadosPorCommit(dirEvidencias, g) {
  if (!gateValeParaCommit(g)) return;
  const arq = caminhoResultadosPorCommit(dirEvidencias);
  const dados = lerJSON(arq, null);
  const commits = dados && dados.versao === 1 && dados.commits && typeof dados.commits === 'object' ? dados.commits : {};
  const doCommit = commits[g.commit] && typeof commits[g.commit] === 'object' ? commits[g.commit] : {};
  for (const e of g.etapas) {
    if (!RESULTADOS_DE_COMMIT.includes(e?.status)) continue;
    const atual = doCommit[e.nome];
    if (!atual || !(Date.parse(atual.em) > Date.parse(g.em))) doCommit[e.nome] = resultadoDeCommit(e, g);
  }
  commits[g.commit] = { ...doCommit, _em: g.em };
  const manter = Object.entries(commits)
    .sort((a, b) => (Date.parse(b[1]?._em) || 0) - (Date.parse(a[1]?._em) || 0))
    .slice(0, MAX_COMMITS_HISTORICO);
  gravarJSON(arq, { versao: 1, commits: Object.fromEntries(manter) });
}

/**
 * Último resultado de uma etapa no commit dado (dependeDe fora desta execução, ex.: "wf gate --etapas"): o mais novo
 * entre o histórico por commit (gate-resultados.json) e os gate.json gravados da task, sem gate inválido, com árvore
 * mudada ou suja. Devolve { status, rotulo, em, causaRaiz? } ou null.
 */
export function ultimoResultadoNoCommit(dirEvidencias, commit, nome) {
  if (!commit) return null;
  const candidatos = [];
  const hist = lerJSON(caminhoResultadosPorCommit(dirEvidencias), null);
  const h = hist?.versao === 1 ? hist.commits?.[commit]?.[nome] : null;
  if (h && RESULTADOS_DE_COMMIT.includes(h.status)) candidatos.push(h);
  let pastas = [];
  try {
    pastas = fs.readdirSync(dirEvidencias, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    pastas = [];
  }
  for (const pasta of pastas) {
    const g = lerJSON(path.join(dirEvidencias, pasta, 'gate.json'), null);
    if (!gateValeParaCommit(g) || g.commit !== commit) continue;
    const e = g.etapas.find((x) => x?.nome === nome);
    if (e && RESULTADOS_DE_COMMIT.includes(e.status)) candidatos.push(resultadoDeCommit(e, { ...g, rotulo: g.rotulo || pasta }));
  }
  return candidatos.reduce((m, x) => (!m || Date.parse(x.em) > Date.parse(m.em) ? x : m), null);
}

/**
 * Roda as etapas do gate (laço em gate.mjs) e grava evidencias/<rotulo>/gate.json.
 * completo: verificação final — todas as etapas, sem falhar rápido e sem o gancho decidirEtapa (cache).
 * decidirEtapa(etapa, ctx): gancho do gate incremental; ver executarEtapas.
 */
export async function rodarGate(raiz, estado, config, { rotulo, somente, exigirLimpo = false, completo = false, decidirEtapa } = {}) {
  const c = caminhos(raiz, estado.id);
  const nome = rotulo || `iter-${estado.iteracao || 0}`;
  const dirEv = path.join(c.evidencias, nome);
  fs.mkdirSync(dirEv, { recursive: true });

  const limpeza = gitLimpo(raiz);
  if (exigirLimpo && !limpeza.limpo) {
    return {
      ok: false,
      rotulo: nome,
      mensagem: 'Há alterações não commitadas. Faça commit antes de gerar provas reproduzíveis.',
      sujos: limpeza.sujos,
      etapas: [],
    };
  }

  // A base entra nos comandos ({base}) e no diff: nome seguro e, quando há motivo, sem conter o HEAD.
  const cb = conferirBase(raiz, estado, config);
  if (!cb.ok) return { ok: false, rotulo: nome, codigo: cb.codigo, mensagem: cb.mensagem, etapas: [] };
  const base = cb.ref;
  // Modo CI (0.7.0): vale só nas fases de ci.fases (ou forçado por WF_GATE_CI=1); desligado, nada daqui acontece.
  const plano = planoCI(config, estado);
  if (plano.erro) return { ok: false, rotulo: nome, codigo: plano.erro.codigo, mensagem: plano.erro.mensagem, etapas: [], ci: { modo: plano.modo } };
  let ctxCI = null;
  if (plano.ativo) {
    // Pré-voo (CI-ESTADO): árvore, branch e remoto; com problema, nada roda (nem as etapas locais).
    const pv = conferirPreVoo(raiz, estado, config, { base });
    if (!pv.ok) return { ok: false, rotulo: nome, codigo: pv.codigo, mensagem: pv.mensagem, checks: pv.checks, etapas: [], ci: { modo: plano.modo, provedor: config.ci.provedor, workflow: config.ci.workflow } };
    ctxCI = criarContextoCI({ raiz, estado, config, base, dirEv, rotulo: nome, plano, avisos: pv.avisos || [] });
  }
  const lista = config.gate.etapas
    .filter((e) => !somente || somente.includes(e.nome))
    .map((e) => {
      const bruto = resolverComando(config, e.comando);
      // Etapa lida do CI: ci:true e dependência da teste-ci (sem run, fica pulada-por-dependencia). Sem comando
      // continua nao-configurado, como local.
      const daCI = !!ctxCI && !!bruto && plano.etapasCI.has(grupoDaEtapa(e.nome));
      return { ...e, obrigatoria: !!e.obrigatoria, comandoBruto: bruto, comando: bruto.replaceAll('{base}', base), ...(daCI ? { ci: true, dependeDe: [...(Array.isArray(e.dependeDe) ? e.dependeDe : []), NOME_TESTE_CI] } : {}) };
    });
  // A teste-ci só entra quando alguma etapa desta execução é lida do CI (um --etapas só com locais não vai ao CI).
  const comCI = lista.some((e) => e.ci === true);
  if (comCI) lista.unshift(ctxCI.etapa);
  const reserva = vagasAtivas(config) ? criarReservaVaga(config, { task: estado.id, raiz }) : null;
  // O commit testado é o do INÍCIO: um commit feito durante o gate (em 2º plano) não herda o resultado.
  const headInicio = gitHead(raiz);
  const rastreadosInicio = estadoRastreados(raiz);
  let etapas;
  try {
    etapas = await executarEtapas(lista, {
      raiz,
      dirEv,
      env: { WF_BASE: base, WF_TASK: estado.id },
      completo,
      falharRapido: !!config.gate.falharRapido,
      paralelismo: config.gate.paralelismo,
      repetirPorCarga: config.gate.repetirPorCarga,
      timeoutPadrao: config.gate.timeoutSegundos,
      // A teste-ci nunca vem do cache nem fica fora da seleção: quando entra, roda.
      decidirEtapa: comCI && typeof decidirEtapa === 'function' ? (e, c) => (e.nome === NOME_TESTE_CI ? { acao: 'executar', motivo: `modo CI (${plano.modo}): dispara o workflow` } : decidirEtapa(e, c)) : decidirEtapa,
      ctxDecisao: { raiz, estado, config, rotulo: nome, base },
      // Etapas ci:true são lidas do run pela teste-ci (origem 'ci'), sem vaga e sem executar.
      resolverExterna: comCI ? (e, porNome) => ctxCI.resolver(e, porNome) : undefined,
      // dependeDe: dependência fora desta execução vale pelo último resultado no mesmo commit (nunca na verificação).
      todasEtapas: [...(comCI ? [NOME_TESTE_CI] : []), ...config.gate.etapas.map((e) => e.nome)],
      resultadoAnterior: completo ? undefined : (etapa) => ultimoResultadoNoCommit(c.evidencias, headInicio, etapa),
      pegarVaga: reserva ? () => reserva.pegar() : undefined,
      registrarGrupo: reserva ? (pg) => reserva.registrarGrupo(pg) : undefined,
      removerGrupo: reserva ? (pg) => reserva.removerGrupo(pg) : undefined,
    });
  } finally {
    // A vaga fica com a task do começo ao fim do gate (não perde a vez entre etapas) e sai junto com ele.
    if (reserva) reserva.soltar();
  }

  const naoRodou = ['ok', 'nao-configurado', 'nao-executada'];
  // Pulada por dependência nunca aprova: conta no veredito, mas sai de "falhas" (a causa raiz é a dependência).
  const falhasObrigatorias = etapas.filter((e) => e.obrigatoria && !naoRodou.includes(e.status));
  // CI indisponível também reprova (nada foi provado), mas não é falha do código: sai de "falhas" e vira ciIndisponivel.
  const falhasReais = falhasObrigatorias.filter((e) => e.status !== PULADA && e.status !== CI_INDISPONIVEL);
  const puladas = etapas.filter((e) => e.status === PULADA);
  const tc = comCI ? etapas.find((e) => e.nome === NOME_TESTE_CI) : null;
  const ciIndisponivel = tc?.status === CI_INDISPONIVEL ? tc.motivo : null;
  const obrigatoriasNaoConfiguradas = etapas.filter((e) => e.obrigatoria && e.status === 'nao-configurado');
  const headFim = gitHead(raiz);
  const invalido = headFim !== headInicio ? `o HEAD mudou durante o gate (${String(headInicio || '').slice(0, 7)} → ${String(headFim || '').slice(0, 7)}): o resultado não vale para nenhum dos dois commits. Rode o gate de novo sem commitar enquanto ele roda.` : null;
  // Arquivo versionado editado durante o gate: o resultado não corresponde ao commit (sem cache e sem commitGate).
  const arvoreMudou = !invalido && estadoRastreados(raiz) !== rastreadosInicio;
  const resultado = {
    ok: falhasObrigatorias.length === 0 && !invalido,
    rotulo: nome,
    commit: headInicio,
    limpo: limpeza.limpo && !arvoreMudou,
    ...(invalido ? { invalido } : {}),
    ...(arvoreMudou ? { arvoreMudou: true } : {}),
    em: agoraISO(),
    base,
    completo: !!completo,
    falharRapido: !!config.gate.falharRapido && !completo,
    etapas: etapas.map(({ resumoFalha, comandoBruto, ...resto }) => resto),
    falhas: falhasReais.map((e) => e.nome),
    ...(puladas.length ? { puladas: puladas.map((e) => e.nome), resumoPuladas: resumoPuladas(puladas) } : {}),
    // Só com o CI valendo (ou forçado, ou no fallback): um config sem CI não ganha campo novo.
    ...(plano.modo !== 'local' ? { ci: resumoCI(plano, config, tc, ctxCI, etapas) } : {}),
    ...(ciIndisponivel ? { ciIndisponivel } : {}),
    naoConfiguradas: obrigatoriasNaoConfiguradas.map((e) => e.nome),
    naoExecutadas: etapas.filter((e) => e.status === 'nao-executada').map((e) => e.nome),
  };
  gravarJSON(path.join(dirEv, 'gate.json'), resultado);
  // O gate pode levar minutos: quem chama aplica o resultado ao estado e aos
  // findings depois, sob o lock (aplicarGate), relendo o estado atual.
  return { ...resultado, arquivo: path.relative(raiz, path.join(dirEv, 'gate.json')), _etapasCompletas: etapas, falhasDetalhe: falhasReais.map((e) => ({ nome: e.nome, log: e.log, trecho: e.resumoFalha })) };
}

/** Bloco `ci` do gate.json: modo, provedor, run (id, url, sha) e as etapas lidas do CI. */
function resumoCI(plano, config, tc, ctxCI, etapas) {
  const r = { modo: plano.modo, provedor: config.ci?.provedor || null, workflow: config.ci?.workflow || null };
  if (plano.modo === 'fallback-local') return { ...r, motivo: plano.motivo };
  const info = tc?.ci || {};
  return {
    ...r,
    etapasDoCI: etapas.filter((e) => e.origem === 'ci' && e.nome !== NOME_TESTE_CI).map((e) => e.nome),
    // run.sha é o headSha que o provedor devolveu; shaLocal é o HEAD no início do gate. A prova exige os dois iguais ao HEAD.
    run: info.runId != null || info.url ? { id: info.runId ?? null, numero: info.runNumero ?? null, url: info.url || null, sha: info.headSha || null, shaLocal: info.sha || null, conclusao: info.conclusao || null, ...(info.tentativa ? { tentativa: info.tentativa } : {}) } : null,
    // 0.8.0: como a prova foi obtida (disparado | reaproveitado | anexado | rerun-falhas) e todos os runs usados.
    ...(info.origemRun ? { origemRun: info.origemRun, runs: info.runs || [] } : {}),
    // 0.9.0: critério "conteudo" e as provas por conteúdo (app, run, sha, hashes) dos runs de outro commit usados.
    ...(info.criterio === 'conteudo' ? { criterio: 'conteudo', conteudo: info.conteudo || [] } : {}),
    apps: info.apps || [],
    arquivo: ctxCI?.arquivo || null,
    ...(tc?.classe ? { classe: tc.classe } : {}),
  };
}

/** Aplica o resultado de rodarGate ao estado e aos findings (chamar sob comLock, com estado relido). */
export function aplicarGate(raiz, estado, config, r) {
  if (!r._etapasCompletas) return r;
  // HEAD mudou durante o gate: o resultado não vale para nenhum commit; não mexe em findings nem no cache.
  const mudancas = r.invalido ? { abertos: [], verificados: [] } : sincronizarGate(raiz, estado, config, r._etapasCompletas);
  // dependeDe: o resultado de cada etapa neste commit sobrevive a um "wf gate --etapas" que regrave o mesmo gate.json.
  if (!r.invalido) {
    try {
      registrarResultadosPorCommit(caminhos(raiz, estado.id).evidencias, r);
    } catch {
      /* melhor esforço: sem o histórico, vale a varredura dos gate.json */
    }
  }
  const semVaga = (r.etapas || []).filter((e) => e.status === 'sem-vaga').map((e) => e.nome);
  estado.ultimoGate = { rotulo: r.rotulo, ok: r.ok, commit: r.commit, limpo: r.limpo, em: r.em, arquivo: r.arquivo, ...(r.invalido ? { invalido: true } : {}), ...(semVaga.length ? { semVaga } : {}), ...(r.resumoPuladas ? { puladas: r.resumoPuladas } : {}), ...(r.ciIndisponivel ? { ciIndisponivel: r.ciIndisponivel } : {}), ...(r.ci ? { ci: { modo: r.ci.modo, ...(r.ci.run ? { runUrl: r.ci.run.url, sha: r.ci.run.sha } : {}) } } : {}) };
  // Gate incremental: grava no cache as etapas executadas agora e soma a economia das que vieram dele.
  let cache;
  try {
    cache = registrarExecucoes(raiz, estado, r);
  } catch (e) {
    cache = { gravadas: [], economiaMs: 0, aviso: `erro ao gravar o cache: ${e.message} (o gate vale; o cache não foi atualizado)` };
  }
  const tabela = tabelaGate(r.etapas);
  if (r.arquivo) fs.writeFileSync(path.join(raiz, path.dirname(r.arquivo), 'gate.md'), `# Gate ${r.rotulo} (${String(r.commit || '').slice(0, 7)})\n\n${tabela}\n`);
  const { _etapasCompletas, _ctxCache, ...resto } = r;
  return { ...resto, tabela, economiaMs: cache.economiaMs, ...(cache.aviso ? { avisoCache: cache.aviso } : {}), findings: mudancas };
}

// ---------------------------------------------------------------------------
// Testes: análise estática de arquivos de teste
// ---------------------------------------------------------------------------

const RX_ASSERT = /\bexpect\s*\(|\bexpect\.\w+\s*\(|\bassert(?:\.\w+)?\s*\(|\.should\b|\bt\.(?:is|not|deepEqual|notDeepEqual|true|false|truthy|falsy|throws|throwsAsync|regex|snapshot|assert)\s*\(|\bself\.assert\w*\s*\(|^\s*assert\s/gm;
// skip/only/todo em todas as formas comuns (jest, vitest, mocha, node:test, pytest)
const RX_SKIP = new RegExp(
  [
    String.raw`\b(?:it|test|describe|suite|context|bench)(?:\.(?:concurrent|sequential|each|for))*\.(?:skip|todo|only|skipIf|runIf|fails)\b`,
    String.raw`\bx(?:it|test|describe|context)\s*\(`,
    String.raw`\bf(?:it|describe)\s*\(`,
    String.raw`[{,]\s*(?:skip|todo|only)\s*:\s*(?!false\b)`,
    String.raw`\b(?:t|ctx|context|this|test)\.(?:skip|todo)\s*\(`,
    String.raw`@pytest\.mark\.(?:skip|skipif|xfail)\b`,
    String.raw`\bpytest\.skip\s*\(`,
    String.raw`@unittest\.skip`,
  ].join('|'),
  'g'
);
const RX_CA = /\[(CA-\d+)\]/g;

/** Remove comentários para que asserts ou skips citados em comentário não contem. */
export function semComentarios(conteudo, arquivo = '') {
  if (/\.py$/.test(arquivo)) return conteudo.replace(/(^|\s)#.*$/gm, '$1');
  return conteudo
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** Uma linha sem o trecho de comentário (para tags [CA-n] vindas do diff, linha a linha). */
export function linhaSemComentario(l, arquivo = '') {
  if (/\.py$/.test(arquivo)) return l.replace(/(^|\s)#.*$/, '$1');
  const t = l.trim();
  if (t.startsWith('*') || t.startsWith('/*')) return '';
  return l.replace(/\/\*.*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/.*$/, '$1');
}

export function analisarArquivoTeste(caminhoAbs) {
  const conteudo = fs.readFileSync(caminhoAbs, 'utf8');
  const codigo = semComentarios(conteudo, caminhoAbs);
  const criterios = new Set();
  let m;
  // Tag em comentário não é teste: só conta no código.
  RX_CA.lastIndex = 0;
  while ((m = RX_CA.exec(codigo))) criterios.add(m[1]);
  return {
    sha256: sha256(conteudo),
    asserts: (codigo.match(RX_ASSERT) || []).length,
    skips: (codigo.match(RX_SKIP) || []).length,
    criterios: [...criterios].sort(),
  };
}

export function arquivosDeTeste(raiz, config) {
  return gitArquivosRastreados(raiz)
    .filter((f) => !f.startsWith('node_modules/') && !f.startsWith('.workflow-ia/'))
    .filter((f) => casaAlgum(f, config.protecoes.padroesTeste))
    .filter((f) => /\.(?:[cm]?[jt]sx?|py|go|rb|java|kt|cs|php)$/.test(f));
}

export function fotografarTestes(raiz, config) {
  const mapa = {};
  for (const f of arquivosDeTeste(raiz, config)) {
    try {
      mapa[f] = analisarArquivoTeste(path.join(raiz, f));
    } catch {
      /* arquivo removido entre listagem e leitura */
    }
  }
  return mapa;
}

// ---------------------------------------------------------------------------
// RED: prova de que os testes falham antes da implementação
// ---------------------------------------------------------------------------

// Falha de carga (import/sintaxe) não prova comportamento: o teste nem rodou.
// Falha que não é de asserção: o teste nem chegou a verificar comportamento.
const RX_ERRO_CARGA = /ERR_MODULE_NOT_FOUND|Cannot find module|Cannot find package|does not provide an export named|SyntaxError|Failed to load url|Failed to resolve import|is not a module|ModuleNotFoundError|ImportError|error TS\d{4}|is not a function|is not defined|is not a constructor|command not found|not found: /;
// Falha de ambiente: banco, container, navegador ou rede fora do ar.
const RX_ERRO_AMBIENTE = /ECONNREFUSED|ENOTFOUND|EADDRINUSE|ETIMEDOUT|Could not find a working container runtime|Cannot connect to the Docker daemon|Executable doesn't exist|browserType\.launch|getaddrinfo|connection refused/i;
// Asserção de jest/vitest/node:test/chai, do pytest ("E   assert ...", "E   AssertionError") e do go ("--- FAIL:").
// Erro de execução (TypeError etc.) não entra aqui: no RED ele não prova comportamento (ver classificarCarga).
const RX_FALHA_ASSERCAO = /AssertionError|expect\(received\)|Expected:|Received:|expected .+ to |AssertError|^E\s+assert\b|--- FAIL:/m;

/** Classifica a falha de um comando de teste. */
export function classificarFalha(exit, saida) {
  if (exit === 0) return 'passou';
  if (exit === 126 || exit === 127) return 'carga';
  const assercao = RX_FALHA_ASSERCAO.test(saida);
  const carga = RX_ERRO_CARGA.test(saida);
  const ambiente = RX_ERRO_AMBIENTE.test(saida);
  if (assercao && !carga && !ambiente) return 'assercao';
  if (assercao) return 'misto';
  if (ambiente) return 'ambiente';
  return 'carga';
}

export async function registrarRed(raiz, estado, config, { aceitarVerde, aceitarErroCarga, incluirE2E = true, refazer = false, completo = false } = {}) {
  const c = caminhos(raiz, estado.id);
  if (estado.fase !== 'testes' && !refazer) {
    return { ok: false, mensagem: `O RED só é registrado na fase "testes" (fase atual: ${estado.fase}). Depois da implementação ele não prova mais nada.` };
  }
  // Ajuste pós-entrega: um RED próprio para os testes de regressão (e os critérios novos) do ajuste. O baseline
  // anti-enfraquecimento é refeito depois de conferir os testes contra o da entrega anterior, que fica arquivado.
  const redAjuste = !refazer && ajusteEmAndamento(estado) ? caminhoRedAjuste(raiz, estado) : null;
  if (redAjuste && existe(redAjuste)) {
    const r0 = lerJSON(redAjuste, {});
    return { ok: false, mensagem: `RED do ajuste ${estado.ajuste.id} já registrado no commit ${String(r0.commit || '').slice(0, 7)}.` };
  }
  if (redAjuste && !exigeRedAjuste(estado)) {
    return { ok: false, mensagem: `O ajuste ${estado.ajuste.id} não tem pontos a provar (todos descartados pelo humano): não há RED do ajuste. Siga para "wf fase implementacao".` };
  }
  // Cada ponto do ajuste é algo que o humano VIU acontecer: um teste de regressão que já passa não o reproduz.
  if (redAjuste && aceitarVerde) {
    return { ok: false, codigo: 4, mensagem: `No ajuste ${estado.ajuste.id}, o RED não aceita "--aceitar-verde": cada ponto precisa de um teste de regressão que reproduza o que o humano viu (e falhe antes da correção).` };
  }
  if (!redAjuste && existe(c.red) && !refazer) {
    const r0 = lerJSON(c.red, {});
    return { ok: false, mensagem: `RED já registrado no commit ${String(r0.commit || '').slice(0, 7)}. Refazer o RED (e o baseline anti-enfraquecimento) é decisão humana: "wf red --refazer" no terminal do humano.` };
  }
  const limpeza = gitLimpo(raiz);
  if (!limpeza.limpo) {
    return { ok: false, mensagem: 'Faça commit dos testes antes de registrar o RED (a prova precisa apontar para um commit).', sujos: limpeza.sujos };
  }
  // Antes de trocar o baseline: os testes já entregues não podem ter sido enfraquecidos, salvo mudança de spec autorizada.
  let diffAntes = null;
  if (redAjuste) {
    const d = diffTestes(raiz, estado, config);
    if (d.ok) {
      diffAntes = { bloqueante: !!d.bloqueante, alertaEnfraquecimento: !!d.alertaEnfraquecimento, removidos: d.removidos, skipsAdicionados: d.skipsAdicionados, criteriosPerdidos: d.criteriosPerdidos, menosAsserts: d.menosAsserts };
      if (d.bloqueante && !ajusteComMudanca(estado)) {
        return { ok: false, codigo: 4, mensagem: `Os testes já entregues foram enfraquecidos (removidos, skip ou critério perdido) e o ajuste ${estado.ajuste.id} não muda o spec: restaure-os antes do RED do ajuste.`, diffAntes };
      }
    }
  }
  // Todo critério do spec precisa de teste marcado antes de provar o RED.
  const criteriosNosTestes = Object.keys(tagsDoBranch(raiz, config, baseDaTask(estado, config)).ocorrencias).sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
  const semTeste = criteriosDaTask(raiz, estado).filter((ca) => !criteriosNosTestes.includes(ca));
  if (semTeste.length) {
    return { ok: false, mensagem: `Critérios sem teste marcado com [CA-n] neste branch: ${semTeste.join(', ')}. Escreva os testes de todos os critérios antes do RED.`, semTeste };
  }
  const dirEv = path.join(c.evidencias, 'red');
  fs.mkdirSync(dirEv, { recursive: true });
  // Focado (padrão): só os arquivos de teste que a task criou/alterou. Completo: os comandos de teste inteiros.
  const cb = conferirBase(raiz, estado, config);
  if (!cb.ok) return { ok: false, codigo: 4, mensagem: cb.mensagem };
  const plano = planoDoRed(raiz, estado, config, { completo, incluirE2E });
  const comandos = [];
  const base = cb.ref;
  const reserva = vagasAtivas(config) ? criarReservaVaga(config, { task: estado.id, raiz }) : null;
  // O RED prova o commit do INÍCIO: se o HEAD mudar enquanto os testes rodam, a prova não vale.
  const headInicio = gitHead(raiz);
  try {
    let vaga = null;
    if (reserva && plano.execucoes.length) {
      const v = await reserva.pegar();
      if (v.erro) return { ok: false, mensagem: `${v.erro} O RED não rodou (isto é capacidade da máquina, não do teste).` };
      vaga = v.numero;
    }
    for (const x of plano.execucoes) {
      const r = await shAsync(x.comando, {
        cwd: raiz,
        timeoutSegundos: config.gate.timeoutSegundos,
        env: { WF_BASE: base, WF_TASK: estado.id, ...(vaga !== null ? { WF_VAGA: String(vaga) } : {}) },
        aoIniciar: vaga !== null ? (pg) => reserva.registrarGrupo(pg) : undefined,
      });
      if (vaga !== null && r.pid) reserva.removerGrupo(r.pid);
      const log = path.join(dirEv, `${x.nome.replace(/[^A-Za-z0-9._-]+/g, '_')}.log`);
      fs.writeFileSync(log, `$ ${x.comando}\n# exit=${r.exit}\n\n${r.saida}`);
      const falha = classificarFalha(r.exit, r.saida);
      comandos.push({ nome: x.nome, comando: x.comando, ...(x.arquivos ? { arquivos: x.arquivos } : {}), exit: r.exit, log: path.relative(raiz, log), falha, erroCarga: !['passou', 'assercao'].includes(falha) });
    }
  } finally {
    if (reserva) reserva.soltar();
  }
  if (!comandos.length) {
    return { ok: false, mensagem: 'Nenhum comando de teste configurado em .workflow-ia/config.json (comandos.testeUnitario/testeIntegracao/testeE2E).' };
  }
  const headFim = gitHead(raiz);
  if (headFim !== headInicio) {
    return { ok: false, codigo: 4, mensagem: `O HEAD mudou durante o RED (${String(headInicio || '').slice(0, 7)} → ${String(headFim || '').slice(0, 7)}): a prova não vale para nenhum dos dois commits. Rode "wf red" de novo sem commitar enquanto ele roda.`, comandos };
  }
  const algumFalhou = comandos.some((x) => x.exit !== 0);
  if (!algumFalhou && !aceitarVerde) {
    return {
      ok: false,
      codigo: 4,
      mensagem:
        'RED não observado: todos os testes passaram antes da implementação. Um teste que passa antes da mudança não prova o comportamento novo. Revise os testes. Só use --aceitar-verde "<motivo>" quando a task não muda comportamento (refactor puro, por exemplo).',
      comandos,
    };
  }
  // RED válido: todo comando que falhou mostra falha de asserção, e só de asserção.
  const falhos = comandos.filter((x) => x.exit !== 0);
  const ambiente = falhos.filter((x) => x.falha === 'ambiente');
  if (ambiente.length) {
    return {
      ok: false,
      codigo: 4,
      mensagem: `Falha de ambiente em ${ambiente.map((x) => x.nome).join(', ')} (banco, container, navegador ou rede indisponível). Isso não é RED. Resolva o ambiente; se não for possível, BLOQUEADA com motivo AMBIENTE.`,
      comandos,
    };
  }
  const soErroCarga = algumFalhou && falhos.some((x) => x.erroCarga);
  if (soErroCarga && !aceitarErroCarga) {
    return {
      ok: false,
      codigo: 4,
      mensagem:
        'Algum comando de teste falhou por erro de carga (import, sintaxe, tipo, função inexistente ou comando não encontrado), sozinho ou misturado com asserções: os testes desse arquivo nem rodaram. Crie stubs mínimos (a função existe e lança "não implementado" ou devolve um valor neutro) para o teste falhar na asserção. Só use --aceitar-erro-carga "<motivo>" se isso for impossível; o motivo vai para o manifest.',
      comandos,
    };
  }
  const baseline = fotografarTestes(raiz, config);
  const red = {
    ok: true,
    observado: !algumFalhou ? 'VERDE_ACEITO' : soErroCarga ? 'RED_CARGA_ACEITO' : 'RED',
    motivo: !algumFalhou ? aceitarVerde : soErroCarga ? aceitarErroCarga : null,
    commit: headInicio,
    em: agoraISO(),
    refeito: !!refazer,
    modo: plano.modo,
    arquivos: plano.arquivos,
    ...(plano.aviso ? { aviso: plano.aviso } : {}),
    comandos,
    criteriosComTeste: criteriosNosTestes,
  };
  if (redAjuste) {
    red.ajuste = estado.ajuste.id;
    red.diffAntes = diffAntes;
  }
  // Dois "wf red" simultâneos: só o primeiro grava.
  const gravado = comLock(raiz, () => {
    if (redAjuste) {
      if (existe(redAjuste)) return false;
      if (existe(c.baselineTestes)) {
        const n = (estado.entregas || []).length;
        fs.renameSync(c.baselineTestes, path.join(c.evidencias, `baseline-testes-entrega-${n}.json`));
      }
      gravarJSON(c.baselineTestes, { commit: red.commit, em: red.em, arquivos: baseline, ajuste: estado.ajuste.id });
      gravarJSON(redAjuste, red);
      return true;
    }
    if (existe(c.red) && !refazer) return false;
    gravarJSON(c.baselineTestes, { commit: red.commit, em: red.em, arquivos: baseline });
    gravarJSON(c.red, red);
    return true;
  });
  if (!gravado) return { ok: false, mensagem: 'RED registrado por outro comando ao mesmo tempo.' };
  return red;
}

/** Arquivos de teste que a task criou, alterou ou renomeou (diff contra o merge-base com a base da task). */
export function arquivosDeTesteDaTask(raiz, config, base) {
  const mb = git(raiz, ['merge-base', refBase(raiz, base), 'HEAD']);
  if (mb.exit !== 0 || !mb.out) return null;
  const d = git(raiz, ['-c', 'core.quotePath=false', 'diff', '--name-only', '--diff-filter=AMR', '-z', mb.out, 'HEAD', '--']);
  if (d.exit !== 0) return null;
  return d.out
    .split('\0')
    .filter(Boolean)
    .filter((f) => !f.startsWith('node_modules/') && !f.startsWith('.workflow-ia/'))
    .filter((f) => casaAlgum(f, config.protecoes.padroesTeste))
    .filter((f) => /\.(?:[cm]?[jt]sx?|py|go|rb|java|kt|cs|php)$/.test(f));
}

function e2eExigido(config, estado) {
  const x = config.provas?.exigirE2E;
  return x === 'sempre' || (x === 'quando-houver-ui' && estado?.meta?.ui === true);
}

/**
 * O que o "wf red" roda. Focado: só os testes da task, com comandos.testeArquivos ({arquivos}, uma execução) ou
 * comandos.testeArquivo ({arquivo}, uma por arquivo, cada uma classificada sozinha); E2E da task só quando
 * provas.exigirE2E pede. Sem comando por arquivo ou sem teste no diff, cai no completo (com aviso).
 */
export function planoDoRed(raiz, estado, config, { completo = false, incluirE2E = true } = {}) {
  const cmds = config.comandos || {};
  const inteiro = (aviso) => ({
    modo: 'completo',
    arquivos: [],
    ...(aviso ? { aviso } : {}),
    execucoes: ['testeUnitario', 'testeIntegracao', ...(incluirE2E ? ['testeE2E'] : [])].filter((n) => cmds[n]).map((n) => ({ nome: n, comando: cmds[n] })),
  });
  if (completo) return inteiro();
  // Config antigo não muda de comportamento: o RED focado só é o padrão no config v7 com provas.redFocado (gravado
  // pelo instalador; a migração 6→7 grava false) ou com comandos.testeArquivos configurado de propósito.
  const focadoLigado = Number(config.versao) >= 7 && config.provas?.redFocado !== false && (config.provas?.redFocado === true || !!cmds.testeArquivos);
  if (!focadoLigado) return inteiro(Number(config.versao) >= 7 ? 'RED focado desligado (provas.redFocado: false): o RED rodou os comandos de teste inteiros.' : undefined);
  if (!cmds.testeArquivos && !cmds.testeArquivo) return inteiro('comandos.testeArquivos e comandos.testeArquivo não configurados: o RED rodou os comandos de teste inteiros.');
  const todos = arquivosDeTesteDaTask(raiz, config, baseDaTask(estado, config));
  if (!todos || !todos.length) return inteiro('nenhum arquivo de teste criado ou alterado pela task no diff contra a base: o RED rodou os comandos de teste inteiros.');
  const ehE2E = (f) => casaAlgum(f, config.protecoes.padroesE2E || []);
  const unit = todos.filter((f) => !ehE2E(f));
  const e2e = incluirE2E && e2eExigido(config, estado) ? todos.filter(ehE2E) : [];
  const execucoes = [];
  if (unit.length) {
    if (cmds.testeArquivos) execucoes.push({ nome: 'testeArquivos', comando: cmds.testeArquivos.replaceAll('{arquivos}', unit.map(aspasShell).join(' ')), arquivos: unit });
    else for (const f of unit) execucoes.push({ nome: `testeArquivo-${f}`, comando: cmds.testeArquivo.replaceAll('{arquivo}', aspasShell(f)), arquivos: [f] });
  }
  if (e2e.length) {
    if (cmds.testeE2EArquivos) execucoes.push({ nome: 'testeE2EArquivos', comando: cmds.testeE2EArquivos.replaceAll('{arquivos}', e2e.map(aspasShell).join(' ')), arquivos: e2e });
    else if (cmds.testeE2E) execucoes.push({ nome: 'testeE2E', comando: cmds.testeE2E, arquivos: e2e });
  }
  if (!execucoes.length) return inteiro('a task só alterou testes E2E e o E2E não é exigido nesta task: o RED rodou os comandos de teste inteiros.');
  return { modo: 'focado', arquivos: [...unit, ...e2e], execucoes };
}

// ---------------------------------------------------------------------------
// Diff de testes: detecta enfraquecimento (removidos, menos asserts, skips)
// ---------------------------------------------------------------------------

export function diffTestes(raiz, estado, config) {
  const c = caminhos(raiz, estado.id);
  const base = lerJSON(c.baselineTestes, null);
  if (!base) return { ok: false, mensagem: 'Sem baseline de testes (rode "wf red" depois de escrever e commitar os testes).' };
  const atual = fotografarTestes(raiz, config);
  const removidos = [];
  const alterados = [];
  const menosAsserts = [];
  const skipsAdicionados = [];
  const criteriosPerdidos = [];
  // Renomeação: mesmo conteúdo em outro caminho, ou renomeação detectada pelo git
  // (arquivo movido e editado), não é remoção; o destino é comparado com a origem.
  const porSha = new Map(Object.entries(atual).map(([f, a]) => [a.sha256, f]));
  const renomeGit = new Map();
  if (base.commit) {
    const r = git(raiz, ['-c', 'core.quotePath=false', 'diff', '-M50%', '--name-status', base.commit, '--']);
    for (const l of r.exit === 0 ? r.out.split('\n') : []) {
      const [st, de, para] = l.split('\t');
      if (st && st.startsWith('R') && de && para) renomeGit.set(de, para);
    }
  }
  const renomeados = [];
  const tagsAtuais = new Set(Object.values(atual).flatMap((a) => a.criterios));
  for (const [arq, b] of Object.entries(base.arquivos)) {
    let a = atual[arq];
    if (!a) {
      if (porSha.has(b.sha256)) {
        renomeados.push({ de: arq, para: porSha.get(b.sha256) });
        continue;
      }
      const para = renomeGit.get(arq);
      if (para && atual[para]) {
        renomeados.push({ de: arq, para, editado: true });
        a = atual[para];
      } else {
        removidos.push(arq);
        continue;
      }
    }
    if (a.sha256 !== b.sha256) alterados.push(arq);
    if (a.asserts < b.asserts) menosAsserts.push({ arquivo: arq, antes: b.asserts, depois: a.asserts });
    if (a.skips > b.skips) skipsAdicionados.push({ arquivo: arq, antes: b.skips, depois: a.skips });
    const perdidos = b.criterios.filter((x) => !a.criterios.includes(x));
    if (perdidos.length) criteriosPerdidos.push({ arquivo: arq, criterios: perdidos, movidosParaOutroArquivo: perdidos.every((x) => tagsAtuais.has(x)) });
  }
  // Tag que sumiu de um arquivo mas existe em outro é movimentação (alerta), não perda.
  const perdidosDeFato = criteriosPerdidos.filter((x) => !x.movidosParaOutroArquivo);
  const destinosRenomeados = new Set(renomeados.map((r) => r.para));
  const novos = Object.keys(atual).filter((f) => !base.arquivos[f] && !destinosRenomeados.has(f));
  const novosComSkip = novos.filter((f) => atual[f].skips > 0).map((f) => ({ arquivo: f, skips: atual[f].skips }));
  const edicoes = [];
  if (existe(c.edicoesTestes)) {
    for (const l of fs.readFileSync(c.edicoesTestes, 'utf8').split('\n').filter(Boolean)) {
      try {
        edicoes.push(JSON.parse(l));
      } catch {
        /* linha inválida */
      }
    }
  }
  const resultado = {
    ok: true,
    baselineCommit: base.commit,
    commit: gitHead(raiz),
    em: agoraISO(),
    removidos,
    renomeados,
    alterados,
    novos,
    menosAsserts,
    skipsAdicionados: [...skipsAdicionados, ...novosComSkip],
    criteriosPerdidos,
    edicoesRegistradasPeloHook: edicoes.length,
    alertaEnfraquecimento: removidos.length > 0 || menosAsserts.length > 0 || skipsAdicionados.length > 0 || novosComSkip.length > 0 || criteriosPerdidos.length > 0,
    bloqueante: removidos.length > 0 || skipsAdicionados.length > 0 || novosComSkip.length > 0 || perdidosDeFato.length > 0,
  };
  gravarJSON(c.testesDiff, resultado);
  return resultado;
}

// ---------------------------------------------------------------------------
// Critérios de aceite e rastreabilidade
// ---------------------------------------------------------------------------

/**
 * Critérios do spec: só os títulos "### CA-n: ..." contam (menções a CA-n em
 * outras seções, como "coberto por CA-2", não criam critérios). Sem nenhum
 * título, aceita linhas que começam com "CA-n:" (formato de lista).
 * "### CA-4 (removido: motivo)" retira o critério da DoD.
 */
export function criteriosDoTexto(texto) {
  const set = new Set();
  const removidos = new Set();
  const linhas = String(texto || '').split('\n');
  // Aceita negrito/itálico/tachado antes do ID: "### **CA-2:** ...", "### _CA-3_ ...".
  const titulo = (l) => l.match(/^\s*#{1,6}\s*[*_~\s]*(CA-\d+)\b/);
  const lista = (l) => l.match(/^\s*(?:[-*]\s*)?(?:\*\*)?~*(CA-\d+)\b\s*~*(?:\*\*)?\s*[:(]/);
  const temTitulo = linhas.some((l) => titulo(l));
  for (const l of linhas) {
    const m = temTitulo ? titulo(l) : lista(l);
    if (!m) continue;
    set.add(m[1]);
    if (/\(\s*removido/i.test(l)) removidos.add(m[1]);
  }
  for (const id of removidos) set.delete(id);
  return [...set].sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
}

export function criteriosDoSpec(raiz, id) {
  const c = caminhos(raiz, id);
  if (!existe(c.spec)) return [];
  return criteriosDoTexto(fs.readFileSync(c.spec, 'utf8'));
}

/** Critérios da task: a lista congelada ao entrar no plano (ou o spec atual, antes disso). */
export function criteriosDaTask(raiz, estado) {
  return estado?.specCongelado?.criterios || criteriosDoSpec(raiz, estado.id);
}

export function hashSpec(raiz, id) {
  const c = caminhos(raiz, id);
  return existe(c.spec) ? sha256(fs.readFileSync(c.spec, 'utf8')) : null;
}

/** O spec.md continua igual ao congelado? */
export function specIntegro(raiz, estado) {
  if (!estado?.specCongelado) return true;
  return hashSpec(raiz, estado.id) === estado.specCongelado.sha256;
}

export function metaDoSpec(raiz, id) {
  // Linhas no topo do spec: "Complexidade: M", "Risco: alto", "UI: sim", "Dados pessoais: nao".
  const c = caminhos(raiz, id);
  if (!existe(c.spec)) return {};
  const texto = fs.readFileSync(c.spec, 'utf8');
  const pegar = (rotulo) => {
    const m = texto.match(new RegExp(`^\\s*[-*]?\\s*\\**${rotulo}\\**\\s*:\\s*\\**\\s*([^\\n*]+)`, 'im'));
    // Template não preenchido ("P | M | G") não é valor.
    return m && !m[1].includes('|') ? m[1].trim() : null;
  };
  const comp = (pegar('Complexidade') || '').toUpperCase().charAt(0);
  const ui = (pegar('UI') || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const risco = (pegar('Risco') || '').toLowerCase();
  const tipo = (pegar('Tipo') || '').toLowerCase().split(/[\s|]/)[0];
  const pii = (pegar('Dados pessoais') || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return {
    complexidade: ['P', 'M', 'G'].includes(comp) ? comp : null,
    ui: /^(?:sim|s|yes|true|1)\b/.test(ui) ? true : /^(?:nao|n|no|false|0|sem|nenhuma|somente|apenas|so)\b/.test(ui) ? false : null,
    risco: risco ? risco.normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s/)[0] : null,
    tipo: ['feat', 'fix', 'refactor', 'chore'].includes(tipo) ? tipo : null,
    // Na dúvida, sim: só um "nao" explícito desliga (linha ausente ou template não preenchido = null).
    dadosPessoais: !pii ? null : /^(?:nao|n|no|false|0|nenhum|nenhuma)\b/.test(pii) ? false : true,
  };
}

/**
 * Tags [CA-n] nas linhas de teste ADICIONADAS/ALTERADAS neste branch (desde o
 * merge-base com o branch base) e em arquivos de teste novos não rastreados.
 * Os IDs CA-n são por task: tags de tasks antigas, em linhas que este branch
 * não tocou, não contam para esta task.
 */
export function tagsDoBranch(raiz, config, base = config.git.branchBase) {
  const r = git(raiz, ['merge-base', refBase(raiz, base), 'HEAD']);
  const mb = r.exit === 0 && r.out ? r.out : null;
  const ocorrencias = {};
  const add = (ca, arquivo, linha, trecho) => (ocorrencias[ca] = ocorrencias[ca] || []).push({ arquivo, linha, trecho: trecho.trim().slice(0, 160) });
  const ehTeste = (f) => casaAlgum(f, config.protecoes.padroesTeste) && !f.startsWith('.workflow-ia/');

  if (!mb) {
    // Sem branch base: considera todos os arquivos de teste.
    for (const f of arquivosDeTeste(raiz, config)) {
      let conteudo;
      try {
        conteudo = fs.readFileSync(path.join(raiz, f), 'utf8');
      } catch {
        continue;
      }
      semComentarios(conteudo, f).split('\n').forEach((l, i) => {
        for (const m of l.matchAll(/\[(CA-\d+)\]/g)) add(m[1], f, i + 1, l);
      });
    }
    return { mergeBase: null, ocorrencias };
  }

  const d = git(raiz, ['-c', 'core.quotePath=false', 'diff', '-U0', '--no-color', '--no-ext-diff', '--no-renames', mb, '--']);
  let arquivo = null;
  let linhaNova = 0;
  for (const l of d.out.split('\n')) {
    if (l.startsWith('+++ ')) {
      // Nomes com tab, aspas ou barra invertida continuam entre aspas mesmo com quotePath=false.
      const nome = l.slice(4).replace(/^"(.*)"$/, '$1');
      arquivo = nome.startsWith('b/') ? nome.slice(2) : null;
      continue;
    }
    const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (h) {
      linhaNova = Number(h[1]);
      continue;
    }
    if (!arquivo || !ehTeste(arquivo)) continue;
    if (l.startsWith('+') && !l.startsWith('+++')) {
      for (const m of linhaSemComentario(l.slice(1), arquivo).matchAll(/\[(CA-\d+)\]/g)) add(m[1], arquivo, linhaNova, l.slice(1));
      linhaNova += 1;
    }
  }
  const novos = git(raiz, ['-c', 'core.quotePath=false', 'ls-files', '--others', '--exclude-standard']).out.split('\n').filter((f) => f && ehTeste(f));
  for (const f of novos) {
    let conteudo;
    try {
      conteudo = fs.readFileSync(path.join(raiz, f), 'utf8');
    } catch {
      continue;
    }
    semComentarios(conteudo, f).split('\n').forEach((l, i) => {
      for (const m of l.matchAll(/\[(CA-\d+)\]/g)) add(m[1], f, i + 1, l);
    });
  }
  return { mergeBase: mb, ocorrencias };
}

export function matrizRastreabilidade(raiz, estadoOuId, config) {
  const criterios = typeof estadoOuId === 'object' ? criteriosDaTask(raiz, estadoOuId) : criteriosDoSpec(raiz, estadoOuId);
  const estado = typeof estadoOuId === 'object' ? estadoOuId : lerJSON(caminhos(raiz, estadoOuId).estado, null);
  const { mergeBase, ocorrencias } = tagsDoBranch(raiz, config, baseDaTask(estado, config));
  const linhas = criterios.map((ca) => ({ criterio: ca, testes: ocorrencias[ca] || [] }));
  const semTeste = linhas.filter((l) => l.testes.length === 0).map((l) => l.criterio);
  return { criterios, linhas, semTeste, mergeBase, nota: 'Só contam tags [CA-n] em linhas de teste adicionadas/alteradas neste branch.' };
}
