/**
 * `GET /v1/admin/metricas?inicio=&fim=` — painel de crescimento da
 * administração (card #30). Montada no roteador da administração, DEPOIS da
 * trava do token, e passa pela segunda trava (`comoAdministrador`) antes de
 * ler o banco. Só leitura.
 */
import type { Response, Router } from "express";
import { esquemaDaConsultaDeMetricasDoAdmin } from "@simpleclick/contracts";

import type { AcessoAoBanco } from "../../core/db.ts";
import { validar } from "../../core/validar.ts";
import { montarMetricasDoAdmin } from "./metricas.usecase.ts";
import { repositorioDasMetricasDoAdmin } from "./metricas.repo.ts";
import { validarIntervalo } from "./periodo.ts";

export interface DependenciasDasMetricasDoAdmin {
  readonly acesso: () => AcessoAoBanco;
  readonly comoAdministrador: (
    resposta: Response,
    trabalho: (administradorId: string) => Promise<void>,
  ) => Promise<void>;
}

const MENSAGENS = {
  invalido: "Informe o período como datas válidas (aaaa-mm-dd).",
  invertido: "O fim do período não pode ser antes do início.",
  longo_demais: "O período pode ter no máximo um ano.",
} as const;

export function montarRotasDasMetricasDoAdmin(
  rotas: Router,
  { acesso, comoAdministrador }: DependenciasDasMetricasDoAdmin,
): void {
  const entrada = validar({ query: esquemaDaConsultaDeMetricasDoAdmin });
  rotas.get("/metricas", entrada, async (requisicao, resposta, proximo) => {
    try {
      const { query } = entrada.dados(requisicao);
      const problema = validarIntervalo(query);
      if (problema !== null) {
        resposta
          .status(422)
          .json({ erro: "periodo_invalido", mensagem: MENSAGENS[problema] });
        return;
      }
      await comoAdministrador(resposta, async () => {
        const painel = await acesso().emTransacao(() =>
          montarMetricasDoAdmin(query, repositorioDasMetricasDoAdmin),
        );
        resposta.setHeader("cache-control", "no-store");
        resposta.json(painel);
      });
    } catch (causa) {
      proximo(causa);
    }
  });
}
