/**
 * As rotas dos endereços salvos, na área da conta (T-707).
 *
 *   GET    /v1/conta/enderecos       — os endereços da pessoa, o padrão primeiro
 *   POST   /v1/conta/enderecos       — salva um endereço
 *   PUT    /v1/conta/enderecos/:id   — troca um endereço
 *   DELETE /v1/conta/enderecos/:id   — apaga um endereço
 *   POST   /v1/conta/enderecos/:id/padrao — marca como o padrão
 *
 * A área da conta não é de loja nenhuma: é da pessoa. A transação abre SEM
 * loja, com a identidade e o papel CLIENTE — é o que as políticas de
 * `customer_addresses` (0036) exigem. A conta é uma só: dono e administração
 * também guardam endereço por aqui, sempre no papel CLIENTE.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { esquemaDoEnderecoParaSalvar } from "@simpleclick/contracts";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, type AcessoAoBanco } from "../../core/db.ts";
import { validar } from "../../core/validar.ts";
import {
  apagarEndereco,
  listarEnderecos,
  marcarEnderecoPadrao,
  salvarEndereco,
  trocarEndereco,
} from "./enderecos.usecase.ts";

/** O cliente autenticado, como a borda o entrega. */
export interface ClienteAutenticado {
  readonly identidadeId: string;
  readonly papel: "CUSTOMER";
}

export interface OpcoesDosEnderecos {
  readonly acesso?: AcessoAoBanco;
  readonly autenticar: (requisicao: Request) => ClienteAutenticado | null;
}

const esquemaDoEnderecoNaRota = z.object({ id: z.uuid() });

function erro(resposta: Response, status: number, codigo: string): void {
  resposta.status(status).json({ erro: codigo });
}

export function criarRotasDosEnderecos(opcoes: OpcoesDosEnderecos): Router {
  const rotas = Router();
  const acesso = (): AcessoAoBanco => opcoes.acesso ?? banco();

  function comoCliente<T>(
    resposta: Response,
    acao: () => Promise<T>,
  ): Promise<T> {
    const cliente = resposta.locals.cliente as ClienteAutenticado;
    return executarComoRequisicao(
      { usuarioId: cliente.identidadeId, papel: cliente.papel },
      () => acesso().emTransacao(acao),
    );
  }

  /** Só as rotas de endereço exigem sessão aqui: o resto da conta tem porta própria. */
  function exigirCliente(
    requisicao: Request,
    resposta: Response,
  ): ClienteAutenticado | null {
    const cliente = opcoes.autenticar(requisicao);
    if (cliente === null) {
      erro(resposta, 401, "nao_autenticado");
      return null;
    }
    resposta.locals.cliente = cliente;
    // Endereço é dado pessoal: nenhum cache no caminho guarda cópia.
    resposta.set("cache-control", "no-store");
    return cliente;
  }

  rotas.get("/enderecos", async (requisicao, resposta, proximo) => {
    try {
      if (exigirCliente(requisicao, resposta) === null) return;
      const enderecos = await comoCliente(resposta, () => listarEnderecos());
      resposta.json({ enderecos });
    } catch (causa) {
      proximo(causa);
    }
  });

  const paraSalvar = validar({ body: esquemaDoEnderecoParaSalvar });

  rotas.post(
    "/enderecos",
    (requisicao, resposta, proximo) => {
      if (exigirCliente(requisicao, resposta) === null) return;
      proximo();
    },
    paraSalvar,
    async (requisicao, resposta, proximo) => {
      try {
        const { body } = paraSalvar.dados(requisicao);
        const salvo = await comoCliente(resposta, () => salvarEndereco(body));
        resposta.status(201).json(salvo);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.put(
    "/enderecos/:id",
    (requisicao, resposta, proximo) => {
      if (exigirCliente(requisicao, resposta) === null) return;
      if (!esquemaDoEnderecoNaRota.safeParse(requisicao.params).success) {
        erro(resposta, 404, "nao_encontrado");
        return;
      }
      proximo();
    },
    paraSalvar,
    async (requisicao, resposta, proximo) => {
      try {
        const { id } = esquemaDoEnderecoNaRota.parse(requisicao.params);
        const { body } = paraSalvar.dados(requisicao);
        const trocado = await comoCliente(resposta, () =>
          trocarEndereco(id, body),
        );
        if (trocado === null) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }
        resposta.json(trocado);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.delete("/enderecos/:id", async (requisicao, resposta, proximo) => {
    try {
      if (exigirCliente(requisicao, resposta) === null) return;
      const params = esquemaDoEnderecoNaRota.safeParse(requisicao.params);
      if (!params.success) {
        erro(resposta, 404, "nao_encontrado");
        return;
      }
      const apagado = await comoCliente(resposta, () =>
        apagarEndereco(params.data.id),
      );
      if (!apagado) {
        erro(resposta, 404, "nao_encontrado");
        return;
      }
      resposta.status(204).end();
    } catch (causa) {
      proximo(causa);
    }
  });

  rotas.post("/enderecos/:id/padrao", async (requisicao, resposta, proximo) => {
    try {
      if (exigirCliente(requisicao, resposta) === null) return;
      const params = esquemaDoEnderecoNaRota.safeParse(requisicao.params);
      if (!params.success) {
        erro(resposta, 404, "nao_encontrado");
        return;
      }
      const marcado = await comoCliente(resposta, () =>
        marcarEnderecoPadrao(params.data.id),
      );
      if (marcado === null) {
        erro(resposta, 404, "nao_encontrado");
        return;
      }
      resposta.json(marcado);
    } catch (causa) {
      proximo(causa);
    }
  });

  return rotas;
}
