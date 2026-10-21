/**
 * Rota do cupom para a impressão por clique (T-606 — AC-617, AC-621).
 *
 * `POST`, e não `GET`, porque pedir o cupom EMITE uma via: soma 1 ao contador
 * do pedido. Um `GET` com efeito seria repetido por pré-carregamento, por
 * robô e por botão de voltar, e cada repetição viraria uma "reimpressão" que
 * nunca saiu no papel.
 *
 * Mesmo arranjo das rotas do painel: a loja é resolvida pelo apelido sem
 * contexto, e só então a transação abre com loja, identidade e papel — é isso
 * que faz o isolamento por linha valer para o pedido pedido.
 */
import { Router, type Request, type Response } from "express";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, type AcessoAoBanco } from "../../core/db.ts";
import { esquemaDoPedidoDeCupom } from "./cupom.schema.ts";
import {
  emitirCupomDoPedido,
  PedidoSemCupom,
  type LerConfiguracaoDoCupom,
} from "./cupom.usecase.ts";

interface ChegadaNaLoja {
  readonly host?: string | null;
  readonly apelido?: string | null;
}

type IdentificacaoDaLoja =
  | { readonly encontrada: true; readonly id: string }
  | { readonly encontrada: false };

interface UsuarioAutenticado {
  readonly identidadeId: string;
  readonly papel: "OWNER" | "STAFF";
}

export interface OpcoesDaRotaDoCupom {
  readonly acesso?: AcessoAoBanco;
  readonly autenticar: (requisicao: Request) => UsuarioAutenticado | null;
  readonly resolverLoja: (
    chegada: ChegadaNaLoja,
  ) => Promise<IdentificacaoDaLoja>;
  /** Vem do módulo da loja, pela borda: um módulo não importa o outro. */
  readonly lerConfiguracaoDoCupom: LerConfiguracaoDoCupom;
}

function erro(resposta: Response, status: number, codigo: string): void {
  resposta.status(status).json({ erro: codigo });
}

export function criarRotasDoCupom(opcoes: OpcoesDaRotaDoCupom): Router {
  const rotas = Router();
  const acesso = opcoes.acesso ?? banco();

  rotas.post(
    "/:apelido/pedidos/:id/cupom",
    async (requisicao, resposta, proximo) => {
      try {
        const usuario = opcoes.autenticar(requisicao);
        if (usuario === null) {
          erro(resposta, 401, "nao_autenticado");
          return;
        }
        // Identificador malformado responde igual a pedido inexistente: não
        // há por que ensinar a quem tenta adivinhar qual formato é o certo.
        const entrada = esquemaDoPedidoDeCupom.safeParse(requisicao.params);
        if (!entrada.success) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }

        const loja = await executarComoRequisicao({ papel: "PUBLIC" }, () =>
          acesso.emTransacao(() =>
            opcoes.resolverLoja({ apelido: entrada.data.apelido }),
          ),
        );
        if (!loja.encontrada) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }

        const cupom = await executarComoRequisicao(
          {
            lojaId: loja.id,
            usuarioId: usuario.identidadeId,
            papel: usuario.papel,
          },
          () =>
            acesso.emTransacao(() =>
              emitirCupomDoPedido(
                entrada.data.id,
                opcoes.lerConfiguracaoDoCupom,
              ),
            ),
        );
        resposta.setHeader("cache-control", "no-store");
        resposta.status(200).json({ cupom });
      } catch (causa) {
        if (causa instanceof PedidoSemCupom) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }
        proximo(causa);
      }
    },
  );

  return rotas;
}
