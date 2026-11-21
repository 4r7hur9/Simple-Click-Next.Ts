/* global __ENV */
/**
 * O resumo de cada etapa: `resumo.json` (para máquina) e `resumo.md` (tabela
 * para gente), mais o mesmo texto no terminal.
 *
 * O resumo só separa o que o k6 enxerga. A duplicidade de pedido e a
 * reconciliação com o banco são do reconciliar.ts, e o relatório final junta
 * as duas coisas (relatorio.ts).
 */
import {
  ETAPA,
  LOJAS,
  METAS,
  OPERACOES,
  PERFIL,
  RUN,
  TABELA_DO_ESTRESSE,
} from "./comum.js";

export const OPCOES_DE_RESUMO = {
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
};

const valor = (data, nome, campo, padrao = 0) => {
  const m = data.metrics[nome];
  return m && m.values && m.values[campo] !== undefined
    ? m.values[campo]
    : padrao;
};

const aprovada = (t) =>
  typeof t === "object" && t !== null ? t.ok === true : t === false;
const ms = (n) => `${Math.round(n)} ms`;
const pct = (n) => `${(n * 100).toFixed(2)}%`;

function porOperacao(data) {
  const linhas = {};
  for (const op of OPERACOES) {
    const d = `http_req_duration{op:${op}}`;
    linhas[op] = {
      requisicoes: valor(data, `http_reqs{op:${op}}`, "count"),
      porSegundo: valor(data, `http_reqs{op:${op}}`, "rate"),
      p50: valor(data, d, "med"),
      p90: valor(data, d, "p(90)"),
      p95: valor(data, d, "p(95)"),
      p99: valor(data, d, "p(99)"),
      max: valor(data, d, "max"),
      falhasHttp: valor(data, `http_req_failed{op:${op}}`, "rate"),
    };
  }
  return linhas;
}

function avaliarPatamar(data, patamar) {
  const nomeDe = (op) => `http_req_duration{op:${op},patamar:${patamar}}`;
  const catalogo = valor(data, nomeDe("catalogo"), "p(95)");
  const criar = valor(data, nomeDe("criar"), "p(95)");
  const falhas = valor(data, `falhas_inesperadas{patamar:${patamar}}`, "rate");
  const reqs = valor(data, `http_reqs{patamar:${patamar}}`, "count");
  const rps = valor(data, `http_reqs{patamar:${patamar}}`, "rate");
  const acima = [];
  if (catalogo >= METAS.catalogoP95Ms)
    acima.push(`p95 do catálogo ${ms(catalogo)} ≥ ${METAS.catalogoP95Ms} ms`);
  if (criar >= METAS.criarP95Ms)
    acima.push(`p95 da criação ${ms(criar)} ≥ ${METAS.criarP95Ms} ms`);
  if (falhas >= METAS.falhasMax)
    acima.push(`falhas ${pct(falhas)} ≥ ${pct(METAS.falhasMax)}`);
  return {
    patamar,
    requisicoes: reqs,
    porSegundo: rps,
    p95Catalogo: catalogo,
    p95Criar: criar,
    falhas,
    acimaDaMeta: acima,
  };
}

function patamaresDoEstresse(data) {
  const vus = {};
  for (const e of TABELA_DO_ESTRESSE) vus[e.patamar] = e.alvo;
  const todos = TABELA_DO_ESTRESSE.map((e) => ({
    ...avaliarPatamar(data, e.patamar),
    vus: e.alvo,
  }));
  const sustentados = todos.filter((p) => /^p\d+$/.test(p.patamar));
  const primeiro = sustentados.find((p) => p.acimaDaMeta.length > 0) || null;
  const recuperacao = todos.find((p) => p.patamar === "recuperacao");
  return {
    todos,
    primeiroAcimaDaMeta: primeiro,
    maiorCargaVerificada:
      primeiro === null
        ? "60 usuários virtuais (todos os patamares dentro da meta)"
        : null,
    recuperou: recuperacao ? recuperacao.acimaDaMeta.length === 0 : false,
  };
}

function montarTexto(r) {
  const t = [];
  t.push(
    `# Resumo do k6 — ${r.etapa} (perfil ${r.perfil}, rodada ${r.rodada})`,
  );
  t.push("");
  t.push(
    `**Thresholds do k6:** ${r.todosOsThresholdsOk ? "APROVADO" : "REPROVADO"} · duração medida ${(r.duracaoMs / 1000).toFixed(1)} s`,
  );
  t.push("");
  t.push("## Por operação");
  t.push("");
  t.push(
    "| operação | requisições | req/s | p50 | p90 | p95 | p99 | máx | falhas HTTP |",
  );
  t.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const [op, l] of Object.entries(r.operacoes)) {
    if (l.requisicoes === 0) continue;
    t.push(
      `| ${op} | ${l.requisicoes} | ${l.porSegundo.toFixed(2)} | ${ms(l.p50)} | ${ms(l.p90)} | ${ms(l.p95)} | ${ms(l.p99)} | ${ms(l.max)} | ${pct(l.falhasHttp)} |`,
    );
  }
  t.push("");
  t.push("## Classificação (o que o k6 viu)");
  t.push("");
  t.push("| classe | quantidade | detalhe |");
  t.push("|---|---:|---|");
  const c = r.contadores;
  t.push(
    `| Lentidão | ${r.lentidao.length} | ${r.lentidao.join("; ") || "metas de p95 respeitadas"} |`,
  );
  t.push(
    `| Recusa de negócio prevista | ${c.recusas_negocio} | loja fechada ${c.recusa_loja_fechada}, mínimo do pedido ${c.recusa_minimo} |`,
  );
  t.push(
    `| Falha de infraestrutura | ${c.falhas_infra} | tempo esgotado/sem resposta ${c.infra_timeout}, 429 ${c.infra_429}, 5xx ${c.infra_5xx} |`,
  );
  t.push(
    `| Rejeição inesperada (4xx fora do previsto) | ${c.rejeicoes_inesperadas} | 403, 401, 404, 400, 409/422 sem explicação |`,
  );
  t.push(
    `| Total incorreto | ${c.totais_errados} | total ≠ subtotal + taxa, ou consulta ≠ criação |`,
  );
  t.push(
    `| Replay divergente (sinal) | ${c.replay_divergente} | replay ≠ 200 ou com outro pedido; o veredito de duplicidade é do banco |`,
  );
  t.push(
    `| Falhas inesperadas (taxa) | ${pct(r.taxaDeFalhasInesperadas)} | critério dos thresholds de falha |`,
  );
  t.push("");
  t.push("## Compras");
  t.push("");
  t.push(`- compras criadas (201): **${c.compras_criadas}**`);
  t.push(`- replays corretos (200, mesmo pedido e total): **${c.replays_ok}**`);
  t.push(
    `- criações incertas (tempo esgotado ou 5xx): **${c.criacoes_incertas}**; recuperadas pelo replay: ${c.compras_recuperadas}`,
  );
  t.push(`- 500 no replay: ${c.erro500_replay}`);
  t.push("");
  if (ETAPA === "carga") {
    t.push(
      r.lojas.comTrafego === null
        ? "## Cobertura: não medida neste perfil (só o perfil completo exige as 100 lojas)"
        : `## Cobertura: ${r.lojas.comTrafego} de ${r.lojas.total} lojas receberam tráfego`,
    );
    t.push("");
  }
  if (r.patamares) {
    t.push("## Patamares do estresse");
    t.push("");
    t.push(
      "| patamar | VUs | requisições | req/s | p95 catálogo | p95 criação | falhas | acima da meta? |",
    );
    t.push("|---|---:|---:|---:|---:|---:|---:|---|");
    for (const p of r.patamares.todos) {
      t.push(
        `| ${p.patamar} | ${p.vus} | ${p.requisicoes} | ${p.porSegundo.toFixed(2)} | ${ms(p.p95Catalogo)} | ${ms(p.p95Criar)} | ${pct(p.falhas)} | ${p.acimaDaMeta.length ? p.acimaDaMeta.join("; ") : "não"} |`,
      );
    }
    t.push("");
    const a = r.patamares.primeiroAcimaDaMeta;
    t.push(
      a
        ? `**Primeiro patamar acima da meta: ${a.patamar} (${a.vus} VUs)** — vazão ${a.porSegundo.toFixed(2)} req/s, p95 do catálogo ${ms(a.p95Catalogo)}, p95 da criação ${ms(a.p95Criar)}, falhas ${pct(a.falhas)}.`
        : `**Nenhum patamar passou da meta. Maior carga verificada: ${r.patamares.maiorCargaVerificada}.**`,
    );
    t.push("");
    t.push(
      `**Recuperação na janela final:** ${r.patamares.recuperou ? "metas recuperadas" : "metas NÃO recuperadas"}.`,
    );
    t.push("");
  }
  if (r.vazao) {
    t.push("## Vazão, validade e metas");
    t.push("");
    t.push(
      `- vazão: **${r.vazao.requisicoesPorSegundo.toFixed(2)} req/s** (${r.vazao.requisicoes} requisições), ${r.vazao.iteracoesPorSegundo.toFixed(2)} iterações/s; compras ${r.vazao.compras} + ${r.vazao.comprasDoPreparo} do preparo`,
    );
    t.push(`- execução válida (integridade, isolamento, trabalho fixo): **${r.validade.ok ? "SIM" : "NÃO"}**`);
    t.push(`- metas de p95/p99: **${r.metasDeP95.ok ? "atingidas" : "NÃO atingidas"}**`);
    if (r.trabalhoFixo.iteracoesDaConta !== null) {
      const l = r.trabalhoFixo.linhasPorChamada;
      t.push(
        `- cenário conta: ${r.trabalhoFixo.iteracoesDaConta} chamadas, ${r.trabalhoFixo.descartadasDaConta} descartadas; linhas por chamada ${l.min}–${l.max} (mediana ${l.med})`,
      );
    }
    const j = r.janelaDeControle;
    if (j.catalogoP95 !== null) {
      t.push(
        `- janela de controle (2 min iniciais, sem conta/painel): p95 catálogo ${ms(j.catalogoP95)}, criação ${j.criarP95 === null ? "—" : ms(j.criarP95)}; depois: catálogo ${j.catalogoP95ForaDoControle === null ? "—" : ms(j.catalogoP95ForaDoControle)}, criação ${j.criarP95ForaDoControle === null ? "—" : ms(j.criarP95ForaDoControle)}`,
      );
    }
    t.push("");
  }
  t.push("## Thresholds");
  t.push("");
  t.push("| métrica | expressão | resultado |");
  t.push("|---|---|---|");
  for (const th of r.thresholds) {
    if (th.neutro) continue;
    t.push(
      `| ${th.metrica} | ${th.expressao} | ${th.ok ? "ok" : "**FALHOU**"} |`,
    );
  }
  t.push("");
  return t.join("\n");
}

export function resumir(data) {
  const operacoes = porOperacao(data);
  const thresholds = [];
  for (const [metrica, m] of Object.entries(data.metrics)) {
    if (!m.thresholds) continue;
    for (const [expressao, resultado] of Object.entries(m.thresholds)) {
      thresholds.push({
        metrica,
        expressao,
        ok: aprovada(resultado),
        neutro: /^(p\(95\)>=0|count>=0|rate>=0)$/.test(expressao),
      });
    }
  }
  const nomes = [
    "compras_criadas",
    "criacoes_incertas",
    "compras_recuperadas",
    "replays_ok",
    "replay_divergente",
    "totais_errados",
    "recusas_negocio",
    "falhas_infra",
    "rejeicoes_inesperadas",
    "erro500_replay",
    "infra_timeout",
    "infra_429",
    "infra_5xx",
    "recusa_loja_fechada",
    "recusa_minimo",
    "compras_preparo",
    "isolamento_violado",
    "vazamento_painel",
  ];
  const contadores = {};
  for (const n of nomes) contadores[n] = valor(data, n, "count");

  const lentidao = [];
  if (operacoes.catalogo.p95 >= METAS.catalogoP95Ms)
    lentidao.push(
      `catálogo p95 ${ms(operacoes.catalogo.p95)} (meta < ${METAS.catalogoP95Ms} ms)`,
    );
  if (operacoes.criar.p95 >= METAS.criarP95Ms)
    lentidao.push(
      `criação p95 ${ms(operacoes.criar.p95)} (meta < ${METAS.criarP95Ms} ms)`,
    );

  // O k6 só cria a série por loja quando há threshold nela: no perfil curto
  // (sem COBERTURA=sim) ela não existe e a cobertura NÃO foi medida (null),
  // o que é diferente de "0 lojas".
  let comTrafego = 0;
  let coberturaMedida = false;
  for (const loja of LOJAS) {
    const serie = `lojas_visitadas{loja:${loja.apelido}}`;
    if (data.metrics[serie] !== undefined) coberturaMedida = true;
    if (valor(data, serie, "count") > 0) comTrafego += 1;
  }

  // #142: validade (a execução vale como medida?) × metas (p95/p99). O código
  // 99 do k6 mistura os dois; aqui eles ficam separados por lista fechada.
  const ehDeValidade = (th) =>
    /^(totais_errados|replay_divergente|isolamento_violado|vazamento_painel|erro500_replay|falhas_inesperadas|checks\{essencial:sim\}|dropped_iterations\{scenario:conta\}|http_reqs\{op:(fila|meus_pedidos)\})$/.test(
      th.metrica,
    );
  const validade = thresholds.filter((th) => !th.neutro && ehDeValidade(th));
  const metasDeP95 = thresholds.filter(
    (th) => !th.neutro && /^http_req_duration\{/.test(th.metrica),
  );
  const janela = (op, j) =>
    valor(data, `http_req_duration{op:${op},janela:${j},expected_response:true}`, "p(95)", null);
  const trabalhoFixo = {
    iteracoesDaConta: valor(data, "iterations{scenario:conta}", "count", null),
    descartadasDaConta: valor(data, "dropped_iterations{scenario:conta}", "count", 0),
    linhasPorChamada: {
      min: valor(data, "linhas_por_chamada", "min", null),
      med: valor(data, "linhas_por_chamada", "med", null),
      max: valor(data, "linhas_por_chamada", "max", null),
    },
  };
  const resultado = {
    etapa: ETAPA,
    perfil: PERFIL,
    rodada: RUN,
    duracaoMs: data.state ? data.state.testRunDurationMs : 0,
    todosOsThresholdsOk: thresholds.every((th) => th.ok),
    metas: METAS,
    operacoes,
    contadores,
    taxaDeFalhasInesperadas: valor(data, "falhas_inesperadas", "rate"),
    checks: {
      passam: valor(data, "checks", "passes"),
      falham: valor(data, "checks", "fails"),
      taxa: valor(data, "checks", "rate"),
      essenciais: valor(data, "checks{essencial:sim}", "rate", null),
    },
    lentidao,
    vazao: {
      requisicoesPorSegundo: valor(data, "http_reqs", "rate"),
      requisicoes: valor(data, "http_reqs", "count"),
      iteracoesPorSegundo: valor(data, "iterations", "rate"),
      compras: contadores.compras_criadas,
      comprasDoPreparo: contadores.compras_preparo,
    },
    validade: {
      ok: validade.every((th) => th.ok),
      thresholds: validade,
    },
    metasDeP95: {
      ok: metasDeP95.every((th) => th.ok),
      thresholds: metasDeP95,
    },
    janelaDeControle: {
      catalogoP95: janela("catalogo", "controle"),
      criarP95: janela("criar", "controle"),
      catalogoP95ForaDoControle: janela("catalogo", "carga"),
      criarP95ForaDoControle: janela("criar", "carga"),
    },
    trabalhoFixo,
    lojas: {
      comTrafego: coberturaMedida ? comTrafego : null,
      total: LOJAS.length,
    },
    patamares: ETAPA === "estresse" ? patamaresDoEstresse(data) : null,
    thresholds,
  };
  return resultado;
}

/** O handleSummary de todos os cenários. */
export function entregar(data) {
  const resultado = resumir(data);
  const texto = montarTexto(resultado);
  const saida = __ENV.SAIDA;
  const arquivos = { stdout: `${texto}\n` };
  if (saida) {
    arquivos[`${saida}/resumo.json`] = JSON.stringify(resultado, null, 2);
    arquivos[`${saida}/resumo.md`] = texto;
  }
  return arquivos;
}
