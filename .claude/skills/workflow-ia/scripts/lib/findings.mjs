// Registro de findings: a memória do loop de correção.

import { caminhos, lerJSON, gravarJSON, agoraISO, sha1Curto, SEVERIDADES, gitHead, comLock } from './core.mjs';

export const ABERTOS = ['aberto', 'reaberto'];
export const PENDENTES_VERIFICACAO = ['corrigido'];

// Prefixo da categoria -> revisor responsável pela re-revisão.
export const REVISOR_POR_PREFIXO = {
  seguranca: 'security-reviewer',
  performance: 'performance-reviewer',
  qualidade: 'quality-reviewer',
  testes: 'test-reviewer',
  operacao: 'ops-reviewer',
  gate: null, // verificado pelo próprio gate
  verificacao: 'verificador-final',
};

export function prefixo(categoria) {
  return String(categoria || '').split('/')[0];
}

export function lerFindings(raiz, id) {
  const c = caminhos(raiz, id);
  return lerJSON(c.findings, { versao: 1, proximoId: 1, itens: [] });
}

export function gravarFindings(raiz, id, dados) {
  gravarJSON(caminhos(raiz, id).findings, dados);
}

function novoId(dados) {
  const n = dados.proximoId || dados.itens.length + 1;
  dados.proximoId = n + 1;
  return `F-${String(n).padStart(3, '0')}`;
}

export function fingerprintPadrao(item) {
  const desc = String(item.descricao || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 80);
  return sha1Curto(`${item.categoria}|${item.arquivo || ''}|${desc}`);
}

function historico(f, de, para, por, nota) {
  f.historico = f.historico || [];
  f.historico.push({ em: agoraISO(), de, para, por: por || 'wf', nota: nota || undefined });
}

export function validarItem(item, i) {
  const erros = [];
  if (!item || typeof item !== 'object') return [`item ${i}: não é objeto`];
  if (!SEVERIDADES.includes(item.severidade)) erros.push(`item ${i}: severidade "${item.severidade}" inválida (use ${SEVERIDADES.join(', ')})`);
  if (!item.categoria || !String(item.categoria).includes('/')) erros.push(`item ${i}: categoria deve ter o formato "<area>/<tema>" (ex.: seguranca/autorizacao)`);
  else if (!(prefixo(item.categoria) in REVISOR_POR_PREFIXO)) erros.push(`item ${i}: área "${prefixo(item.categoria)}" desconhecida (use ${Object.keys(REVISOR_POR_PREFIXO).join(', ')})`);
  if (!item.descricao) erros.push(`item ${i}: descricao obrigatória`);
  if (item.status && !['aberto', 'falso-positivo'].includes(item.status)) erros.push(`item ${i}: na mesclagem o status só pode ser "aberto" ou "falso-positivo"`);
  if (item.status === 'falso-positivo' && !item.motivo) erros.push(`item ${i}: falso-positivo exige "motivo"`);
  return erros;
}

/**
 * Mescla a saída consolidada da triagem (ou de um revisor) no registro.
 * - itens com id existente: atualizam/reabrem
 * - itens sem id: casam por fingerprint ou viram finding novo
 * - revisados: prefixos de categoria re-revisados nesta rodada; findings
 *   "corrigido" desses prefixos que não voltaram a aparecer viram "verificado".
 */
export function mesclar(raiz, estado, itens, opcoes = {}) {
  return comLock(raiz, () => mesclarSemLock(raiz, estado, itens, opcoes));
}

// Bloqueante descartado (falso-positivo) só vale depois que o verificador-final confirma.
function marcarFalsoPositivo(f, motivo, por, bloq) {
  historico(f, f.status, 'falso-positivo', por, motivo);
  f.status = 'falso-positivo';
  f.motivo = motivo;
  f.verificado = false;
  f.confirmacaoPendente = bloq.includes(f.severidade);
}

function mesclarSemLock(raiz, estado, itens, { revisados = [], por = 'triager', bloqueiam = ['urgente', 'alto'] } = {}) {
  const dados = lerFindings(raiz, estado.id);
  const iter = estado.iteracao || 0;
  const vistos = new Set();
  const resumo = { novos: [], atualizados: [], reabertos: [], falsosPositivos: [], verificados: [] };

  for (const bruto of itens) {
    const item = { ...bruto };
    item.fingerprint = item.fingerprint || fingerprintPadrao(item);
    let existente = null;
    if (item.id) existente = dados.itens.find((f) => f.id === item.id);
    if (!existente) existente = dados.itens.find((f) => f.fingerprint === item.fingerprint);

    if (!existente) {
      const f = {
        id: novoId(dados),
        fingerprint: item.fingerprint,
        severidade: item.severidade,
        categoria: item.categoria,
        arquivo: item.arquivo || null,
        linha: item.linha ?? null,
        descricao: item.descricao,
        evidencia: item.evidencia || '',
        recomendacao: item.recomendacao || '',
        skill: item.skill || null,
        revisor: item.revisor || por,
        // Ajuste pós-entrega (A-n) que originou o finding: o humano viu o problema testando a entrega.
        ajuste: item.ajuste || null,
        status: item.status === 'falso-positivo' ? 'falso-positivo' : 'aberto',
        motivo: item.motivo || null,
        confirmacaoPendente: item.status === 'falso-positivo' && bloqueiam.includes(item.severidade),
        iteracao_encontrado: iter,
        iteracao_corrigido: null,
        verificado: false,
        reaberturas: 0,
        ref: null,
        commit: null,
        historico: [],
      };
      historico(f, null, f.status, por, 'criado');
      dados.itens.push(f);
      vistos.add(f.id);
      (f.status === 'falso-positivo' ? resumo.falsosPositivos : resumo.novos).push(f.id);
      continue;
    }

    vistos.add(existente.id);
    // Campos descritivos podem ser refinados pela triagem. Um bloqueante já
    // registrado não é rebaixado por aqui: isso abriria o caminho bloqueante ->
    // médio -> dívida técnica sem ninguém independente olhar.
    const rebaixaBloqueante = bloqueiam.includes(existente.severidade) && item.severidade && !bloqueiam.includes(item.severidade);
    if (rebaixaBloqueante) {
      historico(existente, existente.status, existente.status, por, `rebaixamento de severidade recusado (${existente.severidade} -> ${item.severidade})`);
      (resumo.rebaixamentosRecusados = resumo.rebaixamentosRecusados || []).push(existente.id);
    } else if (item.severidade && item.severidade !== existente.severidade) {
      historico(existente, existente.status, existente.status, por, `severidade ${existente.severidade} -> ${item.severidade}`);
    }
    const sevAntes = existente.severidade;
    for (const k of ['severidade', 'descricao', 'evidencia', 'recomendacao', 'arquivo', 'linha', 'skill']) {
      // Rebaixamento recusado: nada do item muda o registro (nem a descrição "rebaixado de ...").
      if (rebaixaBloqueante) continue;
      if (item[k] !== undefined && item[k] !== null && item[k] !== '') existente[k] = item[k];
    }
    // Virou bloqueante: decisões tomadas quando ele era médio/baixo deixam de valer.
    const elevado = !bloqueiam.includes(sevAntes) && bloqueiam.includes(existente.severidade);
    if (elevado && existente.status === 'divida-tecnica') {
      historico(existente, 'divida-tecnica', 'reaberto', por, `severidade elevada para ${existente.severidade}: bloqueante não pode ser dívida técnica`);
      existente.status = 'reaberto';
      existente.verificado = false;
      resumo.reabertos.push(existente.id);
    } else if (elevado && existente.status === 'falso-positivo') {
      historico(existente, 'falso-positivo', 'falso-positivo', por, `severidade elevada para ${existente.severidade}: falso positivo precisa de confirmação do verificador-final`);
      existente.confirmacaoPendente = true;
      existente.verificado = false;
    }
    if (item.status === 'falso-positivo' && ABERTOS.includes(existente.status)) {
      marcarFalsoPositivo(existente, item.motivo, por, bloqueiam);
      resumo.falsosPositivos.push(existente.id);
    } else if (item.status === 'falso-positivo') {
      // Corrigido/verificado apontado como falso positivo: não reabre nem conta como oscilação.
      resumo.atualizados.push(existente.id);
    } else if (['corrigido', 'verificado'].includes(existente.status)) {
      historico(existente, existente.status, 'reaberto', por, 'problema voltou a ser reportado');
      existente.status = 'reaberto';
      existente.verificado = false;
      existente.reaberturas = (existente.reaberturas || 0) + 1;
      resumo.reabertos.push(existente.id);
    } else {
      resumo.atualizados.push(existente.id);
    }
  }

  if (revisados.length) {
    for (const f of dados.itens) {
      // Problema que o humano viu: o silêncio da re-revisão não basta; quem confirma a correção é o verificador-final.
      if (f.status === 'corrigido' && f.revisor !== 'humano' && revisados.includes(prefixo(f.categoria)) && !vistos.has(f.id)) {
        historico(f, 'corrigido', 'verificado', por, 're-revisão não encontrou o problema');
        f.status = 'verificado';
        f.verificado = true;
        resumo.verificados.push(f.id);
      }
    }
  }

  gravarFindings(raiz, estado.id, dados);
  return resumo;
}

export function alterarStatus(raiz, estado, config, idFinding, novo, opcoes = {}) {
  return comLock(raiz, () => alterarStatusSemLock(raiz, estado, config, idFinding, novo, opcoes));
}

function alterarStatusSemLock(raiz, estado, config, idFinding, novo, { motivo, commit, ref, nota, por = 'agente' } = {}) {
  const dados = lerFindings(raiz, estado.id);
  const f = dados.itens.find((x) => x.id === idFinding);
  if (!f) throw new Error(`Finding ${idFinding} não existe.`);
  const atual = f.status;

  if (novo === 'aceito-risco') {
    throw new Error('"aceito-risco" é decisão exclusiva do humano. O agente não pode aceitar risco; registre o finding e siga a política de autonomia.');
  }
  if (novo === 'verificado') {
    throw new Error('"verificado" só é atribuído pela re-revisão (wf findings merge --revisados), pelo gate ou pelo verificador final.');
  }
  if (novo === 'corrigido') {
    if (!ABERTOS.includes(atual)) throw new Error(`${idFinding} está "${atual}"; só findings abertos/reabertos podem ir para "corrigido".`);
    f.commit = commit || gitHead(raiz);
    f.iteracao_corrigido = estado.iteracao || 0;
  } else if (novo === 'falso-positivo') {
    if (!ABERTOS.includes(atual)) throw new Error(`${idFinding} está "${atual}".`);
    if (!motivo) throw new Error('falso-positivo exige --motivo.');
    marcarFalsoPositivo(f, motivo, por, config.severidades.bloqueiam);
    gravarFindings(raiz, estado.id, dados);
    return f;
  } else if (novo === 'divida-tecnica' && atual === 'divida-tecnica') {
    // Atualiza só a referência do card de dívida técnica.
    f.ref = ref || f.ref;
    historico(f, atual, novo, por, `ref: ${f.ref}`);
    gravarFindings(raiz, estado.id, dados);
    return f;
  } else if (novo === 'divida-tecnica') {
    if (!ABERTOS.includes(atual)) throw new Error(`${idFinding} está "${atual}".`);
    if (config.severidades.bloqueiam.includes(f.severidade)) {
      throw new Error(`${idFinding} é ${f.severidade} (bloqueante): não pode virar dívida técnica. Corrija ou encerre a task como INTERROMPIDA/BLOQUEADA.`);
    }
    f.ref = ref || f.ref || 'pendente';
  } else if (novo === 'aberto' || novo === 'reaberto') {
    f.verificado = false;
    f.confirmacaoPendente = false;
  } else {
    throw new Error(`Status desconhecido: ${novo}`);
  }
  historico(f, atual, novo, por, nota || motivo);
  f.status = novo;
  gravarFindings(raiz, estado.id, dados);
  return f;
}

export function marcarVerificados(raiz, estado, ids, por) {
  return comLock(raiz, () => {
    const dados = lerFindings(raiz, estado.id);
    const feitos = [];
    for (const f of dados.itens) {
      if (ids.includes(f.id) && f.status === 'corrigido') {
        historico(f, 'corrigido', 'verificado', por);
        f.status = 'verificado';
        f.verificado = true;
        feitos.push(f.id);
      } else if (ids.includes(f.id) && f.status === 'falso-positivo' && (f.confirmacaoPendente || !f.verificado)) {
        historico(f, 'falso-positivo', 'falso-positivo', por, 'falso positivo confirmado pela verificação independente');
        f.confirmacaoPendente = false;
        f.verificado = true;
        feitos.push(f.id);
      }
    }
    gravarFindings(raiz, estado.id, dados);
    return feitos;
  });
}

export function reabrir(raiz, estado, ids, por, nota) {
  return comLock(raiz, () => reabrirSemLock(raiz, estado, ids, por, nota));
}

function reabrirSemLock(raiz, estado, ids, por, nota) {
  const dados = lerFindings(raiz, estado.id);
  const feitos = [];
  for (const f of dados.itens) {
    const fpPendente = f.status === 'falso-positivo' && (f.confirmacaoPendente || !f.verificado);
    if (ids.includes(f.id) && (['corrigido', 'verificado'].includes(f.status) || fpPendente)) {
      f.confirmacaoPendente = false;
      historico(f, f.status, 'reaberto', por, nota);
      f.status = 'reaberto';
      f.verificado = false;
      f.reaberturas = (f.reaberturas || 0) + 1;
      feitos.push(f.id);
    }
  }
  gravarFindings(raiz, estado.id, dados);
  return feitos;
}

/** Cria/atualiza/verifica findings do gate determinístico. */
export function sincronizarGate(raiz, estado, config, etapas) {
  return comLock(raiz, () => sincronizarGateSemLock(raiz, estado, config, etapas));
}

function sincronizarGateSemLock(raiz, estado, config, etapas) {
  const dados = lerFindings(raiz, estado.id);
  const iter = estado.iteracao || 0;
  const mudancas = { abertos: [], verificados: [] };
  for (const e of etapas) {
    // Etapa que não rodou agora (sem comando, cache do loop, não executada, sem vaga ou pulada por dependência) não
    // muda o finding dela: a pulada não é defeito dela (a causa raiz é a dependência, que tem o próprio finding).
    // CI indisponível (modo CI) é infraestrutura, não defeito: nunca abre finding nem conta falha seguida.
    if (e.origem === 'cache' || ['nao-configurado', 'nao-executada', 'sem-vaga', 'pulada-por-dependencia', 'ci-indisponivel'].includes(e.status)) continue;
    const fp = `gate:${e.nome}`;
    let f = dados.itens.find((x) => x.fingerprint === fp);
    const falhou = e.status !== 'ok';
    if (falhou) {
      const severidade = e.obrigatoria ? 'urgente' : 'medio';
      const evidencia = e.resumoFalha || '';
      // Erro de config (dependeDe em ciclo): o finding aponta o config.json, que só o humano edita
      // (protecoes.arquivosSomenteHumano): o próximo passo vira CONFIGURACAO_HUMANA, não o fixer.
      const doConfig = e.erroConfig
        ? { categoria: 'gate/config', arquivo: '.workflow-ia/config.json', descricao: `Etapa "${e.nome}" do gate não rodou: erro de config (${e.erroConfig}).`, recomendacao: `Só o humano edita o config: corrija ${e.origem === 'ci' ? 'ci.etapas, ci.apps ou os nomes dos jobs do workflow' : 'gate.etapas[].dependeDe'} em .workflow-ia/config.json ("wf doctor" mostra o problema).` }
        : e.origem === 'ci'
          ? {
              categoria: `gate/${e.nome}`,
              arquivo: null,
              // Sem run (segredos antes do push, push, jobs fora das etapas): a falha é do que a teste-ci fez antes ou depois do run.
              descricao: e.ci?.url ? `Etapa "${e.nome}" do gate falhou no CI (run #${e.ci.runNumero ?? '?'}, SHA ${String(e.ci.sha || '').slice(0, 7)}).` : `Etapa "${e.nome}" (modo CI) falhou: ${e.motivo || 'sem run'}.`,
              recomendacao: `Leia ${e.ci?.url ? `o run ${e.ci.url} e ` : ''}o log em ${e.log}; corrija a causa${e.comando && !e.comando.startsWith('ci:') ? ` (reproduza na máquina com "${e.comando}")` : ''}. Não altere o workflow nem desative a verificação.`,
            }
          : null;
      if (!f) {
        f = {
          id: novoId(dados),
          fingerprint: fp,
          severidade,
          categoria: `gate/${e.nome}`,
          arquivo: null,
          ...(doConfig ? { categoria: doConfig.categoria, arquivo: doConfig.arquivo } : {}),
          linha: null,
          descricao: `Etapa "${e.nome}" do gate falhou (exit ${e.exit}${e.status === 'timeout' ? ', timeout' : ''}).`,
          evidencia,
          recomendacao: `Rode "${e.comando}", leia o log completo em ${e.log} e corrija a causa. Não altere o comando nem desative a verificação.`,
          ...(doConfig ? { descricao: doConfig.descricao, recomendacao: doConfig.recomendacao } : {}),
          skill: null,
          revisor: 'gate',
          status: 'aberto',
          motivo: null,
          iteracao_encontrado: iter,
          iteracao_corrigido: null,
          verificado: false,
          reaberturas: 0,
          ref: null,
          commit: null,
          historico: [],
        };
        historico(f, null, 'aberto', 'gate');
        dados.itens.push(f);
        mudancas.abertos.push(f.id);
      } else {
        f.evidencia = evidencia;
        f.severidade = severidade;
        if (doConfig) Object.assign(f, doConfig);
        else if (f.categoria === 'gate/config') {
          // O config foi corrigido e a etapa agora falha de verdade: o finding volta a ser do código.
          Object.assign(f, { categoria: `gate/${e.nome}`, arquivo: null, descricao: `Etapa "${e.nome}" do gate falhou (exit ${e.exit}${e.status === 'timeout' ? ', timeout' : ''}).`, recomendacao: `Rode "${e.comando}", leia o log completo em ${e.log} e corrija a causa. Não altere o comando nem desative a verificação.` });
        }
        const decididoOpcional = !e.obrigatoria && ['falso-positivo', 'divida-tecnica', 'aceito-risco'].includes(f.status);
        if (!ABERTOS.includes(f.status) && !decididoOpcional) {
          historico(f, f.status, 'reaberto', 'gate', 'etapa voltou a falhar');
          // Gate que volta a falhar não é OSCILACAO: conta em falhasSeguidas (GATE_TRAVADO).
          f.status = 'reaberto';
          f.verificado = false;
        }
        mudancas.abertos.push(f.id);
      }
      f.falhasSeguidas = (f.falhasSeguidas || 0) + 1;
    } else if (f && f.status !== 'verificado') {
      historico(f, f.status, 'verificado', 'gate', 'etapa passou');
      f.falhasSeguidas = 0;
      f.status = 'verificado';
      f.verificado = true;
      if (f.iteracao_corrigido === null) f.iteracao_corrigido = iter;
      mudancas.verificados.push(f.id);
    }
  }
  gravarFindings(raiz, estado.id, dados);
  return mudancas;
}

export function resumoFindings(raiz, estado, config) {
  const dados = lerFindings(raiz, estado.id);
  const porSeveridade = {};
  const porStatus = {};
  for (const s of SEVERIDADES) porSeveridade[s] = { total: 0, abertos: 0 };
  for (const f of dados.itens) {
    porSeveridade[f.severidade] = porSeveridade[f.severidade] || { total: 0, abertos: 0 };
    porSeveridade[f.severidade].total += 1;
    if (ABERTOS.includes(f.status)) porSeveridade[f.severidade].abertos += 1;
    porStatus[f.status] = (porStatus[f.status] || 0) + 1;
  }
  const bloq = config.severidades.bloqueiam;
  const bloqueantesAbertos = dados.itens.filter((f) => bloq.includes(f.severidade) && ABERTOS.includes(f.status));
  const bloqueantesNaoVerificados = dados.itens.filter((f) => bloq.includes(f.severidade) && (f.status === 'corrigido' || (f.status === 'falso-positivo' && (f.confirmacaoPendente || !f.verificado))));
  const falsosPositivosPendentes = bloqueantesNaoVerificados.filter((f) => f.status === 'falso-positivo');
  // Médios são corrigidos no loop como os bloqueantes; o loop só termina com baixos.
  const corrigir = config.severidades.corrigirNoLoop || config.severidades.corrigirSeHouverOrcamento || ['medio'];
  const mediosAbertos = dados.itens.filter((f) => corrigir.includes(f.severidade) && ABERTOS.includes(f.status));
  // OSCILACAO: só findings de revisão (repetição no gate é GATE_TRAVADO).
  const maxReaberturas = dados.itens.filter((f) => f.revisor !== 'gate').reduce((m, f) => Math.max(m, f.reaberturas || 0), 0);
  return {
    total: dados.itens.length,
    porSeveridade,
    porStatus,
    bloqueantesAbertos: bloqueantesAbertos.map((f) => f.id),
    bloqueantesNaoVerificados: bloqueantesNaoVerificados.map((f) => f.id),
    falsosPositivosPendentes: falsosPositivosPendentes.map((f) => f.id),
    mediosAbertos: mediosAbertos.map((f) => f.id),
    maxReaberturas,
  };
}
