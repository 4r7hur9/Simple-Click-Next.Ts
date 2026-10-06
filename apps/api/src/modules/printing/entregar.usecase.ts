/**
 * A entrega ao agente de impressão, do jeito que o contrato a descreve (T-608
 * — AC-623, AC-626; a fila é a da T-607).
 *
 * As regras da fila moram em `fila.usecase.ts`: reivindicar com prazo, o
 * cupom fixo na primeira entrega, a confirmação idempotente, a espera
 * crescente depois de falha e — desde a T-608 — nada entregue com o
 * automático desligado. Aqui está só a passagem para o contrato que o agente
 * lê (`packages/contracts/src/impressao.ts`): o que sai é conferido pelo MESMO
 * esquema que o agente usa para ler. Resposta fora do contrato vira erro aqui,
 * dentro da transação — e a reivindicação é desfeita, em vez de o agente
 * receber um trabalho que não sabe imprimir e que ficaria preso com ele até o
 * prazo vencer.
 *
 * Toda chamada daqui roda com a loja do agente no contexto e o papel
 * `PRINT_AGENT`; o identificador do agente vem da credencial (`parear.usecase
 * .ts`) e entra como parâmetro — o papel não ganha identidade de pessoa.
 */
import {
  esquemaDaConfirmacaoDeImpressao,
  esquemaDaFalhaRegistrada,
  esquemaDosTrabalhosEntregues,
  type ConfirmacaoDeImpressaoNoContrato,
  type FalhaRegistradaNoContrato,
  type TrabalhosEntreguesNoContrato,
} from "@simpleclick/contracts";

import {
  confirmarImpressao,
  reivindicarTrabalhos,
  registrarFalha,
  type OpcoesDaReivindicacao,
} from "./fila.usecase.ts";
import type { LerConfiguracaoDoCupom } from "./pedido-para-cupom.ts";

/**
 * A consulta do agente: o batimento (que alimenta o aviso do painel, AC-624)
 * e os trabalhos que ficaram com ele — nenhum, com o automático desligado.
 */
export async function entregarTrabalhosAoAgente(
  agenteId: string,
  lerConfiguracao: LerConfiguracaoDoCupom,
  opcoes: OpcoesDaReivindicacao = {},
): Promise<TrabalhosEntreguesNoContrato> {
  const trabalhos = await reivindicarTrabalhos(
    agenteId,
    lerConfiguracao,
    opcoes,
  );
  return esquemaDosTrabalhosEntregues.parse({ trabalhos });
}

/** O agente imprimiu: confirmar de novo responde o mesmo (AC-625). */
export async function confirmarPeloAgente(
  agenteId: string,
  trabalhoId: string,
): Promise<ConfirmacaoDeImpressaoNoContrato> {
  return esquemaDaConfirmacaoDeImpressao.parse(
    await confirmarImpressao(agenteId, trabalhoId),
  );
}

/** O agente não conseguiu imprimir: volta para a fila, ou a fila desiste. */
export async function registrarFalhaPeloAgente(
  agenteId: string,
  trabalhoId: string,
  motivo: string,
): Promise<FalhaRegistradaNoContrato> {
  return esquemaDaFalhaRegistrada.parse(
    await registrarFalha(agenteId, trabalhoId, motivo),
  );
}
