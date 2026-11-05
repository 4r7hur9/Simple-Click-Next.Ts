// Medição de consumo de tokens a partir do transcript da sessão do Claude Code.
//
// "Tokens efetivos" = input + cache_creation + output + 10% de cache_read.
// A leitura de cache custa ~10% do input normal; contá-la cheia inflaria o
// número sem refletir custo. O formato do transcript é interno do Claude Code
// e pode mudar: a leitura é tolerante e, se nada for encontrado, retorna 0
// (os limites externos — --max-budget-usd no CI e o limite de iterações —
// continuam valendo).

import fs from 'node:fs';
import path from 'node:path';
import { caminhos, lerJSON, gravarJSON, existe, agoraISO } from './core.mjs';

function arquivosDoTranscript(transcriptPath) {
  const arquivos = [];
  if (!transcriptPath || !existe(transcriptPath)) return arquivos;
  arquivos.push(transcriptPath);
  // Transcripts de subagentes, quando gravados à parte:
  // <dir>/<session-id>/subagents/*.jsonl
  const semExt = transcriptPath.replace(/\.jsonl$/, '');
  for (const dir of [path.join(semExt, 'subagents'), path.join(path.dirname(transcriptPath), 'subagents')]) {
    try {
      for (const f of fs.readdirSync(dir)) if (f.endsWith('.jsonl')) arquivos.push(path.join(dir, f));
    } catch {
      /* não existe */
    }
  }
  return arquivos;
}

export function tokensDoTranscript(transcriptPath, desdeISO) {
  const desde = desdeISO ? Date.parse(desdeISO) : 0;
  const porMensagem = new Map();
  let semId = 0;
  for (const arquivo of arquivosDoTranscript(transcriptPath)) {
    let conteudo;
    try {
      conteudo = fs.readFileSync(arquivo, 'utf8');
    } catch {
      continue;
    }
    for (const linha of conteudo.split('\n')) {
      if (!linha.includes('usage')) continue;
      let obj;
      try {
        obj = JSON.parse(linha);
      } catch {
        continue;
      }
      const msg = obj.message || obj;
      const u = msg && msg.usage;
      if (!u || typeof u !== 'object') continue;
      const ts = obj.timestamp ? Date.parse(obj.timestamp) : NaN;
      if (desde && !Number.isNaN(ts) && ts < desde) continue;
      const valor =
        (u.input_tokens || 0) +
        (u.cache_creation_input_tokens || 0) +
        (u.output_tokens || 0) +
        Math.round((u.cache_read_input_tokens || 0) * 0.1);
      // Mensagens em streaming repetem o mesmo id: fica o último valor.
      const chave = msg.id ? `${arquivo}:${msg.id}` : `sem-id-${semId++}`;
      porMensagem.set(chave, valor);
    }
  }
  let total = 0;
  for (const v of porMensagem.values()) total += v;
  return total;
}

/**
 * Atualiza estado.orcamento com o consumo da sessão atual (lida de
 * runtime/session.json ou do transcriptPath informado) e devolve o total
 * acumulado de todas as sessões que trabalharam na task.
 */
export function atualizarOrcamento(raiz, estado, { transcriptPath, sessionId } = {}) {
  const c = caminhos(raiz);
  const sessao = lerJSON(c.sessao, {});
  const tp = transcriptPath || sessao.transcript_path;
  const sid = sessionId || sessao.session_id || 'desconhecida';
  if (tp) {
    const tokens = tokensDoTranscript(tp, estado.criadoEm);
    estado.orcamento = estado.orcamento || { sessoes: {} };
    estado.orcamento.sessoes = estado.orcamento.sessoes || {};
    // Nunca diminui (um transcript compactado não "devolve" orçamento).
    estado.orcamento.sessoes[sid] = Math.max(estado.orcamento.sessoes[sid] || 0, tokens);
  }
  const total = Object.values(estado.orcamento?.sessoes || {}).reduce((a, b) => a + b, 0);
  estado.orcamento.tokensUsados = total;
  estado.orcamento.atualizadoEm = agoraISO();
  return total;
}

export function registrarSessao(raiz, entrada) {
  if (!entrada || !entrada.session_id) return;
  const c = caminhos(raiz);
  const atual = lerJSON(c.sessao, {});
  const novo = {
    ...atual,
    session_id: entrada.session_id,
    transcript_path: entrada.transcript_path || atual.transcript_path,
    atualizadoEm: agoraISO(),
  };
  if (atual.session_id !== novo.session_id || atual.transcript_path !== novo.transcript_path) {
    gravarJSON(c.sessao, novo);
  }
}
