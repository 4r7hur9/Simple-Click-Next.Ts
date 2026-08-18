/**
 * Erro de domínio tipado e a resposta que ele vira (AC-024).
 *
 * A regra é uma só: **o que sai para quem chamou é genérico; o que explica a
 * falha fica no registro do servidor.** Entre os dois existe um código de
 * referência, que é o identificador da requisição — quem recebeu o erro cita o
 * código, e quem investiga acha na hora todas as linhas daquela requisição
 * (AC-021).
 *
 * O motivo de a resposta ser pobre é concreto e já custou caro em outros
 * sistemas: pilha de execução entrega caminho de arquivo e estrutura interna;
 * mensagem de banco entrega nome de tabela, de coluna e de restrição; e as
 * duas juntas desenham o esquema para quem está procurando por onde entrar.
 * Pior: a mensagem do banco costuma vir com o VALOR que causou a falha colado
 * nela, e esse valor é justamente o dado pessoal que P-009 proíbe registrar —
 * quanto mais devolver.
 *
 * Por isso a resposta é montada a partir de um catálogo fechado, e não a partir
 * do erro. Erro que este módulo não conhece vira `erro_interno`, sempre.
 */

import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  Response,
} from "express";

import { contextoAtual } from "./contexto.ts";
import { descreverErro, EVENTOS, registrar } from "./log.ts";

// ---------------------------------------------------------------------------
// O catálogo
// ---------------------------------------------------------------------------

/** Uma entrada do catálogo: o status HTTP e o texto que o cliente lê. */
interface EntradaDoCatalogo {
  readonly status: number;
  readonly mensagem: string;
}

/**
 * Todo erro que a API sabe responder, com o texto que vai para fora.
 *
 * Os textos são escritos aqui, uma vez, e não montados a partir do que
 * aconteceu. É o que garante que nenhum detalhe interno chegue à resposta por
 * interpolação distraída — não existe interpolação nenhuma.
 */
export const CATALOGO_DE_ERROS = {
  entrada_invalida: {
    status: 400,
    mensagem: "Os dados enviados não são válidos.",
  },
  nao_autenticado: {
    status: 401,
    mensagem: "É preciso entrar para continuar.",
  },
  sem_permissao: {
    status: 403,
    mensagem: "Esta conta não tem permissão para esta operação.",
  },
  nao_encontrado: {
    status: 404,
    mensagem: "O recurso pedido não foi encontrado.",
  },
  conflito: {
    status: 409,
    mensagem: "A operação conflita com o estado atual do recurso.",
  },
  limite_excedido: {
    status: 429,
    mensagem: "Muitas tentativas. Aguarde um pouco e tente de novo.",
  },
  erro_interno: {
    status: 500,
    mensagem: "Não foi possível concluir a operação. Tente novamente.",
  },
  indisponivel: {
    status: 503,
    mensagem: "O serviço está temporariamente indisponível.",
  },
} as const satisfies Record<string, EntradaDoCatalogo>;

/** Códigos que a API sabe responder. */
export type CodigoDeErro = keyof typeof CATALOGO_DE_ERROS;

/** Verdadeiro quando o texto é um código do catálogo. */
export function ehCodigoDeErro(valor: unknown): valor is CodigoDeErro {
  return typeof valor === "string" && valor in CATALOGO_DE_ERROS;
}

// ---------------------------------------------------------------------------
// O erro de domínio
// ---------------------------------------------------------------------------

/**
 * Falha prevista pelo domínio.
 *
 * O `detalhe` NÃO vai para a resposta: ele existe para o registro do servidor,
 * e mesmo lá passa pela lista de permissão de `core/log.ts` — pôr telefone
 * dentro dele não vaza, só produz `[omitido]`.
 *
 * A marca `mensagemEscritaPorNos` autoriza o registro a gravar a mensagem
 * deste erro. Ela é verdadeira porque a mensagem vem do catálogo acima, escrita
 * à mão, sem nada vindo da requisição.
 */
export class ErroDeDominio extends Error {
  readonly codigo: CodigoDeErro;
  readonly status: number;
  readonly detalhe: Readonly<Record<string, unknown>>;
  readonly mensagemEscritaPorNos = true as const;

  constructor(
    codigo: CodigoDeErro,
    detalhe: Readonly<Record<string, unknown>> = {},
    causa?: unknown,
  ) {
    const entrada = CATALOGO_DE_ERROS[codigo];
    super(entrada.mensagem, causa === undefined ? undefined : { cause: causa });
    this.name = "ErroDeDominio";
    this.codigo = codigo;
    this.status = entrada.status;
    this.detalhe = detalhe;
  }
}

/** Atalho de leitura: `lancarErro("nao_encontrado", { recurso, recursoId })`. */
export function erroDeDominio(
  codigo: CodigoDeErro,
  detalhe?: Readonly<Record<string, unknown>>,
  causa?: unknown,
): ErroDeDominio {
  return new ErroDeDominio(codigo, detalhe, causa);
}

// ---------------------------------------------------------------------------
// A resposta
// ---------------------------------------------------------------------------

/** Corpo de erro da API. É esta forma, e só ela, que chega ao cliente. */
export interface CorpoDeErro {
  readonly erro: {
    /** Código estável, para o cliente decidir o que fazer sem ler texto. */
    readonly codigo: CodigoDeErro;
    /** Texto genérico do catálogo, pronto para ser mostrado a uma pessoa. */
    readonly mensagem: string;
    /** Identificador da requisição: é por ele que o suporte acha o registro. */
    readonly referencia: string;
  };
}

/** Resposta pronta: o status HTTP e o corpo. */
export interface RespostaDeErro {
  readonly status: number;
  readonly corpo: CorpoDeErro;
}

/** Referência usada quando a falha acontece fora de um contexto de requisição. */
export const REFERENCIA_SEM_CONTEXTO = "sem-contexto";

/**
 * Traduz qualquer coisa lançada na resposta que o cliente recebe.
 *
 * O `erro` entra como `unknown` de propósito: em JavaScript se lança qualquer
 * coisa, e a função que traduz falha não pode confiar no que recebeu. O que
 * não for `ErroDeDominio` vira `erro_interno` — inclusive erro de biblioteca,
 * inclusive erro do banco.
 */
export function respostaDeErro(
  erro: unknown,
  referencia: string,
): RespostaDeErro {
  const codigo: CodigoDeErro =
    erro instanceof ErroDeDominio ? erro.codigo : "erro_interno";
  const entrada = CATALOGO_DE_ERROS[codigo];

  return {
    status: entrada.status,
    corpo: {
      erro: { codigo, mensagem: entrada.mensagem, referencia },
    },
  };
}

/**
 * Último middleware da composição: converte a falha em resposta e registra o
 * detalhamento.
 *
 * Registra ANTES de responder porque uma falha no envio da resposta não pode
 * apagar o único vestígio do que aconteceu.
 *
 * Nível: 5xx é `erro` (alguém precisa olhar); 4xx é `aviso` (o cliente errou, e
 * inundar o registro com isso esconde o que importa).
 */
export function manipuladorDeErros(): ErrorRequestHandler {
  return function converterErroEmResposta(
    erro: unknown,
    _req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const referencia = contextoAtual()?.requisicaoId ?? REFERENCIA_SEM_CONTEXTO;
    const { status, corpo } = respostaDeErro(erro, referencia);

    const linha = {
      status,
      codigo: corpo.erro.codigo,
      referencia,
      // Descrever aqui, e não deixar o objeto cru para a higienização: em
      // JavaScript se lança qualquer coisa, e um `throw "texto"` passaria como
      // texto simples por um campo autorizado. `descreverErro` fecha essa
      // porta — o que não é erro entra como `[omitido]`.
      erro: descreverErro(erro),
      detalhe: erro instanceof ErroDeDominio ? erro.detalhe : {},
    };
    if (status >= 500) registrar.erro(EVENTOS.requisicaoFalhou, linha);
    else registrar.aviso(EVENTOS.requisicaoFalhou, linha);

    // Resposta já iniciada: mexer nela agora corromperia o que o cliente está
    // recebendo. Quem sabe abortar a conexão é o próprio Express.
    if (res.headersSent) {
      next(erro);
      return;
    }

    res.status(status).json(corpo);
  };
}
