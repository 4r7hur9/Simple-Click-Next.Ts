/**
 * As rotas da conta do cliente sobre os próprios pedidos (T-604, AC-616):
 * a lista, em todas as lojas onde ele comprou, e o detalhe de um deles.
 *
 * O caminho é dedicado e não passa por loja nenhuma no endereço: `/v1/conta`
 * é a área da pessoa, não de uma loja. A lista corre SEM loja no contexto — o
 * que faz toda política por loja devolver nada — e é a função
 * `app.meus_pedidos()` que abre, para o papel CUSTOMER e a identidade do
 * contexto, exatamente os pedidos ligados a essa identidade.
 *
 * O detalhe reaproveita o caminho do link público (T-603): a função diz de
 * qual loja é o pedido e qual é o endereço público dele, e a leitura acontece
 * com esses dois no contexto, pela mesma política que serve o link. Um caminho
 * só para ler o pedido do cliente, e não dois que divergem com o tempo.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, type AcessoAoBanco } from "../../core/db.ts";
import { acompanharPedido } from "./acompanhar.usecase.ts";
import {
  listarMeusPedidos,
  localizarMeuPedido,
  type PedidoDaConta,
} from "./meus-pedidos.usecase.ts";

/** Onde a área da conta fica montada. */
export const PREFIXO_DA_CONTA = "/v1/conta";

/** Quem a borda reconheceu como cliente logado. */
export interface ClienteAutenticado {
  readonly identidadeId: string;
  readonly papel: "CUSTOMER";
}

export interface OpcoesDaConta {
  readonly acesso?: AcessoAoBanco;
  /** Nulo para quem não tem sessão de CLIENTE — dono e administração inclusos. */
  readonly autenticar: (requisicao: Request) => ClienteAutenticado | null;
}

/** O pedido pedido na rota. Formato errado é pedido que não existe. */
const esquemaDoPedidoNaRota = z.object({ id: z.string().uuid() });

function erro(resposta: Response, status: number, mensagem: string): void {
  resposta.status(status).json({ erro: mensagem });
}

/** O resumo como sai da API: sem o identificador interno da loja. */
function resumoParaAConta(pedido: PedidoDaConta) {
  return {
    id: pedido.id,
    loja: { nome: pedido.loja.nome, apelido: pedido.loja.apelido },
    numero: pedido.numero,
    codigo: pedido.codigo,
    status: pedido.status,
    entrega: pedido.entrega,
    totalCentavos: pedido.totalCentavos,
    quantidadeDeItens: pedido.quantidadeDeItens,
    criadoEm: pedido.criadoEm,
    atualizadoEm: pedido.atualizadoEm,
  };
}

export function criarRotasDaConta(opcoes: OpcoesDaConta): Router {
  const rotas = Router();
  // Preguiçoso: montar a aplicação não pode exigir banco configurado.
  const acesso = (): AcessoAoBanco => opcoes.acesso ?? banco();

  rotas.use((requisicao, resposta, proximo) => {
    const cliente = opcoes.autenticar(requisicao);
    if (cliente === null) {
      erro(resposta, 401, "nao_autenticado");
      return;
    }
    resposta.locals.cliente = cliente;
    proximo();
  });

  rotas.get("/pedidos", async (_requisicao, resposta, proximo) => {
    try {
      const cliente = resposta.locals.cliente as ClienteAutenticado;
      const pedidos = await executarComoRequisicao(
        { usuarioId: cliente.identidadeId, papel: cliente.papel },
        () => acesso().emTransacao(() => listarMeusPedidos()),
      );

      // O status anda a cada passo da loja: guardado em cache, a lista
      // mostraria o pedido de minutos atrás como se fosse o de agora.
      resposta.set("cache-control", "no-store");
      resposta.json({ pedidos: pedidos.map(resumoParaAConta) });
    } catch (causa) {
      proximo(causa);
    }
  });

  rotas.get("/pedidos/:id", async (requisicao, resposta, proximo) => {
    try {
      if (!esquemaDoPedidoNaRota.safeParse(requisicao.params).success) {
        erro(resposta, 404, "nao_encontrado");
        return;
      }
      const cliente = resposta.locals.cliente as ClienteAutenticado;
      const meu = await executarComoRequisicao(
        { usuarioId: cliente.identidadeId, papel: cliente.papel },
        () =>
          acesso().emTransacao(() => localizarMeuPedido(requisicao.params.id)),
      );
      // Pedido de outra pessoa e pedido que não existe respondem igual: a
      // diferença entre os dois é justamente o que não pode vazar.
      if (meu === null) {
        erro(resposta, 404, "nao_encontrado");
        return;
      }

      const pedido = await executarComoRequisicao(
        {
          lojaId: meu.loja.id,
          papel: "PUBLIC",
          tokenDoPedido: meu.tokenPublico,
        },
        () => acesso().emTransacao(() => acompanharPedido()),
      );
      if (pedido === null) {
        erro(resposta, 404, "nao_encontrado");
        return;
      }

      resposta.set("cache-control", "no-store");
      resposta.json({
        id: meu.id,
        loja: { nome: meu.loja.nome, apelido: meu.loja.apelido },
        tokenPublico: meu.tokenPublico,
        pedido,
      });
    } catch (causa) {
      proximo(causa);
    }
  });

  return rotas;
}
