// Vagas de recurso da máquina (semáforo entre tasks): várias tasks numa mesma máquina disputam CPU, memória e
// bancos de teste. Uma etapa pesada do gate só roda com uma vaga; quem chega espera numa fila justa (ordem de
// chegada). Tudo em arquivos num diretório compartilhado (recursos.dir), sem serviço:
//  - vaga N = diretório vaga-N criado com mkdir (atômico) + dono.json { task, raiz, pid, em, token, grupos };
//  - fila = um arquivo por pedido em fila/, nome ordenável pela hora de chegada (gravado em tmp + rename);
//  - dono com pid morto (kill -9, máquina reiniciada) = vaga livre. Quem chega recupera sob uma trava por
//    identidade do dono morto (mkdir vaga-N.rec-<hash>): relê o dono.json e só apaga se ainda for o mesmo morto,
//    matando antes os grupos de processos das etapas que ele deixou rodando.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { agoraISO, expandirHome } from './core.mjs';

export const DIR_VAGAS_PADRAO = '/tmp/workflow-ia-vagas';

export function vagasAtivas(config) {
  return Number(config?.recursos?.vagasPesadas) > 0;
}

export function dirVagas(config) {
  return path.resolve(expandirHome(config?.recursos?.dir || DIR_VAGAS_PADRAO));
}

export function pidVivo(pid) {
  if (!(Number(pid) > 0)) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function lerJSONSeguro(arquivo) {
  try {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch {
    return null;
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const aleatorio = () => crypto.randomBytes(8).toString('hex');
const hashCurto = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
const SEM_DONO_MS = 30000;
const TRAVA_VELHA_MS = 10 * 60000;

/** Grava JSON de forma atômica (tmp + rename): quem lê nunca vê o arquivo pela metade. */
function gravarAtomico(arquivo, dados) {
  const tmp = `${arquivo}.tmp-${process.pid}-${aleatorio()}`;
  fs.writeFileSync(tmp, JSON.stringify(dados) + '\n');
  fs.renameSync(tmp, arquivo);
}

/** Identidade de um dono (nunca se repete): o token; donos antigos, pid + hora; sem dono, inode + mtime do diretório. */
function identidadeDe(dono, st) {
  if (dono) return dono.token ? `t-${dono.token}` : `p-${dono.pid}-${dono.em}`;
  return `i-${st.ino}-${Math.round(st.mtimeMs)}`;
}

/** Situação de uma vaga: livre, ocupada (com dono vivo) ou abandonada (dono morto ou sem dono há muito tempo). */
function situacaoVaga(dir, n) {
  const d = path.join(dir, `vaga-${n}`);
  let st;
  try {
    st = fs.statSync(d);
  } catch {
    return { numero: n, livre: true };
  }
  const dono = lerJSONSeguro(path.join(d, 'dono.json'));
  if (!dono) {
    // Entre o mkdir e a gravação do dono.json: ocupada por alguns instantes; sem dono por 30 s = abandonada.
    return Date.now() - st.mtimeMs > SEM_DONO_MS ? { numero: n, livre: false, abandonada: true, identidade: identidadeDe(null, st) } : { numero: n, livre: false, dono: null };
  }
  return pidVivo(dono.pid) ? { numero: n, livre: false, dono } : { numero: n, livre: false, abandonada: true, dono, identidade: identidadeDe(dono, st) };
}

/** Mata os grupos de processos que um dono morto deixou rodando (etapas pesadas órfãs, ainda com o WF_VAGA dele). */
function matarGrupos(dono) {
  if (process.platform === 'win32') return;
  for (const pg of Array.isArray(dono?.grupos) ? dono.grupos : []) {
    if (!(Number(pg) > 1)) continue;
    try {
      process.kill(-Number(pg), 'SIGKILL');
    } catch {
      /* o grupo já terminou */
    }
  }
}

/**
 * Recupera uma vaga abandonada sem corrida. A trava é por identidade do dono morto (mkdir vaga-N.rec-<hash>):
 * entre vários que viram o mesmo morto, só um vence; ele relê o dono.json e só apaga se a vaga ainda for desse
 * morto. Quem leu um dono antigo perde o mkdir ou, se a trava já sumiu, relê e vê outro dono: não faz nada (uma
 * identidade nunca volta). A trava fica no lugar; se quem a ganhou morreu no meio, a trava seguinte deriva da
 * identidade dele, então nunca há trava "velha" a quebrar.
 */
function recuperar(dir, n, identidade) {
  const d = path.join(dir, `vaga-${n}`);
  let chave = identidade;
  for (let nivel = 0; nivel < 8; nivel += 1) {
    const trava = path.join(dir, `vaga-${n}.rec-${hashCurto(chave)}`);
    try {
      fs.mkdirSync(trava);
    } catch (e) {
      if (e.code !== 'EEXIST') return false;
      const quem = lerJSONSeguro(path.join(trava, 'dono.json'));
      if (quem && pidVivo(quem.pid)) return false; // recuperação em andamento por outro processo
      let st;
      try {
        st = fs.statSync(trava);
      } catch {
        return false; // a trava sumiu (limpeza): tenta de novo na próxima passada
      }
      if (!quem && Date.now() - st.mtimeMs < SEM_DONO_MS) return false;
      chave = `${chave}|${quem ? identidadeDe(quem, st) : identidadeDe(null, st)}`;
      continue;
    }
    try {
      gravarAtomico(path.join(trava, 'dono.json'), { pid: process.pid, em: agoraISO(), token: aleatorio() });
    } catch {
      /* a trava continua valendo pelo mkdir */
    }
    const s = situacaoVaga(dir, n);
    if (!s.abandonada || s.identidade !== identidade) return false;
    matarGrupos(s.dono);
    const lixo = `${d}.morta-${process.pid}-${aleatorio()}`;
    try {
      fs.renameSync(d, lixo);
    } catch {
      return false;
    }
    fs.rmSync(lixo, { recursive: true, force: true });
    return true;
  }
  return false;
}

/** Travas de recuperação e restos de vagas apagadas com mais de 10 min (seguro: a identidade de um dono não volta). */
function limparRestos(dir) {
  let nomes = [];
  try {
    nomes = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const nome of nomes) {
    if (!/^vaga-\d+\.(?:rec|morta)-/.test(nome)) continue;
    const p = path.join(dir, nome);
    try {
      if (Date.now() - fs.statSync(p).mtimeMs < TRAVA_VELHA_MS) continue;
      const quem = lerJSONSeguro(path.join(p, 'dono.json'));
      if (nome.includes('.rec-') && quem && pidVivo(quem.pid)) continue;
      fs.rmSync(p, { recursive: true, force: true });
    } catch {
      /* outro já limpou */
    }
  }
}

/** Só para os testes de corrida (leitura antiga seguida de recuperação). */
export const _internos = { situacaoVaga, recuperar };

/** Reserva de vez deixada pelo "wf aguardar-vaga": vale até reservaAte, sem pid. */
const reservaValida = (p) => !!p?.reservaAte && Date.parse(p.reservaAte) > Date.now();

function lerFila(dir) {
  const f = path.join(dir, 'fila');
  let nomes = [];
  try {
    nomes = fs.readdirSync(f).filter((x) => x.endsWith('.json')).sort();
  } catch {
    return [];
  }
  const vivos = [];
  for (const nome of nomes) {
    const arq = path.join(f, nome);
    const p = lerJSONSeguro(arq);
    if (!p) {
      // Ilegível: pedido sendo gravado agora (não apaga) ou lixo antigo (apaga).
      try {
        if (Date.now() - fs.statSync(arq).mtimeMs > SEM_DONO_MS) fs.unlinkSync(arq);
      } catch {
        /* outro já limpou */
      }
      continue;
    }
    if (!pidVivo(p.pid) && !reservaValida(p)) {
      // Pedido de processo morto (ou reserva vencida) não segura a fila.
      try {
        fs.unlinkSync(arq);
      } catch {
        /* outro já limpou */
      }
      continue;
    }
    vivos.push({ ...p, arquivo: arq });
  }
  return vivos;
}

/** Quem está em cada vaga e quem espera (para "wf vagas"). */
export function listarVagas(config) {
  const dir = dirVagas(config);
  const total = Number(config?.recursos?.vagasPesadas) || 0;
  const vagas = [];
  for (let n = 1; n <= total; n += 1) {
    const s = situacaoVaga(dir, n);
    vagas.push({ numero: n, livre: s.livre || !!s.abandonada, dono: s.abandonada ? null : s.dono || null });
  }
  const fila = lerFila(dir).map(({ arquivo, ...p }, i) => ({ posicao: i + 1, ...p }));
  return { ativas: total > 0, vagasPesadas: total, dir, vagas, fila };
}

/**
 * Reserva de vaga de um processo (um gate, um RED). pegar() espera na fila justa e devolve { numero } ou
 * { erro } se a espera passar de esperaMaxMin; a vaga fica com o processo até soltar() (ou até ele morrer).
 * Pedir de novo devolve a mesma vaga: a task não perde a vez entre etapas do mesmo gate.
 */
export function criarReservaVaga(config, { task = null, raiz = null, pid = process.pid, intervaloMs = 500 } = {}) {
  const dir = dirVagas(config);
  const total = Number(config?.recursos?.vagasPesadas) || 0;
  const esperaPadraoMin = Number(config?.recursos?.esperaMaxMin) || 120;
  const reservaSegundos = Number(config?.recursos?.reservaSegundos) >= 0 ? Number(config.recursos.reservaSegundos) : 300;
  let numero = null;
  let pedido = null;
  let token = null;
  const grupos = new Set();

  const sairDaFila = () => {
    if (!pedido) return;
    try {
      fs.unlinkSync(pedido);
    } catch {
      /* já saiu */
    }
    pedido = null;
  };

  const soltar = () => {
    sairDaFila();
    if (numero === null) return;
    const d = path.join(dir, `vaga-${numero}`);
    const dono = lerJSONSeguro(path.join(d, 'dono.json'));
    // Só apaga a vaga que é deste processo (pelo token: um pid reaproveitado não confunde).
    if (dono && Number(dono.pid) === pid && (!dono.token || dono.token === token)) fs.rmSync(d, { recursive: true, force: true });
    numero = null;
    token = null;
    grupos.clear();
  };
  process.once('exit', soltar);

  const gravarDono = () => {
    if (numero === null) return;
    const arq = path.join(dir, `vaga-${numero}`, 'dono.json');
    const dono = lerJSONSeguro(arq);
    if (!dono || dono.token !== token) return;
    try {
      gravarAtomico(arq, { ...dono, grupos: [...grupos] });
    } catch {
      /* melhor esforço */
    }
  };

  const entrarNaFila = () => {
    fs.mkdirSync(path.join(dir, 'fila'), { recursive: true });
    const chave = `${String(Date.now()).padStart(15, '0')}-${process.hrtime.bigint().toString().padStart(20, '0')}-${pid}`;
    pedido = path.join(dir, 'fila', `${chave}.json`);
    gravarAtomico(pedido, { task, raiz, pid, em: agoraISO() });
  };

  /** Adota a reserva de vez que o "wf aguardar-vaga" desta task deixou na fila (mantém a posição). */
  const adotarReserva = () => {
    if (!task) return false;
    const f = path.join(dir, 'fila');
    let nomes = [];
    try {
      nomes = fs.readdirSync(f).filter((x) => x.endsWith('.json')).sort();
    } catch {
      return false;
    }
    for (const nome of nomes) {
      const arq = path.join(f, nome);
      const p = lerJSONSeguro(arq);
      if (!p || p.pid || !reservaValida(p) || p.task !== task || p.raiz !== raiz) continue;
      // O rename é atômico: entre dois processos da mesma task, só um adota.
      const adotando = `${arq}.adotando-${pid}`;
      try {
        fs.renameSync(arq, adotando);
      } catch {
        continue;
      }
      try {
        gravarAtomico(arq, { task, raiz, pid, em: p.em || agoraISO(), adotouReserva: true });
        fs.rmSync(adotando, { force: true });
      } catch {
        continue;
      }
      pedido = arq;
      return true;
    }
    return false;
  };

  /** Uma passada: devolve a vaga livre que cabe a este pedido agora (pela posição na fila), ou null. */
  const tentar = (tomar) => {
    const livres = [];
    for (let n = 1; n <= total; n += 1) {
      let s = situacaoVaga(dir, n);
      if (s.abandonada && recuperar(dir, n, s.identidade)) s = situacaoVaga(dir, n);
      if (s.livre) livres.push(n);
    }
    const fila = lerFila(dir);
    const pos = fila.findIndex((p) => p.arquivo === pedido);
    if (pos < 0) entrarNaFila();
    if (pos < 0 || pos >= livres.length) return null;
    if (!tomar) return livres[0];
    for (const n of livres) {
      const d = path.join(dir, `vaga-${n}`);
      try {
        fs.mkdirSync(d);
      } catch {
        continue;
      }
      token = aleatorio();
      gravarAtomico(path.join(d, 'dono.json'), { task, raiz, pid, em: agoraISO(), token });
      return n;
    }
    return null;
  };

  /** Sem tomar a vaga ("wf aguardar-vaga"): o pedido vira reserva de vez para o próximo gate desta task. */
  const reservarVez = () => {
    if (!pedido || !task || reservaSegundos <= 0) return null;
    const ate = new Date(Date.now() + reservaSegundos * 1000).toISOString();
    try {
      const atual = lerJSONSeguro(pedido) || {};
      gravarAtomico(pedido, { task, raiz, pid: null, em: atual.em || agoraISO(), reservaAte: ate });
    } catch {
      return null;
    }
    pedido = null; // não sai da fila ao terminar: a reserva vale até reservaAte
    return ate;
  };

  const esperar = async ({ tomar, esperaMaxMin }) => {
    if (total <= 0) return { numero: null, esperouMs: 0 };
    if (tomar && numero !== null) return { numero, esperouMs: 0 };
    fs.mkdirSync(dir, { recursive: true });
    limparRestos(dir);
    const inicio = Date.now();
    const limite = inicio + (Number(esperaMaxMin) || esperaPadraoMin) * 60000;
    if (!adotarReserva()) entrarNaFila();
    for (;;) {
      const n = tentar(tomar);
      if (n !== null) {
        if (tomar) {
          sairDaFila();
          numero = n;
          return { numero: n, esperouMs: Date.now() - inicio };
        }
        const reservaAte = reservarVez();
        if (!reservaAte) sairDaFila();
        return { numero: n, esperouMs: Date.now() - inicio, reservaAte };
      }
      if (Date.now() > limite) {
        sairDaFila();
        return { erro: `Sem vaga de recurso em ${Math.round((Date.now() - inicio) / 60000)} min (recursos.vagasPesadas=${total}, ${dir}). Veja quem está nas vagas com "wf vagas".` };
      }
      await dormir(intervaloMs);
    }
  };

  return {
    pegar: (opts = {}) => esperar({ ...opts, tomar: true }),
    /**
     * Espera chegar a vez na fila e sai sem segurar a vaga; a vez fica reservada (reservaAte, recursos.reservaSegundos)
     * para o próximo pegar() desta task, que adota o pedido sem perder a posição.
     */
    aguardar: (opts = {}) => esperar({ ...opts, tomar: false }),
    soltar,
    /** Grupo de processos de uma etapa que roda com a vaga: se este processo morrer, quem recuperar a vaga o mata. */
    registrarGrupo: (pg) => {
      if (!(Number(pg) > 1) || numero === null) return;
      grupos.add(Number(pg));
      gravarDono();
    },
    removerGrupo: (pg) => {
      if (!grupos.delete(Number(pg))) return;
      gravarDono();
    },
    get numero() {
      return numero;
    },
  };
}
