#!/usr/bin/env node
// wf — CLI do Workflow IA. Guarda o estado da task, roda o gate, registra
// findings, controla o loop (rodadas de code review) e só aceita "CONCLUIDA" com provas.
//
// Uso (dentro do projeto): .workflow-ia/wf <comando> [...]
// Rode ".workflow-ia/wf ajuda" para a lista de comandos.

import fs from 'node:fs';
import path from 'node:path';
import {
  acharRaizProjeto,
  caminhos,
  carregarConfig,
  idTaskAtiva,
  definirTaskAtiva,
  validarIdTask,
  estadoInicial,
  lerEstado,
  gravarEstado,
  gravarJSON,
  lerJSON,
  existe,
  saida,
  falha,
  limitesDaTask,
  slugify,
  gitBranchAtual,
  gitHead,
  gitLimpo,
  git,
  resolverComando,
  FASES,
  CONFIG_PADRAO,
  comLock,
  lerRegistro,
  lerSubagentes,
  marcarRegistro,
  agoraISO,
  realpathParcial,
  refBase,
  baseDaTask,
  refSegura,
  shaDaRef,
} from './lib/core.mjs';
import { atualizarOrcamento } from './lib/orcamento.mjs';
import { checar } from './lib/checar.mjs';
import { listarVagas, vagasAtivas, criarReservaVaga } from './lib/vagas.mjs';
import { avaliarAmbiente, gravarAmbiente, bloquearPorAmbiente, hooksAtivos, exigirAmbiente, PREFIXO_NATIVO, iniciarBatimentoWf } from './lib/ambiente.mjs';
import { exportarAgentes, serializarAgentes } from './lib/hosts.mjs';
import { verificarGitHook } from './lib/githooks.mjs';
import { estadoDasCopias, PASTA_EMBUTIDA } from './lib/embutir.mjs';
import { mesclar, alterarStatus, lerFindings, resumoFindings, validarItem, ABERTOS, prefixo, REVISOR_POR_PREFIXO } from './lib/findings.mjs';
import { rodarGate, aplicarGate, registrarRed, diffTestes, matrizRastreabilidade, metaDoSpec, criteriosDoSpec, hashSpec, specIntegro } from './lib/provas.mjs';
import { problemasDependencias } from './lib/gate.mjs';
import { planoCI, planoDasEtapas, conferirPreVoo, appsAlterados, validarConfigCI, lerUltimoCi, repoDoRemoto, PROVEDORES, NOME_TESTE_CI } from './lib/ci.mjs';
import { gerarProposta, gravarProposta, diffCI, PASTA_PROPOSTA } from './lib/ci-gerar.mjs';
import { criterioDe, avisosConteudo } from './lib/ci-conteudo.mjs';
import { prepararCache, decidirEtapa, expandirSelecao, problemasConfigCache, avisosConfigCache, etapasSemInsumos, pendenciasDoGate } from './lib/gate-cache.mjs';
import {
  mudarFase,
  avaliarLimites,
  novaIteracao,
  iteracaoAtual,
  revisoresAfetados,
  relatoriosAntigos,
  proximoPasso,
  verificarLimpo,
  registrarVerificacao,
  congelarSpec,
  construirManifest,
  definirVeredito,
  encerrar,
} from './lib/fluxo.mjs';
import { pedirDecisao, aplicarDecisao, perguntaEmitida, respostasAtestadas, faseDoBloqueio, atestarPedidoAjuste } from './lib/decisoes.mjs';
import { abrirAjuste, registrarClassificacao, cancelarAjuste, resumoAjustes, conferirSpecDoAjuste } from './lib/ajustes.mjs';

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------
function parse(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) flags[a.slice(2, eq)] = a.slice(eq + 1);
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) flags[a.slice(2)] = argv[++i];
      else flags[a.slice(2)] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

process.on('uncaughtException', (err) => {
  process.stdout.write(JSON.stringify({ ok: false, mensagem: err.message }, null, 2) + '\n');
  process.exit(1);
});

const { pos, flags } = parse(process.argv.slice(2));
const cmd = pos[0] || 'ajuda';

// Comandos que só o humano roda, no terminal dele. Dentro de uma sessão do
// Claude Code (o Bash do agente herda CLAUDECODE/CLAUDE_CODE_*), recusa — além
// do hook guarda-bash, que nega o comando antes de ele rodar.
const dentroDoClaudeCode = !!(process.env.CLAUDECODE || process.env.CLAUDE_CODE_ENTRYPOINT || process.env.CLAUDE_CODE_SESSION_ID);
// Quem chama é um agente (sessão do Claude Code/SDK ou CI)? Humano no terminal não é afetado pelas guardas de agente.
const chamadorEhAgente = dentroDoClaudeCode || process.env.WORKFLOW_IA_CI === '1';
function soHumano(descricao) {
  if (dentroDoClaudeCode) {
    process.stdout.write(JSON.stringify({ ok: false, mensagem: `${descricao} é decisão humana: rode no seu terminal, fora do Claude Code.` }, null, 2) + '\n');
    process.exit(1);
  }
}
if (cmd === 'spec' && pos[1] === 'recongelar') soHumano('"wf spec recongelar"');
if (cmd === 'red' && flags.refazer) soHumano('"wf red --refazer"');
if (cmd === 'ci' && pos[1] === 'ativar' && flags.aplicar) soHumano('"wf ci ativar --aplicar" (grava o config.json)');

const AJUDA = `wf — CLI do Workflow IA

Task
  init-task <ID> [--titulo "..."] [--modo task|revisao] [--fonte notion|linear|github|jira|texto] [--card-url URL] [--substituir-ativa] [--nova-execucao]
              [--base <branch>]  base da task (cadeia de branches): diff, gate ({base}/WF_BASE), RED e revisores comparam com ela
  base [<branch> --motivo "..."]  mostra ou troca a base da task (ex.: a branch-mãe foi mergeada); registra em decisoes.md
  ativar <ID> [--substituir-ativa]  torna a task ativa (retomada); recusa se outra task não encerrada estiver ativa
  status                      resumo da task ativa
  proximo                     próximo passo recomendado pela máquina de estados
  fase <fase>                 muda de fase (${FASES.join(' → ')}), checando pré-requisitos
  meta k=v [k=v...]           complexidade=P|M|G risco=baixo|medio|alto ui=sim|nao branch=<nome> tipo=feat|fix|refactor|chore
  meta --do-spec              lê Complexidade/Risco/UI do topo do spec.md
  branch-sugerido             nome de branch a partir do ID e do título
  pausar | retomar            pausa/retoma a execução autônoma

Modo CI (0.7.0, desligado por padrão)
  ci status [--fase f]        ativo?, plano por etapa (local|CI), apps, pré-voo (git, gh, workflow) e último run
  ci plano [--fase f]         só o plano: onde cada etapa roda na fase
  ci gerar                    proposta do workflow em .workflow-ia/ci/ (yml, patch do config, LEIA-ME); nunca em .github/
  ci ativar [--aplicar]       diff do config e passos do humano; --aplicar (só humano) grava o bloco ci
                              env: WF_GATE_CI=1 força o CI em qualquer fase; WF_GATE_CI_FALLBACK=local roda tudo na máquina

Provas
  red [--aceitar-verde "motivo"] [--aceitar-erro-carga "motivo"] [--sem-e2e] [--completo]
                              roda os testes (precisam FALHAR na asserção) e grava baseline; só na fase testes, uma vez.
                              Focado: só os arquivos de teste da task (comandos.testeArquivos/testeArquivo); --completo roda tudo
  spec status                 critérios congelados e se o spec.md mudou
  gate [--etapas a,b] [--rotulo nome]           gate determinístico; falhas viram findings urgentes
       [--sem-cache] [--so-falhas]              no loop é incremental (reaproveita etapas cujos insumos não mudaram);
                                                --sem-cache roda tudo; --so-falhas roda só as que falharam e as
                                                invalidadas pelo diff; --etapas roda só as pedidas (no loop, as demais vêm
                                                do cache). Os dois contam como gate da iteração se o cache cobre o resto
  testes-diff                                   compara testes com o baseline (enfraquecimento)
  matriz                                        critério de aceite -> testes marcados com [CA-n]
  verificar-limpo                               gate completo em checkout limpo + insumos do verificador
  verificacao registrar <julgamento.json>       registra o julgamento do verificador-final
  manifest                                      Definition of Done com as provas
  veredito CONCLUIDA|BLOQUEADA|INTERROMPIDA [--motivo "..."]
  encerrar                                      exige report.md (e pr.md quando CONCLUIDA)
  spec aceitar-ajuste                           recongela o spec uma vez, se o humano escolheu "ajustar o spec" numa decisão

Ajuste pós-entrega (o humano testou uma task CONCLUIDA e quer ajustes: a mesma task volta, no mesmo branch)
  ajuste abrir <ID> --texto "<o que o humano viu>"
                              reabre a task CONCLUIDA (arquiva a entrega anterior; exige o branch da task, limpo e não mergeado;
                              o agente só abre com o "/workflow-ia:ajustar <ID> <texto>" do humano registrado na sessão)
  ajuste registrar <ajustes/A-n.json>
                              análise do spec-analyst: só correções seguem para o plano; mudanças pedem decisão humana
  ajuste cancelar             desiste do ajuste antes de qualquer mudança: a entrega anterior volta a valer
  ajuste status               ajuste atual, ajustes anteriores e histórico de entregas

Decisão humana (a task parou por algo que só o humano decide: o agente pergunta e a mesma task continua)
  decisao pedir [--contexto perguntas.json] [--recomendar <opção>] [--retomada]
                              depois do veredito BLOQUEADA/INTERROMPIDA: registra a decisão H-n e devolve as perguntas
                              exatas para o AskUserQuestion ("Como seguir?" e seus efeitos vêm da CLI, pelo código do motivo)
  decisao aplicar             aplica a resposta do humano atestada pelos hooks e pelo transcript; "continuar" reabre a task
  decisao status              decisão pendente, perguntas e decisões já tomadas

Loop
  iteracao nova | iteracao fechar  uma iteração = uma rodada de code review (máx. 5); "wf gate" pode rodar
                                    várias vezes dentro dela até ficar verde, sem gastar iteração
  limites | tokens | revisores      tokens: consumo medido da task (informativo; não há teto)
  findings merge <arquivo.json> [--revisados seguranca,performance,qualidade,testes,operacao] [--por triager]
  findings status <F-001> corrigido|falso-positivo|divida-tecnica [--motivo] [--commit] [--ref] [--nota]
  findings listar [--abertos] [--bloqueantes] [--status s] [--severidade s]
  findings resumo
  checar [arquivos...] [--pesado]   checagem estreita antes do gate (lint dos arquivos, typecheck do app, testes
                                    relacionados); sem arquivos = alterações não commitadas. Não é gate nem prova

Vagas de recurso (recursos.vagasPesadas: etapas "pesada" disputam vagas da máquina numa fila justa)
  vagas                       quem está em cada vaga e quem espera na fila
  aguardar-vaga [--max-min N] espera a vez desta task na fila (sem polling); não segura a vaga, mas reserva a vez
                              para o próximo gate da task por recursos.reservaSegundos (padrão 300)

Diagnóstico
  doctor                      confere config, git, comandos e (seção host) hooks e agentes
  ambiente [--agentes-visiveis a,b,c | --sdk-init arq.json]
                              F0: o host sustenta o pipeline? (hooks vivos + os 13 subagentes); grava runtime/ambiente.json
  ambiente --bloquear <ID> [--titulo "..."]
                              ambiente reprovado: cria a task já BLOQUEADA (AMBIENTE:) para o relatório; nada de F1

Git hooks (instalados pelo instalador; não rode à mão)
  githook pre-commit|pre-push  bloqueia commit/push em branch protegido (agente ou task aberta) e confere segredos

Hosts (Agent SDK)
  exportar-agentes --formato sdk|mjs [--saida arq] [--prefixo workflow-ia:]
                              os 13 papéis (agents/*.md) no formato "agents" do Claude Agent SDK, para um host registrar
                              os mesmos nomes (funciona fora de um projeto; veja docs/hosts/rmcode.md)

Só para o humano (no terminal, fora do Claude Code; os hooks negam ao agente)
  spec recongelar             aceita a versão atual do spec.md como Definition of Done
  red --refazer               refaz o RED e o baseline de testes

Opções globais: --projeto <raiz>  --task <ID>`;

// ---------------------------------------------------------------------------
// Contexto
// ---------------------------------------------------------------------------
const raiz = flags.projeto ? path.resolve(flags.projeto) : acharRaizProjeto(process.cwd());
if (!raiz && !['ajuda', 'help', '--help', 'exportar-agentes'].includes(cmd)) {
  falha('Workflow IA não está instalado neste projeto (não achei .workflow-ia/config.json). Rode o instalador: node <plugin>/scripts/instalar.mjs <projeto>.');
}
const config = raiz ? carregarConfig(raiz) : CONFIG_PADRAO;

function taskId() {
  const id = flags.task || idTaskAtiva(raiz);
  if (!id) falha('Nenhuma task ativa. Use "wf init-task <ID>" ou "wf ativar <ID>".');
  return id;
}

function comEstado(fn, { gravar = true, orcamento = false } = {}) {
  const id = taskId();
  // Leitura do transcript (pode ser grande) fora do lock; o resto sob o lock.
  let medido = null;
  if (orcamento) {
    const previa = lerEstado(raiz, id);
    atualizarOrcamento(raiz, previa);
    medido = previa.orcamento;
  }
  // Observação: os comandos chamam saida()/falha(), que encerram o processo;
  // quem altera o estado grava explicitamente antes de sair. O lock é
  // liberado no "exit".
  return comLock(raiz, () => {
    const estado = lerEstado(raiz, id);
    if (medido) {
      estado.orcamento = estado.orcamento || { sessoes: {} };
      for (const [sid, v] of Object.entries(medido.sessoes || {})) estado.orcamento.sessoes[sid] = Math.max(estado.orcamento.sessoes?.[sid] || 0, v);
      estado.orcamento.tokensUsados = Object.values(estado.orcamento.sessoes).reduce((a, b) => a + b, 0);
      estado.orcamento.atualizadoEm = medido.atualizadoEm;
      gravarEstado(raiz, estado);
    }
    const r = fn(estado);
    if (gravar) gravarEstado(raiz, estado);
    return r;
  });
}

function lista(v) {
  if (!v || v === true) return [];
  return String(v)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Branch base de uma task (init-task --base, wf base): existe (origin/<b> ou <b>), tem histórico com o HEAD e não
 * esconde os commits da task ({base}..HEAD vazio cegaria gitleaks, revisores, RED e a regra de migration).
 * - Troca ("wf base", no meio da task): os commits da task são os do first-parent desde o merge-base com a base
 *   atual (já validada); a nova base não pode conter nenhum deles nem apontar para o HEAD. A branch-mãe mergeada
 *   na main continua aceita: a main não contém os commits da própria task.
 * - Início (init-task --base): é normal o HEAD estar na base. Aceita git.branchBase, ref ancestral (ou igual) a ela,
 *   ref com origin/<b> e o ramo atual; recusa só o ramo local criado no HEAD para servir de base (a burla).
 */
function validarBase(b, { troca = false, estado = null } = {}) {
  if (!refSegura(b)) return { ok: false, mensagem: `Base inválida: "${b}" (use o nome do branch, ex.: feat/x).` };
  const ref = refBase(raiz, b);
  const sha = shaDaRef(raiz, ref);
  if (!sha) return { ok: false, mensagem: `A base "${b}" não existe (nem origin/${b}). Rode "git fetch" ou confira o nome.` };
  const head = gitHead(raiz);
  if (!head) return { ok: true, ref, sha };
  if (git(raiz, ['merge-base', ref, 'HEAD']).exit !== 0) return { ok: false, mensagem: `A base "${b}" não tem histórico em comum com o HEAD.` };
  const branchBase = config.git.branchBase;
  if (troca) {
    if (sha === head) return { ok: false, mensagem: `A base "${b}" aponta para o próprio HEAD da task: ${ref}..HEAD ficaria vazio e o gate, o RED e os revisores ficariam cegos.` };
    const atual = refBase(raiz, baseDaTask(estado, config));
    const mb = git(raiz, ['merge-base', 'HEAD', atual]);
    if (mb.exit === 0 && mb.out) {
      const daTask = git(raiz, ['rev-list', '--first-parent', 'HEAD', `^${mb.out}`]).out.split('\n').filter(Boolean);
      const naBase = new Set(git(raiz, ['rev-list', ref, `^${mb.out}`]).out.split('\n').filter(Boolean));
      const escondidos = daTask.filter((c) => naBase.has(c));
      if (escondidos.length) {
        return { ok: false, mensagem: `A base "${b}" contém ${escondidos.length} commit(s) da própria task (${escondidos.slice(0, 3).map((c) => c.slice(0, 7)).join(', ')}): eles sumiriam do diff ({base}..HEAD) e o gate, o RED e os revisores ficariam cegos. Use a branch-mãe real ou git.branchBase.` };
      }
    }
    return { ok: true, ref, sha };
  }
  if (b !== branchBase && sha === head && !ref.startsWith('origin/') && gitBranchAtual(raiz) !== b) {
    const ancestralDaBase = git(raiz, ['merge-base', '--is-ancestor', ref, refBase(raiz, branchBase)]).exit === 0;
    if (!ancestralDaBase) return { ok: false, mensagem: `A base "${b}" é um ramo só local criado no próprio HEAD (não é ${branchBase}, nem ancestral dela, nem tem origin/${b}): não serve de base. Use a branch-mãe real (de preferência com push) ou ${branchBase}.` };
  }
  return { ok: true, ref, sha };
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------
// Segunda linha de defesa: sem os hooks ninguém atesta o agent_type (identidade dos subagentes) nem aplica as
// travas de arquivos/git. Um agente só muda estado com os hooks vivos neste instante. Humano no
// terminal não passa por aqui. Ficam de fora: fechar a task de forma negativa (veredito BLOQUEADA/INTERROMPIDA e
// o "encerrar" correspondente), porque é assim que um host sem hooks termina com AMBIENTE: sem conceder nenhuma prova.
const COMANDOS_QUE_MUDAM_ESTADO = new Set(['ativar', 'fase', 'meta', 'pausar', 'retomar', 'red', 'gate', 'iteracao', 'findings', 'verificar-limpo', 'verificacao', 'manifest', 'veredito', 'encerrar', 'spec', 'decisao', 'ajuste', 'base']);
if (raiz && chamadorEhAgente && COMANDOS_QUE_MUDAM_ESTADO.has(cmd) && !(['decisao', 'ajuste'].includes(cmd) && pos[1] === 'status') && !(cmd === 'base' && !pos[1])) {
  const idAtiva = idTaskAtiva(raiz);
  const estadoAtivo = idAtiva ? lerJSON(caminhos(raiz, idAtiva).estado, null) : null;
  const fechamentoNegativo = (cmd === 'veredito' && pos[1] !== 'CONCLUIDA') || (cmd === 'encerrar' && estadoAtivo && ['BLOQUEADA', 'INTERROMPIDA'].includes(estadoAtivo.veredito));
  const h = hooksAtivos(raiz, config);
  const janela = config.host?.janelaBatimentoSegundos ?? 120;
  // Só é "vencido" um carimbo recente (até 30 janelas: 1 h no padrão) da mesma sessão. Carimbo de horas ou dias
  // atrás, de outra sessão, ou renovado pela CLI de outro shell é hooks mortos de fato: AMBIENTE (exit 5).
  const sessaoAtual = process.env.CLAUDE_CODE_SESSION_ID || null;
  const deOutraSessao = !!h.outraSessao || !!(sessaoAtual && h.sessionId && h.sessionId !== sessaoAtual);
  const apenasVencido = h.idadeSegundos !== null && h.idadeSegundos <= janela * 30 && !deOutraSessao;
  if (!h.ativo && !fechamentoNegativo && apenasVencido) {
    // Carimbo vencido (houve hooks, mas o último foi há mais que a janela): quase sempre um "wf" encadeado depois
    // de um comando longo na mesma chamada do Bash. Repetir resolve; não é motivo para fechar a task.
    falha(`Batimento dos hooks vencido: o último carimbo é de ${h.idadeSegundos}s atrás (janela de ${janela}s). Rode qualquer comando numa chamada própria do Bash (ex.: "true") e repita "wf ${cmd}" sozinho, sem encadear depois de um comando longo. Isto NÃO é motivo para fechar a task como BLOQUEADA. Só se o carimbo continuar vencido logo depois de uma chamada nova do Bash os hooks pararam de fato: aí veja "wf ambiente".`, { codigo: 'BATIMENTO_VENCIDO', idadeSegundos: h.idadeSegundos, janelaSegundos: janela });
  }
  if (!h.ativo && !fechamentoNegativo) {
    falha(`AMBIENTE: os hooks do plugin não registraram atividade${h.idadeSegundos === null ? '' : ` (último carimbo há ${h.idadeSegundos}s${deOutraSessao ? ', de outra sessão ou de outro shell' : ''})`}. "wf ${cmd}" muda estado e só roda com os hooks ativos: sem eles ninguém atesta quem grava cada prova. Feche a task com "wf veredito BLOQUEADA --motivo AMBIENTE: ..." e veja "wf ambiente".`, { instrucoes: ['Claude Code CLI: abra uma sessão nova com o plugin habilitado.', 'RM Code/Agent SDK: veja docs/hosts/rmcode.md.'] }, 5);
  }
}

// Comandos longos: a própria CLI renova o batimento dos hooks enquanto roda (só se ele estava válido agora), e
// Ctrl+C/kill encerram pelo caminho normal, para soltar a vaga de recurso e matar as etapas em andamento.
const COMANDOS_LONGOS = new Set(['gate', 'red', 'verificar-limpo', 'checar', 'aguardar-vaga', 'ci']);
if (raiz && COMANDOS_LONGOS.has(cmd)) {
  if (chamadorEhAgente) iniciarBatimentoWf(raiz, config);
  process.once('SIGINT', () => process.exit(130));
  process.once('SIGTERM', () => process.exit(143));
  // Terminal ou sessão fechados: mesmo caminho (solta a vaga e mata as etapas, que não sobrevivem ao wf).
  process.once('SIGHUP', () => process.exit(129));
}

switch (cmd) {
  case 'ajuda':
  case 'help':
  case '--help':
    process.stdout.write(AJUDA + '\n');
    process.exit(0);
    break;

  case 'init-task': {
    const id = validarIdTask(pos[1]);
    if (chamadorEhAgente) {
      // F0: a task só nasce num host que sustenta o pipeline (hooks vivos + os 13 subagentes). Evita descobrir isso na F1.
      const amb = exigirAmbiente(raiz, config);
      if (!amb.ok) {
        falha(`${amb.motivo} Nenhuma task foi criada.`, { instrucoes: amb.instrucoes, proximo: `Registre o bloqueio no F0: wf ambiente --bloquear ${id} --titulo "<título>" (cria a task já BLOQUEADA), escreva report.md e rode "wf encerrar".` }, 5);
      }
    }
    // Tudo sob o lock: registro, arquivamento e criação não podem se intercalar.
    comLock(raiz, () => {
    const c = caminhos(raiz, id);
    let arquivada = null;
    const registro = lerRegistro(raiz)[id];
    if (!existe(c.estado) && registro && !registro.encerradaEm) {
      falha(`A task ${id} foi iniciada em ${registro.criadoEm} e não foi encerrada, mas o estado dela não existe mais. Recriá-la zeraria iterações, consumo medido e provas: é decisão humana (no seu terminal, remova a entrada "${id}" de .workflow-ia/runtime/registro-tasks.json).`);
    }
    if (!existe(c.estado) && existe(c.task) && fs.readdirSync(c.task).length) {
      falha(`A pasta ${path.relative(raiz, c.task)} existe sem state.json. Estado incompleto: decisão humana antes de recriar.`);
    }
    if (existe(c.estado)) {
      const e = lerJSON(c.estado);
      if (e.fase !== 'encerrada') {
        falha(`A task ${id} já existe e não foi encerrada (fase ${e.fase}, status ${e.status}). Para continuar, use "wf ativar ${id}".`, { fase: e.fase, status: e.status });
      }
      // Parou por decisão humana ou limite: o caminho é desbloquear (mesma task, nada refeito), não recomeçar do zero.
      if (['BLOQUEADA', 'INTERROMPIDA'].includes(e.veredito) && !flags['nova-execucao']) {
        falha(`A task ${id} terminou ${e.veredito} na fase "${faseDoBloqueio(e)}" (${e.motivo || 'sem motivo'}). Para continuar de onde parou, sem refazer spec e plano: /workflow-ia:retomar ${id} (o agente pergunta o que você decide e retoma). Para recomeçar do zero, passe --nova-execucao.`, { veredito: e.veredito, fase: faseDoBloqueio(e) });
      }
      // Entregue: ajustes depois do teste do humano continuam a MESMA task, no mesmo branch. Recomeçar do zero é explícito.
      if (e.veredito === 'CONCLUIDA' && !flags['nova-execucao']) {
        falha(`A task ${id} já foi entregue (CONCLUIDA no branch ${e.meta?.branch || '?'}). Para ajustar o que você viu testando, sem refazer nada: /workflow-ia:ajustar ${id} "<o que você viu>" (mesma task, mesmo branch). Para recomeçar o card do zero, passe --nova-execucao.`, { veredito: e.veredito, branch: e.meta?.branch || null });
      }
      // Nova execução do mesmo card: arquiva a execução anterior.
      arquivada = `${c.task}@${(e.encerradaEm || new Date().toISOString()).replace(/[:.]/g, '-')}`;
      fs.renameSync(c.task, arquivada);
    }
    const ativa = idTaskAtiva(raiz);
    if (ativa && ativa !== id) {
      const e = lerJSON(caminhos(raiz, ativa).estado, null);
      if (e && e.fase !== 'encerrada' && !flags['substituir-ativa']) {
        falha(`Já existe uma task ativa não encerrada (${ativa}, fase ${e.fase}). Encerre-a antes ou passe --substituir-ativa (ela continua salva e pode ser reativada com "wf ativar ${ativa}").`);
      }
    }
    const estado = estadoInicial(id, flags.titulo === true ? '' : flags.titulo, flags.modo === 'revisao' ? 'revisao' : 'task');
    if (typeof flags.base === 'string' && flags.base) {
      if (estado.modo === 'revisao') {
        // Só nome de ref ou sha: a base entra no {base} dos comandos do gate (":/regex", ";" etc. ficam de fora).
        if (!refSegura(flags.base)) falha(`Base inválida: "${flags.base}" (use o nome de um branch ou um sha).`);
        if (git(raiz, ['rev-parse', '--verify', '--quiet', `${flags.base}^{commit}`]).exit !== 0) falha(`A base "${flags.base}" não existe neste repositório.`);
        estado.baseRevisao = flags.base;
      } else {
        // Task numa cadeia de branches (a base é outra branch de feature): diff, gate ({base}/WF_BASE), RED e
        // revisores comparam com ela, não com git.branchBase.
        const v = validarBase(flags.base);
        if (!v.ok) falha(v.mensagem);
        estado.base = flags.base;
        estado.baseValidada = { ref: v.ref, sha: v.sha, em: agoraISO() };
      }
    }
    if (flags.fonte) estado.meta.fonte = flags.fonte;
    if (flags['card-url']) estado.meta.cardUrl = flags['card-url'];
    for (const d of [c.task, c.revisoes, c.evidencias]) fs.mkdirSync(d, { recursive: true });
    gravarEstado(raiz, estado);
    marcarRegistro(raiz, id, { criadoEm: estado.criadoEm, encerradaEm: null, modo: estado.modo });
    definirTaskAtiva(raiz, id);
    saida({ ok: true, task: id, pasta: path.relative(raiz, c.task), execucaoAnterior: arquivada ? path.relative(raiz, arquivada) : undefined, mensagem: `Task ${id} criada e ativa.${arquivada ? ' A execução anterior (encerrada) foi arquivada.' : ''}` });
    });
    break;
  }

  case 'ativar': {
    const id = validarIdTask(pos[1]);
    const c = caminhos(raiz, id);
    if (!existe(c.estado)) falha(`Task ${id} não existe.`);
    {
      // Trocar a task ativa abandonaria outra em andamento (e o branch dela): só com --substituir-ativa.
      const ativa = idTaskAtiva(raiz);
      const outra = ativa && ativa !== id ? lerJSON(caminhos(raiz, ativa).estado, null) : null;
      if (outra && outra.fase !== 'encerrada' && !flags['substituir-ativa']) {
        falha(`Há outra task ativa não encerrada (${ativa}, fase ${outra.fase}${outra.pausada ? ', pausada' : ''}). Termine-a antes, ou passe --substituir-ativa (ela continua salva e volta com "wf ativar ${ativa}").`, { ativa, fase: outra.fase });
      }
    }
    definirTaskAtiva(raiz, id);
    const e = lerJSON(c.estado);
    saida({ ok: true, task: id, fase: e.fase, status: e.status, mensagem: `Task ${id} ativa.` });
    break;
  }

  case 'status': {
    comEstado(
      (e) => {
        const lim = avaliarLimites(raiz, e, config);
        const res = resumoFindings(raiz, e, config);
        // Gate da iteração não verde: o que falta, por etapa, e o porquê (cache e último gate.json).
        const pg = pendenciasDoGate(raiz, e, config);
        saida({
          ok: true,
          task: e.id,
          titulo: e.titulo,
          modo: e.modo,
          fase: e.fase,
          status: e.status,
          veredito: e.veredito,
          pausada: e.pausada,
          branch: e.meta.branch,
          branchAtual: gitBranchAtual(raiz),
          meta: e.meta,
          iteracao: e.iteracao,
          rodadasRevisao: `${lim.rodadasRevisao}/${lim.maxIteracoes}`,
          tokens: lim.tokens,
          ultimoGate: e.ultimoGate,
          pendencias: pg.pendencias,
          sugestaoGate: pg.sugestao,
          ajuste: e.ajuste ? { id: e.ajuste.id, status: e.ajuste.status, caminho: e.ajuste.caminho, texto: e.ajuste.texto } : null,
          entregas: (e.entregas || []).length,
          findings: {
            total: res.total,
            porSeveridade: res.porSeveridade,
            porStatus: res.porStatus,
            bloqueantesAbertos: res.bloqueantesAbertos,
          },
          proximo: proximoPasso(raiz, e, config),
        });
      },
      { orcamento: true }
    );
    break;
  }

  case 'proximo': {
    comEstado((e) => saida({ ok: true, ...proximoPasso(raiz, e, config) }), { orcamento: true });
    break;
  }

  case 'fase': {
    const alvo = pos[1];
    comEstado((e) => {
      const r = mudarFase(raiz, e, alvo);
      if (!r.ok) {
        gravarEstado(raiz, e);
        falha(r.mensagem, { faltas: r.faltas });
      }
      gravarEstado(raiz, e);
      saida({ ok: true, fase: e.fase });
    }, { gravar: false });
    break;
  }

  case 'meta': {
    comEstado((e) => {
      const alteracoes = {};
      if (flags['do-spec']) {
        const m = metaDoSpec(raiz, e.id);
        for (const [k, v] of Object.entries(m)) if (v !== null && v !== undefined) alteracoes[k] = v;
      }
      for (const par of pos.slice(1)) {
        const i = par.indexOf('=');
        if (i < 1) falha(`Par inválido: "${par}". Use chave=valor.`);
        const k = par.slice(0, i);
        let v = par.slice(i + 1);
        if (!['complexidade', 'risco', 'ui', 'dadosPessoais', 'branch', 'tipo', 'fonte', 'cardUrl'].includes(k)) falha(`Chave de meta desconhecida: ${k}`);
        if (k === 'complexidade') {
          v = v.toUpperCase();
          if (!['P', 'M', 'G'].includes(v)) falha('complexidade deve ser P, M ou G.');
          if (e.iteracao > 0 && v !== e.meta.complexidade) falha('A complexidade não pode mudar depois que o loop começou.');
        }
        if (k === 'ui') v = ['sim', 's', 'true', '1', 'yes'].includes(v.toLowerCase());
        if (k === 'dadosPessoais') {
          // Na dúvida, sim: só um "nao" explícito desliga, e nunca contra o spec.
          v = !/^(?:nao|não|n|no|false|0)$/i.test(v.trim());
          if (v === false && metaDoSpec(raiz, e.id).dadosPessoais === true) falha('O spec marca "Dados pessoais: sim": dadosPessoais não pode ser "nao" (mude o spec antes do plano, se for o caso).');
        }
        if (k === 'branch' && config.git.branchesProtegidos.includes(v)) falha(`"${v}" é um branch protegido.`);
        alteracoes[k] = v;
      }
      if (alteracoes.complexidade && e.iteracao > 0) delete alteracoes.complexidade;
      // Depois que o loop começou, "dados pessoais" não volta a falso: isso tiraria o ops-reviewer da revisão.
      if (alteracoes.dadosPessoais === false && e.meta.dadosPessoais === true && e.iteracao > 0) delete alteracoes.dadosPessoais;
      Object.assign(e.meta, alteracoes);
      gravarEstado(raiz, e);
      const lim = limitesDaTask(config, e);
      saida({ ok: true, meta: e.meta, limites: lim });
    }, { gravar: false });
    break;
  }

  case 'branch-sugerido': {
    comEstado(
      (e) => {
        const tipo = flags.tipo || e.meta.tipo || 'feat';
        const nome = config.git.padraoBranch
          .replace('{tipo}', tipo)
          .replace('{id}', e.id)
          .replace('{slug}', slugify(e.titulo) || 'task');
        saida({ ok: true, branch: nome.replace(/-+$/, ''), base: baseDaTask(e, config) });
      },
      { gravar: false }
    );
    break;
  }

  case 'pausar':
  case 'retomar': {
    comEstado((e) => {
      e.pausada = cmd === 'pausar';
      gravarEstado(raiz, e);
      saida({ ok: true, pausada: e.pausada, mensagem: e.pausada ? 'Task pausada: o hook de parada não forçará a continuação.' : 'Task retomada.' });
    }, { gravar: false });
    break;
  }

  case 'red': {
    // Roda os testes fora do lock (não altera state.json; grava só evidencias/).
    const e = lerEstado(raiz, taskId());
    const r = await registrarRed(raiz, e, config, {
      aceitarVerde: typeof flags['aceitar-verde'] === 'string' ? flags['aceitar-verde'] : undefined,
      aceitarErroCarga: typeof flags['aceitar-erro-carga'] === 'string' ? flags['aceitar-erro-carga'] : undefined,
      incluirE2E: !flags['sem-e2e'],
      refazer: !!flags.refazer,
      completo: !!flags.completo,
    });
    if (!r.ok) falha(r.mensagem, r, r.codigo || 1);
    const escopo = r.modo === 'focado' ? ` (focado: ${r.arquivos.length} arquivo(s) de teste da task)` : '';
    saida({ ...r, mensagem: r.observado === 'RED' ? `RED registrado: testes falharam na asserção antes da implementação${escopo}.` : `${r.observado} com motivo registrado no manifest.` });
    break;
  }

  case 'spec': {
    const sub = pos[1];
    comEstado((e) => {
      if (sub === 'status') {
        saida({ ok: true, congelado: e.specCongelado || null, criteriosAtuais: criteriosDoSpec(raiz, e.id), integro: specIntegro(raiz, e) });
      } else if (sub === 'aceitar-ajuste') {
        // O humano escolheu "ajustar o spec" numa decisão (atestada): o agente recongela uma única vez.
        if (!e.ajusteSpecAutorizado) falha('Nenhuma decisão humana autorizou ajustar o spec. Se o critério precisa mudar: veredito BLOQUEADA (SPEC_MUDOU) e "wf decisao pedir".');
        // Ajuste pós-entrega: o humano aprovou critérios específicos; o spec recongelado tem de ser exatamente isso.
        const conf = conferirSpecDoAjuste(raiz, e);
        if (!conf.ok) falha('O spec.md não corresponde aos critérios que o humano aprovou: ajuste-o e rode de novo.', { erros: conf.erros });
        const antes = e.specCongelado || null;
        congelarSpec(raiz, e, { recongeladoDe: antes ? antes.sha256 : null, decisao: e.ajusteSpecAutorizado });
        e.historicoFases.push({ fase: e.fase, em: agoraISO(), evento: `spec recongelado pela decisão humana ${e.ajusteSpecAutorizado}` });
        e.ajusteSpecAutorizado = null;
        gravarEstado(raiz, e);
        saida({ ok: true, congelado: e.specCongelado });
      } else if (sub === 'recongelar') {
        const antes = e.specCongelado || null;
        congelarSpec(raiz, e, { recongeladoDe: antes ? antes.sha256 : null });
        e.historicoFases.push({ fase: e.fase, em: agoraISO(), evento: 'spec recongelado pelo humano' });
        gravarEstado(raiz, e);
        saida({ ok: true, congelado: e.specCongelado });
      } else falha('Use "wf spec status", "wf spec aceitar-ajuste" (após decisão humana) ou, só o humano, "wf spec recongelar".');
    }, { gravar: false });
    break;
  }

  case 'gate': {
    const rotulo = typeof flags.rotulo === 'string' ? flags.rotulo : undefined;
    if (rotulo !== undefined && (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,40}$/.test(rotulo) || rotulo === 'verificacao' || rotulo === 'red')) {
      falha('--rotulo aceita só letras, números, ponto, hífen e sublinhado; "verificacao" e "red" são reservados à CLI.');
    }
    // O gate pode levar minutos: roda sem o lock e aplica o resultado depois, sobre o estado relido.
    const antes = lerEstado(raiz, taskId());
    const iterDoGate = antes.fase === 'loop' ? iteracaoAtual(antes)?.n : undefined;
    // Gate incremental (só no loop): etapas que passaram e cujos insumos não mudaram vêm do cache. --sem-cache
    // roda tudo; --so-falhas só as falhas e as invalidadas; --etapas roda as pedidas e, com o cache ativo, as
    // demais só vêm do cache (nunca rodam). Fora do loop, com árvore suja ou rótulo, --etapas roda só as pedidas.
    if (flags['so-falhas'] && (flags.etapas || flags['sem-cache'])) falha('--so-falhas não combina com --etapas nem com --sem-cache.');
    const somente = flags.etapas ? expandirSelecao(config, lista(flags.etapas)) : undefined;
    if (somente) {
      // Nome errado no --etapas não pode virar "nada a rodar, o resto do cache" e fechar a iteração.
      const conhecidas = new Set(config.gate.etapas.map((x) => x.nome));
      const desconhecidas = somente.filter((n) => !conhecidas.has(n));
      if (desconhecidas.length || !somente.length) falha(`Etapa desconhecida no --etapas: ${desconhecidas.join(', ') || '(vazio)'}. Etapas do gate: ${[...conhecidas].join(', ')}.`);
    }
    const ctxCache = prepararCache(raiz, antes, config, { usarCache: !flags['sem-cache'], soFalhas: !!flags['so-falhas'], rotulo, selecao: somente });
    const porSelecao = !!somente && ctxCache.ativo;
    const bruto = await rodarGate(raiz, antes, config, { rotulo, somente: porSelecao ? undefined : somente, decidirEtapa: (etapa) => decidirEtapa(etapa, etapa.comando, ctxCache) });
    // Gate que nem começou (base inválida ou contendo o HEAD): não conta como gate da iteração.
    // CI-ESTADO (modo CI: árvore, branch, remoto, config): nada rodou; exit 5 como os erros de ambiente.
    if (!bruto._etapasCompletas) falha(bruto.mensagem, { codigo: bruto.codigo, ...(bruto.checks ? { checks: bruto.checks } : {}), ...(bruto.ci ? { ci: bruto.ci } : {}) }, bruto.codigo === 'BASE_CONTEM_HEAD' || bruto.codigo === 'BASE_INVALIDA' ? 4 : bruto.codigo === 'CI-ESTADO' || bruto.codigo === 'CI-INDISPONIVEL' ? 5 : 1);
    bruto._ctxCache = ctxCache;
    comEstado((e) => {
      const r = aplicarGate(raiz, e, config, bruto);
      const it = iteracaoAtual(e);
      // --so-falhas e --etapas só contam como gate completo quando o cache cobriu todas as obrigatórias que não rodaram.
      const naoCobertas = (r.etapas || []).filter((x) => x.status === 'nao-executada' && ctxCache.naoCobertas?.has(x.nome)).map((x) => x.nome);
      const naoCobertasObrigatorias = (r.etapas || []).filter((x) => x.obrigatoria && naoCobertas.includes(x.nome)).map((x) => x.nome);
      // Sem vaga numa etapa obrigatória: capacidade da máquina, não resultado do código. Não conta como o gate da
      // iteração (não libera a triagem nem gasta a rodada): o próximo passo é "wf aguardar-vaga" e repetir o gate.
      // Obrigatória pulada porque a dependência ficou sem vaga (dependeDe): também é capacidade, não resultado do código.
      const semVagaObrigatorias = (r.etapas || []).filter((x) => x.obrigatoria && (x.status === 'sem-vaga' || (x.status === 'pulada-por-dependencia' && x.causaRaiz?.status === 'sem-vaga'))).map((x) => x.nome);
      // HEAD ou arquivos versionados mudando durante o gate: o resultado não é de nenhum commit (sem commitGate).
      // CI indisponível (modo CI): o run não veio; nada foi provado e nada foi reprovado: não conta como o gate da iteração.
      const gateCompleto = !flags.rotulo && (!flags.etapas || porSelecao) && !naoCobertasObrigatorias.length && !semVagaObrigatorias.length && !r.invalido && !r.arvoreMudou && !r.ciIndisponivel;
      // Só vale para a iteração em que o gate começou, aberta e ainda antes do code review: gate → correção →
      // gate repete aqui dentro sem gastar iteração. Depois da triagem, o gate já é da próxima iteração.
      if (e.fase === 'loop' && it && !it.correcao && !it.triagem && it.n === iterDoGate && gateCompleto) {
        it.gate = r.ok ? 'ok' : 'falhou';
        it.tentativasGate = (it.tentativasGate || 0) + 1;
        it.commitGate = r.ok ? r.commit || gitHead(raiz) : null;
        // Commit em que o gate desta iteração rodou (verde ou vermelho): os revisores, disparados junto com o
        // gate, revisam este mesmo commit, e a triagem só junta os dois sobre ele.
        it.commitGateRodado = r.commit || gitHead(raiz);
        if (!r.ok) it.bloqueantes = resumoFindings(raiz, e, config).bloqueantesAbertos.length;
      }
      gravarEstado(raiz, e);
      const semEtapa = r.ok && (r.etapas || []).every((x) => x.status === 'nao-configurado');
      const semVaga = (r.etapas || []).filter((x) => x.status === 'sem-vaga').map((x) => x.nome);
      const cortadas = (r.etapas || []).filter((x) => x.status === 'nao-executada' && /^falha anterior/.test(x.motivo || '')).map((x) => x.nome);
      // dependeDe resolvido sem resultado da dependência no mesmo commit: a etapa rodou sem essa checagem.
      const avisosDep = [...new Set((r.etapas || []).flatMap((x) => x.avisosDependencia || []))];
      const avisos =
        (r.invalido ? ` INVÁLIDO: ${r.invalido}` : '') +
        (r.arvoreMudou ? ' Arquivos versionados mudaram durante o gate: o resultado não vale como o gate desta iteração (nada foi gravado no cache); rode o gate de novo com a árvore parada.' : '') +
        (cortadas.length ? ` Não executadas (falhar rápido, falha anterior): ${cortadas.join(', ')}.` : '') +
        (r.resumoPuladas ? ` ${r.resumoPuladas[0].toUpperCase()}${r.resumoPuladas.slice(1)} (dependeDe: não pegaram vaga nem rodaram; não contam como aprovadas).` : '') +
        (avisosDep.length ? ` Aviso: ${avisosDep.join('; ')}.` : '') +
        (r.ciIndisponivel ? ` CI indisponível (${r.ciIndisponivel}): infraestrutura, não defeito do código; este gate não conta como o gate da iteração. Repita o gate${config.ci?.fallback === 'local' ? ' ou rode-o com WF_GATE_CI_FALLBACK=local' : ''}.` : '') +
        (r.ci?.etapasDoCI?.length ? ` Etapas lidas do CI: ${r.ci.etapasDoCI.join(', ')} (run ${r.ci.run?.url || '?'}, SHA ${String(r.ci.run?.sha || r.commit || '').slice(0, 7)}).` : '') +
        (semVaga.length ? ` Sem vaga de recurso (capacidade da máquina, não defeito do código): ${semVaga.join(', ')}; rode "wf aguardar-vaga" e repita o gate.${semVagaObrigatorias.length ? ' Este gate não conta como o gate da iteração.' : ''}` : '');
      const flagParcial = flags.etapas ? '--etapas' : '--so-falhas';
      const parcial = avisos + (naoCobertasObrigatorias.length ? ` Gate incompleto: ${naoCobertasObrigatorias.join(', ')} não ${naoCobertasObrigatorias.length > 1 ? 'foram cobertas' : 'foi coberta'} pelo cache (${flagParcial} não as roda); rode "wf gate" para fechar o gate desta iteração.` : '') + (porSelecao && gateCompleto ? ' O cache cobriu as demais etapas obrigatórias: conta como o gate completo desta iteração.' : '');
      const titulo = r.invalido ? 'Gate inválido.' : r.ok ? (semEtapa ? 'Nenhuma etapa do gate está configurada: nada foi verificado (o manifest vai acusar).' : 'Gate verde.') : (r.falhas || []).length ? `Gate falhou em: ${r.falhas.join(', ')}. As falhas viraram findings urgentes.` : r.ciIndisponivel ? 'Gate sem resultado: CI indisponível.' : 'Gate falhou.';
      saida({ ...r, gateCompleto, naoCobertas, ...(r.ciIndisponivel ? { codigo: 'CI-INDISPONIVEL' } : {}), mensagem: titulo + parcial }, r.ok ? 0 : r.ciIndisponivel ? 5 : 1);
    }, { gravar: false });
    break;
  }

  case 'base': {
    // Troca a branch base da task (ex.: a branch-mãe foi mergeada): registrada em decisoes.md e no histórico.
    const nova = pos[1];
    comEstado(
      (e) => {
        const atual = baseDaTask(e, config);
        if (!nova) saida({ ok: true, base: atual, ref: refBase(raiz, atual), daTask: !!e.base });
        if (e.modo === 'revisao') falha('No modo revisão a base vem do "wf init-task --base".');
        if (['verificacao', 'entrega', 'encerrada'].includes(e.fase)) falha(`A base não muda na fase "${e.fase}": a verificação compara com a base que o loop usou.`);
        const motivo = typeof flags.motivo === 'string' ? flags.motivo.trim() : '';
        if (!motivo) falha('Informe o motivo: wf base <branch> --motivo "<por que a base mudou>" (vai para decisoes.md).');
        if (nova === atual) saida({ ok: true, base: atual, ref: refBase(raiz, atual), mensagem: 'A base da task já é essa.' });
        const v = validarBase(nova, { troca: true, estado: e });
        if (!v.ok) falha(v.mensagem);
        e.base = nova;
        e.baseValidada = { ref: v.ref, sha: v.sha, em: agoraISO() };
        const em = agoraISO();
        e.historicoFases.push({ fase: e.fase, em, evento: `base da task: ${atual} → ${nova} (${motivo})` });
        fs.appendFileSync(caminhos(raiz, e.id).decisoes, `\n## Base da task: ${atual} → ${nova} (${em})\n\n${motivo}\n\nDiff, gate ({base} e WF_BASE), RED e revisores passam a comparar com ${v.ref}.\n`);
        gravarEstado(raiz, e);
        saida({ ok: true, base: nova, ref: v.ref, antes: atual, mensagem: `Base da task trocada para ${v.ref} (registrado em decisoes.md).` });
      },
      { gravar: false }
    );
    break;
  }

  case 'checar': {
    // Checagem estreita antes de um gate (fixer): lint dos arquivos, typecheck do app, testes relacionados. Não é prova.
    const r = await checar(raiz, config, { idTask: flags.task || idTaskAtiva(raiz), arquivos: pos.slice(1), pesado: !!flags.pesado });
    if (!r.passos) falha(r.mensagem, r);
    saida({ ...r, mensagem: r.ok ? 'Checagem estreita verde. Faça commit e rode "wf gate" (a checagem não substitui o gate).' : `Checagem falhou em: ${r.falhas.join(', ')}. Corrija e rode "wf checar" de novo antes do gate.` }, r.ok ? 0 : 1);
    break;
  }

  case 'ci': {
    // Modo CI opcional (0.7.0). Nenhum subcomando escreve em .github/ (arquivo só do humano) nem liga o CI sozinho:
    // "gerar" grava a proposta em .workflow-ia/ci/; "ativar" mostra o diff e os passos; "--aplicar" só por humano.
    const sub = pos[1] || 'status';
    const ciCfg = config.ci;
    const estadoOpcional = () => {
      const id = flags.task || idTaskAtiva(raiz);
      return id ? lerEstado(raiz, id) : null;
    };
    if (sub === 'status' || sub === 'plano') {
      const estado = estadoOpcional();
      const fase = typeof flags.fase === 'string' ? flags.fase : estado?.fase || 'verificacao';
      const plano = planoCI(config, { ...(estado || {}), fase });
      const etapas = planoDasEtapas(config, plano);
      // 0.9.0: o critério do reaproveitamento (commit | conteudo) aparece no plano, no status e no ativar.
      const criterio = criterioDe(config);
      if (sub === 'plano') saida({ ok: true, fase, modo: plano.modo, ativo: plano.ativo, motivo: plano.motivo, criterioReaproveitar: criterio, etapas, ...(plano.erro ? { erro: plano.erro } : {}) });
      const v = validarConfigCI(config);
      const preVoo = plano.ativo && estado ? conferirPreVoo(raiz, estado, config, { fetch: !flags['sem-fetch'] }) : null;
      let gh = null;
      if (ciCfg?.ativo === true && !flags['sem-gh']) {
        // Provedor desconhecido (config inválido): mensagem, nunca TypeError (B2).
        const fabrica = PROVEDORES[ciCfg.provedor];
        const p = fabrica ? (await fabrica()).criarProvedor({ raiz, config, repo: repoDoRemoto(raiz, config) }) : null;
        const disp = p ? await p.disponivel() : { ok: false, motivo: `provedor desconhecido: ${ciCfg.provedor} (use ${Object.keys(PROVEDORES).join(', ')})`, classe: 'config' };
        gh = { ...disp, repo: repoDoRemoto(raiz, config), ...(disp.ok && p ? { workflow: await p.workflowExiste(ciCfg.workflow) } : {}) };
      }
      const alterados = plano.ativo && estado ? (() => {
        try {
          return appsAlterados(raiz, config, refBase(raiz, baseDaTask(estado, config)));
        } catch (e) {
          return { erro: e.message };
        }
      })() : null;
      const ultimo = estado ? lerUltimoCi(raiz, estado) : null;
      saida({
        ok: v.erros.length === 0,
        ativo: ciCfg?.ativo === true,
        configurado: !!ciCfg,
        provedor: ciCfg?.provedor || null,
        workflow: ciCfg?.workflow || null,
        fases: ciCfg?.fases || [],
        fase,
        modo: plano.modo,
        criterioReaproveitar: criterio,
        etapas,
        apps: ciCfg?.apps || {},
        appsAlterados: alterados,
        config: v,
        preVoo,
        gh,
        ultimoRun: ultimo ? { status: ultimo.status, fase: ultimo.fase, sha: ultimo.sha, run: ultimo.run, em: ultimo.em, arquivo: ultimo.arquivo, classe: ultimo.classe, motivo: ultimo.motivo, origemRun: ultimo.origemRun ?? null, tentativa: ultimo.tentativa ?? null, runs: ultimo.runs || [], ...(ultimo.criterio ? { criterio: ultimo.criterio } : {}), ...(ultimo.conteudo ? { conteudo: ultimo.conteudo } : {}), ...(ultimo.rerun ? { rerun: ultimo.rerun } : {}), avisos: ultimo.avisos || [] } : null,
        proposta: existe(path.join(raiz, PASTA_PROPOSTA, 'ci.yml.proposta')) ? path.posix.join(PASTA_PROPOSTA, 'ci.yml.proposta') : null,
        mensagem: v.erros.length ? `Config do CI inválido: ${v.erros.join('; ')}.` : ciCfg?.ativo === true ? `Modo CI ativo (${plano.modo} na fase ${fase}).${preVoo && !preVoo.ok ? ` Pré-voo: ${preVoo.mensagem}` : ''}${preVoo?.avisos?.length ? ` Aviso: ${preVoo.avisos.join('; ')}.` : ''}${gh && !gh.ok ? ` gh: ${gh.motivo}.` : ''}` : 'Modo CI desligado: tudo roda na máquina. "wf ci gerar" propõe o workflow; "wf ci ativar" mostra como ligar.',
      });
    }
    if (sub === 'gerar' || sub === 'ativar') {
      const proposta = gerarProposta(raiz, config);
      const arquivos = gravarProposta(raiz, config, proposta);
      const diff = diffCI(ciCfg, proposta.patch.ci);
      if (sub === 'gerar') {
        // Proposta inválida (validador mínimo ou actionlint) sai com erro: o humano não deve copiar um yml quebrado (B1).
        const okYml = proposta.validacao.ok === true;
        saida({ ok: okYml, arquivos, apps: proposta.apps, etapas: proposta.etapas, jobs: proposta.jobs, criterioReaproveitar: proposta.criterio, ...(proposta.conteudo ? { conteudo: proposta.conteudo } : {}), validacao: { ok: proposta.validacao.ok, erros: proposta.validacao.erros, actionlint: proposta.validacao.actionlint }, avisos: proposta.avisos, diffConfig: diff, mensagem: `${okYml ? 'Proposta gravada' : 'Proposta gravada, mas INVÁLIDA (não copie antes de corrigir)'} em ${arquivos.pasta}/ (${proposta.jobs.length} job(s) de app). O plugin não escreve em .github/workflows/: copie ${arquivos.yml} para lá, aplique ${arquivos.patch} no config (humano) e leia ${arquivos.leiame}.${proposta.avisos.length ? ` Avisos: ${proposta.avisos.join('; ')}.` : ''}` }, okYml ? 0 : 1);
      }
      const passos = [
        `Copie ${arquivos.yml} para .github/workflows/ci.yml, revise e faça commit na branch base (${proposta.base}); o gh só acha o workflow pelo nome quando ele existe no branch padrão.`,
        flags.aplicar ? 'Bloco ci do .workflow-ia/config.json atualizado (ci.ativo = true).' : `Aplique ${arquivos.patch} no .workflow-ia/config.json (só o bloco ci): rode "wf ci ativar --aplicar" no seu terminal, fora do Claude Code.`,
        `Exija o check "ci-ok" na proteção do branch ${proposta.base}.`,
        'Confira "gh auth status" nesta máquina e rode "wf doctor" (check ci) e "wf ci status".',
        proposta.criterio === 'conteudo'
          ? 'Critério do reaproveitamento: "conteudo" (por app: o dispatch verde mais novo da branch vale quando o conteúdo do app e o workflow não mudaram). Declare em ci.apps.<app>.entradas o que um app lê fora da pasta dele.'
          : 'Critério do reaproveitamento: "commit" (0.8.0: só o run do mesmo SHA). Para reaproveitar por conteúdo de cada app, ponha ci.criterioReaproveitar = "conteudo" e rode "wf ci gerar" de novo.',
      ];
      if (flags.aplicar) {
        // Só o humano chega aqui (soHumano acima): grava só o bloco ci, preservando o resto do arquivo.
        const arq = caminhos(raiz).config;
        const atual = lerJSON(arq, {});
        atual.ci = proposta.patch.ci;
        fs.writeFileSync(arq, `${JSON.stringify(atual, null, 2)}\n`);
      }
      saida({ ok: true, aplicado: !!flags.aplicar, arquivos, criterioReaproveitar: proposta.criterio, diffConfig: diff, passos, validacao: { ok: proposta.validacao.ok, erros: proposta.validacao.erros, actionlint: proposta.validacao.actionlint }, avisos: proposta.avisos, mensagem: `${flags.aplicar ? 'Modo CI ligado no config.' : 'Modo CI ainda desligado (o config não muda sozinho).'} Passos do humano: ${passos.join(' ')}` });
    }
    falha(`Use "wf ci status", "wf ci plano [--fase <fase>]", "wf ci gerar" ou "wf ci ativar [--aplicar]".`);
    break;
  }

  case 'vagas': {
    saida({ ok: true, ...listarVagas(config), nota: vagasAtivas(config) ? undefined : 'Vagas de recurso desligadas (recursos.vagasPesadas = 0).' });
    break;
  }

  case 'aguardar-vaga': {
    // Espera, sem polling do agente, até chegar a vez desta task na fila. Não segura a vaga: deixa a VEZ reservada
    // (recursos.reservaSegundos) para o próximo gate/RED desta task, que adota o pedido sem voltar para o fim da fila.
    if (!vagasAtivas(config)) saida({ ok: true, mensagem: 'Vagas de recurso desligadas (recursos.vagasPesadas = 0): nada a esperar.' });
    const maxMin = Number(flags['max-min']) > 0 ? Number(flags['max-min']) : undefined;
    const r = await criarReservaVaga(config, { task: flags.task || idTaskAtiva(raiz), raiz }).aguardar({ esperaMaxMin: maxMin });
    if (r.erro) falha(r.erro, listarVagas(config));
    const reserva = r.reservaAte
      ? ` A vez fica reservada para o próximo gate desta task até ${r.reservaAte} (recursos.reservaSegundos): outras tasks não passam na frente nesse tempo. A vaga em si não fica presa; o gate a pega na primeira etapa pesada.`
      : ' A vaga não fica presa nem a vez reservada: o gate entra na fila de novo ao chegar na primeira etapa pesada.';
    saida({ ok: true, vagaLivre: r.numero, reservaAte: r.reservaAte || null, esperouSegundos: Math.round(r.esperouMs / 1000), mensagem: `Há vaga livre (vaga ${r.numero}). Rode o gate agora.${reserva}` });
    break;
  }

  case 'testes-diff': {
    comEstado((e) => saida(diffTestes(raiz, e, config)), { gravar: false });
    break;
  }

  case 'matriz': {
    comEstado((e) => saida({ ok: true, ...matrizRastreabilidade(raiz, e.id, config) }), { gravar: false });
    break;
  }

  case 'iteracao': {
    const sub = pos[1];
    comEstado(
      (e) => {
        if (sub === 'nova') {
          if (e.fase !== 'loop') {
            const r = mudarFase(raiz, e, 'loop');
            if (!r.ok) falha(r.mensagem, { faltas: r.faltas });
          }
          const it = iteracaoAtual(e);
          if (it && !it.correcao) {
            if (!it.gate) falha(`A iteração ${it.n} ainda não rodou o gate. Rode "wf gate".`);
            if (!it.triagem) falha(`A iteração ${it.n} ainda não teve code review: rode os revisores (junto com o gate) e a triagem, que junta os findings dos dois.`);
            falha(`A iteração ${it.n} ainda não foi fechada. Termine a correção e rode "wf iteracao fechar".`);
          }
          const r = novaIteracao(raiz, e, config);
          gravarEstado(raiz, e);
          if (!r.ok) falha(r.mensagem, r, 3);
          saida(r);
        } else if (sub === 'fechar') {
          const it = iteracaoAtual(e);
          if (!it || it.correcao) falha('Não há iteração aberta.');
          if (!it.gate) falha(`A iteração ${it.n} ainda não rodou o gate: rode "wf gate" antes de fechar (iteração sem gate não conta como trabalho).`);
          if (!it.triagem) falha(`A iteração ${it.n} só fecha depois do code review: rode os revisores (junto com o gate) e a triagem; o fixer corrige os findings do gate e da revisão.`);
          it.correcao = true;
          it.fim = new Date().toISOString();
          gravarEstado(raiz, e);
          saida({ ok: true, iteracao: it.n, mensagem: 'Iteração fechada. Próximo: "wf proximo" (nova iteração para re-revisar as correções, ou verificação).' });
        } else falha('Use "wf iteracao nova" ou "wf iteracao fechar".');
      },
      { gravar: false, orcamento: true }
    );
    break;
  }

  case 'limites': {
    comEstado((e) => saida({ ok: true, ...avaliarLimites(raiz, e, config) }), { orcamento: true });
    break;
  }

  case 'tokens':
  case 'orcamento': {
    comEstado(
      (e) => {
        saida({ ok: true, tokensUsados: e.orcamento.tokensUsados, porSessao: e.orcamento.sessoes, nota: 'consumo medido (informativo, sem teto): tokens efetivos = input + cache_creation + output + 10% de cache_read' });
      },
      { orcamento: true }
    );
    break;
  }

  case 'revisores': {
    comEstado((e) => saida({ ok: true, iteracao: e.iteracao, pasta: `.workflow-ia/tasks/${e.id}/revisoes/iter-${e.iteracao}/`, ...revisoresAfetados(raiz, e, config) }), { gravar: false });
    break;
  }

  case 'findings': {
    const sub = pos[1];
    if (sub === 'merge') {
      const arq = pos[2];
      if (!arq || !existe(arq)) falha(`Arquivo não encontrado: ${arq}`);
      const conteudo = lerJSON(arq);
      const itens = Array.isArray(conteudo) ? conteudo : conteudo.findings || conteudo.itens || [];
      const erros = itens.flatMap((it, i) => validarItem(it, i));
      if (erros.length) falha('Findings inválidos. Corrija o arquivo e rode de novo.', { erros });
      comEstado((e) => {
        const revisados = lista(flags.revisados);
        const itAberta = iteracaoAtual(e);
        const pasta = path.join(caminhos(raiz, e.id).revisoes, `iter-${e.iteracao}`);
        if (e.modo !== 'revisao') {
          // Na task, a triagem só existe dentro de uma iteração aberta, depois que o gate dela terminou (verde ou
          // vermelho: revisores e gate rodam juntos e a triagem junta os dois), a partir do triagem.json da
          // iteração (gravado só pelo triager) e com os relatórios dos revisores que deviam rodar nesta rodada.
          if (e.fase !== 'loop' || !itAberta || itAberta.correcao) falha('A triagem só é mesclada durante uma iteração aberta do loop ("wf iteracao nova").');
          if (!itAberta.gate) falha('A triagem junta os findings do gate e dos revisores: espere o "wf gate" desta iteração terminar.');
          // Iteração aberta numa versão anterior (0.5.x) não registra o commit do gate: nada de aceitar sem checagem.
          if (!itAberta.commitGateRodado) falha('Esta iteração não registra o commit em que o gate rodou (aberta numa versão anterior do Workflow IA): rode "wf gate" de novo, e os revisores sobre o mesmo commit, antes da triagem.');
          const commitDoGate = itAberta.commitGateRodado;
          if (commitDoGate !== gitHead(raiz)) falha('O código mudou depois do gate desta iteração: rode "wf gate" e os revisores de novo sobre o código atual.');
          if (chamadorEhAgente && itAberta.commitGateRodado) {
            // Os revisores devidos foram disparados nesta iteração sobre o mesmo commit do gate (registro do hook).
            const desde = Date.parse(itAberta.inicio || 0) || 0;
            const disparos = lerSubagentes(raiz).filter((d) => d.task === e.id && Date.parse(d.em) >= desde);
            const papel = (t) => String(t || '').split(':').pop();
            const foraDoCommit = revisoresAfetados(raiz, e, config).revisores.filter((rv) => !disparos.some((d) => papel(d.tipo) === rv && d.head === itAberta.commitGateRodado));
            if (foraDoCommit.length) falha(`Estes revisores não foram disparados nesta iteração sobre o commit do gate (${itAberta.commitGateRodado.slice(0, 7)}): ${foraDoCommit.join(', ')}. Rode-os de novo sobre o código atual.`, { faltam: foraDoCommit });
            // O relatório tem de ser desse disparo: um arquivo anterior a ele é de outra rodada (gate terminou antes do revisor).
            const antigos = relatoriosAntigos(raiz, e, itAberta, revisoresAfetados(raiz, e, config).revisores);
            if (antigos.length) falha(`Os relatórios destes revisores são anteriores ao disparo deles sobre o commit do gate (${itAberta.commitGateRodado.slice(0, 7)}): ${antigos.join(', ')}. Espere-os terminar (ou rode-os de novo) antes da triagem.`, { antigos });
          }
          const esperado = path.join(pasta, 'triagem.json');
          if (realpathParcial(path.resolve(arq)) !== realpathParcial(esperado)) falha(`Na task, mescle a triagem da iteração: ${path.relative(raiz, esperado)} (gravada pelo triager).`);
        }
        {
          // Task e revisão: a triagem só entra com o relatório de cada revisor devido nesta rodada (inclui o ops-reviewer quando a CLI o chamou).
          const devidos = revisoresAfetados(raiz, e, config).revisores;
          const ausentes = devidos.filter((rv) => !existe(path.join(pasta, `${rv}.json`)));
          if (ausentes.length) falha(`Faltam os relatórios destes revisores em ${path.relative(raiz, pasta)}/: ${ausentes.join(', ')}. Rode-os antes da triagem.`, { faltam: ausentes });
        }
        if (revisados.length) {
          // "--revisados" marca correções como verificadas: exige que os revisores tenham de fato rodado nesta iteração.
          const it = itAberta;
          if (e.fase !== 'loop' || !it || it.correcao) falha('--revisados só vale durante uma iteração aberta do loop.');
          if (!it.gate) falha('--revisados exige o gate desta iteração concluído.');
          const faltam = revisados
            .map((p) => REVISOR_POR_PREFIXO[p])
            .filter((rv) => rv && rv !== 'verificador-final')
            .filter((rv) => !existe(path.join(pasta, `${rv}.json`)));
          const desconhecidos = revisados.filter((p) => !REVISOR_POR_PREFIXO[p] || REVISOR_POR_PREFIXO[p] === 'verificador-final');
          if (desconhecidos.length) falha(`Prefixos sem revisor próprio em --revisados: ${desconhecidos.join(', ')}.`);
          if (faltam.length) falha(`Não achei o relatório destes revisores em ${path.relative(raiz, pasta)}/: ${faltam.join(', ')}. Rode-os antes de marcar a re-revisão.`, { faltam });
        }
        const r = mesclar(raiz, e, itens, { revisados, por: flags.por || 'triager', bloqueiam: config.severidades.bloqueiam });
        const it = iteracaoAtual(e);
        if (e.fase === 'loop' && it && !it.correcao) {
          it.triagem = true;
          it.revisores = revisados;
          it.commitRevisado = gitHead(raiz);
          it.bloqueantes = resumoFindings(raiz, e, config).bloqueantesAbertos.length;
        }
        gravarEstado(raiz, e);
        saida({ ok: true, ...r, resumo: resumoFindings(raiz, e, config) });
      }, { gravar: false });
    } else if (sub === 'status') {
      const [idF, novo] = [pos[2], pos[3]];
      if (!idF || !novo) falha('Uso: wf findings status <F-001> <status> [--motivo] [--commit] [--ref]');
      comEstado((e) => {
        try {
          const f = alterarStatus(raiz, e, config, idF, novo, {
            motivo: typeof flags.motivo === 'string' ? flags.motivo : undefined,
            commit: typeof flags.commit === 'string' ? flags.commit : undefined,
            ref: typeof flags.ref === 'string' ? flags.ref : undefined,
            nota: typeof flags.nota === 'string' ? flags.nota : undefined,
          });
          const it = iteracaoAtual(e);
          // Só correção de findings do code review abre a etapa "fechar a iteração"; correção de gate repete o gate.
          if (it && novo === 'corrigido' && it.triagem) it.correcaoIniciada = true;
          gravarEstado(raiz, e);
          saida({ ok: true, finding: { id: f.id, status: f.status, severidade: f.severidade, commit: f.commit, ref: f.ref } });
        } catch (err) {
          falha(err.message);
        }
      }, { gravar: false });
    } else if (sub === 'listar') {
      comEstado(
        (e) => {
          let itens = lerFindings(raiz, e.id).itens;
          if (flags.abertos) itens = itens.filter((f) => ABERTOS.includes(f.status));
          if (flags.bloqueantes) itens = itens.filter((f) => config.severidades.bloqueiam.includes(f.severidade));
          if (typeof flags.status === 'string') itens = itens.filter((f) => f.status === flags.status);
          if (typeof flags.severidade === 'string') itens = itens.filter((f) => f.severidade === flags.severidade);
          const ordem = { urgente: 0, alto: 1, medio: 2, baixo: 3 };
          itens.sort((a, b) => ordem[a.severidade] - ordem[b.severidade] || a.id.localeCompare(b.id));
          saida({ ok: true, total: itens.length, itens: itens.map(({ historico, fingerprint, ...r }) => r) });
        },
        { gravar: false }
      );
    } else if (sub === 'resumo') {
      comEstado((e) => saida({ ok: true, ...resumoFindings(raiz, e, config) }), { gravar: false });
    } else falha('Use: wf findings merge|status|listar|resumo');
    break;
  }

  case 'verificar-limpo': {
    // verificarLimpo roda o gate sem lock e aplica o resultado sob o lock.
    const r = await verificarLimpo(raiz, lerEstado(raiz, taskId()), config);
    // Modo CI: CI-ESTADO e CI-INDISPONIVEL não são reprovação do código (exit 5, como os erros de ambiente).
    saida({ ok: r.gate.ok, ...r }, r.gate.ok ? 0 : ['CI-ESTADO', 'CI-INDISPONIVEL'].includes(r.gate.codigo) ? 5 : 1);
    break;
  }

  case 'verificacao': {
    if (pos[1] !== 'registrar' || !pos[2]) falha('Uso: wf verificacao registrar <verificacao-julgamento.json>');
    if (!existe(pos[2])) falha(`Arquivo não encontrado: ${pos[2]}`);
    comEstado((e) => {
      const r = registrarVerificacao(raiz, e, config, pos[2]);
      gravarEstado(raiz, e);
      if (!r.ok) falha(r.mensagem, r);
      saida({ ...r, ok: r.resultado === 'aprovado' }, r.resultado === 'aprovado' ? 0 : 1);
    }, { gravar: false });
    break;
  }

  case 'manifest': {
    comEstado((e) => {
      const m = construirManifest(raiz, e, config);
      saida({ ok: m.completo, completo: m.completo, faltando: m.faltando, itens: m.itens, arquivo: path.relative(raiz, caminhos(raiz, e.id).manifest) }, m.completo ? 0 : 1);
    }, { orcamento: true });
    break;
  }

  case 'veredito': {
    const v = pos[1];
    comEstado((e) => {
      let r;
      try {
        r = definirVeredito(raiz, e, config, v, typeof flags.motivo === 'string' ? flags.motivo : undefined);
      } catch (err) {
        falha(err.message);
      }
      gravarEstado(raiz, e);
      if (!r.ok) falha(r.mensagem, r);
      saida(r);
    }, { gravar: false, orcamento: true });
    break;
  }

  case 'encerrar': {
    comEstado((e) => {
      const r = encerrar(raiz, e);
      if (!r.ok) falha(r.mensagem);
      gravarEstado(raiz, e);
      saida(r);
    }, { gravar: false, orcamento: true });
    break;
  }

  case 'ajuste': {
    const sub = pos[1];
    if (!['abrir', 'registrar', 'cancelar', 'status'].includes(sub)) falha('Use "wf ajuste abrir <ID> --texto \"<o que você viu>\"", "wf ajuste registrar <ajustes/A-n.json>", "wf ajuste cancelar" ou "wf ajuste status".');
    if (sub === 'abrir') {
      if (!pos[2]) falha('Informe a task: wf ajuste abrir <ID> --texto "<o que você viu>".');
      const id = validarIdTask(pos[2]);
      if (chamadorEhAgente) {
        // Mesmo F0 do init-task: a task só volta a trabalhar num host que sustenta o pipeline.
        const amb = exigirAmbiente(raiz, config);
        if (!amb.ok) falha(`${amb.motivo} A task não foi reaberta.`, { instrucoes: amb.instrucoes }, 5);
      }
      comLock(raiz, () => {
        if (!existe(caminhos(raiz, id).estado)) falha(`Task ${id} não existe.`);
        const e = lerEstado(raiz, id);
        const texto = typeof flags.texto === 'string' ? flags.texto : '';
        // O agente não reabre uma entrega por conta própria: o pedido tem de ser do humano, atestado pelo hook.
        const atestado = chamadorEhAgente && texto.trim() ? atestarPedidoAjuste(raiz, e, config, texto) : null;
        if (atestado && !atestado.ok) falha(atestado.mensagem, atestado);
        const r = abrirAjuste(raiz, e, config, texto);
        if (!r.ok) falha(r.mensagem, r);
        if (atestado) e.respostasConsumidas = [...(e.respostasConsumidas || []), atestado.chave];
        gravarEstado(raiz, e);
        saida(r);
      });
      break;
    }
    if (sub === 'status') {
      comEstado((e) => saida({ ok: true, task: e.id, ...resumoAjustes(e) }), { gravar: false });
      break;
    }
    comEstado(
      (e) => {
        let r;
        if (sub === 'registrar') {
          if (!pos[2]) falha('Informe o arquivo: wf ajuste registrar .workflow-ia/tasks/<ID>/ajustes/A-n.json');
          r = registrarClassificacao(raiz, e, config, path.resolve(pos[2]));
        } else {
          r = cancelarAjuste(raiz, e, { motivo: typeof flags.motivo === 'string' ? flags.motivo : 'cancelado' });
        }
        if (!r.ok) falha(r.mensagem, r);
        gravarEstado(raiz, e);
        saida(r);
      },
      { gravar: false }
    );
    break;
  }

  case 'decisao': {
    const sub = pos[1];
    if (!['pedir', 'aplicar', 'status'].includes(sub)) falha('Use "wf decisao pedir|aplicar|status".');
    if (sub === 'status') {
      comEstado(
        (e) => {
          const p = e.decisaoPendente;
          saida({
            ok: true,
            task: e.id,
            veredito: e.veredito,
            motivo: e.motivo,
            faseDoBloqueio: e.veredito ? faseDoBloqueio(e) : null,
            pendente: p ? { id: p.id, codigo: p.codigo, questions: p.questions, perguntaEmitida: perguntaEmitida(raiz, e), respostaRegistrada: respostasAtestadas(raiz, e).length > 0, respostasLivres: p.respostasLivres } : null,
            decisoes: e.decisoes || [],
            alertaForja: e.alertaForja || undefined,
          });
        },
        { gravar: false }
      );
      break;
    }
    let contexto = [];
    if (sub === 'pedir' && typeof flags.contexto === 'string') {
      if (!existe(flags.contexto)) falha(`Arquivo não encontrado: ${flags.contexto}`);
      contexto = lerJSON(flags.contexto);
    }
    comEstado(
      (e) => {
        const r = sub === 'pedir' ? pedirDecisao(raiz, e, config, { contexto, recomendar: typeof flags.recomendar === 'string' ? flags.recomendar : undefined, retomada: !!flags.retomada }) : aplicarDecisao(raiz, e, config);
        // Mesmo recusada, a aplicação pode ter mudado o estado (alerta de forja, resposta livre registrada).
        gravarEstado(raiz, e);
        if (!r.ok) falha(r.mensagem, r);
        saida(r);
      },
      { gravar: false }
    );
    break;
  }

  case 'doctor': {
    const checks = [];
    const add = (nome, ok, detalhe) => checks.push({ nome, ok, detalhe });
    add('config', existe(caminhos(raiz).config), path.relative(process.cwd(), caminhos(raiz).config));
    const g = git(raiz, ['rev-parse', '--is-inside-work-tree']);
    add('git', g.exit === 0, g.exit === 0 ? 'repositório git' : 'não é um repositório git');
    const b = git(raiz, ['rev-parse', '--verify', config.git.branchBase]);
    add('branch-base', b.exit === 0, `${config.git.branchBase}${b.exit === 0 ? '' : ' (não encontrado)'}`);
    const rt = caminhos(raiz).pluginRoot;
    const aqui = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
    add('plugin', true, `${aqui}${existe(rt) ? '' : ' (a sessão do Claude Code ainda não registrou o caminho; o atalho usa o caminho da instalação)'}`);
    // Informativo: a versão do plugin em uso x a que gravou o config (config.versao é o formato do config, outra coisa).
    const versaoPlugin = lerJSON(path.join(aqui, '.claude-plugin', 'plugin.json'), {}).version || null;
    add(
      'plugin-versao',
      true,
      !config.pluginVersao
        ? `plugin ${versaoPlugin}; o config não registra a versão do plugin (rode /workflow-ia:atualizar)`
        : config.pluginVersao === versaoPlugin
          ? `plugin ${versaoPlugin} (config gravado por esta versão)`
          : `plugin ${versaoPlugin}, mas o config foi gravado pela ${config.pluginVersao} (rode /workflow-ia:atualizar)`
    );
    // Cópia do plugin versionada em cada repositório (quem clona usa o Workflow IA sem instalar nada). Só informa.
    const copias = estadoDasCopias(raiz);
    add(
      'plugin-embutido',
      true,
      !copias.length
        ? 'sem repositório git: o plugin não está versionado no projeto'
        : copias
            .map((c) => `${c.repo === '.' ? 'raiz' : c.repo}: ${!c.existe ? `sem ${PASTA_EMBUTIDA} (rode /workflow-ia:atualizar)` : c.versao === versaoPlugin ? `${c.versao} (atualizada)` : `${c.versao ?? '?'}, plugin em uso ${versaoPlugin} (rode /workflow-ia:atualizar)`}`)
            .join('; ')
    );
    for (const e of config.gate.etapas) {
      const cmdE = resolverComando(config, e.comando);
      add(`gate:${e.nome}`, !!cmdE || !e.obrigatoria, cmdE || (e.obrigatoria ? 'OBRIGATÓRIA e não configurada' : 'não configurada (opcional)'));
    }
    {
      // Gate incremental: formato dos insumos e das sub-etapas; etapas sem insumos sempre rodam (informativo).
      const problemas = problemasConfigCache(config);
      const semInsumos = etapasSemInsumos(config);
      const ligado = config.gate.cacheEntreIteracoes !== false;
      // Avisos (não reprovam): glob que não casa nenhum arquivo versionado e insumo que alcança diretório ignorado.
      let avisosCache = [];
      try {
        avisosCache = problemas.length ? [] : avisosConfigCache(raiz, config);
      } catch (err) {
        avisosCache = [`não consegui conferir os globs dos insumos (${err.message})`];
      }
      const detalheCache = problemas.length ? problemas.join('; ') : !ligado ? 'desligado (gate.cacheEntreIteracoes: false): o loop roda todas as etapas' : semInsumos.length ? `ligado; sempre rodam (sem insumos): ${semInsumos.join(', ')}` : 'ligado; todas as etapas declaram insumos';
      add('gate-cache', !problemas.length, `${detalheCache}${avisosCache.length ? `; AVISO: ${avisosCache.join('; ')}` : ''}`);
    }
    {
      // dependeDe: nome inexistente, autodependência e ciclo reprovam; ordem invertida e dependência não obrigatória avisam.
      const { erros, avisos } = problemasDependencias(config);
      const com = config.gate.etapas.filter((e) => Array.isArray(e.dependeDe) && e.dependeDe.length).length;
      const detalhe = erros.length ? erros.join('; ') : com ? `${com} etapa(s) com dependeDe` : 'nenhuma etapa com dependeDe';
      add('gate-dependencias', !erros.length, `${detalhe}${avisos.length ? `; AVISO: ${avisos.join('; ')}` : ''}`);
    }
    {
      // Modo CI (0.7.0): formato do bloco ci; com ativo, apps/etapas vazios reprovam; gh ausente ou sem auth só avisa.
      const { erros, avisos } = validarConfigCI(config);
      const ci = config.ci;
      // 0.9.0: no critério "conteudo", app que lê arquivo fora da pasta sem declarar entradas (melhor esforço).
      if (ci && criterioDe(config) === 'conteudo') avisos.push(...avisosConteudo(raiz, config));
      let detalhe;
      if (erros.length) detalhe = erros.join('; ');
      else if (!ci || ci.ativo !== true) detalhe = `desligado${ci ? ` (ci.ativo: false; ligue com "wf ci ativar")` : ''}: tudo roda na máquina`;
      else detalhe = `ativo (${ci.provedor}, workflow "${ci.workflow}", fases ${ci.fases.join(', ')}; etapas no CI: ${[...ci.etapas, ...(ci.e2e ? ['teste-e2e'] : [])].join(', ')}; apps: ${Object.keys(ci.apps).join(', ')}; reaproveitamento por ${criterioDe(config)})`;
      add('ci', !erros.length, `${detalhe}${avisos.length ? `; AVISO: ${avisos.join('; ')}` : ''}`);
    }
    {
      // Desempenho do loop (0.6.0): valores inválidos reprovam; o resto é informativo.
      const g = config.gate;
      const problemas = [];
      const custoInvalido = g.etapas.filter((e) => e.custo !== undefined && !['baixo', 'medio', 'alto'].includes(e.custo)).map((e) => e.nome);
      if (custoInvalido.length) problemas.push(`custo inválido em: ${custoInvalido.join(', ')} (use baixo, medio ou alto)`);
      if (!(Number.isInteger(g.repetirPorCarga) && g.repetirPorCarga >= 0)) problemas.push('gate.repetirPorCarga deve ser um inteiro >= 0');
      if (!(Number.isInteger(g.paralelismo) && g.paralelismo >= 1)) problemas.push('gate.paralelismo deve ser um inteiro >= 1');
      const vagas = Number(config.recursos?.vagasPesadas) || 0;
      const pesadas = g.etapas.filter((e) => e.pesada).map((e) => e.nome);
      const focadoLigado = Number(config.versao) >= 7 && config.provas?.redFocado !== false && (config.provas?.redFocado === true || !!config.comandos.testeArquivos);
      const focado = !focadoLigado ? 'wf red completo (provas.redFocado desligado)' : config.comandos.testeArquivos || config.comandos.testeArquivo ? 'wf red focado' : 'wf red completo (sem testeArquivos/testeArquivo)';
      add('desempenho', problemas.length === 0, problemas.length ? problemas.join('; ') : `falharRapido ${g.falharRapido ? 'ligado' : 'desligado'}; repetirPorCarga ${g.repetirPorCarga}; paralelismo ${g.paralelismo}; vagas ${vagas ? `${vagas} (etapas pesadas: ${pesadas.join(', ') || 'nenhuma'})` : 'desligadas'}; ${focado}`);
    }
    {
      const rev = config.revisao;
      const modo = rev && typeof rev === 'object' ? rev.operacao : undefined;
      const problemas = [];
      if (!rev || typeof rev !== 'object') problemas.push('bloco "revisao" ausente ou inválido (rode /workflow-ia:atualizar)');
      else {
        if (!['condicional', 'sempre'].includes(modo)) problemas.push(`revisao.operacao = ${JSON.stringify(modo)} (use "condicional" ou "sempre"; hoje vale "condicional")`);
        if (!Array.isArray(rev.gatilhosOperacao) || rev.gatilhosOperacao.some((g) => typeof g !== 'string')) problemas.push('revisao.gatilhosOperacao deve ser uma lista de globs');
      }
      add('revisao', problemas.length === 0, problemas.length ? problemas.join('; ') : `ops-reviewer ${modo} (${rev.gatilhosOperacao.length} gatilhos)`);
    }
    const gi = existe(path.join(raiz, '.gitignore')) ? fs.readFileSync(path.join(raiz, '.gitignore'), 'utf8') : '';
    add('gitignore', gi.includes('.workflow-ia/runtime') && gi.includes('.workflow-ia/tasks'), 'runtime/ e tasks/ devem estar no .gitignore');
    const limpo = gitLimpo(raiz);
    add('working-tree', limpo.limpo, limpo.limpo ? 'limpo' : `alterações pendentes: ${limpo.sujos.slice(0, 5).join(', ')}`);
    // Seção host: o que este ambiente sustenta. Um humano no terminal não tem hooks nem lista de agentes
    // (informativo); dentro de um agente (Claude Code, SDK, CI) hook inativo é falha, porque a task nem deveria nascer.
    const amb = avaliarAmbiente({ raiz, config, ci: process.env.WORKFLOW_IA_CI === '1', sessao: chamadorEhAgente });
    const hostSecao = { hooks: amb.hooks, batimento: amb.batimento, agentes: amb.agentes, modo: amb.modo, chamador: chamadorEhAgente ? 'agente' : 'humano', prontoParaTask: amb.ok, avisos: amb.avisos };
    if (chamadorEhAgente) add('host-hooks', amb.hooks === 'sim', amb.hooks === 'sim' ? 'hooks do plugin ativos' : 'hooks do plugin SEM atividade: a task não deve começar (veja "wf ambiente")');
    const falhas = checks.filter((c) => !c.ok && !['working-tree'].includes(c.nome));
    saida({ ok: falhas.length === 0, checks, host: hostSecao, head: gitHead(raiz) }, falhas.length ? 1 : 0);
    break;
  }

  case 'githook': {
    const nome = pos[1];
    const stdin = nome === 'pre-push' && !process.stdin.isTTY ? fs.readFileSync(0, 'utf8') : '';
    const r = verificarGitHook(raiz, config, nome, { agente: chamadorEhAgente, stdin });
    if (r.aviso) process.stderr.write(`[Workflow IA] ${r.aviso}\n`);
    if (!r.ok) {
      process.stderr.write(`[Workflow IA] ${r.motivo}\n`);
      process.exit(1);
    }
    process.exit(0);
    break;
  }

  case 'exportar-agentes': {
    const formato = typeof flags.formato === 'string' ? flags.formato : 'sdk';
    const prefixo = typeof flags.prefixo === 'string' ? flags.prefixo : PREFIXO_NATIVO;
    let texto;
    try {
      texto = serializarAgentes(exportarAgentes({ prefixo }), formato);
    } catch (err) {
      falha(err.message);
    }
    if (typeof flags.saida === 'string') {
      fs.writeFileSync(flags.saida, texto);
      saida({ ok: true, arquivo: path.resolve(flags.saida), formato, prefixo, papeis: Object.keys(JSON.parse(serializarAgentes(exportarAgentes({ prefixo }), 'sdk'))).length });
    }
    process.stdout.write(texto);
    process.exit(0);
    break;
  }

  case 'ambiente': {
    if (flags.bloquear) {
      const id = typeof flags.bloquear === 'string' ? flags.bloquear : null;
      if (!id) falha('Uso: wf ambiente --bloquear <ID> --titulo "..."');
      const a = lerJSON(caminhos(raiz).ambiente, null);
      if (!a || a.ok) falha(a?.ok ? 'O ambiente está aprovado: crie a task normalmente com "wf init-task".' : 'Rode "wf ambiente --agentes-visiveis ..." antes: não há avaliação de ambiente reprovada para registrar.');
      const e = bloquearPorAmbiente(raiz, id, typeof flags.titulo === 'string' ? flags.titulo : '', a.motivo);
      saida({ ok: true, task: id, veredito: e.veredito, motivo: e.motivo, pasta: path.relative(raiz, caminhos(raiz, id).task), instrucoes: a.instrucoes, proximo: 'Salve o card em card.md, escreva report.md (motivo AMBIENTE + o que o humano deve fazer: ver instrucoes) e rode "wf encerrar".' });
    }
    let sdkInit = null;
    if (typeof flags['sdk-init'] === 'string') {
      if (!existe(flags['sdk-init'])) falha(`Arquivo não encontrado: ${flags['sdk-init']}`);
      sdkInit = lerJSON(flags['sdk-init']);
    }
    const visiveis = typeof flags['agentes-visiveis'] === 'string' ? lista(flags['agentes-visiveis']) : null;
    const r = avaliarAmbiente({ raiz, config, agentesVisiveis: visiveis, sdkInit, ci: process.env.WORKFLOW_IA_CI === '1', sessao: chamadorEhAgente });
    gravarAmbiente(raiz, r);
    saida(r, r.ok ? 0 : 5);
    break;
  }

  default:
    falha(`Comando desconhecido: ${cmd}. Rode "wf ajuda".`);
}
