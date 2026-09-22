import { exigirContexto } from "../../core/contexto.ts";
import { transacaoAtual } from "../../core/db.ts";

export type AcaoDeConfirmacaoWhatsapp = "CLIQUE" | "CONFIRMACAO";

export interface EstadoDaConfirmacaoWhatsapp {
  readonly clicadoEm: Date | null;
  readonly confirmadoEm: Date | null;
}

export interface ResultadoDaConfirmacaoWhatsapp {
  readonly id: string;
  readonly clicadoEm: Date;
  readonly confirmadoEm: Date | null;
  readonly aguardandoConfirmacao: boolean;
}

export class PedidoDaConfirmacaoNaoEncontrado extends Error {
  constructor() {
    super("Pedido não encontrado.");
    this.name = "PedidoDaConfirmacaoNaoEncontrado";
  }
}

/**
 * Decide o estado sem permitir que uma nova tentativa apague o passado.
 * A mesma regra é repetida pela função SQL para que a operação permaneça
 * atômica quando dois toques chegarem ao mesmo tempo.
 */
export function proximoEstadoDaConfirmacaoWhatsapp(
  atual: EstadoDaConfirmacaoWhatsapp,
  acao: AcaoDeConfirmacaoWhatsapp,
  agora: Date,
): EstadoDaConfirmacaoWhatsapp {
  return {
    clicadoEm: atual.clicadoEm ?? agora,
    confirmadoEm:
      acao === "CONFIRMACAO"
        ? (atual.confirmadoEm ?? agora)
        : atual.confirmadoEm,
  };
}

/** Registra o clique que abre a conversa, usando o token do link público. */
export async function registrarCliqueNoWhatsApp(
  agora = new Date(),
): Promise<ResultadoDaConfirmacaoWhatsapp> {
  return registrarAcao("CLIQUE", agora);
}

/** Registra a declaração do cliente de que a mensagem foi enviada. */
export async function confirmarEnvioNoWhatsApp(
  agora = new Date(),
): Promise<ResultadoDaConfirmacaoWhatsapp> {
  return registrarAcao("CONFIRMACAO", agora);
}

async function registrarAcao(
  acao: AcaoDeConfirmacaoWhatsapp,
  agora: Date,
): Promise<ResultadoDaConfirmacaoWhatsapp> {
  const contexto = exigirContexto();
  if (contexto.tokenDoPedido === undefined) {
    throw new PedidoDaConfirmacaoNaoEncontrado();
  }

  const tx = transacaoAtual();
  const linhas = await tx.$queryRaw<
    {
      order_id: string;
      whatsapp_clicked_at: Date;
      whatsapp_confirmed_at: Date | null;
    }[]
  >`
    SELECT * FROM app.registrar_whatsapp_do_pedido(
      ${acao === "CONFIRMACAO"},
      ${agora}
    )
  `;
  const linha = linhas[0];
  if (linha === undefined) throw new PedidoDaConfirmacaoNaoEncontrado();

  return {
    id: linha.order_id,
    clicadoEm: linha.whatsapp_clicked_at,
    confirmadoEm: linha.whatsapp_confirmed_at,
    aguardandoConfirmacao: linha.whatsapp_confirmed_at === null,
  };
}
