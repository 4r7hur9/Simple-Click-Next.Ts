/**
 * Contrato de saúde da API.
 *
 * É o domínio que já tem uso: `apps/api/src/app.ts` responde na raiz desde a
 * T-019, e o site precisa saber ler essa resposta. As verificações separadas
 * de vivo e pronto (`/v1/health/live` e `/ready`, AC-023) entram aqui quando a
 * T-012 as escrever — contrato de rota que ainda não existe não é inventado.
 */

import { z } from "zod";
import { esquemaDeNomeDeServico } from "./comum.ts";
import { definirRota } from "./rota.ts";

/**
 * Resposta da raiz da API: sinal de vida, sem nenhum dado de negócio.
 *
 * Estrito de propósito. Se alguém acrescentar um campo na resposta sem passar
 * pelo contrato, o teste de conformidade da API recusa — que é o mecanismo que
 * mantém este arquivo verdadeiro em vez de decorativo.
 */
export const esquemaDeIdentificacaoDaApi = z.strictObject({
  servico: esquemaDeNomeDeServico,
  status: z.literal("viva"),
});

export type IdentificacaoDaApi = z.infer<typeof esquemaDeIdentificacaoDaApi>;

/** `GET /` — o sinal de vida que a API serve hoje. */
export const rotaDeIdentificacao = definirRota({
  metodo: "get",
  caminho: "/",
  etiqueta: "saude",
  resumo: "Sinal de vida da API",
  descricao:
    "Diz que a API está no ar e qual serviço respondeu. Não consulta banco, não abre transação e não devolve dado de nenhuma loja.",
  resposta: esquemaDeIdentificacaoDaApi,
});
