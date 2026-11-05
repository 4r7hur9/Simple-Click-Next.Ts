// Ajuste pós-entrega: o humano testa uma task CONCLUIDA, encontra algo e a MESMA task volta a trabalhar, no
// mesmo branch e na mesma pasta, pelo processo completo (/workflow-ia:ajustar <ID> "<o que viu>"):
//
//   análise (spec-analyst, a partir do código atual do branch) → spec (só muda com aval do humano)
//   → plano (seção do ajuste, ciclo novo de revisão) → testes de regressão (RED do ajuste) → implementação
//   → loop → verificação (cada ponto do feedback julgado) → entrega (relatório e PR com o histórico).
//
// Cada ponto do feedback (A-n.k) é "correção" (o comportamento já estava combinado no spec) ou "mudança"
// (comportamento novo ou alterado). Mudança só entra com a decisão humana AJUSTE_MUDA_SPEC.
// A entrega anterior (relatório, PR, verificação, manifest) fica arquivada: as provas novas atestam o HEAD novo.

import fs from 'node:fs';
import path from 'node:path';
import {
  caminhos,
  existe,
  lerJSON,
  gravarJSON,
  agoraISO,
  idTaskAtiva,
  gitBranchAtual,
  gitHead,
  gitLimpo,
  git,
  refBase,
  baseDaTask,
  rodadasRevisao,
  reabrirEstado,
  marcarRegistro,
  definirTaskAtiva,
  sha256,
} from './core.mjs';
import { fotografarTestes, criteriosDaTask } from './provas.mjs';

const ATIVOS = ['analise', 'aguardando-decisao', 'em-andamento'];

export const CODIGO_DECISAO_AJUSTE = 'AJUSTE_MUDA_SPEC';

export function ajusteAtivo(estado) {
  return estado?.ajuste && ATIVOS.includes(estado.ajuste.status) ? estado.ajuste : null;
}

/** Ajuste desta entrega: o ativo ou, depois do veredito CONCLUIDA, o que acabou de ir para o histórico. */
export function ajusteDaEntrega(estado) {
  const a = ajusteAtivo(estado);
  if (a) return a;
  const n = (estado?.entregas || []).length + 1;
  return (estado?.ajustes || []).filter((y) => y.status === 'concluido' && y.entrega === n).pop() || null;
}

/** Pontos de um ajuste que a verificação julga (os descartados pelo humano ficam de fora). */
export function pontosDoAjuste(a) {
  return a ? (a.itens || []).filter((i) => !i.descartado) : [];
}

/** O ajuste em andamento tem pontos a provar com o RED do ajuste? (Descartados todos, não há o que reproduzir.) */
export function exigeRedAjuste(estado) {
  return ajusteEmAndamento(estado) && pontosDoAjuste(estado.ajuste).length > 0;
}

/**
 * O que o humano aprova na decisão AJUSTE_MUDA_SPEC: os pontos de mudança e os critérios propostos.
 * A decisão guarda esta assinatura; se o ajuste mudar (outro ajuste, outra análise), a resposta não vale.
 */
export function assinaturaAjuste(a) {
  if (!a) return null;
  const mud = (a.itens || []).filter((i) => i.tipo === 'mudanca' && !i.descartado).map((i) => ({ id: i.id, descricao: i.descricao }));
  return sha256(JSON.stringify({ id: a.id, mud, specProposto: a.specProposto || null }));
}

/** Análise registrada e decidida: o ajuste está no pipeline (plano, testes, implementação, loop, verificação). */
export function ajusteEmAndamento(estado) {
  return ajusteAtivo(estado)?.status === 'em-andamento';
}

/** O humano autorizou mudança de comportamento neste ajuste (spec recongelado)? */
export function ajusteComMudanca(estado) {
  const a = ajusteAtivo(estado);
  return !!a && a.itens.some((i) => i.tipo === 'mudanca' && !i.descartado);
}

/** Pontos do ajuste ativo que a verificação independente julga (os descartados pelo humano ficam de fora). */
export function itensParaJulgar(estado) {
  return pontosDoAjuste(ajusteAtivo(estado));
}

export function caminhoRedAjuste(raiz, estado, id) {
  const aid = id || ajusteAtivo(estado)?.id;
  return aid ? path.join(caminhos(raiz, estado.id).evidencias, `red-${aid}.json`) : null;
}

/** Commit atestado da última entrega (base da primeira revisão completa do ajuste). */
export function commitDaUltimaEntrega(estado) {
  const e = estado?.entregas || [];
  return e.length ? e[e.length - 1].commit : null;
}

/**
 * Commit que a entrega atestou: o do manifest (veredito) ou o da verificação independente. Os commits que o humano
 * fez depois da entrega ficam DEPOIS dele, e por isso entram na primeira revisão do ajuste.
 */
function commitAtestadoDaEntrega(raiz, estado) {
  const c = caminhos(raiz, estado.id);
  return lerJSON(c.manifest, null)?.commit || lerJSON(c.verificacao, null)?.commit || null;
}

/**
 * PR mergeado por squash ou rebase: o HEAD do branch não é ancestral da base, mas o conteúdo dos arquivos que o
 * branch mudou já está nela.
 */
function conteudoJaNaBase(raiz, base) {
  const mb = git(raiz, ['merge-base', base, 'HEAD']);
  if (mb.exit !== 0 || !mb.out) return false;
  const arquivos = git(raiz, ['diff', '--name-only', mb.out, 'HEAD']).out.split('\n').filter(Boolean);
  if (!arquivos.length) return false;
  return git(raiz, ['diff', '--quiet', base, 'HEAD', '--', ...arquivos]).exit === 0;
}

function proximoArquivo(dir, prefixo, ext) {
  let n = 1;
  while (existe(path.join(dir, `${prefixo}-${n}.${ext}`))) n += 1;
  return path.join(dir, `${prefixo}-${n}.${ext}`);
}

function moverSeExiste(origem, destino) {
  if (!origem || !existe(origem)) return null;
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.renameSync(origem, destino);
  return destino;
}

function linhaDecisoes(raiz, estado, colunas) {
  const c = caminhos(raiz, estado.id);
  const celula = (t) => String(t ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
  try {
    const atual = existe(c.decisoes) ? fs.readFileSync(c.decisoes, 'utf8') : '';
    fs.writeFileSync(c.decisoes, `${atual}${atual && !atual.endsWith('\n') ? '\n' : ''}| ${colunas.map(celula).join(' | ')} |\n`);
  } catch {
    /* a fonte de verdade é state.json (ajuste/ajustes); decisoes.md é a cópia para leitura */
  }
}

/** Arquiva a entrega atual (relatório, texto do PR, verificação, manifest) para que as provas novas atestem o HEAD novo. */
export function arquivarEntrega(raiz, estado, n) {
  const c = caminhos(raiz, estado.id);
  const dir = path.join(c.entregas, String(n));
  const rel = (p) => (p ? path.relative(raiz, p) : null);
  return {
    report: rel(moverSeExiste(c.relatorio, path.join(c.relatorios, `entrega-${n}-report.md`))),
    pr: rel(moverSeExiste(c.pr, path.join(c.relatorios, `entrega-${n}-pr.md`))),
    verificacao: rel(moverSeExiste(c.verificacao, path.join(dir, 'verificacao.json'))),
    julgamento: rel(moverSeExiste(c.julgamento, path.join(dir, 'verificacao-julgamento.json'))),
    manifest: rel(moverSeExiste(c.manifest, path.join(dir, 'manifest.json'))),
    gateVerificacao: rel(moverSeExiste(path.join(c.evidencias, 'verificacao'), path.join(dir, 'verificacao'))),
    // Baseline do RED anterior: no lugar dele entra a fotografia dos testes no estado entregue.
    baselineRed: rel(moverSeExiste(c.baselineTestes, path.join(dir, 'baseline-testes-red.json'))),
  };
}

function restaurarEntrega(raiz, estado, entrega) {
  const c = caminhos(raiz, estado.id);
  const abs = (p) => (p ? path.join(raiz, p) : null);
  const a = entrega.arquivos || {};
  moverSeExiste(abs(a.report), c.relatorio);
  moverSeExiste(abs(a.pr), c.pr);
  moverSeExiste(abs(a.verificacao), c.verificacao);
  moverSeExiste(abs(a.julgamento), c.julgamento);
  moverSeExiste(abs(a.manifest), c.manifest);
  moverSeExiste(abs(a.gateVerificacao), path.join(c.evidencias, 'verificacao'));
  if (a.baselineRed) moverSeExiste(abs(a.baselineRed), c.baselineTestes);
  else fs.rmSync(c.baselineTestes, { force: true });
  try {
    fs.rmdirSync(path.join(c.entregas, String(entrega.n)));
  } catch {
    /* sobrou algo ou já não existe */
  }
}

/** Reabre uma task CONCLUIDA encerrada com o feedback do humano: volta à fase spec para a análise do ajuste. */
export function abrirAjuste(raiz, estado, config, texto) {
  const feedback = String(texto || '').trim();
  if (!feedback) return { ok: false, mensagem: 'Passe o que você viu: wf ajuste abrir <ID> --texto "<o que você viu testando>".' };
  if (estado.modo === 'revisao') return { ok: false, mensagem: 'Revisão não tem entrega para ajustar.' };
  if (ajusteAtivo(estado)) return { ok: false, mensagem: `O ajuste ${estado.ajuste.id} ainda está em andamento nesta task: siga "wf proximo".` };
  if (estado.veredito !== 'CONCLUIDA' || estado.fase !== 'encerrada') {
    const como = ['BLOQUEADA', 'INTERROMPIDA'].includes(estado.veredito) ? ` Ela parou ${estado.veredito}: use /workflow-ia:retomar ${estado.id} (o agente pergunta o que você decide e continua).` : ` Se ela ainda está em andamento, continue com /workflow-ia:retomar ${estado.id}.`;
    return { ok: false, mensagem: `Ajuste pós-entrega só reabre task CONCLUIDA e encerrada (a ${estado.id} está ${estado.veredito || estado.status}, fase ${estado.fase}).${como}` };
  }
  const ativa = idTaskAtiva(raiz);
  if (ativa && ativa !== estado.id) {
    const outra = lerJSON(caminhos(raiz, ativa).estado, null);
    if (outra && outra.fase !== 'encerrada') return { ok: false, mensagem: `Há outra task ativa não encerrada (${ativa}). Termine-a antes de ajustar ${estado.id}.` };
  }
  const branch = estado.meta?.branch;
  if (!branch) return { ok: false, mensagem: `A task ${estado.id} não registrou o branch (meta.branch): não há onde continuar.` };
  if (gitBranchAtual(raiz) !== branch) return { ok: false, mensagem: `Volte ao branch da task antes de ajustar: git switch ${branch} (atual: ${gitBranchAtual(raiz)}).` };
  const limpeza = gitLimpo(raiz);
  if (!limpeza.limpo) return { ok: false, mensagem: 'Há alterações não commitadas no branch da task: faça commit ou descarte antes de reabrir.', sujos: limpeza.sujos };
  const base = refBase(raiz, baseDaTask(estado, config));
  if (git(raiz, ['merge-base', '--is-ancestor', 'HEAD', base]).exit === 0) {
    return { ok: false, mensagem: `O branch ${branch} já está contido em ${base} (o PR foi mergeado). A rastreabilidade dos testes [CA-n] depende do diff contra a base: abra um card novo para o ajuste.` };
  }
  if (conteudoJaNaBase(raiz, base)) {
    return { ok: false, mensagem: `O conteúdo do branch ${branch} já está em ${base} (PR mergeado por squash ou rebase). A rastreabilidade dos testes [CA-n] depende do diff contra a base: abra um card novo para o ajuste.` };
  }

  const c = caminhos(raiz, estado.id);
  const n = (estado.entregas || []).length + 1;
  const head = gitHead(raiz);
  // O commit que a entrega atestou (não o HEAD de agora): os commits do humano depois da entrega entram na revisão.
  const commit = commitAtestadoDaEntrega(raiz, estado) || head;
  const arquivos = arquivarEntrega(raiz, estado, n);
  // Baseline anti-enfraquecimento = os testes como foram entregues (inclui os escritos depois do RED anterior).
  gravarJSON(c.baselineTestes, { commit: head, em: agoraISO(), arquivos: fotografarTestes(raiz, config), entrega: n });
  estado.entregas = [...(estado.entregas || []), { n, commit, commitReabertura: head, em: estado.encerradaEm || agoraISO(), veredito: estado.veredito, rodadasRevisao: rodadasRevisao(estado), arquivos }];
  // O plano ganha um ciclo novo de revisão: a seção do ajuste é revisada antes dos testes.
  let planoRevisaoArquivado = null;
  if (existe(c.planoRevisao)) {
    fs.mkdirSync(c.relatorios, { recursive: true });
    planoRevisaoArquivado = proximoArquivo(c.relatorios, 'plano-revisao-ciclo', 'json');
    fs.renameSync(c.planoRevisao, planoRevisaoArquivado);
  }
  const id = `A-${(estado.ajustes || []).length + 1}`;

  const limitesAntes = { limitesExtra: estado.limitesExtra || null, janelaProgressoDesde: estado.janelaProgressoDesde ?? null };
  reabrirEstado(raiz, estado, { fase: 'spec', evento: `ajuste ${id} pedido pelo humano depois da entrega ${n}`, retomada: { ajuste: id, fase: 'plano' } });
  // Orçamento novo para o ajuste: as rodadas já feitas continuam no histórico, mas não consomem as do ajuste.
  estado.limitesExtra = { ...(estado.limitesExtra || {}), iteracoes: rodadasRevisao(estado) };
  estado.janelaProgressoDesde = estado.iteracao;
  estado.retornoVerificacao = null;
  // Nenhuma decisão anterior vale para este ajuste: a resposta do humano é sempre sobre o ajuste que ele vê.
  estado.decisaoPendente = null;
  estado.ajusteSpecAutorizado = null;
  estado.ajuste = {
    id,
    texto: feedback,
    em: agoraISO(),
    status: 'analise',
    caminho: null,
    itens: [],
    desdeIteracao: estado.iteracao,
    aposEntrega: n,
    commitBase: commit,
    commitReabertura: head,
    planoRevisaoArquivado: planoRevisaoArquivado ? path.relative(raiz, planoRevisaoArquivado) : null,
    limitesAntes,
    decisao: null,
  };
  linhaDecisoes(raiz, estado, [id, 'ajuste', `Feedback do humano depois da entrega ${n} (commit ${commit.slice(0, 7)}): "${feedback}"`, '—', 'Pedido pelo humano via /workflow-ia:ajustar', 'humano']);
  return {
    ok: true,
    ajuste: id,
    entregaArquivada: { n, commit, arquivos },
    proximo: `Task ${estado.id} reaberta no branch ${branch} para o ajuste ${id}, na fase spec. Delegue ao spec-analyst a análise do ajuste a partir do código atual do branch (ajustes/${id}.md e ajustes/${id}.json) e rode "wf ajuste registrar .workflow-ia/tasks/${estado.id}/ajustes/${id}.json".`,
  };
}

function validarItemAjuste(item, i, criteriosDoSpec) {
  const erros = [];
  const onde = `item ${i + 1}`;
  if (!item || typeof item !== 'object') return [`${onde}: objeto inválido.`];
  if (typeof item.descricao !== 'string' || !item.descricao.trim()) erros.push(`${onde}: "descricao" obrigatória.`);
  if (!['correcao', 'mudanca'].includes(item.tipo)) erros.push(`${onde}: "tipo" deve ser "correcao" (já estava no spec) ou "mudanca" (comportamento novo/alterado).`);
  if (item.criterios !== undefined && (!Array.isArray(item.criterios) || item.criterios.some((x) => !/^CA-\d+$/.test(String(x))))) erros.push(`${onde}: "criterios" deve ser uma lista de "CA-n".`);
  if (item.tipo === 'correcao' && !(Array.isArray(item.criterios) && item.criterios.length)) erros.push(`${onde}: correção aponta o critério (CA-n) que o código violou; se nenhum critério cobre o que o humano viu, é "mudanca".`);
  // Correção só vale contra um critério que existe no spec congelado: citar um CA inexistente seria mudança sem o humano.
  const inexistentes = item.tipo === 'correcao' && Array.isArray(item.criterios) ? item.criterios.filter((x) => !criteriosDoSpec.includes(String(x))) : [];
  if (inexistentes.length) erros.push(`${onde}: ${inexistentes.join(', ')} não existe(m) no spec congelado (${criteriosDoSpec.join(', ') || 'sem critérios'}). Sem critério que já combine o comportamento, o ponto é "mudanca".`);
  if (typeof item.justificativa !== 'string' || !item.justificativa.trim()) erros.push(`${onde}: "justificativa" obrigatória (por que é correção ou mudança, com a evidência no código).`);
  return erros;
}

/** Registra a análise do spec-analyst (ajustes/A-n.json + ajustes/A-n.md). Mudança de comportamento pede decisão humana. */
export function registrarClassificacao(raiz, estado, config, arquivo) {
  const a = ajusteAtivo(estado);
  if (!a) return { ok: false, mensagem: 'Não há ajuste pós-entrega em andamento (use /workflow-ia:ajustar <ID> "<o que você viu>").' };
  if (a.status !== 'analise') return { ok: false, mensagem: `A análise do ${a.id} já foi registrada (status ${a.status}). Siga "wf proximo".` };
  const dir = caminhos(raiz, estado.id).ajustes;
  const esperado = path.join(dir, `${a.id}.json`);
  // Compara caminhos reais: no macOS /var é link para /private/var, e a raiz do projeto vem resolvida.
  const real = (p) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  if (!existe(esperado)) return { ok: false, mensagem: `Arquivo não encontrado: ${path.relative(raiz, esperado)} (a análise do ${a.id}, escrita pelo spec-analyst).` };
  if (real(arquivo) !== real(esperado)) return { ok: false, mensagem: `A análise do ${a.id} fica em ${path.relative(raiz, esperado)} (escrita pelo spec-analyst).` };
  const doc = path.join(dir, `${a.id}.md`);
  if (!existe(doc) || !fs.readFileSync(doc, 'utf8').trim()) return { ok: false, mensagem: `Falta a documentação da análise em ${path.relative(raiz, doc)} (o que o humano viu, como reproduzir, causa no código, pontos e critérios afetados).` };
  let dados;
  try {
    dados = JSON.parse(fs.readFileSync(esperado, 'utf8'));
  } catch (e) {
    return { ok: false, mensagem: `JSON inválido em ${path.relative(raiz, esperado)}: ${e.message}` };
  }
  const brutos = dados?.itens;
  if (!Array.isArray(brutos) || !brutos.length) return { ok: false, mensagem: 'A análise precisa de "itens": um por ponto do feedback.' };
  const criteriosDoSpec = criteriosDaTask(raiz, estado);
  const erros = brutos.flatMap((b, i) => validarItemAjuste(b, i, criteriosDoSpec));
  const temMudanca = brutos.some((b) => b?.tipo === 'mudanca');
  if (temMudanca && (typeof dados.specProposto !== 'string' || !/CA-\d+/.test(dados.specProposto))) {
    erros.push('Há ponto de mudança: "specProposto" deve trazer o texto dos critérios novos ou alterados (### CA-n: ...), para o humano aprovar.');
  }
  if (erros.length) return { ok: false, mensagem: 'Análise inválida.', erros };

  a.itens = brutos.map((b, k) => ({
    id: `${a.id}.${k + 1}`,
    descricao: b.descricao.trim(),
    tipo: b.tipo,
    criterios: b.criterios || [],
    arquivo: b.arquivo || null,
    reproducao: typeof b.reproducao === 'string' ? b.reproducao.trim() : null,
    justificativa: b.justificativa.trim(),
    descartado: false,
  }));
  a.specProposto = temMudanca ? dados.specProposto.trim() : null;
  a.documentacao = path.relative(raiz, doc);
  a.analisadoEm = agoraISO();
  a.commitAnalisado = gitHead(raiz);
  const mudancas = a.itens.filter((i) => i.tipo === 'mudanca');
  if (mudancas.length) {
    a.status = 'aguardando-decisao';
    a.caminho = mudancas.length === a.itens.length ? 'mudanca' : 'misto';
    return {
      ok: true,
      ajuste: a.id,
      correcoes: a.itens.filter((i) => i.tipo === 'correcao').map((i) => i.id),
      mudancas: mudancas.map((i) => i.id),
      specProposto: a.specProposto,
      proximo: `Há ${mudancas.length} ponto(s) que mudam o comportamento combinado no spec (${mudancas.map((i) => i.id).join(', ')}): só o humano autoriza. Mostre os critérios propostos numa pergunta de contexto, rode "wf decisao pedir --contexto <arquivo>", chame AskUserQuestion com as perguntas devolvidas e rode "wf decisao aplicar".`,
    };
  }
  a.caminho = 'correcao';
  a.status = 'em-andamento';
  return { ok: true, ajuste: a.id, correcoes: a.itens.map((i) => i.id), mudancas: [], proximo: 'Todos os pontos são correções dentro do spec atual: rode "wf fase plano" e delegue ao arquiteto a seção do ajuste no plan.md.' };
}

/** Opções de "Como seguir?" para pontos que mudam o comportamento combinado. */
export function opcoesAjuste(estado) {
  const a = estado.ajuste;
  const mud = (a?.itens || []).filter((i) => i.tipo === 'mudanca' && !i.descartado).map((i) => i.id).join(', ');
  return [
    { label: 'Ajustar o spec (comportamento novo)', description: `Os pontos ${mud} entram no spec como critérios novos/alterados (os propostos na análise) e passam por plano, testes RED, implementação e verificação. [efeito: autoriza recongelar o spec]`, efeito: { tipo: 'ajuste-mudanca' } },
    { label: 'Tratar como correção', description: `Os pontos ${mud} seguem como correção dentro do spec atual, sem critério novo. [efeito: spec fica como está]`, efeito: { tipo: 'ajuste-correcao' } },
    { label: 'Descartar esses pontos', description: `Os pontos ${mud} ficam fora (registrados em decisoes.md). [efeito: descarta; o resto do ajuste segue, ou a entrega anterior volta se não sobrar nada]`, efeito: { tipo: 'ajuste-descartar' } },
  ];
}

/** Aplica a decisão humana sobre os pontos de mudança do ajuste ativo. */
export function aplicarEfeitoAjuste(raiz, estado, config, decisao) {
  const a = ajusteAtivo(estado);
  if (!a || a.status !== 'aguardando-decisao') return { ok: false, mensagem: 'Não há ajuste aguardando decisão.' };
  a.decisao = decisao.id;
  const mudancas = a.itens.filter((i) => i.tipo === 'mudanca' && !i.descartado);
  const tipo = decisao.efeito.tipo;
  if (tipo === 'ajuste-correcao') {
    for (const i of mudancas) {
      i.tipo = 'correcao';
      i.reclassificadoPor = decisao.id;
    }
    a.caminho = 'correcao';
    a.specProposto = null;
    a.status = 'em-andamento';
    return { ok: true, efeito: tipo, proximo: `Decisão ${decisao.id}: os pontos seguem como correção, sem mudar o spec. Rode "wf fase plano" e delegue ao arquiteto a seção do ajuste no plan.md.` };
  }
  if (tipo === 'ajuste-descartar') {
    for (const i of mudancas) {
      i.descartado = true;
      i.descartadoPor = decisao.id;
    }
    a.specProposto = null;
    if (!a.itens.some((i) => !i.descartado)) {
      const r = cancelarAjuste(raiz, estado, { motivo: `todos os pontos descartados pelo humano (${decisao.id})` });
      if (r.ok) return { ok: true, efeito: tipo, ...r };
      // O branch mudou desde a reabertura: não dá para devolver a entrega anterior. Segue o pipeline sem pontos
      // (sem RED do ajuste), com revisão e verificação do que mudou desde a entrega.
    }
    a.caminho = 'correcao';
    a.status = 'em-andamento';
    const sobrou = pontosDoAjuste(a).length;
    return {
      ok: true,
      efeito: tipo,
      proximo: sobrou
        ? `Decisão ${decisao.id}: pontos descartados. Rode "wf fase plano" e siga com o que sobrou do ajuste.`
        : `Decisão ${decisao.id}: todos os pontos descartados, mas o branch mudou desde a reabertura e a entrega anterior não vale mais. Siga o pipeline (plano, implementação sem RED do ajuste, loop e verificação) para entregar o código atual.`,
    };
  }
  // ajuste-mudanca: o humano autorizou mudar o comportamento combinado (os critérios propostos na análise).
  a.status = 'em-andamento';
  estado.ajusteSpecAutorizado = decisao.id;
  estado.historicoFases.push({ fase: estado.fase, em: agoraISO(), evento: `ajuste ${a.id}: mudança de spec autorizada pela decisão ${decisao.id}` });
  return {
    ok: true,
    efeito: tipo,
    proximo: `Decisão ${decisao.id}: delegue ao spec-analyst a aplicação no spec.md dos critérios aprovados (specProposto do ${a.id}), rode "wf spec aceitar-ajuste" e depois "wf fase plano".`,
  };
}

/** Desiste do ajuste antes de qualquer mudança: a entrega anterior volta a valer e a task é re-encerrada como CONCLUIDA. */
export function cancelarAjuste(raiz, estado, { motivo = 'cancelado' } = {}) {
  const a = ajusteAtivo(estado);
  if (!a) return { ok: false, mensagem: 'Não há ajuste pós-entrega em andamento.' };
  if (!['analise', 'aguardando-decisao'].includes(a.status)) return { ok: false, mensagem: `O ajuste ${a.id} já está no pipeline (plano, testes ou implementação): siga até a entrega.` };
  const entrega = (estado.entregas || [])[estado.entregas.length - 1];
  if (!entrega) return { ok: false, mensagem: 'Não há entrega anterior registrada para restaurar.' };
  const reaberto = entrega.commitReabertura || entrega.commit;
  if (gitHead(raiz) !== reaberto) return { ok: false, mensagem: `O branch mudou desde a reabertura da entrega ${entrega.n} (${reaberto.slice(0, 7)} → ${gitHead(raiz).slice(0, 7)}): a entrega anterior não vale mais para este código. Siga o ajuste até a nova entrega.` };
  const c = caminhos(raiz, estado.id);
  restaurarEntrega(raiz, estado, entrega);
  if (a.planoRevisaoArquivado && !existe(c.planoRevisao)) moverSeExiste(path.join(raiz, a.planoRevisaoArquivado), c.planoRevisao);
  estado.entregas = estado.entregas.slice(0, -1);
  estado.ajustes = [...(estado.ajustes || []), { ...a, status: 'cancelado', canceladoEm: agoraISO(), motivoCancelamento: motivo }];
  estado.ajuste = null;
  estado.retornoVerificacao = null;
  estado.retomada = null;
  estado.ajusteSpecAutorizado = null;
  // Uma pergunta feita sobre este ajuste não vale para nenhum outro: a resposta (mesmo já dada) é descartada.
  estado.decisaoPendente = null;
  if (a.limitesAntes) {
    estado.limitesExtra = a.limitesAntes.limitesExtra;
    estado.janelaProgressoDesde = a.limitesAntes.janelaProgressoDesde;
  }
  estado.veredito = 'CONCLUIDA';
  estado.status = 'CONCLUIDA';
  estado.fase = 'encerrada';
  estado.encerradaEm = agoraISO();
  estado.historicoFases.push({ fase: 'encerrada', em: estado.encerradaEm, evento: `ajuste ${a.id} cancelado: ${motivo}; a entrega ${entrega.n} volta a valer` });
  marcarRegistro(raiz, estado.id, { encerradaEm: estado.encerradaEm, veredito: estado.veredito });
  definirTaskAtiva(raiz, null);
  linhaDecisoes(raiz, estado, [a.id, 'ajuste', `Ajuste cancelado: ${motivo}. A entrega ${entrega.n} (commit ${entrega.commit.slice(0, 7)}) volta a valer.`, '—', '—', 'humano']);
  return { ok: true, cancelado: a.id, entregaRestaurada: entrega.n, mensagem: `Ajuste ${a.id} cancelado: a entrega ${entrega.n} volta a valer e a task está encerrada como CONCLUIDA.` };
}

/** Blocos "CA-n → texto" de um spec (do título/linha do critério até o próximo critério ou título). */
export function blocosDeCriterios(texto) {
  const linhas = String(texto || '').split('\n');
  const titulo = (l) => l.match(/^\s*#{1,6}\s*[*_~\s]*(CA-\d+)\b/);
  const lista = (l) => l.match(/^\s*(?:[-*]\s*)?(?:\*\*)?~*(CA-\d+)\b\s*~*(?:\*\*)?\s*[:(]/);
  const temTitulo = linhas.some((l) => titulo(l));
  const blocos = new Map();
  let atual = null;
  for (const l of linhas) {
    const m = temTitulo ? titulo(l) : lista(l);
    if (m) {
      atual = m[1];
      blocos.set(atual, [l]);
    } else if (atual && /^\s*#{1,6}\s/.test(l)) {
      atual = null;
    } else if (atual) {
      blocos.get(atual).push(l);
    }
  }
  const norm = (ls) => ls.join('\n').replace(/\s+/g, ' ').trim();
  return new Map([...blocos].map(([id, ls]) => [id, norm(ls)]));
}

/**
 * Recongelamento autorizado por uma decisão de ajuste: o spec novo só pode diferir do congelado nos critérios que
 * o humano aprovou (specProposto), e exatamente como aprovados. Qualquer outro critério novo, alterado ou removido
 * não teve aval.
 */
export function conferirSpecDoAjuste(raiz, estado) {
  const a = ajusteAtivo(estado);
  if (!a || !estado.ajusteSpecAutorizado || a.decisao !== estado.ajusteSpecAutorizado) return { ok: true, aplicavel: false };
  const c = caminhos(raiz, estado.id);
  const proposto = blocosDeCriterios(a.specProposto || '');
  if (!proposto.size) return { ok: false, erros: [`O ajuste ${a.id} não tem critérios propostos (specProposto) para aplicar.`] };
  const copia = path.join(c.evidencias, 'spec-congelado.md');
  const antes = existe(copia) ? blocosDeCriterios(fs.readFileSync(copia, 'utf8')) : null;
  const depois = blocosDeCriterios(existe(c.spec) ? fs.readFileSync(c.spec, 'utf8') : '');
  const conhecidos = new Set([...(antes ? antes.keys() : estado.specCongelado?.criterios || []), ...proposto.keys()]);
  const erros = [];
  for (const [id, texto] of proposto) {
    if (depois.get(id) !== texto) erros.push(`${id} não está no spec exatamente como o humano aprovou (specProposto do ${a.id}).`);
  }
  if (antes) {
    for (const [id, texto] of antes) {
      if (!proposto.has(id) && depois.get(id) !== texto) erros.push(`${id} ${depois.has(id) ? 'foi alterado' : 'foi removido'} sem estar entre os critérios aprovados.`);
    }
  }
  for (const id of depois.keys()) if (!conhecidos.has(id)) erros.push(`${id} é novo e não estava entre os critérios aprovados.`);
  return erros.length ? { ok: false, erros } : { ok: true, aplicavel: true };
}

/** Veredito CONCLUIDA com ajuste ativo: o ajuste vai para o histórico. */
export function concluirAjuste(estado) {
  const a = ajusteAtivo(estado);
  if (!a) return;
  estado.ajustes = [...(estado.ajustes || []), { ...a, status: 'concluido', concluidoEm: agoraISO(), entrega: (estado.entregas || []).length + 1 }];
  estado.ajuste = null;
  estado.retomada = null;
}

/** Resumo para "wf ajuste status". */
export function resumoAjustes(estado) {
  const a = estado.ajuste;
  return {
    atual: a ? { id: a.id, status: a.status, caminho: a.caminho, texto: a.texto, documentacao: a.documentacao || null, itens: (a.itens || []).map((i) => ({ id: i.id, tipo: i.tipo, descartado: i.descartado, criterios: i.criterios, descricao: i.descricao })), specProposto: a.specProposto || null, decisao: a.decisao } : null,
    historico: (estado.ajustes || []).map((x) => ({ id: x.id, status: x.status, caminho: x.caminho, entrega: x.entrega || null, texto: x.texto, documentacao: x.documentacao || null })),
    entregas: (estado.entregas || []).map((e) => ({ n: e.n, commit: e.commit, em: e.em, arquivos: e.arquivos })),
  };
}
