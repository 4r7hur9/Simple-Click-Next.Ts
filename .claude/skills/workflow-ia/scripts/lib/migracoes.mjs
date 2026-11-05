// Atualização do config.json de um projeto que já tem o Workflow IA ("instalar.mjs --atualizar").
//
// Princípio: o que o humano ajustou é dele. A atualização só (1) aplica migrações versionadas de schema,
// (2) preenche chaves que não existem e (3) relata o que sugere mudar. Nunca recalcula valores existentes
// (diferente de --forcar, que refaz tudo a partir da detecção e perde ajustes como o build com variáveis
// de ambiente do catalogo-assineyou).

import { CONFIG_PADRAO, SAST_PADRAO } from './core.mjs';

/** Comando que o instalador gravava até a 0.5.1: o semgrep recusa --config auto com --metrics=off (exit 2). */
const SAST_ANTIGO = 'semgrep scan --config auto --error --quiet --metrics=off';

export const CONFIG_VERSAO_ATUAL = CONFIG_PADRAO.versao;

const clonar = (v) => JSON.parse(JSON.stringify(v));
const ehObjeto = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** União de lista (acrescenta o que falta, nunca remove nem reordena o que o humano já tem). */
function uniao(cfg, caminho, itens) {
  const partes = caminho.split('.');
  let alvo = cfg;
  for (const p of partes.slice(0, -1)) alvo = alvo[p] = ehObjeto(alvo[p]) ? alvo[p] : {};
  const ultima = partes[partes.length - 1];
  const atual = Array.isArray(alvo[ultima]) ? alvo[ultima] : [];
  const novos = itens.filter((i) => !atual.includes(i));
  if (novos.length) alvo[ultima] = [...atual, ...novos];
  return novos.map((i) => `${caminho} += ${JSON.stringify(i)}`);
}

/**
 * Migrações de schema, em ordem. Cada uma recebe o config (já clonado) e devolve a lista de alterações feitas.
 * Cada migração tem teste em testes/atualizacao.sh. Idempotentes: rodar de novo não muda nada.
 */
export const MIGRACOES = [
  {
    de: 1,
    para: 2,
    descricao: 'Capacidades do host (hooks/agentes) e git hooks de proteção',
    aplicar(cfg) {
      const feitas = [];
      if (!ehObjeto(cfg.host)) {
        cfg.host = clonar(CONFIG_PADRAO.host);
        feitas.push('host adicionado');
      }
      if (!ehObjeto(cfg.githooks)) {
        cfg.githooks = clonar(CONFIG_PADRAO.githooks);
        feitas.push('githooks adicionado');
      }
      // Os git hooks vivem em .git/hooks: o agente não os edita (o guarda-arquivos já nega .git/**; aqui fica explícito).
      feitas.push(...uniao(cfg, 'protecoes.arquivosSomenteHumano', ['.git/hooks/**']));
      return feitas;
    },
  },
  {
    de: 2,
    para: 3,
    descricao: 'Decisão humana pelo chat (wf decisao): o agente pergunta, aplica a resposta e retoma a task',
    aplicar(cfg) {
      const feitas = [];
      if (!ehObjeto(cfg.interacao)) {
        cfg.interacao = clonar(CONFIG_PADRAO.interacao);
        feitas.push('interacao adicionado');
      }
      return feitas;
    },
  },
  {
    de: 3,
    para: 4,
    descricao: 'Sem orçamento de tokens; iteração = rodada de code review (máx. 5); limites do pipeline em "limites"',
    aplicar(cfg) {
      // Aqui a migração sobrescreve de propósito: "iteração" mudou de significado (antes contava voltas do gate),
      // então os valores antigos de orcamento.P/M/G não valem mais. Os removidos ficam registrados no relatório.
      const feitas = [];
      const antigo = ehObjeto(cfg.orcamento) ? cfg.orcamento : null;
      const limites = clonar(CONFIG_PADRAO.limites);
      if (antigo && Number.isInteger(antigo.maxBloqueiosDeParada)) limites.maxBloqueiosDeParada = antigo.maxBloqueiosDeParada;
      if (!ehObjeto(cfg.limites)) {
        cfg.limites = limites;
        feitas.push(`limites adicionado ${JSON.stringify(limites)}`);
      }
      if (antigo) {
        delete cfg.orcamento;
        feitas.push(`orcamento removido (era ${JSON.stringify(antigo)})`);
      }
      if (ehObjeto(cfg.severidades) && 'corrigirSeHouverOrcamento' in cfg.severidades) {
        if (!('corrigirNoLoop' in cfg.severidades)) cfg.severidades.corrigirNoLoop = cfg.severidades.corrigirSeHouverOrcamento;
        delete cfg.severidades.corrigirSeHouverOrcamento;
        feitas.push('severidades.corrigirSeHouverOrcamento renomeado para severidades.corrigirNoLoop');
      }
      return feitas;
    },
  },
  {
    de: 4,
    para: 5,
    descricao: 'sast do semgrep: --config auto não funciona com --metrics=off (troca por --config p/default)',
    aplicar(cfg) {
      // Só o valor exato que o instalador gravava: qualquer outro é ajuste do humano e fica como está.
      if (ehObjeto(cfg.comandos) && cfg.comandos.sast === SAST_ANTIGO) {
        cfg.comandos.sast = SAST_PADRAO;
        return [`comandos.sast: ${JSON.stringify(SAST_ANTIGO)} → ${JSON.stringify(SAST_PADRAO)}`];
      }
      return [];
    },
  },
  {
    de: 5,
    para: 6,
    descricao: 'Revisor de operação (ops-reviewer, categoria operacao/): bloco revisao com modo e gatilhos',
    aplicar(cfg) {
      // Só acrescenta: um bloco revisao que o humano já tenha escrito fica como está (faltas são preenchidas abaixo).
      const feitas = [];
      if (!ehObjeto(cfg.revisao)) {
        const antes = cfg.revisao;
        cfg.revisao = clonar(CONFIG_PADRAO.revisao);
        feitas.push(
          antes === undefined
            ? 'revisao criado (operacao: "condicional" e gatilhos padrão)'
            : `revisao inválido (${JSON.stringify(antes)}) substituído pelo padrão (operacao: "condicional" e gatilhos padrão)`
        );
        return feitas;
      }
      if (!('operacao' in cfg.revisao)) {
        cfg.revisao.operacao = CONFIG_PADRAO.revisao.operacao;
        feitas.push('revisao.operacao = "condicional"');
      }
      if (!Array.isArray(cfg.revisao.gatilhosOperacao)) {
        cfg.revisao.gatilhosOperacao = clonar(CONFIG_PADRAO.revisao.gatilhosOperacao);
        feitas.push('revisao.gatilhosOperacao criado com os padrões');
      }
      return feitas;
    },
  },
  {
    de: 6,
    para: 7,
    descricao: '0.6.0: desempenho do loop (falhar rápido, repetição por carga, paralelismo, vagas de recurso, execução focada) e gate incremental',
    aplicar(cfg) {
      const feitas = [];
      // Desempenho do loop (card #2): tudo entra DESLIGADO num config existente; o gate fica igual ao de antes.
      // Ligar é decisão do humano (o relatório sugere: --set gate.falharRapido=true etc.; custo/pesada por etapa).
      cfg.gate = ehObjeto(cfg.gate) ? cfg.gate : {};
      for (const [k, v] of [['falharRapido', false], ['repetirPorCarga', 0], ['paralelismo', 1]]) {
        if (!(k in cfg.gate)) {
          cfg.gate[k] = v;
          feitas.push(`gate.${k} = ${JSON.stringify(v)} (desligado; veja docs/configuracao.md)`);
        }
      }
      if (!ehObjeto(cfg.recursos)) {
        cfg.recursos = clonar(CONFIG_PADRAO.recursos);
        feitas.push('recursos criado com vagasPesadas = 0 (vagas de recurso desligadas)');
      }
      feitas.push(...uniao(cfg, 'protecoes.padroesE2E', CONFIG_PADRAO.protecoes.padroesE2E));
      // Gate incremental (card #1): o cache fica ligado, mas sem "insumos" nas etapas nada é reaproveitado, então o
      // gate continua rodando tudo até o humano mapear os insumos de cada etapa.
      for (const [k, v] of [['cacheEntreIteracoes', true], ['insumosGlobais', []]]) {
        if (!(k in cfg.gate)) {
          cfg.gate[k] = v;
          feitas.push(`gate.${k} = ${JSON.stringify(v)} (gate incremental: declare "insumos" nas etapas; veja docs/configuracao.md)`);
        }
      }
      // As etapas do humano ficam intactas: "segredos" (e qualquer etapa com {base}/WF_BASE no comando) já nunca vem
      // do cache pela regra do gate-cache (dependeDoHistorico), sem precisar de "cacheavel: false" no array.
      // O RED continua completo, como antes; o RED focado é decisão do humano (--set provas.redFocado=true).
      cfg.provas = ehObjeto(cfg.provas) ? cfg.provas : {};
      if (!('redFocado' in cfg.provas)) {
        cfg.provas.redFocado = false;
        feitas.push('provas.redFocado = false (o "wf red" continua completo; ligue com --set provas.redFocado=true)');
      }
      return feitas;
    },
  },
  {
    de: 7,
    para: 8,
    descricao: '0.7.0: dependências entre etapas do gate (gate.etapas[].dependeDe, opcional) e modo CI opcional (ci, desligado)',
    aplicar(cfg) {
      // dependeDe é opcional e nenhuma etapa ganha dependência sozinha. O bloco "ci" entra DESLIGADO: um config sem ele
      // roda o gate exatamente como antes (tudo local); ligar é decisão do humano ("wf ci ativar"). Um "ci" que o humano
      // já escreveu fica como está (chaves que faltam são preenchidas por preencherAusentes).
      const feitas = [];
      if (!ehObjeto(cfg.ci)) {
        cfg.ci = clonar(CONFIG_PADRAO.ci);
        // O critério é da migração 9→10 ("commit" para quem migra), não do padrão de instalação nova.
        delete cfg.ci.criterioReaproveitar;
        feitas.push('ci adicionado com ativo = false (modo CI desligado; veja "wf ci ativar" e docs/configuracao.md)');
      }
      return feitas;
    },
  },
  {
    de: 8,
    para: 9,
    descricao: '0.8.0: CI econômico (ci.reaproveitar: run do mesmo SHA reaproveitado; ci.repetirFalhas: rerun só dos jobs que falharam)',
    aplicar(cfg) {
      // Só as chaves que faltam: o que o humano já escreveu no bloco ci fica como está. Com ci.ativo=false nada muda.
      const feitas = [];
      if (!ehObjeto(cfg.ci)) return feitas;
      for (const k of ['reaproveitar', 'repetirFalhas']) {
        if (!(k in cfg.ci)) {
          cfg.ci[k] = CONFIG_PADRAO.ci[k];
          feitas.push(`ci.${k} = ${JSON.stringify(CONFIG_PADRAO.ci[k])} (CI econômico; veja docs/configuracao.md)`);
        }
      }
      return feitas;
    },
  },
  {
    de: 9,
    para: 10,
    descricao: '0.9.0: critério do reaproveitamento do CI (ci.criterioReaproveitar; "commit" mantém o comportamento da 0.8.0)',
    aplicar(cfg) {
      // "commit" para quem migra: o reaproveitamento por conteúdo (e o yml novo) só com o humano pedindo. Um valor que o
      // humano já escreveu fica como está.
      const feitas = [];
      if (!ehObjeto(cfg.ci)) return feitas;
      if (!('criterioReaproveitar' in cfg.ci)) {
        cfg.ci.criterioReaproveitar = 'commit';
        feitas.push('ci.criterioReaproveitar = "commit" (comportamento da 0.8.0; "conteudo" reaproveita por app quando o conteúdo do app não mudou: veja docs/configuracao.md e "wf ci gerar")');
      }
      return feitas;
    },
  },
];

/** Aplica, em ordem, as migrações a partir de config.versao. Devolve { config, aplicadas }. */
export function migrar(existente) {
  const config = clonar(existente);
  const aplicadas = [];
  let versao = Number.isInteger(config.versao) ? config.versao : 1;
  for (const m of MIGRACOES) {
    if (m.de !== versao) continue;
    const alteracoes = m.aplicar(config);
    config.versao = m.para;
    versao = m.para;
    aplicadas.push({ de: m.de, para: m.para, descricao: m.descricao, alteracoes });
  }
  return { config, aplicadas };
}

/** Preenche só o que não existe, com o padrão. Arrays e valores presentes do humano são intocáveis. */
export function preencherAusentes(config, padrao, prefixo = '', adicionados = []) {
  for (const [k, v] of Object.entries(padrao)) {
    const chave = prefixo ? `${prefixo}.${k}` : k;
    if (!(k in config) || config[k] === undefined) {
      config[k] = clonar(v);
      adicionados.push({ chave, valor: v });
    } else if (ehObjeto(v) && ehObjeto(config[k])) {
      preencherAusentes(config[k], v, chave, adicionados);
    }
  }
  return adicionados;
}

function folhas(obj, prefixo = '', saida = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const chave = prefixo ? `${prefixo}.${k}` : k;
    if (ehObjeto(v)) folhas(v, chave, saida);
    else saida[chave] = v;
  }
  return saida;
}

/**
 * Atualiza o config existente. `recemInstalado` é o que uma instalação nova produziria (padrão + detecção do
 * stack): serve só para dizer o que o humano ajustou ("preservado") e para sugerir comandos que ele deixou vazios.
 */
export function atualizarConfig(existente, { recemInstalado }) {
  const { config: migrado, aplicadas } = migrar(existente);
  const adicionado = preencherAusentes(migrado, CONFIG_PADRAO);
  const antes = folhas(existente);
  const novo = folhas(recemInstalado);
  const preservado = Object.keys(antes)
    .filter((k) => k !== 'versao' && k !== 'pluginVersao' && k in novo && JSON.stringify(antes[k]) !== JSON.stringify(novo[k]))
    .map((k) => ({ chave: k, valor: antes[k] }));
  const sugeridos = [];
  for (const [k, detectado] of Object.entries(recemInstalado.comandos || {})) {
    if (detectado && !migrado.comandos?.[k]) sugeridos.push({ chave: `comandos.${k}`, atual: migrado.comandos?.[k] ?? '', detectado, aplicar: `--set comandos.${k}="${detectado}"` });
  }
  // Otimizações do loop que uma instalação nova liga e o config existente deixa desligadas: só sugere.
  for (const k of ['falharRapido', 'repetirPorCarga', 'paralelismo']) {
    const detectado = recemInstalado.gate?.[k];
    if (detectado !== undefined && JSON.stringify(migrado.gate?.[k]) === JSON.stringify(CONFIG_PADRAO.gate[k]) && JSON.stringify(detectado) !== JSON.stringify(CONFIG_PADRAO.gate[k])) {
      sugeridos.push({ chave: `gate.${k}`, atual: migrado.gate?.[k], detectado, aplicar: `--set gate.${k}=${JSON.stringify(detectado)}` });
    }
  }
  return {
    config: migrado,
    relatorio: { versao: { de: Number.isInteger(existente.versao) ? existente.versao : 1, para: migrado.versao }, migracoes: aplicadas, adicionado, preservado, sugeridos },
  };
}
