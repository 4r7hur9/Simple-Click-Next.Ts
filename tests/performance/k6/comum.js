/* global __ENV, open */
/**
 * Peças comuns dos cenários de desempenho (Estruturação 5).
 *
 * O que está aqui:
 *  - o manifesto das 100 lojas (gerado pelo seed de simulação) e a configuração;
 *  - as métricas por operação, a classificação das respostas e a tabela de
 *    estágios (uma só: os `stages` do k6 e a etiqueta `patamar` saem dela);
 *  - as duas jornadas: navegação (vitrine, catálogo, fotos) e compra (carrinho,
 *    fechamento, replay da MESMA chave e consulta).
 *
 * Regras que valem para todos os cenários:
 *  - cada comprador virtual (VU) tem uma conta própria e a sessão de carrinho
 *    do próprio cookie jar; a chave de idempotência é uma por compra lógica e só
 *    é reutilizada no replay da mesma compra;
 *  - o WhatsApp nunca é chamado: só se confere que o link gerado é um wa.me;
 *  - a API NÃO diz o motivo de um 409/422 no corpo (o motivo vai para o log do
 *    servidor). Por isso a "recusa de negócio prevista" é deduzida do estado
 *    que o próprio VU observou na mesma iteração (loja fechada, subtotal abaixo
 *    do mínimo). Qualquer outro 4xx é falha inesperada.
 *  - duplicidade de pedido NÃO é decidida aqui: quem decide é a reconciliação,
 *    contando pedidos por chave no banco (reconciliar.ts).
 */
import http from "k6/http";
import exec from "k6/execution";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import { Counter, Rate, Trend } from "k6/metrics";

// ---------------------------------------------------------------------------
// Configuração (tudo por variável de ambiente; o executar-k6.sh preenche)
// ---------------------------------------------------------------------------

export const ETAPA = __ENV.ETAPA || "smoke";
export const PERFIL = __ENV.PERFIL || "completo";
export const API = (__ENV.API || "http://localhost:3301").replace(/\/$/, "");
export const SITE = (__ENV.SITE || "http://localhost:3300").replace(/\/$/, "");
export const RUN = __ENV.RUN_ID || "00000000";

const ORIGEM = SITE;
const PAUSA_MS = Number(__ENV.PAUSA_MS || (ETAPA === "smoke" ? 0 : 1000));
const RENOVAR_CONTA_MS = Number(__ENV.RENOVAR_CONTA_MS || 12 * 60 * 1000);
const TEMPO_LIMITE = __ENV.TEMPO_LIMITE || "30s";
const SENHA = "Senha-k6-Simulacao-2026!";
const ENDERECO = {
  rotulo: "Casa",
  logradouro: "Rua das Simulacoes",
  numero: "100",
  bairro: "Centro",
  cidade: "Fortaleza",
  estado: "CE",
  cep: "60000-000",
};

/** Metas propostas (valores iniciais de homologação, seção 5 do plano). */
export const METAS = {
  catalogoP95Ms: 500,
  criarP95Ms: 1000,
  falhasMax: 0.01,
};

/** As operações estáveis: a etiqueta `op` de cada requisição. */
export const OPERACOES = [
  "cadastro",
  "vitrine",
  "pagina",
  "catalogo",
  "produto",
  "imagem",
  "fechamento",
  "carrinho",
  "conferencia",
  "criar",
  "replay",
  "consulta",
  // #142: leituras do plano de p95 com trabalho fixo (cenários conta e painel).
  "login",
  "meus_pedidos",
  "fila",
  "fila_cruzada",
  "preparo",
];

const CAMINHO_DO_MANIFESTO =
  __ENV.MANIFESTO ||
  "../../../packages/database/seed/simulacao/saida/manifesto.json";

export const LOJAS = new SharedArray("lojas", () => {
  const manifesto = JSON.parse(open(CAMINHO_DO_MANIFESTO));
  return manifesto.lojas;
});

// Respostas 2xx são o esperado; o resto entra em `http_req_failed`. A decisão
// "isto foi uma recusa prevista?" é nossa (ver classificar) e vive em
// `falhas_inesperadas`, que é o critério dos thresholds de falha.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }));

// ---------------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------------

export const comprasCriadas = new Counter("compras_criadas");
export const criacoesIncertas = new Counter("criacoes_incertas");
export const comprasRecuperadas = new Counter("compras_recuperadas");
export const replaysOk = new Counter("replays_ok");
export const replayDivergente = new Counter("replay_divergente");
export const totaisErrados = new Counter("totais_errados");
export const recusasNegocio = new Counter("recusas_negocio");
export const falhasInfra = new Counter("falhas_infra");
export const rejeicoesInesperadas = new Counter("rejeicoes_inesperadas");
export const erro500Replay = new Counter("erro500_replay");
export const lojasVisitadas = new Counter("lojas_visitadas");
// Os mesmos fatos por tipo, para o resumo (as etiquetas só chegam ao JSON bruto).
export const infraTimeout = new Counter("infra_timeout");
export const infra429 = new Counter("infra_429");
export const infra5xx = new Counter("infra_5xx");
export const recusaLojaFechada = new Counter("recusa_loja_fechada");
export const recusaMinimo = new Counter("recusa_minimo");
export const chaveIncerta = new Counter("chave_incerta");
export const falhasInesperadas = new Rate("falhas_inesperadas");
// #142: integridade e isolamento sob carga (tolerância zero) e trabalho fixo.
export const isolamentoViolado = new Counter("isolamento_violado");
export const vazamentoPainel = new Counter("vazamento_painel");
export const comprasDoPreparo = new Counter("compras_preparo");
export const linhasPorChamada = new Trend("linhas_por_chamada");

// ---------------------------------------------------------------------------
// Estágios (uma tabela só)
// ---------------------------------------------------------------------------

/** No perfil curto (ensaio local) as durações são divididas por 12. */
const ESCALA = PERFIL === "curto" ? 1 / 12 : 1;

export const segundos = (s) => Math.max(5, Math.round(s * ESCALA));

export const TABELA_DA_CARGA = [
  { patamar: "subida", duracaoS: 120, alvo: 20 },
  { patamar: "sustentacao", duracaoS: 300, alvo: 20 },
  { patamar: "descida", duracaoS: 60, alvo: 0 },
];

export const TABELA_DO_ESTRESSE = [
  { patamar: "rampa-20", duracaoS: 60, alvo: 20 },
  { patamar: "p20", duracaoS: 120, alvo: 20 },
  { patamar: "rampa-40", duracaoS: 60, alvo: 40 },
  { patamar: "p40", duracaoS: 120, alvo: 40 },
  { patamar: "rampa-60", duracaoS: 60, alvo: 60 },
  { patamar: "p60", duracaoS: 120, alvo: 60 },
  { patamar: "descida", duracaoS: 60, alvo: 1 },
  { patamar: "recuperacao", duracaoS: 120, alvo: 1 },
];

/** Os `stages` do k6 a partir de uma tabela. */
export function estagiosDe(tabela) {
  return tabela.map((e) => ({
    duration: `${segundos(e.duracaoS)}s`,
    target: e.alvo,
  }));
}

/**
 * Janela da carga (#142): os primeiros 2 min da jornada mista ("controle")
 * rodam SEM os cenários conta e painel, que começam no fim da subida. O
 * comparar.ts usa o catálogo e a criação desta janela como controle de deriva
 * do ambiente entre o antes e o depois.
 */
function janelaAgora() {
  if (ETAPA !== "carga") return undefined;
  let nome;
  let inicio;
  try {
    // No setup() não há cenário (o k6 lança ao ler): o preparo fica sem janela.
    nome = exec.scenario.name;
    inicio = exec.scenario.startTime;
  } catch {
    return undefined;
  }
  if (nome !== "carga") return undefined;
  const decorrido = (Date.now() - inicio) / 1000;
  return decorrido < segundos(TABELA_DA_CARGA[0].duracaoS) ? "controle" : "carga";
}

/** Em que patamar do estresse estamos agora (só no estresse). */
function patamarAgora() {
  if (ETAPA !== "estresse") return undefined;
  const decorrido = (Date.now() - exec.scenario.startTime) / 1000;
  let acumulado = 0;
  for (const e of TABELA_DO_ESTRESSE) {
    acumulado += segundos(e.duracaoS);
    if (decorrido < acumulado) return e.patamar;
  }
  return "recuperacao";
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/**
 * Thresholds "neutros": não reprovam nada, só fazem o k6 criar as submétricas
 * por operação (sem eles o resumo não traz `http_req_duration{op:...}`).
 */
export function thresholdsPorOperacao() {
  const t = {};
  for (const op of OPERACOES) {
    t[`http_req_duration{op:${op}}`] = ["p(95)>=0"];
    t[`http_reqs{op:${op}}`] = ["count>=0"];
    t[`http_req_failed{op:${op}}`] = ["rate>=0"];
  }
  if (ETAPA === "carga") {
    for (const op of ["catalogo", "criar"]) {
      for (const janela of ["controle", "carga"]) {
        t[`http_req_duration{op:${op},janela:${janela},expected_response:true}`] = ["p(95)>=0"];
      }
    }
  }
  return t;
}

/** Uma exigência por loja: as 100 precisam ter recebido tráfego. */
export function thresholdsDeCobertura() {
  const t = {};
  for (const loja of LOJAS) {
    t[`lojas_visitadas{loja:${loja.apelido}}`] = ["count>0"];
  }
  return t;
}

// ---------------------------------------------------------------------------
// Verificação do ambiente (roda no setup, nunca no `k6 inspect`)
// ---------------------------------------------------------------------------

export function verificarAmbiente() {
  if (!__ENV.RUN_ID) {
    throw new Error(
      "RUN_ID não definido: rode pelo executar-k6.sh, que lê o run-id do preparo.",
    );
  }
  const pronto = http.get(`${API}/v1/health/ready`, { timeout: "10s" });
  if (pronto.status !== 200) {
    throw new Error(
      `A API não respondeu /v1/health/ready (status ${pronto.status}).`,
    );
  }
  return { run: RUN };
}

// ---------------------------------------------------------------------------
// Chamadas e classificação
// ---------------------------------------------------------------------------

function lerJson(res) {
  try {
    return res.json();
  } catch {
    return null;
  }
}

/** "ok", "previsto", "infra" ou "inesperado". */
function classificar(res, previsto, esperados) {
  const s = res.status;
  if (esperados && esperados.includes(s)) return "ok";
  if (s >= 200 && s < 300) return "ok";
  if (s === 0 || s >= 500 || s === 429) return "infra";
  if ((s === 409 || s === 422) && previsto) return "previsto";
  return "inesperado";
}

function registrar({ classe, res, op, previsto, patamar }) {
  const marcas = patamar === undefined ? { op } : { op, patamar };
  const status = String(res.status);
  if (classe === "ok") {
    falhasInesperadas.add(0, marcas);
  } else if (classe === "previsto") {
    falhasInesperadas.add(0, marcas);
    recusasNegocio.add(1, { op, motivo: previsto });
    if (previsto === "loja_fechada") recusaLojaFechada.add(1);
    else recusaMinimo.add(1);
  } else if (classe === "infra") {
    falhasInesperadas.add(1, marcas);
    falhasInfra.add(1, { op, status });
    if (res.status === 0) infraTimeout.add(1);
    else if (res.status === 429) infra429.add(1);
    else infra5xx.add(1);
  } else {
    falhasInesperadas.add(1, marcas);
    rejeicoesInesperadas.add(1, { op, status });
  }
}

/**
 * Faz uma chamada, etiqueta com a operação (e o patamar, no estresse) e
 * registra a classe da resposta. `previsto` é o motivo que explicaria um
 * 409/422 nesta chamada (ou nulo): vem do estado observado, nunca do corpo.
 */
function chamar(metodo, url, opcoes) {
  const { op, corpo, token, binario, previsto = null, esperados } = opcoes;
  const patamar = patamarAgora();
  const janela = janelaAgora();
  const cabecalhos = {};
  if (metodo !== "GET") {
    cabecalhos["Content-Type"] = "application/json";
    cabecalhos.Origin = ORIGEM;
  }
  if (token) cabecalhos.Authorization = `Bearer ${token}`;
  const tags = patamar === undefined ? { op } : { op, patamar };
  if (janela !== undefined) tags.janela = janela;
  const parametros = { headers: cabecalhos, tags, timeout: TEMPO_LIMITE };
  if (binario) parametros.responseType = "binary";
  if (esperados) parametros.responseCallback = http.expectedStatuses(...esperados);
  const res =
    metodo === "GET"
      ? http.get(url, parametros)
      : http.post(url, JSON.stringify(corpo), parametros);
  const classe = classificar(res, previsto, esperados);
  registrar({ classe, res, op, previsto, patamar });
  return { res, classe, json: binario ? null : lerJson(res) };
}

function pausa() {
  if (PAUSA_MS > 0) sleep((PAUSA_MS * (0.5 + Math.random())) / 1000);
}

// ---------------------------------------------------------------------------
// Imagens
// ---------------------------------------------------------------------------

function urlDaImagem(caminho) {
  return /^https?:\/\//.test(caminho) ? caminho : `${SITE}${caminho}`;
}

/** 200, tipo de imagem e o cabeçalho RIFF/WEBP que o seed grava. */
function imagemValida(res) {
  if (res.status !== 200) return false;
  const tipo = res.headers["Content-Type"] || "";
  if (!tipo.startsWith("image/")) return false;
  if (!res.body || res.body.byteLength < 100) return false;
  const bytes = new Uint8Array(res.body, 0, 12);
  const texto = (de, ate) =>
    String.fromCharCode.apply(null, Array.from(bytes.slice(de, ate)));
  return texto(0, 4) === "RIFF" && texto(8, 12) === "WEBP";
}

function baixarImagem(caminho) {
  if (!caminho) return;
  const { res } = chamar("GET", urlDaImagem(caminho), {
    op: "imagem",
    binario: true,
  });
  check(
    res,
    { "imagem válida": imagemValida },
    { op: "imagem", essencial: "sim" },
  );
}

// ---------------------------------------------------------------------------
// A conta do comprador virtual (uma por VU)
// ---------------------------------------------------------------------------

let conta = null;

function garantirConta() {
  const agora = Date.now();
  if (conta !== null && agora - conta.emitidaEm < RENOVAR_CONTA_MS)
    return conta;
  const vu = exec.vu.idInTest;
  const n = conta === null ? 0 : conta.n + 1;
  const marcaDaRodada = parseInt(RUN.slice(0, 4), 16) % 10000;
  const telefone = `+55859${String(marcaDaRodada).padStart(4, "0")}${String(vu).padStart(3, "0")}${String(n % 1000).padStart(3, "0")}`;
  const { res, json } = chamar("POST", `${API}/v1/auth/cadastro`, {
    op: "cadastro",
    corpo: {
      nome: `Comprador k6 ${vu}`,
      email: `k6-${RUN}-v${vu}-r${n}@simulacao.test`,
      telefone,
      senha: SENHA,
      aceitouTermos: true,
    },
  });
  const token = res.status === 201 && json ? json.tokenDeAcesso : null;
  check(
    res,
    { "cadastro 201 com token": () => res.status === 201 && Boolean(token) },
    { op: "cadastro" },
  );
  conta = token
    ? { token, emitidaEm: agora, n }
    : { token: null, emitidaEm: 0, n };
  return conta;
}

// ---------------------------------------------------------------------------
// Jornada de navegação
// ---------------------------------------------------------------------------

function abrirVitrine(loja) {
  const { res, json } = chamar("GET", `${API}/v1/vitrine/${loja.apelido}`, {
    op: "vitrine",
  });
  const ok =
    res.status === 200 &&
    json &&
    json.loja &&
    json.loja.apelido === loja.apelido;
  check(
    res,
    { "vitrine abre com a loja certa": () => Boolean(ok) },
    { op: "vitrine" },
  );
  if (res.status === 200) lojasVisitadas.add(1, { loja: loja.apelido });
  return json;
}

export function navegar(loja, completo = false) {
  const base = `${API}/v1/vitrine/${loja.apelido}`;
  const vitrine = abrirVitrine(loja);
  pausa();

  const resumo = chamar("GET", `${base}/catalogo/resumo`, { op: "catalogo" });
  check(
    resumo.res,
    { "resumo do catálogo 200": (r) => r.status === 200 },
    { op: "catalogo" },
  );
  const pagina = chamar("GET", `${base}/catalogo/produtos?limite=24`, {
    op: "catalogo",
  });
  const produtos =
    pagina.json && pagina.json.produtos ? pagina.json.produtos : [];
  check(
    pagina.res,
    {
      "catálogo traz produtos": (r) => r.status === 200 && produtos.length > 0,
    },
    { op: "catalogo" },
  );

  baixarImagem(vitrine && vitrine.loja ? vitrine.loja.logo : null);
  let fotos = 0;
  for (const produto of produtos) {
    if (fotos >= 2) break;
    if (produto.imagem) {
      baixarImagem(produto.imagem);
      fotos += 1;
    }
  }
  pausa();

  if (completo || Math.random() < 0.3) {
    const site = chamar("GET", `${SITE}/loja/${loja.apelido}`, {
      op: "pagina",
    });
    check(
      site.res,
      { "página da loja 200": (r) => r.status === 200 },
      { op: "pagina" },
    );
  }
  if ((completo || Math.random() < 0.4) && produtos.length > 0) {
    const alvo = produtos[Math.floor(Math.random() * produtos.length)];
    const detalhe = chamar("GET", `${base}/produto/${alvo.id}`, {
      op: "produto",
    });
    check(
      detalhe.res,
      { "produto 200": (r) => r.status === 200 },
      { op: "produto" },
    );
  }
  return { vitrine, produtos };
}

// ---------------------------------------------------------------------------
// Jornada de compra
// ---------------------------------------------------------------------------

/** Escolhe variação e opções que fecham o item; null se este produto não serve. */
function montarItem(produto, pedido) {
  if (!produto.disponivel) return null;
  let variacao = null;
  if (produto.variacoes.length > 0) {
    variacao =
      produto.variacoes.find((v) => v.padrao && v.disponivel) ||
      produto.variacoes.find((v) => v.disponivel) ||
      null;
    if (variacao === null) return null;
  }
  const escolhas = [];
  let acrescimos = 0;
  for (const grupo of produto.grupos) {
    if (grupo.eixoDeVariacao) continue;
    const livres = grupo.opcoes.filter((o) => o.disponivel);
    const pedida =
      pedido.adicional && pedido.adicional.grupo === grupo.nome
        ? livres.find((o) => o.nome === pedido.adicional.opcao)
        : null;
    if (pedida) {
      escolhas.push({ grupoId: grupo.id, opcaoId: pedida.id, quantidade: 1 });
      acrescimos += pedida.acrescimoCentavos;
      continue;
    }
    if (grupo.minimo === 0) continue;
    const ordem = livres
      .filter((o) => o.marcadaPorPadrao)
      .concat(livres.filter((o) => !o.marcadaPorPadrao));
    if (ordem.length < grupo.minimo) return null;
    for (const opcao of ordem.slice(0, grupo.minimo)) {
      escolhas.push({ grupoId: grupo.id, opcaoId: opcao.id, quantidade: 1 });
      acrescimos += opcao.acrescimoCentavos;
    }
  }
  const base = variacao ? variacao.precoCentavos : produto.precoCentavos;
  return {
    variacaoId: variacao ? variacao.id : null,
    escolhas,
    unitario: (base === null ? 0 : base) + acrescimos,
  };
}

function modalidadeDa(entrega, pedido) {
  if (pedido.modalidade) return pedido.modalidade;
  if (entrega.aceitaRetirada && entrega.aceitaEntrega) {
    return exec.scenario.iterationInTest % 2 === 1 ? "DELIVERY" : "PICKUP";
  }
  return entrega.aceitaRetirada ? "PICKUP" : "DELIVERY";
}

function iguais(a, b) {
  return (
    a.id === b.id &&
    a.numero === b.numero &&
    a.tokenPublico === b.tokenPublico &&
    a.codigo === b.codigo &&
    a.totalCentavos === b.totalCentavos &&
    a.subtotalCentavos === b.subtotalCentavos
  );
}

/**
 * A compra inteira: vitrine, fechamento, produto, carrinho, conferência,
 * criação, replay da mesma chave e consulta. Devolve o que foi observado
 * (o smoke afirma sobre isso; a carga só soma métricas).
 *
 * opções: { produto (do manifesto), quantidade, adicional: {grupo, opcao},
 *           modalidade, totalEsperado }
 */
export function comprar(loja, pedido = {}) {
  const resultado = { criada: false, replayIgual: false, consulta: false };
  const base = `${API}/v1/vitrine/${loja.apelido}`;

  const vitrine = abrirVitrine(loja);
  const aberta = !(
    vitrine &&
    vitrine.abertura &&
    vitrine.abertura.aberta === false
  );

  const fechamento = chamar("GET", `${base}/fechamento`, { op: "fechamento" });
  check(
    fechamento.res,
    { "fechamento 200": (r) => r.status === 200 },
    { op: "fechamento" },
  );
  if (fechamento.res.status !== 200 || !fechamento.json) return resultado;
  const entrega = fechamento.json.entrega;
  const formas = fechamento.json.formasDePagamento || [];
  const forma = formas.includes("PIX") ? "PIX" : formas[0] || null;
  const modalidade = modalidadeDa(entrega, pedido);
  const minimo =
    modalidade === "DELIVERY"
      ? entrega.minimoParaEntregaCentavos
      : entrega.minimoParaRetiradaCentavos;

  // O produto: o pedido do cenário, ou um sorteado entre os da loja que fecham.
  const candidatos = pedido.produto
    ? [pedido.produto]
    : loja.produtos.slice().sort(() => Math.random() - 0.5);
  let item = null;
  let alvo = null;
  for (const candidato of candidatos) {
    const detalhe = chamar("GET", `${base}/produto/${candidato.id}`, {
      op: "produto",
    });
    if (detalhe.res.status !== 200 || !detalhe.json) continue;
    const montado = montarItem(detalhe.json, pedido);
    if (montado !== null) {
      item = montado;
      alvo = candidato;
      break;
    }
  }
  check(
    { item },
    { "achou um produto que fecha": (x) => x.item !== null },
    { op: "produto" },
  );
  if (item === null) return resultado;

  let quantidade = pedido.quantidade || 1;
  if (!pedido.quantidade && minimo && item.unitario > 0) {
    quantidade = Math.min(9, Math.max(1, Math.ceil(minimo / item.unitario)));
  }

  const sessao = garantirConta();
  if (!sessao.token) return resultado;

  const adicionado = chamar("POST", `${base}/carrinho/itens`, {
    op: "carrinho",
    token: sessao.token,
    corpo: {
      produtoId: alvo.id,
      variacaoId: item.variacaoId,
      quantidade,
      escolhas: item.escolhas,
    },
  });
  check(
    adicionado.res,
    { "item entra no carrinho (201)": (r) => r.status === 201 },
    { op: "carrinho" },
  );
  if (adicionado.res.status !== 201) return resultado;

  const conferencia = chamar("POST", `${base}/carrinho/conferencia`, {
    op: "conferencia",
    token: sessao.token,
    corpo: {},
  });
  const conf = conferencia.json;
  const somaDasLinhas =
    conf && conf.itens
      ? conf.itens.reduce((s, i) => s + i.totalDaLinhaCentavos, 0)
      : -1;
  check(
    conferencia.res,
    {
      "conferência fecha o subtotal e não pede confirmação": (r) =>
        r.status === 200 &&
        conf &&
        conf.precisaConfirmar === false &&
        conf.subtotalCentavos === somaDasLinhas &&
        conf.subtotalCentavos > 0,
    },
    { op: "conferencia" },
  );
  if (conferencia.res.status !== 200 || !conf) return resultado;
  resultado.subtotalConferido = conf.subtotalCentavos;

  // O que explicaria uma recusa de negócio PREVISTA, visto nesta iteração.
  let previsto = null;
  if (!aberta) previsto = "loja_fechada";
  else if (minimo && conf.subtotalCentavos < minimo)
    previsto = "minimo_do_pedido";

  const chave = `k6-${RUN}-${ETAPA}-v${exec.vu.idInTest}-i${exec.scenario.iterationInTest}`;
  const corpo = {
    entrega: modalidade,
    formaDePagamento: forma,
    chaveDeIdempotencia: chave,
    subtotalVistoCentavos: conf.subtotalCentavos,
  };
  if (modalidade === "DELIVERY") corpo.endereco = ENDERECO;

  const criar = chamar("POST", `${base}/pedidos`, {
    op: "criar",
    token: sessao.token,
    corpo,
    previsto,
  });
  let pedidoCriado = null;
  if (criar.classe === "ok" && criar.res.status === 201 && criar.json) {
    pedidoCriado = criar.json;
    comprasCriadas.add(1);
    resultado.criada = true;
    resultado.criar = pedidoCriado;
    const coerente =
      pedidoCriado.jaExistia === false &&
      pedidoCriado.subtotalCentavos === conf.subtotalCentavos &&
      pedidoCriado.totalCentavos ===
        pedidoCriado.subtotalCentavos + pedidoCriado.taxaDeEntregaCentavos &&
      (pedido.totalEsperado === undefined ||
        pedidoCriado.totalCentavos === pedido.totalEsperado);
    if (!coerente) totaisErrados.add(1);
    check(
      criar.res,
      {
        "criar devolve 201, valores coerentes e jaExistia falso": () =>
          coerente,
      },
      { op: "criar", essencial: "sim" },
    );
    check(
      criar.res,
      {
        "link do WhatsApp gerado (wa.me)": () =>
          pedidoCriado.whatsapp !== null &&
          typeof pedidoCriado.whatsapp.endereco === "string" &&
          pedidoCriado.whatsapp.endereco.startsWith("https://wa.me/"),
      },
      { op: "criar", verificacao: "whatsapp" },
    );
  } else if (criar.classe === "infra") {
    // Resposta perdida, tempo esgotado ou 5xx: o servidor PODE ter gravado.
    criacoesIncertas.add(1);
    chaveIncerta.add(1, {
      chave,
      tipo: criar.res.status === 0 ? "timeout" : "500",
      fase: "criar",
    });
    check(
      criar.res,
      { "criar devolve 201": () => false },
      { op: "criar", essencial: "sim" },
    );
  } else if (criar.classe === "inesperado") {
    check(
      criar.res,
      { "criar devolve 201": () => false },
      { op: "criar", essencial: "sim" },
    );
  }
  // Recusa prevista: nada foi criado, nada a verificar nem a repetir.
  if (criar.classe === "previsto" || criar.classe === "inesperado")
    return resultado;

  // O replay: a MESMA chave, o MESMO corpo. É o único uso repetido da chave.
  const replay = chamar("POST", `${base}/pedidos`, {
    op: "replay",
    token: sessao.token,
    corpo,
  });
  const replayJson = replay.json;
  if (pedidoCriado !== null) {
    const igual =
      replay.res.status === 200 &&
      replayJson &&
      replayJson.jaExistia === true &&
      iguais(replayJson, pedidoCriado);
    if (igual) {
      replaysOk.add(1);
      resultado.replayIgual = true;
    } else {
      replayDivergente.add(1);
    }
    if (replay.res.status >= 500) {
      erro500Replay.add(1);
      chaveIncerta.add(1, { chave, tipo: "500", fase: "replay" });
    } else if (replay.res.status === 0) {
      chaveIncerta.add(1, { chave, tipo: "timeout", fase: "replay" });
    }
    check(
      replay.res,
      {
        "replay devolve 200, jaExistia e o mesmo pedido e total": () =>
          Boolean(igual),
      },
      { op: "replay", essencial: "sim" },
    );
  } else {
    // A criação ficou incerta: o replay é a recuperação natural da resposta perdida.
    if (replay.res.status === 201 && replayJson) {
      pedidoCriado = replayJson;
      comprasCriadas.add(1);
      resultado.criada = true;
    } else if (replay.res.status === 200 && replayJson) {
      pedidoCriado = replayJson;
      comprasRecuperadas.add(1);
    } else if (replay.res.status >= 500 || replay.res.status === 0) {
      chaveIncerta.add(1, {
        chave,
        tipo: replay.res.status === 0 ? "timeout" : "500",
        fase: "replay",
      });
    }
    check(
      replay.res,
      { "replay recupera a compra": () => pedidoCriado !== null },
      { op: "replay", essencial: "sim" },
    );
    resultado.criar = pedidoCriado;
  }
  if (pedidoCriado === null) return resultado;

  const consulta = chamar(
    "GET",
    `${base}/pedido/${pedidoCriado.tokenPublico}`,
    { op: "consulta" },
  );
  const visto = consulta.json && consulta.json.pedido;
  const confere =
    consulta.res.status === 200 &&
    visto &&
    visto.codigo === pedidoCriado.codigo &&
    visto.totalCentavos === pedidoCriado.totalCentavos &&
    visto.itens.length >= 1;
  if (
    consulta.res.status === 200 &&
    visto &&
    visto.totalCentavos !== pedidoCriado.totalCentavos
  ) {
    totaisErrados.add(1);
  }
  check(
    consulta.res,
    { "consulta devolve o mesmo pedido e total": () => Boolean(confere) },
    { op: "consulta", essencial: "sim" },
  );
  resultado.consulta = Boolean(confere);
  return resultado;
}

// ---------------------------------------------------------------------------
// A iteração de cada cenário de carga
// ---------------------------------------------------------------------------

/**
 * Loja = índice da iteração módulo 100, para as 100 receberem tráfego. A
 * rodada (iteração ÷ 100) desloca quem compra: 20% das iterações são compra,
 * e depois de 5 rodadas toda loja já teve a sua.
 */
export function iteracaoMista() {
  const i = exec.scenario.iterationInTest;
  const rodada = Math.floor(i / LOJAS.length);
  const loja = LOJAS[i % LOJAS.length];
  if (((i % LOJAS.length) + rodada) % 5 === 0) comprar(loja);
  else navegar(loja);
  pausa();
}

// ---------------------------------------------------------------------------
// #142 — Trabalho fixo: contas com pedidos conhecidos e a fila do painel
// ---------------------------------------------------------------------------

/** Quantas contas e quantos pedidos por conta o setup da carga prepara. */
export const CONTAS_FIXAS = Number(__ENV.CONTAS_FIXAS || 10);
export const PEDIDOS_POR_CONTA = Number(__ENV.PEDIDOS_POR_CONTA || 20);
/** Lojas por conta: o histórico legítimo em várias lojas tem de continuar inteiro. */
const LOJAS_POR_CONTA = 2;

/** O perfil de simulação só pode mirar a API desta rodada, no loopback. */
export function exigirApiLocal() {
  if (!/^http:\/\/(localhost|127\.0\.0\.1):3301$/.test(API)) {
    throw new Error(
      "Os cenários conta e painel usam credenciais de simulação: só rodam contra a API do ensaio (localhost:3301).",
    );
  }
}

function emailDaContaFixa(n) {
  return `k6-${RUN}-conta-c${n}@simulacao.test`;
}

function cadastrarContaFixa(n) {
  const marcaDaRodada = parseInt(RUN.slice(0, 4), 16) % 10000;
  const telefone = `+55859${String(marcaDaRodada).padStart(4, "0")}900${String(n).padStart(3, "0")}`;
  const { res, json } = chamar("POST", `${API}/v1/auth/cadastro`, {
    op: "preparo",
    corpo: {
      nome: `Cliente fixo k6 ${n}`,
      email: emailDaContaFixa(n),
      telefone,
      senha: SENHA,
      aceitouTermos: true,
    },
  });
  return res.status === 201 && json ? json.tokenDeAcesso : null;
}

/**
 * O que a loja precisa para uma compra do preparo: modalidade, forma de
 * pagamento, produto que fecha e quantidade que passa do mínimo. Lido uma vez
 * por loja; null se a loja não serve agora (fechada, sem produto que feche).
 */
function receitaDaLoja(loja) {
  const base = `${API}/v1/vitrine/${loja.apelido}`;
  const vitrine = chamar("GET", base, { op: "preparo" }).json;
  if (!vitrine || (vitrine.abertura && vitrine.abertura.aberta === false))
    return null;
  const fechamento = chamar("GET", `${base}/fechamento`, { op: "preparo" });
  if (fechamento.res.status !== 200 || !fechamento.json) return null;
  const entrega = fechamento.json.entrega;
  const formas = fechamento.json.formasDePagamento || [];
  const modalidade = entrega.aceitaRetirada ? "PICKUP" : "DELIVERY";
  const minimo =
    modalidade === "DELIVERY"
      ? entrega.minimoParaEntregaCentavos
      : entrega.minimoParaRetiradaCentavos;
  for (const candidato of loja.produtos) {
    const detalhe = chamar("GET", `${base}/produto/${candidato.id}`, {
      op: "preparo",
    });
    if (detalhe.res.status !== 200 || !detalhe.json) continue;
    const item = montarItem(detalhe.json, {});
    if (item === null) continue;
    const quantidade =
      minimo && item.unitario > 0
        ? Math.min(9, Math.max(1, Math.ceil(minimo / item.unitario)))
        : 1;
    return {
      base,
      modalidade,
      forma: formas.includes("PIX") ? "PIX" : formas[0] || null,
      produtoId: candidato.id,
      item,
      quantidade,
    };
  }
  return null;
}

/** Uma compra do preparo: carrinho → conferência → criação (201). */
function comprarNoPreparo(receita, token, chave) {
  const adicionado = chamar("POST", `${receita.base}/carrinho/itens`, {
    op: "preparo",
    token,
    corpo: {
      produtoId: receita.produtoId,
      variacaoId: receita.item.variacaoId,
      quantidade: receita.quantidade,
      escolhas: receita.item.escolhas,
    },
  });
  if (adicionado.res.status !== 201) return null;
  const conferencia = chamar("POST", `${receita.base}/carrinho/conferencia`, {
    op: "preparo",
    token,
    corpo: {},
  });
  const conf = conferencia.json;
  if (conferencia.res.status !== 200 || !conf || conf.precisaConfirmar) return null;
  const corpo = {
    entrega: receita.modalidade,
    formaDePagamento: receita.forma,
    chaveDeIdempotencia: chave,
    subtotalVistoCentavos: conf.subtotalCentavos,
  };
  if (receita.modalidade === "DELIVERY") corpo.endereco = ENDERECO;
  const criar = chamar("POST", `${receita.base}/pedidos`, {
    op: "preparo",
    token,
    corpo,
  });
  if (criar.res.status !== 201 || !criar.json || criar.json.jaExistia) return null;
  comprasDoPreparo.add(1);
  return { id: criar.json.id, totalCentavos: criar.json.totalCentavos };
}

/**
 * O setup da carga: CONTAS_FIXAS contas, cada uma com PEDIDOS_POR_CONTA pedidos
 * repartidos em LOJAS_POR_CONTA lojas (donos diferentes). Devolve só o que os
 * VUs precisam conferir — e-mail, ids, totais e lojas; NUNCA token (o
 * setup_data chega ao handleSummary). Falta de pedido derruba o ensaio: sem o
 * trabalho fixo o antes e o depois não se comparam.
 */
export function prepararContas() {
  exigirApiLocal();
  const receitas = new Map();
  const receitaDe = (loja) => {
    if (!receitas.has(loja.apelido)) receitas.set(loja.apelido, receitaDaLoja(loja));
    return receitas.get(loja.apelido);
  };
  const contas = [];
  let cursor = 0;
  for (let n = 0; n < CONTAS_FIXAS; n++) {
    http.cookieJar().clear(API);
    const token = cadastrarContaFixa(n);
    if (!token) throw new Error(`preparo: o cadastro da conta fixa ${n} falhou.`);
    const lojas = [];
    let tentativas = 0;
    while (lojas.length < LOJAS_POR_CONTA && tentativas < LOJAS.length) {
      const loja = LOJAS[cursor % LOJAS.length];
      cursor += 1;
      tentativas += 1;
      if (receitaDe(loja) !== null) lojas.push(loja);
    }
    if (lojas.length < LOJAS_POR_CONTA)
      throw new Error("preparo: não há lojas abertas suficientes para as contas fixas.");
    const pedidos = [];
    for (let m = 0; m < PEDIDOS_POR_CONTA; m++) {
      const loja = lojas[m % lojas.length];
      const feito = comprarNoPreparo(
        receitaDe(loja),
        token,
        `k6-${RUN}-preparo-c${n}-p${m}`,
      );
      if (feito === null)
        throw new Error(`preparo: a compra ${m} da conta fixa ${n} não foi criada.`);
      pedidos.push({ ...feito, loja: loja.apelido });
    }
    contas.push({ email: emailDaContaFixa(n), pedidos });
  }
  return contas;
}

/** Login (POST /v1/auth/login, com Origin) e o token de acesso; null se falhou. */
function entrar(email, senha) {
  const { res, json } = chamar("POST", `${API}/v1/auth/login`, {
    op: "login",
    corpo: { email, senha },
  });
  const ok =
    res.status === 200 &&
    json &&
    json.status === "SESSAO_CRIADA" &&
    typeof json.tokenDeAcesso === "string";
  check(res, { "login cria a sessão": () => Boolean(ok) }, { op: "login" });
  // Só o status e o código do erro (nunca o corpo nem o e-mail) para diagnóstico.
  if (!ok) console.warn(`login recusado: HTTP ${res.status} ${json && json.codigo ? json.codigo : json && json.status ? json.status : ""}`);
  return ok ? json.tokenDeAcesso : null;
}

let sessaoDaConta = null;

/**
 * Cenário conta: GET /v1/conta/pedidos de uma conta fixa (a do VU). A lista
 * precisa ser EXATAMENTE a que o preparo criou — mesmos ids, totais e lojas, e
 * nenhum pedido alheio. Qualquer desvio é isolamento_violado (tolerância zero);
 * o detalhe vai só como contagem, nunca o corpo (que traz o token público).
 */
export function listarContaDoCliente(dados) {
  const contas = dados.contas;
  const alvo = contas[exec.vu.idInTest % contas.length];
  const agora = Date.now();
  if (
    sessaoDaConta === null ||
    sessaoDaConta.email !== alvo.email ||
    agora - sessaoDaConta.emitidaEm > RENOVAR_CONTA_MS
  ) {
    const token = entrar(alvo.email, SENHA);
    sessaoDaConta = token ? { email: alvo.email, token, emitidaEm: agora } : null;
    if (sessaoDaConta === null) return;
  }
  const { res, json } = chamar("GET", `${API}/v1/conta/pedidos`, {
    op: "meus_pedidos",
    token: sessaoDaConta.token,
  });
  if (res.status !== 200 || !json || !Array.isArray(json.pedidos)) {
    check(res, { "meus pedidos 200": () => false }, { op: "meus_pedidos", essencial: "sim" });
    return;
  }
  linhasPorChamada.add(json.pedidos.length);
  const esperados = new Map(alvo.pedidos.map((p) => [p.id, p]));
  let alheios = 0;
  let divergentes = 0;
  for (const p of json.pedidos) {
    const e = esperados.get(p.id);
    if (e === undefined) alheios += 1;
    else if (
      e.totalCentavos !== p.totalCentavos ||
      !p.loja ||
      p.loja.apelido !== e.loja
    )
      divergentes += 1;
  }
  const faltantes = alvo.pedidos.length - (json.pedidos.length - alheios);
  const exato = alheios === 0 && divergentes === 0 && faltantes === 0;
  if (!exato) isolamentoViolado.add(1, { alheios: String(alheios), faltantes: String(faltantes) });
  check(
    res,
    { "meus pedidos devolve exatamente os pedidos da conta": () => exato },
    { op: "meus_pedidos", essencial: "sim" },
  );
}

let sessaoDoDono = null;
let lojaDoDono = null;

/**
 * Cenário painel: o dono da loja (a menor e a maior do volume, por
 * LOJAS_DO_PAINEL) abre a fila como o painel faz, a cada ~5 s. Uma vez por VU,
 * tenta a fila da OUTRA loja com o próprio token: precisa dar 403/404
 * (vazamento_painel conta qualquer 2xx).
 */
export function acompanharFila() {
  const lojas = (__ENV.LOJAS_DO_PAINEL || "").split(",").filter(Boolean);
  if (lojas.length < 2) throw new Error("LOJAS_DO_PAINEL precisa de duas lojas.");
  // A loja do VU é escolhida na 1ª iteração dele: o contador de iterações do
  // cenário é único entre os VUs (0 e 1 nas duas primeiras), então os 2 VUs
  // ficam em lojas diferentes. (`exec.vu` não tem id por cenário.)
  if (lojaDoDono === null) lojaDoDono = exec.scenario.iterationInTest % lojas.length;
  const indice = lojaDoDono;
  const apelido = lojas[indice];
  const outra = lojas[(indice + 1) % lojas.length];
  if (sessaoDoDono === null) {
    const token = entrar(`dono@${apelido}.simulacao.test`, __ENV.SENHA_DOS_DONOS || "");
    if (!token) {
      sleep(5);
      return;
    }
    sessaoDoDono = { token, cruzada: false };
  }
  if (!sessaoDoDono.cruzada) {
    sessaoDoDono.cruzada = true;
    const cruzada = chamar("GET", `${API}/v1/lojas/${outra}/pedidos`, {
      op: "fila_cruzada",
      token: sessaoDoDono.token,
      esperados: [401, 403, 404],
    });
    if (cruzada.res.status >= 200 && cruzada.res.status < 300) vazamentoPainel.add(1);
    check(
      cruzada.res,
      { "fila de outra loja é recusada": (r) => r.status === 403 || r.status === 404 || r.status === 401 },
      { op: "fila_cruzada", essencial: "sim" },
    );
  }
  const { res, json } = chamar("GET", `${API}/v1/lojas/${apelido}/pedidos`, {
    op: "fila",
    token: sessaoDoDono.token,
  });
  check(
    res,
    { "fila do painel 200": () => res.status === 200 && json && Array.isArray(json.pedidos) },
    { op: "fila", essencial: "sim" },
  );
  sleep(5);
}

/** As lojas do painel precisam ser do manifesto (nunca uma loja real). */
export function exigirLojasDoPainel() {
  const apelidos = new Set(LOJAS.map((l) => l.apelido));
  const lojas = (__ENV.LOJAS_DO_PAINEL || "").split(",").filter(Boolean);
  if (lojas.length !== 2 || !lojas.every((a) => apelidos.has(a))) {
    throw new Error("LOJAS_DO_PAINEL precisa de 2 apelidos do manifesto da simulação.");
  }
  if (!__ENV.SENHA_DOS_DONOS) throw new Error("SENHA_DOS_DONOS não definida.");
}
