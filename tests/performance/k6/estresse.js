/**
 * Etapa 3 — estresse. Patamares de 20, 40 e 60 usuários virtuais, rampa de
 * 1 min e 2 min de sustentação em cada um; depois volta a 1 usuário e observa a
 * recuperação por 2 min. Mesmo roteiro da carga.
 *
 * O estresse NÃO reprova por passar da meta num patamar: ele registra o
 * primeiro patamar acima da meta (no resumo). Reprova só por inconsistência de
 * pedido (total errado, replay divergente, duplicidade no banco) e por não
 * recuperar as metas na janela final ("recuperacao").
 */
import {
  estagiosDe,
  iteracaoMista,
  METAS,
  TABELA_DO_ESTRESSE,
  thresholdsPorOperacao,
  verificarAmbiente,
} from "./comum.js";
import { entregar, OPCOES_DE_RESUMO } from "./resumo.js";

function thresholdsPorPatamar() {
  const t = {};
  for (const { patamar } of TABELA_DO_ESTRESSE) {
    const final = patamar === "recuperacao";
    t[`http_req_duration{op:catalogo,patamar:${patamar}}`] = [
      final ? `p(95)<${METAS.catalogoP95Ms}` : "p(95)>=0",
    ];
    t[`http_req_duration{op:criar,patamar:${patamar}}`] = [
      final ? `p(95)<${METAS.criarP95Ms}` : "p(95)>=0",
    ];
    t[`falhas_inesperadas{patamar:${patamar}}`] = [
      final ? `rate<${METAS.falhasMax}` : "rate>=0",
    ];
    t[`http_reqs{patamar:${patamar}}`] = ["count>=0"];
  }
  return t;
}

export const options = {
  ...OPCOES_DE_RESUMO,
  scenarios: {
    estresse: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: estagiosDe(TABELA_DO_ESTRESSE),
      gracefulRampDown: "30s",
      gracefulStop: "60s",
    },
  },
  thresholds: {
    ...thresholdsPorOperacao(),
    ...thresholdsPorPatamar(),
    totais_errados: ["count==0"],
    replay_divergente: ["count==0"],
  },
};

export function setup() {
  return verificarAmbiente();
}

export default function () {
  iteracaoMista();
}

export function handleSummary(data) {
  return entregar(data);
}
