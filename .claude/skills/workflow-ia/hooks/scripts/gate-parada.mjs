#!/usr/bin/env node
// Stop: o agente só pode encerrar a sessão quando a task ativa terminou de
// verdade — veredito definido, relatório escrito e "wf encerrar" executado —
// ou quando o humano pausou a task. Enquanto isso, devolve o agente ao
// pipeline com o próximo passo. Para não virar loop infinito, depois de
// N bloqueios seguidos sem nenhum progresso no estado, libera a parada.

import fs from 'node:fs';
import path from 'node:path';
import { contexto } from './_comum.mjs';
import { caminhos, lerJSON, gravarJSON, gravarEstado, lerEstado, comLock, gitHead, agoraISO, subagentesEmAndamento } from '../../scripts/lib/core.mjs';
import { atualizarOrcamento } from '../../scripts/lib/orcamento.mjs';
import { proximoPasso, avaliarLimites } from '../../scripts/lib/fluxo.mjs';
import { perguntaEmitida } from '../../scripts/lib/decisoes.mjs';

const { entrada, raiz, config, estado } = contexto();
if (!estado || estado.fase === 'encerrada' || estado.pausada || estado.modo === 'revisao') process.exit(0);
// Decisão humana já perguntada: a vez é do humano (ele responde ou volta depois com /workflow-ia:retomar).
if (estado.decisaoPendente && perguntaEmitida(raiz, estado)) process.exit(0);

const c = caminhos(raiz, estado.id);
atualizarOrcamento(raiz, estado, { transcriptPath: entrada.transcript_path, sessionId: entrada.session_id });
// Grava só o orçamento, sob o lock e sobre o estado relido (a CLI pode ter mudado o resto).
function gravarSoOrcamento(extra = {}) {
  try {
    comLock(
      raiz,
      () => {
        const atual = lerEstado(raiz, estado.id);
        atual.orcamento = atual.orcamento || { sessoes: {} };
        for (const [sid, v] of Object.entries(estado.orcamento?.sessoes || {})) atual.orcamento.sessoes[sid] = Math.max(atual.orcamento.sessoes?.[sid] || 0, v);
        atual.orcamento.tokensUsados = Object.values(atual.orcamento.sessoes).reduce((a, b) => a + b, 0);
        atual.orcamento.atualizadoEm = agoraISO();
        Object.assign(atual, extra);
        gravarEstado(raiz, atual);
      },
      { esperaMs: 10000 }
    );
  } catch {
    /* melhor esforço */
  }
}
gravarSoOrcamento();

// Subagente disparado em segundo plano ainda rodando: o orquestrador encerrou o turno para esperar a notificação
// de conclusão, que o acorda. Não é parada sem progresso e não conta bloqueio. No CI (claude -p) o orquestrador
// delega em primeiro plano e o processo termina com o turno: ali a parada continua bloqueada como antes.
if (process.env.WORKFLOW_IA_CI !== '1' && subagentesEmAndamento(raiz, estado.id, { esperaMaxMin: config.limites?.esperaSubagenteMin ?? 180 }).length) process.exit(0);

// Assinatura de progresso: muda quando algo relevante acontece.
function mtime(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}
function contarArquivos(dir) {
  let n = 0;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      n += e.isDirectory() ? contarArquivos(path.join(dir, e.name)) : 1;
    }
  } catch {
    /* sem pasta */
  }
  return n;
}
const assinatura = JSON.stringify([
  estado.fase,
  estado.iteracao,
  estado.veredito,
  (estado.iteracoes || []).map((i) => [i.gate, i.triagem, i.correcao]),
  gitHead(raiz),
  mtime(c.findings),
  contarArquivos(c.task),
]);

const guarda = lerJSON(c.guardaParada, {});
const mesmaTask = guarda.task === estado.id;
const semProgresso = mesmaTask && guarda.assinatura === assinatura;
// Já liberado sem progresso desde então: não insiste de novo.
if (semProgresso && guarda.liberadoEm) process.exit(0);
const bloqueios = semProgresso ? (guarda.bloqueios || 0) + 1 : 1;
const maxBloqueios = config.limites?.maxBloqueiosDeParada || 4;

if (bloqueios > maxBloqueios) {
  gravarJSON(c.guardaParada, { task: estado.id, assinatura, bloqueios, liberadoEm: agoraISO() });
  gravarSoOrcamento({ alertaParada: `O agente parou ${maxBloqueios} vezes seguidas sem progresso na fase "${estado.fase}" (${agoraISO()}). Revisão humana necessária.` });
  process.exit(0);
}
gravarJSON(c.guardaParada, { task: estado.id, assinatura, bloqueios, em: agoraISO() });

const lim = avaliarLimites(raiz, estado, config);
const passo = proximoPasso(raiz, estado, config);
const cabecalho = `[Workflow IA] A task ${estado.id} ainda não terminou (fase "${estado.fase}", rodada de revisão ${lim.rodadasRevisao}/${lim.maxIteracoes}, ${lim.tokens.toLocaleString('pt-BR')} tokens).`;
const regra =
  'A execução é autônoma: não pare para pedir confirmação. A task só termina com veredito (CONCLUIDA com provas, BLOQUEADA ou INTERROMPIDA), report.md escrito e ".workflow-ia/wf encerrar". Se for impossível avançar sem o humano, aplique a skill politica-autonomia: veredito BLOQUEADA com o motivo e "wf decisao pedir" para perguntar a ele (AskUserQuestion).';
const reason = `${cabecalho}\nPróximo passo: ${passo.instrucao}\n${regra}\n(Aviso ${bloqueios}/${maxBloqueios} desta parada sem progresso.)`;

process.stdout.write(JSON.stringify({ decision: 'block', reason }));
process.exit(0);
