/**
 * Borda única de validação de entrada da API (P-007).
 *
 * A regra da constituição é curta — "todo corpo, parâmetro e query de rota é
 * validado por esquema declarado antes de chegar ao domínio" — mas ela só vale
 * de fato se existir UM lugar por onde a entrada passa. Validação espalhada
 * pelos casos de uso é validação que alguém esquece numa rota nova, e o
 * esquecimento não aparece em teste nenhum: a rota funciona, só que aceita
 * qualquer coisa.
 *
 * Três decisões deste arquivo, e o modo de falha que cada uma fecha:
 *
 * 1. **O que não foi declarado não existe para o domínio.** O esquema de objeto
 *    do Zod descarta chave não declarada, e a borda entrega ao domínio SÓ o que
 *    o esquema devolveu. É o que impede a atribuição em massa — o corpo com um
 *    `papel: "OWNER"` a mais, que o domínio copiaria inteiro para o banco.
 * 2. **O domínio não lê a requisição crua.** Quem quer a entrada chama
 *    `borda.dados(req)`, e essa chamada RECUSA quando a borda não rodou antes.
 *    Sem isso, "esqueci de pôr o middleware na rota" seria silencioso: o
 *    handler leria `req.body` sem validação e ninguém notaria.
 * 3. **A recusa não devolve o que foi recebido.** A resposta diz onde e o que
 *    se esperava, nunca o valor enviado — que costuma ser dado pessoal (P-009)
 *    e, num erro, iria parar no registro de quem chamou.
 *
 * O esquema em si mora no módulo de domínio, em `modules/<area>/*.schema.ts`.
 * Aqui fica só a mecânica de aplicá-lo, porque a borda não pode conhecer regra
 * de negócio nenhuma.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { z } from "zod";

// ---------------------------------------------------------------------------
// Tipos de fronteira
// ---------------------------------------------------------------------------

/** As quatro partes de uma requisição HTTP que a borda sabe validar. */
export const PARTES_DA_ENTRADA = [
  "params",
  "query",
  "body",
  "headers",
] as const;

/** Uma das partes validáveis da requisição. */
export type ParteDaEntrada = (typeof PARTES_DA_ENTRADA)[number];

/** Esquemas declarados por uma rota, uma parte de cada vez. */
export type EsquemasDaRota = Partial<Record<ParteDaEntrada, z.ZodType>>;

/**
 * O que o domínio recebe: uma propriedade por parte declarada, já com o tipo
 * de saída do esquema. Parte não declarada nem aparece no tipo — assim o
 * domínio não tem como ler o que ninguém validou.
 */
export type DadosValidados<E extends EsquemasDaRota> = {
  readonly [P in keyof E & ParteDaEntrada]: NonNullable<E[P]> extends z.ZodType
    ? z.output<NonNullable<E[P]>>
    : never;
};

/** Um campo reprovado, no formato que a resposta de recusa publica. */
export interface CampoInvalido {
  /** Em que parte da requisição o campo estava. */
  readonly onde: ParteDaEntrada;
  /** Caminho até o campo, com ponto entre os níveis. Vazio é a raiz da parte. */
  readonly caminho: string;
  /** O que se esperava. Nunca o que foi recebido. */
  readonly mensagem: string;
}

/** Corpo da resposta 400 desta borda. */
export interface RecusaDeEntrada {
  readonly erro: "entrada_invalida";
  readonly campos: readonly CampoInvalido[];
}

/**
 * A borda de uma rota: um middleware do Express que também sabe entregar, já
 * tipados, os dados que ele mesmo validou.
 */
export interface BordaDeValidacao<
  E extends EsquemasDaRota,
> extends RequestHandler {
  /** Os dados validados desta requisição. Recusa se a borda não tiver rodado. */
  dados(req: Request): DadosValidados<E>;
  /** Os esquemas declarados, para quem gera o documento de contrato (T-011). */
  readonly esquemas: E;
}

/** Código HTTP de entrada reprovada. */
export const STATUS_DE_ENTRADA_INVALIDA = 400;

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

/**
 * O domínio pediu a entrada validada de uma requisição que não passou pela
 * borda. É erro de programação, não de quem chamou a API — por isso estoura
 * alto em vez de devolver um objeto vazio que pareceria funcionar.
 */
export class ErroSemValidacao extends Error {
  constructor() {
    super(
      [
        "Pedido de entrada validada numa requisição que não passou pela borda de validação.",
        "",
        "Monte a rota com o middleware que a borda devolve, e leia os dados",
        "pela mesma borda:",
        "",
        "  const entrada = validar({ body: esquemaDoPedido });",
        "  app.post('/v1/…', entrada, (req, res) => {",
        "    const { body } = entrada.dados(req);",
        "  });",
        "",
        "Ler `req.body` direto é o que P-007 existe para impedir.",
      ].join("\n"),
    );
    this.name = "ErroSemValidacao";
  }
}

// ---------------------------------------------------------------------------
// Mecânica
// ---------------------------------------------------------------------------

/** Caminho do campo em texto: `itens.0.quantidade`. Raiz vira cadeia vazia. */
function caminhoDoCampo(trilha: readonly PropertyKey[]): string {
  return trilha.map((passo) => String(passo)).join(".");
}

/** Traduz as reclamações do Zod de uma parte em campos reprovados. */
function camposReprovados(
  onde: ParteDaEntrada,
  erro: z.ZodError,
): CampoInvalido[] {
  return erro.issues.map((questao) => ({
    onde,
    caminho: caminhoDoCampo(questao.path),
    // Só a expectativa. O valor recebido fica fora de propósito: ele é dado de
    // quem chamou, e resposta de erro é lugar por onde dado pessoal vaza.
    mensagem: questao.message,
  }));
}

/** O valor cru de uma parte da requisição, do jeito que o Express o entrega. */
function parteCrua(req: Request, parte: ParteDaEntrada): unknown {
  if (parte === "params") return req.params;
  if (parte === "query") return req.query;
  if (parte === "body") return req.body;
  return req.headers;
}

/**
 * Substitui o corpo cru pelo corpo validado — ou o apaga quando a rota não
 * declarou corpo nenhum.
 *
 * Existe para o caso de alguém ler `req.body` por hábito: o que estiver lá já
 * passou pelo esquema, ou não está lá. `req.query` não recebe o mesmo
 * tratamento porque no Express 5 ela é só leitura; para essa parte o único
 * caminho é `borda.dados(req)`.
 */
function trocarOCorpoPeloValidado(
  req: Request,
  declarouCorpo: boolean,
  validado: Record<string, unknown>,
): void {
  req.body = declarouCorpo ? validado.body : undefined;
}

/**
 * Monta a borda de validação de uma rota (P-007).
 *
 * Entrada reprovada devolve 400 e o middleguarda NÃO chama o próximo elo — é
 * literalmente isso que "não chega ao domínio" significa aqui.
 */
export function validar<E extends EsquemasDaRota>(
  esquemas: E,
): BordaDeValidacao<E> {
  // Uma marca por borda, e não uma marca global: assim duas bordas na mesma
  // rota não sobrescrevem uma os dados da outra.
  const marca = Symbol("entrada validada");

  const middleware = (req: Request, res: Response, proximo: NextFunction) => {
    const validado: Record<string, unknown> = {};
    const reprovados: CampoInvalido[] = [];

    for (const parte of PARTES_DA_ENTRADA) {
      const esquema = esquemas[parte];
      if (esquema === undefined) continue;

      const resultado = esquema.safeParse(parteCrua(req, parte));
      if (resultado.success) validado[parte] = resultado.data;
      else reprovados.push(...camposReprovados(parte, resultado.error));
    }

    if (reprovados.length > 0) {
      const recusa: RecusaDeEntrada = {
        erro: "entrada_invalida",
        campos: reprovados,
      };
      res.status(STATUS_DE_ENTRADA_INVALIDA).json(recusa);
      return;
    }

    (req as unknown as Record<symbol, unknown>)[marca] = validado;
    trocarOCorpoPeloValidado(req, esquemas.body !== undefined, validado);
    proximo();
  };

  const borda = middleware as BordaDeValidacao<E>;

  borda.dados = (req: Request): DadosValidados<E> => {
    const guardado = (req as unknown as Record<symbol, unknown>)[marca];
    if (guardado === undefined) throw new ErroSemValidacao();
    return guardado as DadosValidados<E>;
  };

  Object.defineProperty(borda, "esquemas", { value: esquemas });
  return borda;
}
