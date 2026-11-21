/**
 * Etapa 1 — smoke. Um usuário virtual, uma jornada dirigida na Cozinha do
 * Benfica: vitrine, foto, catálogo, carrinho (2 marmitas de frango + ovo
 * frito), conferência, retirada, criação (201), replay da MESMA chave (200,
 * mesmo pedido e mesmo total) e consulta. R$ 20,00 + R$ 3,00 de adicional,
 * duas unidades, retirada: R$ 46,00 (4.600 centavos).
 *
 * Qualquer divergência reprova: 100% dos checks, nenhuma falha, exatamente uma
 * compra criada. A conta do banco (uma compra nova, 1.000 → 1.001) é conferida
 * depois pelo reconciliar.ts.
 */
import { check } from "k6";

import {
  comprar,
  LOJAS,
  navegar,
  thresholdsPorOperacao,
  verificarAmbiente,
} from "./comum.js";
import { entregar, OPCOES_DE_RESUMO } from "./resumo.js";

export const options = {
  ...OPCOES_DE_RESUMO,
  scenarios: {
    smoke: {
      executor: "shared-iterations",
      vus: 1,
      iterations: 1,
      maxDuration: "5m",
    },
  },
  thresholds: {
    ...thresholdsPorOperacao(),
    checks: ["rate==1"],
    "checks{essencial:sim}": ["rate==1"],
    "checks{verificacao:whatsapp}": ["rate==1"],
    http_req_failed: ["rate==0"],
    falhas_inesperadas: ["rate==0"],
    compras_criadas: ["count==1"],
    replays_ok: ["count==1"],
    replay_divergente: ["count==0"],
    totais_errados: ["count==0"],
    criacoes_incertas: ["count==0"],
    erro500_replay: ["count==0"],
  },
};

export function setup() {
  return verificarAmbiente();
}

export default function () {
  const loja = LOJAS.find((l) => l.apelido === "cozinha-do-benfica");
  const marmita = loja.produtos.find(
    (p) => p.slug === "marmita-frango-grelhado",
  );

  const visto = navegar(loja, true);
  check(
    visto.produtos,
    {
      "o catálogo lista a marmita de frango": (lista) =>
        lista.some((p) => p.id === marmita.id),
    },
    { op: "catalogo", essencial: "sim" },
  );

  const compra = comprar(loja, {
    produto: marmita,
    quantidade: 2,
    adicional: { grupo: "Adicionais", opcao: "Ovo frito" },
    modalidade: "PICKUP",
    totalEsperado: 4600,
  });
  check(
    compra,
    {
      "a jornada fecha: criada, replay igual e consulta": (c) =>
        c.criada && c.replayIgual && c.consulta,
      "a conferência deu 4.600 centavos": (c) => c.subtotalConferido === 4600,
    },
    { op: "criar", essencial: "sim" },
  );
}

export function handleSummary(data) {
  return entregar(data);
}
