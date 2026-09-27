/**
 * O que ainda falta configurar para a loja vender (T-907: AC-902, AC-905, AC-914).
 *
 * CADA AVISO NASCE DE UMA CONSEQUÊNCIA PARA O CLIENTE, e não de um campo vazio
 * qualquer: sem forma de pagamento o checkout não tem como cobrar; sem entrega
 * nem retirada o cliente não finaliza; sem WhatsApp o pedido é registrado mas
 * não abre conversa; sem horário a vitrine não sabe quando a loja atende. É
 * isso que o aviso diz — o que acontece —, com o atalho para resolver.
 *
 * É REGRA PURA: recebe as seções já lidas e devolve a lista. Quem lê é o caso
 * de uso de configuração, na mesma transação.
 */
import type { ValorDaSecao } from "./configuracoes.schema.ts";

export type CodigoDaPendencia =
  "PAGAMENTO" | "ENTREGA" | "WHATSAPP" | "HORARIO";

export interface Pendencia {
  readonly codigo: CodigoDaPendencia;
  readonly titulo: string;
  readonly descricao: string;
  /** Onde o dono resolve. */
  readonly href: string;
}

/** O que a regra precisa saber de cada seção. */
export interface EstadoDaConfiguracao {
  readonly pagamento: Pick<ValorDaSecao<"pagamento">, "formas" | "pix">;
  readonly entrega: Pick<
    ValorDaSecao<"entrega">,
    "aceitaEntrega" | "aceitaRetirada"
  >;
  readonly contato: Pick<ValorDaSecao<"contato">, "numero">;
  readonly horario: Pick<ValorDaSecao<"horario">, "semana">;
}

/**
 * As formas que o checkout de fato oferece: PIX sem chave não conta (AC-902).
 */
function formasOferecidas(
  pagamento: EstadoDaConfiguracao["pagamento"],
): readonly string[] {
  return pagamento.formas.filter(
    (forma) => forma !== "PIX" || (pagamento.pix?.chave ?? "") !== "",
  );
}

/** As pendências da loja, na ordem em que impedem a venda. */
export function pendenciasDaLoja(estado: EstadoDaConfiguracao): Pendencia[] {
  const pendencias: Pendencia[] = [];

  if (formasOferecidas(estado.pagamento).length === 0) {
    pendencias.push({
      codigo: "PAGAMENTO",
      titulo: "Configure uma forma de pagamento",
      descricao:
        "Sem nenhuma forma de pagamento, o checkout não tem como receber o pedido.",
      href: "/painel/config/pagamento",
    });
  }

  if (!estado.entrega.aceitaEntrega && !estado.entrega.aceitaRetirada) {
    pendencias.push({
      codigo: "ENTREGA",
      titulo: "Ative entrega ou retirada",
      descricao:
        "Com as duas desligadas, o cliente não consegue finalizar nenhum pedido.",
      href: "/painel/config/entrega",
    });
  }

  if (estado.contato.numero.trim() === "") {
    pendencias.push({
      codigo: "WHATSAPP",
      titulo: "Adicione seu WhatsApp",
      descricao:
        "Sem ele, o pedido ainda é registrado no painel, mas não abre uma conversa para você.",
      href: "/painel/config/contato",
    });
  }

  const temFaixa = estado.horario.semana.some((dia) => dia.faixas.length > 0);
  if (!temFaixa) {
    pendencias.push({
      codigo: "HORARIO",
      titulo: "Defina o horário de funcionamento",
      descricao:
        "Sem horário, a vitrine mostra a loja fechada e ninguém consegue pedir.",
      href: "/painel/config/horarios",
    });
  }

  return pendencias;
}
