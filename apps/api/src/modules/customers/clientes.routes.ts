/**
 * As rotas do dono sobre os clientes da loja (T-700 a T-703, T-706).
 *
 *   GET    /v1/lojas/:apelido/clientes?busca=&pedidos=&cadastro=&inativosDias=
 *          &origem=&ordem=&pagina=&porPagina=  — a lista, com totais, busca,
 *          filtros, ordem e (com `pagina`) paginação
 *   POST   /v1/lojas/:apelido/clientes          — o cadastro manual
 *   GET    /v1/lojas/:apelido/clientes/:id      — a ficha com o histórico
 *   PATCH  /v1/lojas/:apelido/clientes/:id      — a correção da ficha
 *   DELETE /v1/lojas/:apelido/clientes/:id      — a remoção com retenção
 *   POST   /v1/lojas/:apelido/clientes/importacao/{previa,confirmar,relatorio}
 *          — o importador de planilhas (card #60, `importacao/`)
 *
 * MESMO ARRANJO DAS OUTRAS ROTAS DO PAINEL: a loja é resolvida pelo apelido
 * SEM contexto — ainda não se sabe qual é —, e só então a transação abre com a
 * loja, a identidade e o papel de quem pediu. É o isolamento por linha que
 * garante que cliente de outra loja não existe para esta requisição: pedido
 * pelo identificador, ele responde 404, igual a cliente que não existe
 * (AC-702). Nenhuma rota daqui recebe a loja por outro caminho que não o
 * apelido, e nenhuma decide sozinha quem pode o quê.
 *
 * Identificador fora do formato responde "não encontrado" na borda, antes do
 * banco (P-007), igual a identificador bem formado que não existe.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import {
  esquemaDoClienteParaCadastrar,
  esquemaDoClienteParaEditar,
} from "@simpleclick/contracts";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, type AcessoAoBanco } from "../../core/db.ts";
import { validar } from "../../core/validar.ts";
import { cadastrarCliente } from "./cadastrar.usecase.ts";
import { editarCliente } from "./editar.usecase.ts";
import { historicoDoCliente } from "./historico.usecase.ts";
import { registrarRotasDaImportacao } from "./importacao/importacao.routes.ts";
import { listarClientes, ORDENS_DOS_CLIENTES } from "./listar.usecase.ts";
import { removerCliente } from "./remover.usecase.ts";

/** Como a loja chega: pelo apelido do caminho. */
export interface ChegadaNaLoja {
  readonly host?: string | null;
  readonly apelido?: string | null;
}

export type IdentificacaoDaLoja =
  | { readonly encontrada: true; readonly id: string }
  | { readonly encontrada: false };

/** O dono autenticado, como a borda o entrega. */
export interface DonoAutenticado {
  readonly identidadeId: string;
  readonly papel: "OWNER" | "STAFF";
}

export interface OpcoesDosClientes {
  readonly acesso?: AcessoAoBanco;
  readonly autenticar: (requisicao: Request) => DonoAutenticado | null;
  readonly resolverLoja: (
    chegada: ChegadaNaLoja,
  ) => Promise<IdentificacaoDaLoja>;
}

const esquemaDoApelidoNaRota = z.object({
  apelido: z.string().trim().min(1).max(80),
});

const esquemaDoClienteNaRota = z.object({
  apelido: z.string().trim().min(1).max(80),
  id: z.uuid(),
});

/**
 * A consulta da lista. Tudo é opcional (a lista antiga continua valendo):
 * com `pagina`, a resposta vem paginada e com o total. Valor de filtro que
 * não existe é recusado (400), e não ignorado em silêncio.
 */
const esquemaDaBusca = z.object({
  busca: z.string().trim().max(80).optional(),
  pedidos: z.enum(["com", "sem"]).optional(),
  cadastro: z.enum(["recentes"]).optional(),
  inativosDias: z.coerce.number().int().min(1).max(3650).optional(),
  origem: z.enum(["importados"]).optional(),
  ordem: z.enum(ORDENS_DOS_CLIENTES).optional(),
  pagina: z.coerce.number().int().min(1).max(100_000).optional(),
  porPagina: z.coerce.number().int().min(10).max(100).optional(),
});

function erro(resposta: Response, status: number, codigo: string): void {
  resposta.status(status).json({ erro: codigo });
}

export function criarRotasDosClientes(opcoes: OpcoesDosClientes): Router {
  const rotas = Router();
  // Preguiçoso: montar a aplicação não pode exigir banco configurado (AC-001).
  const acesso = (): AcessoAoBanco => opcoes.acesso ?? banco();

  /** A loja do apelido, resolvida sem contexto de loja. */
  async function lojaDoApelido(apelido: string): Promise<string | null> {
    const identificacao = await executarComoRequisicao(
      { papel: "PUBLIC" },
      () => acesso().emTransacao(() => opcoes.resolverLoja({ apelido })),
    );
    return identificacao.encontrada ? identificacao.id : null;
  }

  /** Roda `acao` na transação da loja, como o dono autenticado. */
  function comoDono<T>(
    resposta: Response,
    lojaId: string,
    acao: () => Promise<T>,
  ): Promise<T> {
    const dono = resposta.locals.dono as DonoAutenticado;
    return executarComoRequisicao(
      { lojaId, usuarioId: dono.identidadeId, papel: dono.papel },
      () => acesso().emTransacao(acao),
    );
  }

  /** Sem dono autenticado, nada daqui responde. */
  function exigirDono(
    requisicao: Request,
    resposta: Response,
  ): DonoAutenticado | null {
    const dono = opcoes.autenticar(requisicao);
    if (dono === null) {
      erro(resposta, 401, "nao_autenticado");
      return null;
    }
    resposta.locals.dono = dono;
    // A lista muda a cada pedido e a cada cadastro: guardada em cache, a tela
    // mostraria o cliente de minutos atrás como se fosse o de agora.
    resposta.set("cache-control", "no-store");
    return dono;
  }

  rotas.get("/:apelido/clientes", async (requisicao, resposta, proximo) => {
    try {
      if (exigirDono(requisicao, resposta) === null) return;
      const params = esquemaDoApelidoNaRota.safeParse(requisicao.params);
      const consulta = esquemaDaBusca.safeParse(requisicao.query);
      if (!params.success) {
        erro(resposta, 404, "nao_encontrado");
        return;
      }
      if (!consulta.success) {
        erro(resposta, 400, "entrada_invalida");
        return;
      }
      const lojaId = await lojaDoApelido(params.data.apelido);
      if (lojaId === null) {
        erro(resposta, 404, "nao_encontrado");
        return;
      }
      const pagina = await comoDono(resposta, lojaId, () =>
        listarClientes(consulta.data),
      );
      // Sem `pagina`, a resposta é a de sempre: só a lista.
      if (consulta.data.pagina === undefined) {
        resposta.json({ clientes: pagina.clientes });
        return;
      }
      resposta.json(pagina);
    } catch (causa) {
      proximo(causa);
    }
  });

  const paraCadastrar = validar({
    params: esquemaDoApelidoNaRota,
    body: esquemaDoClienteParaCadastrar,
  });

  rotas.post(
    "/:apelido/clientes",
    (requisicao, resposta, proximo) => {
      if (exigirDono(requisicao, resposta) === null) return;
      proximo();
    },
    paraCadastrar,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = paraCadastrar.dados(requisicao);
        const lojaId = await lojaDoApelido(params.apelido);
        if (lojaId === null) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }
        const resultado = await comoDono(resposta, lojaId, () =>
          cadastrarCliente(body),
        );
        if (resultado.tipo === "existente") {
          resposta.status(409).json(resultado.existente);
          return;
        }
        if (resultado.tipo === "telefone_invalido") {
          resposta.status(400).json({
            erro: "entrada_invalida",
            campos: [
              {
                onde: "body",
                caminho: "telefone",
                mensagem: resultado.explicacao,
              },
            ],
          });
          return;
        }
        resposta.status(201).json(resultado.ficha);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.get("/:apelido/clientes/:id", async (requisicao, resposta, proximo) => {
    try {
      if (exigirDono(requisicao, resposta) === null) return;
      const params = esquemaDoClienteNaRota.safeParse(requisicao.params);
      if (!params.success) {
        erro(resposta, 404, "nao_encontrado");
        return;
      }
      const lojaId = await lojaDoApelido(params.data.apelido);
      if (lojaId === null) {
        erro(resposta, 404, "nao_encontrado");
        return;
      }
      const ficha = await comoDono(resposta, lojaId, () =>
        historicoDoCliente(params.data.id),
      );
      if (ficha === null) {
        erro(resposta, 404, "nao_encontrado");
        return;
      }
      resposta.json(ficha);
    } catch (causa) {
      proximo(causa);
    }
  });

  const paraEditar = validar({ body: esquemaDoClienteParaEditar });

  rotas.patch(
    "/:apelido/clientes/:id",
    (requisicao, resposta, proximo) => {
      if (exigirDono(requisicao, resposta) === null) return;
      if (!esquemaDoClienteNaRota.safeParse(requisicao.params).success) {
        erro(resposta, 404, "nao_encontrado");
        return;
      }
      proximo();
    },
    paraEditar,
    async (requisicao, resposta, proximo) => {
      try {
        const params = esquemaDoClienteNaRota.parse(requisicao.params);
        const { body } = paraEditar.dados(requisicao);
        const lojaId = await lojaDoApelido(params.apelido);
        if (lojaId === null) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }
        const resultado = await comoDono(resposta, lojaId, () =>
          editarCliente(params.id, body),
        );
        switch (resultado.tipo) {
          case "nao_encontrado":
            erro(resposta, 404, "nao_encontrado");
            return;
          case "existente":
            resposta.status(409).json(resultado.existente);
            return;
          case "telefone_invalido":
            resposta.status(400).json({
              erro: "entrada_invalida",
              campos: [
                {
                  onde: "body",
                  caminho: "telefone",
                  mensagem: resultado.explicacao,
                },
              ],
            });
            return;
          case "editado":
            resposta.json(resultado.ficha);
            return;
        }
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.delete(
    "/:apelido/clientes/:id",
    async (requisicao, resposta, proximo) => {
      try {
        if (exigirDono(requisicao, resposta) === null) return;
        const params = esquemaDoClienteNaRota.safeParse(requisicao.params);
        if (!params.success) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }
        const lojaId = await lojaDoApelido(params.data.apelido);
        if (lojaId === null) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }
        const removido = await comoDono(resposta, lojaId, () =>
          removerCliente(params.data.id),
        );
        if (!removido) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }
        resposta.status(204).end();
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  registrarRotasDaImportacao(rotas, { exigirDono, lojaDoApelido, comoDono });

  return rotas;
}
