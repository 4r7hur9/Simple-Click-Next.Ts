/**
 * Apoio das provas do painel do catálogo (T-300 em diante).
 *
 * Monta, sobre o banco descartável do arquivo, as MESMAS rotas que `app.ts`
 * monta — gestão do dono e vitrine pública — com duas trocas só: o acesso ao
 * banco é o do arquivo de teste, e a autenticação devolve o dono que a prova
 * criou. Todo o resto é o caminho real: validação de borda, contexto da
 * requisição, transação com a loja gravada e isolamento por linha ligado.
 *
 * A PROVA PASSA PELA VITRINE DE VERDADE. "Aparece na vitrine" é afirmação sobre
 * o endereço que o cliente abre, e é esse endereço que a prova consulta — ler o
 * banco direto provaria o que o dono gravou, não o que o cliente vê.
 */
import express, { type Express } from "express";

import { criarRotasDasCategorias } from "../src/modules/catalog/categorias.routes.ts";
import { criarRotasDosProdutos } from "../src/modules/catalog/produtos.routes.ts";
import { manipuladorDeErros } from "../src/core/erros.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { horarioDaLoja } from "../src/modules/stores/horarios.usecase.ts";
import { identificarLoja } from "../src/modules/storefront/resolver-loja.usecase.ts";
import {
  criarRotasDaVitrine,
  PREFIXO_DA_VITRINE,
} from "../src/modules/storefront/vitrine.routes.ts";

/** Quem está logado no painel durante a prova. */
export interface DonoDaProva {
  readonly identidadeId: string;
}

/**
 * A aplicação da prova: painel do dono em `/v1/lojas` e vitrine pública.
 *
 * `dono` nulo simula quem chega sem sessão — é o que prova que a rota do
 * painel não responde a qualquer um.
 */
export function montarPainelDaProva(
  acesso: AcessoAoBanco,
  dono: DonoDaProva | null,
): Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const autenticar = () =>
    dono === null
      ? null
      : { identidadeId: dono.identidadeId, papel: "OWNER" as const };

  app.use(
    "/v1/lojas",
    criarRotasDasCategorias({
      acesso,
      autenticar,
      resolverLoja: identificarLoja,
    }),
  );
  app.use(
    "/v1/lojas",
    criarRotasDosProdutos({
      acesso,
      autenticar,
      resolverLoja: identificarLoja,
    }),
  );
  app.use(
    PREFIXO_DA_VITRINE,
    criarRotasDaVitrine({ acesso, lerHorario: horarioDaLoja }),
  );
  app.use(manipuladorDeErros());
  return app;
}
