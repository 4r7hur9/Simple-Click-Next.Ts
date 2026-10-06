/**
 * A exportação do período em planilha (T-808; AC-815, AC-816).
 *
 * UM PEDIDO POR LINHA, no mesmo recorte da tela: o período resolvido é o
 * mesmo objeto que alimenta as métricas, então "de 1º a 15" na tela é "de 1º
 * a 15" no arquivo, com as pontas inteiras e o fuso da loja.
 *
 * O ARQUIVO É CSV COM PONTO E VÍRGULA, ordem de bytes no início e quebra de
 * linha do Windows. Não é gosto: é o que faz o Excel em português abrir o
 * arquivo com acento certo e uma coluna por campo sem assistente de
 * importação. Dinheiro sai em reais com vírgula pelo mesmo motivo — é a
 * borda de apresentação (P-005), e o contador vai somar a coluna.
 *
 * A EXPORTAÇÃO FICA NA AUDITORIA (AC-816). Dado que saiu do sistema não volta;
 * saber quem exportou o quê e quando é o mínimo que a LGPD pede do dono, e
 * a trilha só acrescenta.
 */
import { situacaoNaVenda } from "@simpleclick/core";

import { exigirContexto, exigirLojaDoContexto } from "../../core/contexto.ts";
import { transacaoAtual } from "../../core/db.ts";
import { pedidosDoPeriodo, type PedidoParaExportar } from "./consultas.ts";
import { relogioNoFuso, type PeriodoResolvido } from "./periodo.ts";

/** Ação registrada na trilha de auditoria a cada exportação. */
export const ACAO_DE_EXPORTACAO = "metricas.exportar";

/** As colunas, na ordem em que o contador as lê. */
export const COLUNAS_DA_EXPORTACAO = [
  "Data",
  "Hora",
  "Número",
  "Código",
  "Cliente",
  "Canal",
  "Itens",
  "Status",
  "Conta como venda",
  "Valor (R$)",
] as const;

const ROTULOS_DE_STATUS: Readonly<Record<string, string>> = {
  PENDING: "Aguardando confirmação",
  ACCEPTED: "Aceito",
  PREPARING: "Em preparo",
  READY_FOR_PICKUP: "Pronto para retirada",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

function paraDois(numero: number): string {
  return String(numero).padStart(2, "0");
}

/** Centavos inteiros em reais com vírgula, sem símbolo: `1234,56`. */
export function reaisParaPlanilha(centavos: number): string {
  const sinal = centavos < 0 ? "-" : "";
  const absoluto = Math.abs(centavos);
  return `${sinal}${Math.trunc(absoluto / 100)},${paraDois(absoluto % 100)}`;
}

/**
 * Um campo do CSV, protegido.
 *
 * Aspas dobradas e o campo inteiro entre aspas quando houver separador, aspa
 * ou quebra de linha. E um cuidado a mais: campo que começa com `=`, `+`,
 * `-` ou `@` ganha um apóstrofo, porque a planilha o executaria como fórmula
 * — é assim que um nome de cliente digitado com má intenção vira comando no
 * computador do contador.
 */
export function campoDoCsv(valor: string): string {
  let texto = valor;
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  if (/[";\r\n]/.test(texto)) texto = `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

/** Como o pedido se escreve na planilha: `2× Açaí com granola; 1× Suco`. */
export function descreverItens(itens: PedidoParaExportar["itens"]): string {
  return itens.map((item) => `${item.quantidade}× ${item.nome}`).join("; ");
}

/** O rótulo do status, ou o próprio código quando não há rótulo. */
export function rotuloDoStatus(status: string): string {
  return ROTULOS_DE_STATUS[status] ?? status;
}

/** Uma linha da planilha, já como texto, a partir do pedido. */
export function linhaDoPedido(
  pedido: PedidoParaExportar,
  fuso: string,
): string[] {
  const relogio = relogioNoFuso(pedido.colocadoEm, fuso);
  const situacao = situacaoNaVenda({
    status: pedido.status,
    totalCentavos: pedido.totalCentavos,
    aguardandoConfirmacaoWhatsapp: pedido.aguardandoConfirmacaoWhatsapp,
  });
  return [
    `${relogio.ano}-${paraDois(relogio.mes)}-${paraDois(relogio.dia)}`,
    `${paraDois(relogio.hora)}:${paraDois(relogio.minuto)}`,
    String(pedido.numero),
    pedido.codigo,
    pedido.cliente ?? "",
    pedido.canal === "MANUAL" ? "Balcão" : "Site",
    descreverItens(pedido.itens),
    rotuloDoStatus(pedido.status),
    situacao === "VENDA" ? "Sim" : "Não",
    reaisParaPlanilha(pedido.totalCentavos),
  ];
}

/**
 * A marca de ordem de bytes do UTF-8, escrita por código e não colada: é ela
 * que faz o Excel em português abrir o acento certo sem assistente.
 */
export const MARCA_DE_CODIFICACAO = "\uFEFF";

/** O arquivo inteiro: cabeçalho e uma linha por pedido. */
export function montarCsv(
  pedidos: readonly PedidoParaExportar[],
  fuso: string,
): string {
  const linhas = [
    [...COLUNAS_DA_EXPORTACAO],
    ...pedidos.map((pedido) => linhaDoPedido(pedido, fuso)),
  ];
  const corpo = linhas
    .map((linha) => linha.map(campoDoCsv).join(";"))
    .join("\r\n");
  return `${MARCA_DE_CODIFICACAO}${corpo}\r\n`;
}

/** O nome do arquivo que o navegador salva. */
export function nomeDoArquivo(
  apelido: string,
  periodo: PeriodoResolvido,
): string {
  const limpo = apelido.replace(/[^A-Za-z0-9_-]/g, "-");
  return `pedidos-${limpo}-${periodo.de}-a-${periodo.ate}.csv`;
}

export interface Exportacao {
  readonly csv: string;
  readonly quantidade: number;
}

/**
 * Exporta os pedidos do período da loja do contexto e registra na trilha.
 *
 * Os dois na MESMA transação: não existe arquivo gerado sem registro, nem
 * registro de um arquivo que não saiu.
 */
export async function exportarPedidosDoPeriodo(
  periodo: PeriodoResolvido,
  agora: Date,
): Promise<Exportacao> {
  const contexto = exigirContexto();
  const lojaId = exigirLojaDoContexto();
  const pedidos = await pedidosDoPeriodo(lojaId, periodo);

  // O autor é sempre uma identidade de verdade: a transação do dono só abre
  // para quem tem vínculo com a loja, e sujeito sem identidade é recusado
  // antes (`core/db.ts`, regra 7).
  const autor = contexto.usuarioId ?? null;
  const registro = JSON.stringify({
    de: periodo.de,
    ate: periodo.ate,
    fuso: periodo.fuso,
    quantidade: pedidos.length,
  });
  await transacaoAtual().$executeRaw`
    INSERT INTO app.audit_log
      (store_id, actor_id, actor_role, action, entity, entity_id, after_data, created_at)
    VALUES (${lojaId}::uuid, ${autor}::uuid, ${contexto.papel},
            ${ACAO_DE_EXPORTACAO}, 'orders', NULL, ${registro}::jsonb, ${agora})`;

  return { csv: montarCsv(pedidos, periodo.fuso), quantidade: pedidos.length };
}
