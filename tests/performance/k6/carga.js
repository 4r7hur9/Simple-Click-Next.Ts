/* global __ENV */
/**
 * Etapa 2 — carga. De 1 a 20 usuários virtuais em 2 min, 20 por 5 min, até 0
 * em 1 min. Cerca de 80% navegação e 20% compra, distribuídas pelas 100 lojas.
 *
 * Metas propostas (valores iniciais de homologação): p95 do catálogo < 500 ms,
 * p95 da criação < 1.000 ms, falhas inesperadas < 1%, zero total errado, zero
 * replay divergente e as 100 lojas com tráfego. A duplicidade de pedido é
 * decidida pelo banco (reconciliar.ts).
 *
 * `checks{essencial:sim}` exige > 99%, e não 100%: o mesmo 1% de falha
 * tolerado nas requisições. A integridade (total, replay) tem contador próprio,
 * com tolerância zero.
 *
 * #142 — dois cenários de TRABALHO FIXO, que começam no fim da subida (os 2
 * primeiros min da jornada mista são a janela de controle):
 *  - conta: 10 contas preparadas no setup com 20 pedidos cada (2 lojas), lidas
 *    em GET /v1/conta/pedidos a 5 req/s (chegada constante: o trabalho por
 *    requisição não depende de quanto o servidor aguenta);
 *  - painel: 2 donos (a menor e a maior loja do volume) abrindo a fila a cada
 *    ~5 s, como o painel, e uma tentativa cruzada que precisa ser recusada.
 * Metas sobre `expected_response:true` (só 2xx), a mesma população do SLO.
 */
import {
  acompanharFila as acompanharFilaComum,
  exigirApiLocal,
  exigirLojasDoPainel,
  listarContaDoCliente as listarContaComum,
  prepararContas,
  segundos,
  estagiosDe,
  iteracaoMista,
  TABELA_DA_CARGA,
  PERFIL,
  thresholdsDeCobertura,
  thresholdsPorOperacao,
  verificarAmbiente,
} from "./comum.js";
import { entregar, OPCOES_DE_RESUMO } from "./resumo.js";

const INICIO_DO_TRABALHO_FIXO = segundos(TABELA_DA_CARGA[0].duracaoS);
const DURACAO_DO_TRABALHO_FIXO = segundos(TABELA_DA_CARGA[1].duracaoS);

export const options = {
  ...OPCOES_DE_RESUMO,
  setupTimeout: "900s",
  scenarios: {
    carga: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: estagiosDe(TABELA_DA_CARGA),
      gracefulRampDown: "30s",
      gracefulStop: "60s",
    },
    conta: {
      executor: "constant-arrival-rate",
      exec: "listarContaDoCliente",
      rate: 5,
      timeUnit: "1s",
      startTime: `${INICIO_DO_TRABALHO_FIXO}s`,
      duration: `${DURACAO_DO_TRABALHO_FIXO}s`,
      preAllocatedVUs: 20,
      maxVUs: 40,
      gracefulStop: "30s",
    },
    painel: {
      executor: "constant-vus",
      exec: "acompanharFila",
      vus: 2,
      startTime: `${INICIO_DO_TRABALHO_FIXO}s`,
      duration: `${DURACAO_DO_TRABALHO_FIXO}s`,
      gracefulStop: "30s",
    },
  },
  thresholds: {
    ...thresholdsPorOperacao(),
    // Metas de p95 (docs/desempenho.md §1): só respostas 2xx (expected_response).
    "http_req_duration{op:catalogo,expected_response:true}": ["p(95)<500"],
    "http_req_duration{op:criar,expected_response:true}": [
      "p(95)<1000",
      "p(99)<1000",
    ],
    "http_req_duration{op:replay,expected_response:true}": ["p(95)<500"],
    "http_req_duration{op:meus_pedidos,expected_response:true}": ["p(95)<500"],
    "http_req_duration{op:fila,expected_response:true}": ["p(95)<500"],
    // Validade da execução (tolerância zero): integridade, isolamento, trabalho fixo.
    erro500_replay: ["count==0"],
    isolamento_violado: ["count==0"],
    vazamento_painel: ["count==0"],
    "dropped_iterations{scenario:conta}": ["count==0"],
    // Trabalho fixo de verdade: a fila e a lista da conta precisam ter tráfego
    // (uma meta de p95 sem amostras passaria vazia).
    "http_reqs{op:fila}": ["count>0"],
    "http_reqs{op:meus_pedidos}": ["count>0"],
    // Neutro: só cria a série de iterações do cenário conta para o resumo.
    "iterations{scenario:conta}": ["count>=0"],
    falhas_inesperadas: ["rate<0.01"],
    checks: ["rate>0.99"],
    "checks{essencial:sim}": ["rate>0.99"],
    totais_errados: ["count==0"],
    replay_divergente: ["count==0"],
    // No perfil curto não há iterações para as 100 lojas: não se exige
    // (COBERTURA=sim força, para provar o mecanismo).
    ...(PERFIL === "curto" && __ENV.COBERTURA !== "sim"
      ? {}
      : thresholdsDeCobertura()),
  },
};

export function setup() {
  const base = verificarAmbiente();
  exigirApiLocal();
  exigirLojasDoPainel();
  return { ...base, contas: prepararContas() };
}

export function listarContaDoCliente(dados) {
  listarContaComum(dados);
}

export function acompanharFila() {
  acompanharFilaComum();
}

export default function () {
  iteracaoMista();
}

export function handleSummary(data) {
  return entregar(data);
}
