/**
 * As rotas do importador de clientes (card #60), penduradas no roteador dos
 * clientes (`clientes.routes.ts`) — o mesmo portão de dono e a mesma
 * permissão `clientes` (o portão da equipe casa `/clientes/*`).
 *
 *   POST /v1/lojas/:apelido/clientes/importacao/previa
 *   POST /v1/lojas/:apelido/clientes/importacao/confirmar
 *   POST /v1/lojas/:apelido/clientes/importacao/relatorio
 *
 * O ARQUIVO VEM CRU NO CORPO, com teto de 5 MB lido aqui (e conferido de novo
 * pelo leitor). Quem não está autenticado é recusado ANTES de o corpo ser
 * lido: nenhum anônimo faz a API carregar 5 MB na memória.
 *
 * Um JSON enviado como `application/json` já chega lido pelo leitor geral da
 * API (teto de 1 MB); ele é aceito do mesmo jeito, reconvertido em bytes.
 */
import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
  type Router,
} from "express";
import { z } from "zod";

import {
  esquemaDaConsultaDaImportacao,
  esquemaDoPedidoDeRelatorio,
  mapeamentoDaConsulta,
  TAMANHO_MAXIMO_DA_IMPORTACAO_EM_BYTES,
  type ConsultaDaImportacao,
} from "@simpleclick/contracts";

import { validar } from "../../../core/validar.ts";
import { lerArquivoDeClientes } from "./ler-arquivo.ts";
import {
  confirmarImportacao,
  previaDaImportacao,
  type RodarNaLoja,
} from "./importacao.usecase.ts";
import { nomeDoRelatorio, relatorioEmCsv } from "./relatorio.ts";
import { ErroDaLeitura, type TabelaLida } from "./tabela.ts";

/** O que o roteador dos clientes empresta: o portão e a transação da loja. */
export interface ApoioDaImportacao {
  readonly exigirDono: (requisicao: Request, resposta: Response) => unknown;
  readonly lojaDoApelido: (apelido: string) => Promise<string | null>;
  readonly comoDono: <T>(
    resposta: Response,
    lojaId: string,
    acao: () => Promise<T>,
  ) => Promise<T>;
}

const esquemaDoApelidoNaRota = z.object({
  apelido: z.string().trim().min(1).max(80),
});

const STATUS_DA_RECUSA: Readonly<Record<ErroDaLeitura["codigo"], number>> = {
  arquivo_vazio: 400,
  arquivo_grande_demais: 413,
  linhas_demais: 413,
  formato_nao_suportado: 415,
  arquivo_ilegivel: 422,
};

const MENSAGEM_DE_ARQUIVO_GRANDE = `O arquivo passa de ${TAMANHO_MAXIMO_DA_IMPORTACAO_EM_BYTES / (1024 * 1024)} MB. Divida em arquivos menores.`;

const leitorCru = express.raw({
  type: () => true,
  limit: TAMANHO_MAXIMO_DA_IMPORTACAO_EM_BYTES,
});

/** Lê o corpo cru; corpo grande demais vira a recusa do importador. */
const lerCorpo: RequestHandler = (requisicao, resposta, proximo) => {
  leitorCru(requisicao, resposta, (causa?: unknown) => {
    if (causa === undefined || causa === null) {
      proximo();
      return;
    }
    if ((causa as { type?: string }).type === "entity.too.large") {
      resposta.status(413).json({
        erro: "arquivo_grande_demais",
        mensagem: MENSAGEM_DE_ARQUIVO_GRANDE,
      });
      return;
    }
    proximo(causa);
  });
};

/** Os bytes do arquivo, venham crus ou já lidos como JSON. */
function bytesDoCorpo(requisicao: Request): Uint8Array {
  const corpo: unknown = requisicao.body;
  if (Buffer.isBuffer(corpo)) return corpo;
  if (corpo === undefined || corpo === null) return new Uint8Array();
  if (typeof corpo === "object" && Object.keys(corpo).length === 0) {
    return new Uint8Array();
  }
  return Buffer.from(JSON.stringify(corpo), "utf-8");
}

function recusar(resposta: Response, erro: ErroDaLeitura): void {
  resposta
    .status(STATUS_DA_RECUSA[erro.codigo])
    .json({ erro: erro.codigo, mensagem: erro.message });
}

function lerTabela(
  requisicao: Request,
  consulta: ConsultaDaImportacao,
): TabelaLida {
  const jaLidoComoJson = !Buffer.isBuffer(requisicao.body);
  return lerArquivoDeClientes(bytesDoCorpo(requisicao), {
    nomeDoArquivo: consulta.arquivo ?? null,
    tipoDoConteudo: requisicao.get("content-type") ?? null,
    ...(consulta.formato !== undefined
      ? { formato: consulta.formato }
      : jaLidoComoJson
        ? { formato: "json" as const }
        : {}),
    ...(consulta.separador === undefined
      ? {}
      : { separador: consulta.separador }),
    ...(consulta.codificacao === undefined
      ? {}
      : { codificacao: consulta.codificacao }),
  });
}

export function registrarRotasDaImportacao(
  rotas: Router,
  apoio: ApoioDaImportacao,
): void {
  /** O portão antes do corpo: sem dono, nada é lido. */
  const portao = (
    requisicao: Request,
    resposta: Response,
    proximo: NextFunction,
  ) => {
    if (apoio.exigirDono(requisicao, resposta) === null) return;
    proximo();
  };

  /** Apelido, consulta e loja; ou a recusa já respondida. */
  async function entrada(
    requisicao: Request,
    resposta: Response,
  ): Promise<{ lojaId: string; consulta: ConsultaDaImportacao } | null> {
    const params = esquemaDoApelidoNaRota.safeParse(requisicao.params);
    if (!params.success) {
      resposta.status(404).json({ erro: "nao_encontrado" });
      return null;
    }
    const consulta = esquemaDaConsultaDaImportacao.safeParse(requisicao.query);
    if (!consulta.success) {
      resposta.status(400).json({ erro: "entrada_invalida" });
      return null;
    }
    const lojaId = await apoio.lojaDoApelido(params.data.apelido);
    if (lojaId === null) {
      resposta.status(404).json({ erro: "nao_encontrado" });
      return null;
    }
    return { lojaId, consulta: consulta.data };
  }

  rotas.post(
    "/:apelido/clientes/importacao/previa",
    portao,
    lerCorpo,
    async (requisicao, resposta, proximo) => {
      try {
        const pedido = await entrada(requisicao, resposta);
        if (pedido === null) return;
        const tabela = lerTabela(requisicao, pedido.consulta);
        const previa = await apoio.comoDono(resposta, pedido.lojaId, () =>
          previaDaImportacao(
            tabela,
            mapeamentoDaConsulta(pedido.consulta),
            pedido.consulta.arquivo ?? null,
          ),
        );
        resposta.json(previa);
      } catch (causa) {
        if (causa instanceof ErroDaLeitura) {
          recusar(resposta, causa);
          return;
        }
        proximo(causa);
      }
    },
  );

  rotas.post(
    "/:apelido/clientes/importacao/confirmar",
    portao,
    lerCorpo,
    async (requisicao, resposta, proximo) => {
      try {
        const pedido = await entrada(requisicao, resposta);
        if (pedido === null) return;
        const tabela = lerTabela(requisicao, pedido.consulta);
        const rodar: RodarNaLoja = (acao) =>
          apoio.comoDono(resposta, pedido.lojaId, acao);
        const resultado = await confirmarImportacao(
          {
            tabela,
            manual: mapeamentoDaConsulta(pedido.consulta),
            regra: pedido.consulta.repetidos,
            nomeDoArquivo: pedido.consulta.arquivo ?? null,
          },
          rodar,
        );
        resposta.json(resultado);
      } catch (causa) {
        if (causa instanceof ErroDaLeitura) {
          recusar(resposta, causa);
          return;
        }
        proximo(causa);
      }
    },
  );

  const paraRelatorio = validar({
    params: esquemaDoApelidoNaRota,
    body: esquemaDoPedidoDeRelatorio,
  });

  rotas.post(
    "/:apelido/clientes/importacao/relatorio",
    portao,
    paraRelatorio,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = paraRelatorio.dados(requisicao);
        const lojaId = await apoio.lojaDoApelido(params.apelido);
        if (lojaId === null) {
          resposta.status(404).json({ erro: "nao_encontrado" });
          return;
        }
        const arquivo = z
          .string()
          .trim()
          .max(200)
          .optional()
          .safeParse(requisicao.query["arquivo"]);
        const nome = nomeDoRelatorio(
          arquivo.success ? (arquivo.data ?? null) : null,
        );
        resposta
          .status(200)
          .set("content-type", "text/csv; charset=utf-8")
          .set("content-disposition", `attachment; filename="${nome}"`)
          .send(relatorioEmCsv(body.linhas));
      } catch (causa) {
        proximo(causa);
      }
    },
  );
}
