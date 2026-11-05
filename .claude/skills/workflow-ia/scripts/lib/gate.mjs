// Laço de execução das etapas do gate: ondas por custo (falhar rápido), paralelismo dentro da onda, teto por
// etapa, repetição automática quando a falha é de carga da máquina e vaga de recurso para etapas pesadas.
// Assíncrono de propósito: com spawnSync o processo trava e nada roda junto (heartbeat, espera de vaga, etapas
// em paralelo). O que só o gate incremental decide (cache) entra pelo gancho decidirEtapa, nunca na verificação.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { agoraISO, ultimasLinhas } from './core.mjs';
import { classificarFalha } from './provas.mjs';

export const CUSTOS = ['baixo', 'medio', 'alto'];
const LIMITE_SAIDA = 64 * 1024 * 1024;

// Grupos de processos ainda vivos: se a CLI sair no meio (exit, Ctrl+C), nenhuma etapa fica órfã segurando porta.
const gruposVivos = new Set();
function matarGrupo(pid, sinal = 'SIGKILL') {
  try {
    if (process.platform === 'win32') process.kill(pid, sinal);
    else process.kill(-pid, sinal);
  } catch {
    /* já terminou */
  }
}
process.once('exit', () => {
  for (const pid of gruposVivos) matarGrupo(pid);
});

/**
 * Executa um comando de shell sem travar o processo. Mesmo formato de sh() (core.mjs) e mais `sinal`.
 * No timeout mata o grupo inteiro do comando (o shell e os filhos), para não sobrar servidor segurando porta.
 */
export function shAsync(comando, { cwd, timeoutSegundos = 600, env, aoIniciar } = {}) {
  const inicio = Date.now();
  return new Promise((resolve) => {
    let filho;
    try {
      filho = spawn(process.platform === 'win32' ? comando : '/bin/bash', process.platform === 'win32' ? [] : ['-c', comando], {
        cwd,
        shell: process.platform === 'win32',
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, CI: process.env.CI || '1', FORCE_COLOR: '0', ...env },
      });
    } catch (e) {
      resolve({ exit: 127, stdout: '', stderr: e.message, saida: e.message, duracaoMs: Date.now() - inicio, timeout: false, erro: e.message });
      return;
    }
    const pid = filho.pid;
    if (pid) gruposVivos.add(pid);
    if (pid && typeof aoIniciar === 'function') {
      try {
        aoIniciar(pid);
      } catch {
        /* melhor esforço */
      }
    }
    let stdout = '';
    let stderr = '';
    filho.stdout.on('data', (d) => {
      if (stdout.length < LIMITE_SAIDA) stdout += d;
    });
    filho.stderr.on('data', (d) => {
      if (stderr.length < LIMITE_SAIDA) stderr += d;
    });
    let timeout = false;
    const timer = setTimeout(() => {
      timeout = true;
      if (pid) matarGrupo(pid);
    }, timeoutSegundos * 1000);
    let erro;
    filho.on('error', (e) => {
      erro = e.message;
    });
    filho.on('close', (code, sinal) => {
      clearTimeout(timer);
      if (pid) {
        gruposVivos.delete(pid);
        // O shell saiu, mas um filho em segundo plano pode ter ficado: o grupo é da etapa, não sobrevive a ela.
        matarGrupo(pid);
      }
      const exit = typeof code === 'number' ? code : timeout ? 124 : sinal ? 128 + (os.constants.signals[sinal] || 0) : 1;
      resolve({
        exit,
        pid,
        stdout,
        stderr,
        saida: stdout + (stderr ? `\n${stderr}` : ''),
        duracaoMs: Date.now() - inicio,
        timeout,
        sinal: timeout ? undefined : sinal || undefined,
        erro: erro && !timeout ? erro : undefined,
      });
    });
  });
}

// Falha que vem da máquina (carga, porta, memória, banco fora do ar), não do código: vale repetir.
const RX_CARGA = [
  [/EADDRINUSE|address already in use/i, 'porta ocupada'],
  [/JavaScript heap out of memory|\bENOMEM\b|Cannot allocate memory|FATAL ERROR:.*(?:out of memory|Allocation failed)/i, 'falta de memória'],
  [/ECONNREFUSED|connection refused|Connection terminated unexpectedly|too many clients already|the database system is starting up/i, 'conexão recusada (banco ou serviço)'],
];
// Sinais de que um teste rodou e falhou pelo código (além das asserções de classificarFalha): erro de execução
// dentro do teste, "--- FAIL" do go, linha "E   " do pytest, expect( do jest/vitest. Com qualquer um deles, não é carga.
const RX_SINAL_TESTE = /\b(?:TypeError|ReferenceError|RangeError)\b|--- FAIL\b|^E\s{2,}\S|\bexpect\(|\bassert\b.*(?:==|!=|\bis\b|\bin\b)|AssertionError/m;
// Padrões de carga só valem no fim da saída, onde o runner diz por que parou (uma mensagem no meio do log, como a
// de um lint citando "out of memory", não é a causa da falha).
const LINHAS_CAUDA = 30;

/**
 * Motivo de carga de uma execução que falhou, ou null quando a falha é do código. Falha de asserção (ou outro sinal
 * de teste que falhou) nunca é carga, mesmo que a etapa tenha estourado o teto depois. Na dúvida, não é carga.
 */
export function classificarCarga(r) {
  if (!r || r.exit === 0) return null;
  const saida = r.saida || '';
  const tipo = classificarFalha(r.exit, saida);
  if (tipo === 'assercao' || tipo === 'misto') return null;
  if (RX_SINAL_TESTE.test(saida)) return null;
  if (r.timeout) return 'timeout (teto da etapa)';
  if (r.sinal || r.exit === 137 || r.exit === 143) return `encerrada por sinal${r.sinal ? ` ${r.sinal}` : ` (exit ${r.exit})`}`;
  const cauda = ultimasLinhas(saida, LINHAS_CAUDA);
  for (const [rx, motivo] of RX_CARGA) if (rx.test(cauda)) return motivo;
  if (/^\s*Killed\s*$/m.test(cauda)) return 'falta de memória (processo morto pelo sistema)';
  return null;
}

export function custoDa(etapa) {
  return CUSTOS.includes(etapa?.custo) ? etapa.custo : 'medio';
}

const nomeDeLog = (nome) => String(nome).replaceAll(':', '--');
const falhou = (r) => r && r.obrigatoria && !['ok', 'nao-configurado', 'nao-executada'].includes(r.status);

// --------------------------------------------------------------------------- dependências entre etapas (dependeDe)

/** Etapa que não rodou porque uma dependência dela não passou. Nunca aprova: conta como falha no veredito do gate. */
export const PULADA = 'pulada-por-dependencia';
// Etapa do modo CI que não conseguiu um resultado do CI (gh sem auth, rede, cota, run cancelado, workflow ausente):
// capacidade/infraestrutura, não defeito do código. Como "sem-vaga": não abre finding e não fecha a verificação.
export const CI_INDISPONIVEL = 'ci-indisponivel';
// Resultado de dependência que libera a dependente. "nao-configurado" (sem comando) não bloqueia nada; "nao-executada"
// (fora do --etapas ou do --so-falhas) é resolvida pelo último resultado no mesmo commit (resultadoAnterior).
const LIBERA = ['ok', 'nao-configurado'];
const doGrupo = (nome, grupo) => nome === grupo || String(nome).startsWith(`${grupo}:`);

/** "teste-ci falhou", "build deu timeout", "e2e ficou sem vaga" (motivo, tabela e resumo). */
export function textoStatusDependencia(status) {
  return { falhou: 'falhou', timeout: 'deu timeout', 'sem-vaga': 'ficou sem vaga', cancelada: 'foi cancelada', [PULADA]: 'foi pulada', 'sem-resultado': 'não terminou antes dela', [CI_INDISPONIVEL]: 'ficou sem CI (indisponível)' }[status] || `terminou com status ${status}`;
}

/**
 * Nomes de que a etapa depende (dependeDe), entre os nomes do gate: um nome de grupo sem sufixo ("teste-integracao")
 * vale por todas as sub-etapas dele ("teste-integracao:api", ...). Devolve { nomes, desconhecidas, invalido }.
 */
export function expandirDependencias(etapa, nomes) {
  const bruto = etapa?.dependeDe;
  if (bruto === undefined) return { nomes: [], desconhecidas: [], invalido: false };
  if (!Array.isArray(bruto) || bruto.some((d) => typeof d !== 'string' || !d.trim())) return { nomes: [], desconhecidas: [], invalido: true };
  const saida = [];
  const desconhecidas = [];
  for (const d of bruto.map((x) => x.trim())) {
    const casadas = nomes.filter((n) => doGrupo(n, d));
    if (!casadas.length) desconhecidas.push(d);
    for (const n of casadas) if (!saida.includes(n)) saida.push(n);
  }
  return { nomes: saida, desconhecidas, invalido: false };
}

/** Ciclos do grafo de dependências ({ nome: [deps] }): listas "A → B → A"; autodependência sai como [A, A]. */
function ciclosDe(deps) {
  const cor = new Map();
  const ciclos = [];
  const vistos = new Set();
  const visitar = (n, pilha) => {
    cor.set(n, 1);
    pilha.push(n);
    for (const d of deps.get(n) || []) {
      if (!deps.has(d)) continue;
      if (cor.get(d) === 1) {
        const c = pilha.slice(pilha.indexOf(d));
        const chave = [...c].sort().join('\0');
        if (!vistos.has(chave)) {
          vistos.add(chave);
          ciclos.push([...c, d]);
        }
      } else if (!cor.get(d)) visitar(d, pilha);
    }
    pilha.pop();
    cor.set(n, 2);
  };
  for (const n of deps.keys()) if (!cor.get(n)) visitar(n, []);
  return ciclos;
}

/**
 * Problemas do dependeDe no config (wf doctor). erros reprovam: formato, nome inexistente, autodependência e ciclo.
 * avisos não reprovam: dependência depois da dependente no config (o gate espera mesmo assim) e obrigatória que
 * depende de etapa não obrigatória (se esta falhar, a obrigatória é pulada e o gate reprova).
 */
export function problemasDependencias(config) {
  const etapas = config?.gate?.etapas || [];
  const nomes = etapas.map((e) => e.nome);
  const erros = [];
  const avisos = [];
  const deps = new Map();
  for (const e of etapas) {
    const r = expandirDependencias(e, nomes);
    if (r.invalido) erros.push(`etapa "${e.nome}": dependeDe deve ser uma lista de nomes de etapa`);
    for (const d of r.desconhecidas) erros.push(`etapa "${e.nome}": dependeDe cita "${d}", que não é etapa nem grupo do gate`);
    if (r.nomes.includes(e.nome)) erros.push(`etapa "${e.nome}": depende de si mesma${(e.dependeDe || []).includes(e.nome) ? '' : ' (pelo grupo)'}`);
    deps.set(e.nome, r.nomes);
    for (const d of r.nomes) {
      if (d === e.nome) continue;
      const alvo = etapas.find((x) => x.nome === d);
      if (nomes.indexOf(d) > nomes.indexOf(e.nome)) avisos.push(`etapa "${e.nome}": a dependência "${d}" vem depois dela no config (o gate espera "${d}" terminar; deixe-a antes para ler na ordem)`);
      if (e.obrigatoria && alvo && !alvo.obrigatoria) avisos.push(`etapa "${e.nome}" (obrigatória) depende de "${d}" (não obrigatória): se "${d}" falhar, "${e.nome}" é pulada e o gate reprova`);
    }
  }
  for (const c of ciclosDe(deps)) if (c.length > 2) erros.push(`dependeDe em ciclo: ${c.join(' → ')}`);
  return { erros, avisos };
}

/** "3 etapas puladas porque teste-ci falhou; 1 etapa pulada porque build deu timeout" (ou null). */
export function resumoPuladas(etapas) {
  const porCausa = new Map();
  for (const e of etapas || []) {
    if (e?.status !== PULADA) continue;
    const texto = e.causaRaiz?.texto || `${e.dependencia?.etapa || '?'} ${textoStatusDependencia(e.dependencia?.status)}`;
    porCausa.set(texto, (porCausa.get(texto) || 0) + 1);
  }
  if (!porCausa.size) return null;
  return [...porCausa].map(([texto, n]) => `${n} ${n === 1 ? 'etapa pulada' : 'etapas puladas'} porque ${texto}`).join('; ');
}

/**
 * Ondas de execução (com falhar rápido, baixo → medio → alto, na ordem do config dentro de cada uma; sem, uma só) e
 * dependências de cada etapa: internas (índices desta execução), externas (no gate, mas fora desta
 * execução, como no --etapas), desconhecidas e onda. Com falhar rápido, a onda é a do custo, mas nunca antes da onda
 * das dependências. Etapas em ciclo saem em `emCiclo` (erro de config: falham sem rodar).
 */
function planejar(lista, todas, falharRapido) {
  const indice = new Map(lista.map((e) => [e.nome, e._i]));
  for (const e of lista) {
    const r = expandirDependencias(e, todas);
    e._deps = r.nomes.filter((n) => indice.has(n)).map((n) => indice.get(n));
    e._dependenciasPorIndice = new Map(e._deps.map((i) => [i, lista[i].nome]));
    e._externas = r.nomes.filter((n) => !indice.has(n));
    e._desconhecidas = r.invalido ? ['(dependeDe inválido)'] : r.desconhecidas;
  }
  const porI = new Map(lista.map((e) => [e._i, e]));
  const ciclos = ciclosDe(new Map(lista.map((e) => [e._i, e._deps])));
  const emCiclo = new Map();
  for (const c of ciclos) {
    const texto = c.map((i) => porI.get(i).nome).join(' → ');
    for (const i of c) if (!emCiclo.has(i)) emCiclo.set(i, texto);
  }
  const onda = new Map();
  const ondaDe = (e) => {
    if (onda.has(e._i)) return onda.get(e._i);
    onda.set(e._i, 0);
    let o = falharRapido ? CUSTOS.indexOf(custoDa(e)) : 0;
    for (const d of e._deps) if (!emCiclo.has(d)) o = Math.max(o, ondaDe(porI.get(d)));
    onda.set(e._i, o);
    return o;
  };
  const ondas = [];
  for (const e of lista) {
    if (emCiclo.has(e._i)) continue;
    const o = ondaDe(e);
    (ondas[o] ||= []).push(e);
  }
  return { ondas: ondas.filter((o) => o && o.length), emCiclo };
}

/**
 * Decide, antes da vaga e do comando, se a etapa roda: alguma dependência que não passou (falhou, timeout, sem vaga,
 * cancelada ou pulada) a deixa pulada-por-dependencia. Dependência fora desta execução (ou não executada nela) vale
 * pelo último resultado no mesmo commit (ctx.resultadoAnterior); sem resultado, a etapa roda com aviso.
 */
function avaliarDependencias(e, resultados, ctx) {
  const avisos = [];
  const notas = [];
  const pular = (nome, r, extra = '') => {
    const raiz = r.status === PULADA && r.causaRaiz ? r.causaRaiz : { etapa: nome, status: r.status, texto: `${nome} ${textoStatusDependencia(r.status)}` };
    const motivo = r.status === PULADA ? `dependência ${nome} foi pulada (${raiz.texto})${extra}` : `dependência ${nome} ${textoStatusDependencia(r.status)}${extra}`;
    return { pular: true, resultado: base(e, { status: PULADA, origem: 'dependencia', motivo, exit: null, duracaoMs: 0, log: null, dependencia: { etapa: nome, status: r.status }, causaRaiz: raiz }) };
  };
  const anterior = (nome) => {
    const u = typeof ctx.resultadoAnterior === 'function' ? ctx.resultadoAnterior(nome) : null;
    if (!u) {
      avisos.push(`dependência ${nome} não rodou nesta execução e não tem resultado registrado no mesmo commit: ${e.nome} roda sem essa checagem`);
      return null;
    }
    const extra = ` no gate "${u.rotulo}" do mesmo commit`;
    if (LIBERA.includes(u.status)) {
      notas.push(`dependência ${nome} ${u.status === 'ok' ? 'ok' : 'não configurada'}${extra}`);
      return null;
    }
    return pular(nome, u, extra);
  };
  for (const i of e._deps) {
    const r = resultados.get(i);
    // Só acontece na saída de emergência contra impasse (rodarOnda): sem resultado, nunca libera calada.
    if (!r) return pular(e._dependenciasPorIndice.get(i), { status: 'sem-resultado' });
    const nome = r.nome;
    if (LIBERA.includes(r.status)) continue;
    if (r.status === 'nao-executada') {
      const p = anterior(nome);
      if (p) return p;
      continue;
    }
    return pular(nome, r);
  }
  for (const nome of e._externas) {
    const p = anterior(nome);
    if (p) return p;
  }
  for (const d of e._desconhecidas) avisos.push(`dependeDe cita "${d}", que não existe no gate (rode wf doctor): ${e.nome} roda sem essa checagem`);
  return { pular: false, avisos, notas };
}

/**
 * Roda as etapas e devolve um resultado por etapa, na ordem recebida.
 *
 * etapas: [{ nome, comando (já resolvido), obrigatoria, custo, pesada, paralela, timeoutSegundos, dependeDe, ... }]
 * ctx: {
 *   raiz, dirEv, env,                     // pasta das evidências e variáveis extras (WF_BASE, WF_TASK)
 *   completo,                             // verificação final: sem falhar rápido e sem decidirEtapa
 *   falharRapido, paralelismo, repetirPorCarga, timeoutPadrao,
 *   decidirEtapa(etapa, ctx) -> { acao: 'executar'|'cache'|'nao-coberta', motivo, cache } (gancho do gate incremental)
 *   pegarVaga(etapa) -> { numero } | { erro }   // vaga de recurso para etapa pesada (segura até o fim do gate)
 *   registrarGrupo(pgid), removerGrupo(pgid)    // grupo da etapa pesada no dono.json da vaga (órfãos após kill -9)
 *   ctxDecisao                            // repassado ao decidirEtapa
 *   todasEtapas                           // nomes de todas as etapas do gate (dependeDe fora desta execução)
 *   resultadoAnterior(nome) -> { status, rotulo } | null  // último resultado da etapa no mesmo commit (--etapas)
 *   executar(comando, opcoes)             // executor do comando (padrão shAsync; os testes injetam um falso)
 *   resolverExterna(etapa, porNome) -> resultado | null   // etapa ci:true lida de fora (modo CI), sem vaga nem execução
 * }
 * etapa.executor(comando, opcoes): executor só desta etapa (a "teste-ci" do modo CI); um resultado com `ci` vem com
 * status pronto (ok|falhou|ci-indisponivel), vira origem 'ci' e não passa pela repetição por carga.
 * dependeDe: a etapa só começa depois que as dependências terminam (inclusive as repetições por carga); se alguma
 * não passou, fica pulada-por-dependencia sem pegar vaga, sem consultar o cache e sem executar.
 */
export async function executarEtapas(etapas, ctx) {
  const completo = !!ctx.completo;
  const falharRapido = !!ctx.falharRapido && !completo;
  const paralelismo = Math.max(1, Number(ctx.paralelismo) || 1);
  const resultados = new Map();
  const lista = etapas.map((e, i) => ({ ...e, _i: i }));
  const todas = Array.isArray(ctx.todasEtapas) && ctx.todasEtapas.length ? ctx.todasEtapas : lista.map((e) => e.nome);
  const { ondas, emCiclo } = planejar(lista, todas, falharRapido);
  for (const [i, texto] of emCiclo) {
    // Erro de config, não do código: origem "config" e erroConfig (o sincronizarGate aponta o config.json, que só o humano edita).
    const erro = `dependeDe em ciclo (${texto})`;
    resultados.set(i, base(lista[i], { status: 'falhou', origem: 'config', erroConfig: erro, motivo: `erro de config: ${erro}; rode wf doctor`, exit: null, duracaoMs: 0, log: null, resumoFalha: `${erro}. Corrija gate.etapas[].dependeDe no .workflow-ia/config.json (só o humano edita o config).` }));
  }
  let corte = null;
  for (const onda of ondas) {
    if (corte) {
      for (const e of onda) resultados.set(e._i, base(e, { status: 'nao-executada', motivo: `falha anterior em ${corte}`, exit: null, duracaoMs: 0, log: null }));
      continue;
    }
    const pronta = (e) => e._deps.every((d) => resultados.has(d));
    await rodarOnda(onda, paralelismo, pronta, async (e) => {
      try {
        // Etapa lida de fora (modo CI: ci:true): o gancho devolve o resultado pronto, sem vaga nem execução; sem
        // resultado (CI indisponível, segredos, estado) cai no fluxo normal e vira pulada-por-dependencia.
        if (e.ci === true && typeof ctx.resolverExterna === 'function') {
          const porNome = new Map([...resultados.values()].map((r) => [r.nome, r]));
          const ext = await ctx.resolverExterna(e, porNome);
          if (ext) {
            resultados.set(e._i, ext);
            return;
          }
        }
        // Etapa sem comando é nao-configurado (rodarEtapa), nunca pulada: as dependências nem são avaliadas.
        const dep = e.comando ? avaliarDependencias(e, resultados, ctx) : { pular: false };
        resultados.set(e._i, dep.pular ? dep.resultado : await rodarEtapa(e, ctx, completo, dep));
      } catch (err) {
        resultados.set(e._i, base(e, { status: 'falhou', origem: 'execucao', motivo: `erro interno da CLI: ${err.message}`, exit: null, duracaoMs: 0, log: null, resumoFalha: err.stack || err.message }));
      }
    });
    if (falharRapido) {
      const daOnda = onda.map((e) => resultados.get(e._i));
      const f = daOnda.find((r) => falhou(r) && r.status !== PULADA) || daOnda.find((r) => falhou(r));
      if (f) corte = f.status === PULADA ? f.causaRaiz?.etapa || f.nome : f.nome;
    }
  }
  return etapas.map((_, i) => resultados.get(i));
}

/**
 * Até `paralelismo` etapas ao mesmo tempo; pesadas uma de cada vez (dividem a vaga); `paralela: false` roda sozinha;
 * uma etapa só começa com as dependências terminadas (`pronta`).
 */
function rodarOnda(onda, paralelismo, pronta, rodar) {
  const fila = [...onda];
  const ativos = new Set();
  let pesadaAtiva = false;
  let exclusivaAtiva = false;
  return new Promise((resolve) => {
    const proximo = () => {
      while (ativos.size < paralelismo && !exclusivaAtiva && fila.length) {
        let i = fila.findIndex((e) => pronta(e) && (!e.pesada || !pesadaAtiva) && (e.paralela !== false || ativos.size === 0));
        // Defesa: nada pronto e nada rodando seria um impasse (não acontece sem ciclo); a dependente avalia o que houver.
        if (i < 0 && !ativos.size) i = 0;
        if (i < 0) break;
        const [e] = fila.splice(i, 1);
        if (e.paralela === false) exclusivaAtiva = true;
        if (e.pesada) pesadaAtiva = true;
        const p = rodar(e).then(() => {
          ativos.delete(p);
          if (e.pesada) pesadaAtiva = false;
          if (e.paralela === false) exclusivaAtiva = false;
          proximo();
        });
        ativos.add(p);
      }
      if (!fila.length && !ativos.size) resolve();
    };
    proximo();
  });
}

/** Resultado de uma etapa com os campos fixos (nome, comando, obrigatoria, custo, pesada). */
export function resultadoEtapa(e, extra) {
  return base(e, extra);
}

function base(e, extra) {
  const r = { nome: e.nome, comando: e.comando || '', obrigatoria: !!e.obrigatoria, custo: custoDa(e), ...extra };
  if (e.pesada) r.pesada = true;
  return r;
}

async function rodarEtapa(e, ctx, completo, dep = {}) {
  if (!e.comando) return base(e, { status: 'nao-configurado', exit: null, duracaoMs: 0, log: null });
  // dependeDe resolvido pelo último resultado no mesmo commit (nota) ou sem resultado nenhum (aviso, também no log).
  const avisos = dep.avisos || [];
  const sobreDeps = [...(dep.notas || []), ...avisos].join('; ');
  const comDeps = (extra) => ({ ...extra, ...(sobreDeps ? { motivo: `${extra.motivo}; ${sobreDeps}` } : {}), ...(avisos.length ? { avisosDependencia: avisos } : {}) });

  // Gancho do gate incremental (cache entre iterações). A verificação final nunca pergunta: roda tudo.
  let motivo = completo ? 'verificação final: roda todas as etapas' : 'executada';
  if (!completo && typeof ctx.decidirEtapa === 'function') {
    const d = (await ctx.decidirEtapa(e, ctx.ctxDecisao || {})) || {};
    if (d.acao === 'cache') return base(e, comDeps({ status: 'ok', origem: 'cache', motivo: d.motivo || 'cache', cache: d.cache || null, exit: 0, duracaoMs: 0, log: null }));
    if (d.acao === 'nao-coberta') return base(e, comDeps({ status: 'nao-executada', motivo: d.motivo || 'não coberta', exit: null, duracaoMs: 0, log: null }));
    if (d.motivo) motivo = d.motivo;
  }

  let vaga = null;
  if (e.pesada && typeof ctx.pegarVaga === 'function') {
    vaga = await ctx.pegarVaga(e);
    if (vaga?.erro) {
      return base(e, comDeps({ status: 'sem-vaga', origem: 'execucao', motivo: vaga.erro, porCarga: true, motivoCarga: 'sem vaga de recurso', exit: null, duracaoMs: 0, log: null, resumoFalha: `${vaga.erro}\nIsto é capacidade da máquina, não um defeito do código: não altere o código por causa disto.` }));
    }
  }

  const env = { ...(ctx.env || {}), ...(vaga && vaga.numero != null ? { WF_VAGA: String(vaga.numero) } : {}) };
  const teto = Number(e.timeoutSegundos) > 0 ? Number(e.timeoutSegundos) : Number(ctx.timeoutPadrao) || 900;
  const maxTentativas = 1 + Math.max(0, Number(ctx.repetirPorCarga) || 0);
  const logAbs = path.join(ctx.dirEv, `${nomeDeLog(e.nome)}.log`);
  const logRel = path.relative(ctx.raiz, logAbs);
  const tentativas = [];
  let r;
  let carga = null;
  let status;
  // Com vaga, o grupo de processos da etapa vai para o dono.json: se a CLI morrer (kill -9), quem recuperar a vaga
  // mata a etapa órfã antes de usar o mesmo WF_VAGA.
  const comGrupo = vaga && vaga.numero != null && typeof ctx.registrarGrupo === 'function';
  const executar = typeof e.executor === 'function' ? e.executor : typeof ctx.executar === 'function' ? ctx.executar : shAsync;
  const cabecalhoAvisos = avisos.map((a) => `# aviso: ${a}\n`).join('');
  for (let n = 1; n <= maxTentativas; n += 1) {
    r = await executar(e.comando, { cwd: ctx.raiz, timeoutSegundos: teto, env, aoIniciar: comGrupo ? (pg) => ctx.registrarGrupo(pg) : undefined });
    if (comGrupo && r.pid) ctx.removerGrupo?.(r.pid);
    if (r.ci) {
      // Resultado do CI: o status vem pronto e a saída é a narrativa do executor (um log de teste com "ECONNREFUSED"
      // não é carga da máquina): sem classificarCarga e sem repetição.
      status = ['ok', 'falhou', CI_INDISPONIVEL].includes(r.status) ? r.status : r.exit === 0 ? 'ok' : 'falhou';
      carga = null;
      fs.writeFileSync(logAbs, `$ ${e.comando}\n${cabecalhoAvisos}# status=${status} duracao=${r.duracaoMs}ms em=${agoraISO()}\n\n${r.saida || ''}`);
      tentativas.push({ n, status, exit: r.exit, duracaoMs: r.duracaoMs, porCarga: false });
      break;
    }
    status = r.timeout ? 'timeout' : r.exit === 0 ? 'ok' : 'falhou';
    carga = status === 'ok' ? null : classificarCarga(r);
    fs.writeFileSync(logAbs, `$ ${e.comando}\n${cabecalhoAvisos}# exit=${r.exit} duracao=${r.duracaoMs}ms tentativa=${n} em=${agoraISO()}${carga ? ` carga=${carga}` : ''}${vaga?.numero != null ? ` vaga=${vaga.numero}` : ''}\n\n${r.saida}`);
    const t = { n, status, exit: r.exit, duracaoMs: r.duracaoMs, porCarga: !!carga };
    if (carga) t.motivoCarga = carga;
    if (r.sinal) t.sinal = r.sinal;
    tentativas.push(t);
    const repetir = carga && n < maxTentativas;
    if (repetir || n > 1) {
      // Cada tentativa guarda o próprio log; o <etapa>.log fica sempre com a última.
      const logN = path.join(ctx.dirEv, `${nomeDeLog(e.nome)}.tentativa-${n}.log`);
      fs.copyFileSync(logAbs, logN);
      t.log = path.relative(ctx.raiz, logN);
    }
    if (!repetir) break;
  }
  const out = base(
    e,
    comDeps({
      status,
      origem: r.ci ? 'ci' : 'execucao',
      motivo: r.ci && r.motivo ? r.motivo : tentativas.length > 1 ? `${motivo}; repetida por carga (${tentativas[0].motivoCarga})` : motivo,
      exit: r.exit,
      duracaoMs: tentativas.reduce((a, t) => a + t.duracaoMs, 0),
      log: logRel,
      resumoFalha: status === 'ok' ? undefined : r.ci ? r.resumoFalha || ultimasLinhas(r.saida, 40) : ultimasLinhas(r.saida, 40),
    })
  );
  if (r.ci) {
    out.ci = r.ci.resumo || r.ci;
    if (r.classe) out.classe = r.classe;
    // Erro de config do CI (permissão de push, input do workflow, hook): finding gate/config, decisão do humano.
    if (r.erroConfig) out.erroConfig = r.erroConfig;
  }
  if (teto !== (Number(ctx.timeoutPadrao) || 900)) out.timeoutSegundos = teto;
  if (vaga?.numero != null) out.vaga = vaga.numero;
  if (carga) {
    out.porCarga = true;
    out.motivoCarga = carga;
  }
  if (tentativas.length > 1) out.tentativas = tentativas;
  return out;
}

/** Argumento de shell entre aspas simples (para {arquivo}/{arquivos} nos comandos do config). */
export function aspasShell(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}
