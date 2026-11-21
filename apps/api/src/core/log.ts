/**
 * Registro estruturado da API (AC-021, AC-022, P-009).
 *
 * Duas obrigações moram aqui, e as duas são de segurança antes de serem de
 * conveniência:
 *
 * 1. **Toda linha de uma requisição carrega o mesmo identificador.** Sem isso,
 *    investigar um defeito é juntar linhas soltas por horário e torcer para
 *    duas requisições simultâneas não terem se misturado. O identificador vem
 *    do contexto que já existe em `core/contexto.ts` — não de um parâmetro que
 *    cada chamada precise lembrar de passar, porque um esquecimento numa única
 *    chamada já parte o caminho ao meio.
 *
 * 2. **O registro é montado por LISTA DO QUE PODE entrar**, nunca por lista do
 *    que não pode. A diferença não é de estilo, é de modo de falha: uma lista
 *    de negação esquece o campo que nasceu ontem e vaza em silêncio; uma lista
 *    de permissão esquece o campo que nasceu ontem e o omite — o programador
 *    percebe na primeira investigação e acrescenta o campo de propósito. Como
 *    telefone, endereço, chave PIX, senha e credencial são exatamente os campos
 *    que aparecem depois, é a lista de permissão que atende à LGPD aqui.
 *
 * Consequência assumida: **mensagem de erro de biblioteca não vai para o
 * registro.** O texto de um erro que não escrevemos é livre e já foi visto
 * carregando o valor que causou a falha (`invalid input syntax for ...` com o
 * dado colado). O que se registra dele é o nome da classe, o código quando ele
 * tem um, e os quadros da pilha — que são caminho de arquivo e nome de função,
 * nunca dado de quem usa. Erro nosso, que carrega a marca
 * `mensagemEscritaPorNos`, tem a mensagem registrada porque quem a escreveu
 * fomos nós.
 */

import { randomUUID } from "node:crypto";

import type { NextFunction, Request, RequestHandler, Response } from "express";
import { pino, type DestinationStream, type Logger } from "pino";

import { trace } from "@opentelemetry/api";

import {
  abrirContextoRaiz,
  anotarRastreio,
  contextoAtual,
  executarNoContexto,
  marcasDoContexto,
  type ContextoDaRequisicao,
} from "./contexto.ts";

// ---------------------------------------------------------------------------
// A lista do que pode ser registrado
// ---------------------------------------------------------------------------

/** O que aparece no lugar do valor que a lista de permissão não deixou passar. */
export const OMITIDO = "[omitido]";

/**
 * Os únicos nomes de campo que chegam ao registro.
 *
 * Todos descrevem **identificação, classificação ou medida** — coisas que
 * apontam para o dado sem serem o dado. Acrescentar um nome aqui é uma decisão
 * consciente e revisável; é isso que faz esta lista valer alguma coisa.
 *
 * Note o que NÃO está aqui e nunca deve estar: qualquer campo que guarde o
 * valor informado por uma pessoa. O identificador do cliente entra; o meio de
 * contato dele, não. O identificador da loja entra; a chave de recebimento
 * dela, não.
 */
export const CAMPOS_PERMITIDOS: ReadonlySet<string> = new Set([
  // --- quem é a requisição ---
  "requisicaoId",
  "lojaId",
  "usuarioId",
  "papel",
  // --- ligação com o trace (OpenTelemetry) ---
  "traceId",
  "spanId",
  // --- quem é o processo ---
  "servico",
  "ambiente",
  "versao",
  "pid",
  "hostname",
  // --- o que aconteceu ---
  "evento",
  "metodo",
  "rota",
  "status",
  "duracaoMs",
  "tentativa",
  "esperaMs",
  "quantidade",
  "porta",
  // --- sobre qual coisa ---
  "recurso",
  "recursoId",
  "dependencia",
  "estado",
  "campos",
  "itens",
  "detalhe",
  // --- o que deu errado ---
  "erro",
  "nome",
  "codigo",
  "mensagem",
  "pilha",
  "causa",
  "referencia",
]);

/** Profundidade máxima que a higienização percorre. Ciclo não passa daqui. */
const PROFUNDIDADE_MAXIMA = 6;

/** Quantos itens de uma lista sobrevivem. O resto vira uma contagem. */
const ITENS_MAXIMOS = 50;

/** Quantos quadros de pilha bastam para achar a origem sem inchar a linha. */
const QUADROS_MAXIMOS = 12;

// ---------------------------------------------------------------------------
// Erro cuja mensagem é nossa
// ---------------------------------------------------------------------------

/**
 * Erro cuja mensagem foi escrita por nós, e por isso pode ir para o registro.
 *
 * A marca é uma propriedade e não uma verificação por `instanceof` de propósito:
 * `core/log.ts` não pode importar `core/erros.ts` — seria dependência circular,
 * porque é `erros.ts` que registra.
 */
export interface ErroDeMensagemPropria extends Error {
  readonly mensagemEscritaPorNos: true;
}

/** Verdadeiro quando a mensagem do erro foi escrita por nós. */
export function temMensagemPropria(
  erro: unknown,
): erro is ErroDeMensagemPropria {
  return (
    erro instanceof Error &&
    (erro as Partial<ErroDeMensagemPropria>).mensagemEscritaPorNos === true
  );
}

// ---------------------------------------------------------------------------
// Higienização
// ---------------------------------------------------------------------------

/** Formato de código de erro que é seguro registrar: sem espaço, curto. */
const FORMA_DE_CODIGO = /^[A-Za-z0-9_.:-]{1,64}$/;

/** Só os quadros da pilha. A primeira linha é `Nome: mensagem` — ela fica fora. */
function quadrosDaPilha(pilha: string | undefined): string[] | undefined {
  if (pilha === undefined) return undefined;
  const quadros = pilha
    .split("\n")
    .filter((linha) => /^\s*at\s/.test(linha))
    .map((linha) => linha.trim())
    .slice(0, QUADROS_MAXIMOS);
  return quadros.length > 0 ? quadros : undefined;
}

/** O código do erro, quando ele tem um e ele tem forma de código. */
function codigoDoErro(erro: Error): string | undefined {
  const bruto =
    (erro as Error & { code?: unknown; codigo?: unknown }).codigo ??
    (erro as Error & { code?: unknown }).code;
  return typeof bruto === "string" && FORMA_DE_CODIGO.test(bruto)
    ? bruto
    : undefined;
}

/**
 * Descreve um erro em campos que a lista de permissão aceita.
 *
 * O que sai daqui ainda passa pela higienização — descrever não é autorizar.
 */
export function descreverErro(
  erro: unknown,
  profundidade = 0,
): Record<string, unknown> {
  if (!(erro instanceof Error)) {
    // Alguém lançou algo que não é erro. O valor não é registrado: seria
    // exatamente o tipo de texto livre que esta camada existe para conter.
    return { nome: "naoErro", mensagem: OMITIDO };
  }

  const descricao: Record<string, unknown> = { nome: erro.name };

  if (temMensagemPropria(erro)) descricao.mensagem = erro.message;
  const codigo = codigoDoErro(erro);
  if (codigo !== undefined) descricao.codigo = codigo;

  const quadros = quadrosDaPilha(erro.stack);
  if (quadros !== undefined) descricao.pilha = quadros;

  // A causa vira uma descrição também: uma falha de conexão embrulhada por um
  // erro nosso perde a origem se a cadeia parar no primeiro elo.
  if (erro.cause !== undefined && profundidade < 2) {
    descricao.causa = descreverErro(erro.cause, profundidade + 1);
  }

  return descricao;
}

/** Verdadeiro para o que pode ser gravado como está: texto, número, sim/não. */
function ehValorSimples(valor: unknown): boolean {
  const tipo = typeof valor;
  return tipo === "string" || tipo === "number" || tipo === "boolean";
}

/** Higieniza o valor de um campo já autorizado pela lista. */
function higienizarValor(valor: unknown, profundidade: number): unknown {
  if (valor === null || valor === undefined) return valor;
  if (ehValorSimples(valor)) return valor;
  if (valor instanceof Date) return valor.toISOString();
  if (valor instanceof Error) {
    return higienizar(descreverErro(valor), profundidade + 1);
  }
  if (Array.isArray(valor)) {
    if (profundidade >= PROFUNDIDADE_MAXIMA) return OMITIDO;
    return valor
      .slice(0, ITENS_MAXIMOS)
      .map((item) => higienizarValor(item, profundidade + 1));
  }
  if (typeof valor === "object") {
    if (profundidade >= PROFUNDIDADE_MAXIMA) return OMITIDO;
    return higienizar(valor as Record<string, unknown>, profundidade + 1);
  }
  // Função, símbolo, `bigint` de origem desconhecida: nada disso é informação
  // de operação, e serializar o que não se conhece é como o dado vaza.
  return OMITIDO;
}

/**
 * Deixa passar somente os campos da lista de permissão, em qualquer
 * profundidade.
 *
 * O campo barrado não desaparece: ele fica com o valor `[omitido]`. Sumir com a
 * chave esconderia que havia algo ali, e quem investiga precisa saber que o
 * dado existe — só não pode vê-lo.
 */
export function higienizar(
  dados: Record<string, unknown>,
  profundidade = 0,
): Record<string, unknown> {
  const limpo: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(dados)) {
    limpo[chave] = CAMPOS_PERMITIDOS.has(chave)
      ? higienizarValor(valor, profundidade)
      : OMITIDO;
  }
  return limpo;
}

// ---------------------------------------------------------------------------
// Nome do evento
// ---------------------------------------------------------------------------

/**
 * Nome de evento é identificador pontilhado em minúsculas — `pedido.criado`.
 *
 * A forma é estreita de propósito: ela é a lista de permissão aplicada ao
 * único texto livre que uma linha de registro tem. Telefone, endereço, chave
 * PIX e credencial não casam com ela (têm dígito no início, espaço, arroba ou
 * sinal), então um `registrar.info(dadoDaPessoa)` escrito por descuido não
 * chega à saída.
 */
const FORMA_DE_EVENTO = /^[a-z][a-z0-9]*(?:[._][a-z0-9]+)+$/;

/** O que aparece no lugar do nome de evento que não tem forma de evento. */
export const EVENTO_INVALIDO = "registro.evento_invalido";

/**
 * Substituir em vez de recusar é deliberado: registrador que lança derruba a
 * requisição que ele deveria apenas descrever. A linha continua saindo, sem
 * nome — e um evento sem nome salta aos olhos na primeira investigação.
 */
function nomeDeEvento(evento: string): string {
  return FORMA_DE_EVENTO.test(evento) ? evento : EVENTO_INVALIDO;
}

/** Eventos que este módulo emite. Cada módulo declara os seus. */
export const EVENTOS = {
  requisicaoIniciou: "requisicao.iniciou",
  requisicaoTerminou: "requisicao.terminou",
  requisicaoFalhou: "requisicao.falhou",
} as const;

// ---------------------------------------------------------------------------
// O registrador
// ---------------------------------------------------------------------------

/** Campos estruturados de uma linha de registro. */
export type DadosDeRegistro = Readonly<Record<string, unknown>>;

/**
 * O que o resto da API enxerga.
 *
 * Não expõe o registrador do pino: quem tiver o objeto cru pode chamar `.info`
 * com o que quiser e passar por fora da lista de permissão.
 */
export interface Registrador {
  depuracao(evento: string, dados?: DadosDeRegistro): void;
  info(evento: string, dados?: DadosDeRegistro): void;
  aviso(evento: string, dados?: DadosDeRegistro): void;
  erro(evento: string, dados?: DadosDeRegistro): void;
  fatal(evento: string, dados?: DadosDeRegistro): void;
}

/** Ajustes de quem monta um registrador. Teste usa `destino` para ler a saída. */
export interface OpcoesDeRegistrador {
  readonly nivel?: string | undefined;
  readonly ambiente?: string | undefined;
  readonly destino?: DestinationStream | undefined;
}

/** Nível padrão quando o ambiente não diz outro. */
const NIVEL_PADRAO = "info";

/** Nome do serviço em toda linha, para separar API de trabalho em segundo plano. */
const SERVICO = "simpleclick-api";

/**
 * Monta um registrador em JSON — uma linha, um objeto (AC-021, "legível por
 * máquina").
 *
 * O identificador da requisição entra por `mixin`, que o pino chama a cada
 * linha: é isso que faz o campo aparecer sem nenhuma chamada precisar passá-lo.
 * A higienização entra por `formatters.log`, que o pino chama com o objeto já
 * montado — pôr a lista de permissão ali, e não na fachada, é o que impede que
 * um caminho novo de registro nasça por fora dela.
 */
export function criarRegistrador(
  opcoes: OpcoesDeRegistrador = {},
): Registrador {
  const configuracao = {
    level: opcoes.nivel ?? NIVEL_PADRAO,
    base: {
      servico: SERVICO,
      ambiente: opcoes.ambiente ?? process.env.NODE_ENV ?? "development",
      pid: process.pid,
    },
    mixin(): Record<string, unknown> {
      const contexto = contextoAtual();
      if (contexto === undefined) return {};
      // As marcas juntam o que a requisição INTEIRA soube (papel de maior
      // privilégio, usuário, loja); o contexto em curso é a reserva.
      const marcas = marcasDoContexto(contexto);
      const lojaId = contexto.lojaId ?? marcas?.lojaId;
      const usuarioId = contexto.usuarioId ?? marcas?.usuarioId;
      const ativo = trace.getActiveSpan()?.spanContext();
      const traceId = ativo?.traceId ?? marcas?.traceId;
      const spanId = ativo?.spanId ?? marcas?.spanId;
      return {
        requisicaoId: contexto.requisicaoId,
        ...(lojaId === undefined ? {} : { lojaId }),
        ...(usuarioId === undefined ? {} : { usuarioId }),
        papel: marcas?.papel ?? contexto.papel,
        ...(traceId === undefined ? {} : { traceId }),
        ...(spanId === undefined ? {} : { spanId }),
      };
    },
    formatters: {
      log(objeto: Record<string, unknown>): Record<string, unknown> {
        return higienizar(objeto);
      },
    },
  };

  const registradorDoPino: Logger =
    opcoes.destino === undefined
      ? pino(configuracao)
      : pino(configuracao, opcoes.destino);

  function emitir(
    nivel: "debug" | "info" | "warn" | "error" | "fatal",
    evento: string,
    dados: DadosDeRegistro | undefined,
  ): void {
    const nome = nomeDeEvento(evento);
    registradorDoPino[nivel]({ ...dados, evento: nome }, nome);
  }

  return {
    depuracao: (evento, dados) => emitir("debug", evento, dados),
    info: (evento, dados) => emitir("info", evento, dados),
    aviso: (evento, dados) => emitir("warn", evento, dados),
    erro: (evento, dados) => emitir("error", evento, dados),
    fatal: (evento, dados) => emitir("fatal", evento, dados),
  };
}

let registradorDaAplicacao: Registrador | undefined;

/**
 * O registrador que a API usa em execução.
 *
 * Preguiçoso porque importar este módulo — o que todo teste faz — não pode
 * fixar o nível de registro antes de o ambiente ser lido.
 */
export function registrador(): Registrador {
  registradorDaAplicacao ??= criarRegistrador({ nivel: process.env.LOG_LEVEL });
  return registradorDaAplicacao;
}

/** Troca o registrador da aplicação. Serve à partida e ao teste. */
export function definirRegistrador(novo: Registrador | undefined): void {
  registradorDaAplicacao = novo;
}

/** Fachada de uso diário: `registrar.info("pedido.criado", { recursoId })`. */
export const registrar: Registrador = {
  depuracao: (evento, dados) => registrador().depuracao(evento, dados),
  info: (evento, dados) => registrador().info(evento, dados),
  aviso: (evento, dados) => registrador().aviso(evento, dados),
  erro: (evento, dados) => registrador().erro(evento, dados),
  fatal: (evento, dados) => registrador().fatal(evento, dados),
};

// ---------------------------------------------------------------------------
// A borda HTTP
// ---------------------------------------------------------------------------

/** Cabeçalho que carrega o identificador entre o site e a API. */
export const CABECALHO_DE_REQUISICAO = "x-request-id";

/**
 * Forma aceita para um identificador vindo de fora.
 *
 * Aceitar o valor do cliente é o que permite seguir uma jornada do navegador
 * até o banco; aceitá-lo sem forma é convite a injeção de linha no registro e a
 * texto arbitrário no lugar do identificador.
 */
const FORMA_DE_IDENTIFICADOR = /^[A-Za-z0-9._-]{8,64}$/;

/** O identificador recebido, quando ele tem forma; senão, um novo. */
function identificadorDaRequisicao(req: Request): string {
  const recebido = req.get(CABECALHO_DE_REQUISICAO);
  return recebido !== undefined && FORMA_DE_IDENTIFICADOR.test(recebido)
    ? recebido
    : randomUUID();
}

/** Rótulo da rota quando o molde não é texto (regex ou lista de caminhos). */
export const ROTA_NAO_TEXTUAL = "rota_nao_textual";

/** O molde completo (com o prefixo do sub-roteador) de cada requisição. */
const moldesDasRequisicoes = new WeakMap<object, string>();

/** Requisições que já têm a captura instalada. */
const instaladas = new WeakSet<object>();

/**
 * Captura o molde da rota NO MOMENTO em que o Express a escolhe.
 *
 * Ler `req.baseUrl` só no `finish` não serve: nessa hora o roteador já
 * restaurou o prefixo e o molde perde o `/v1/...`. Ler `req.route` também
 * não, porque respostas 4xx tratadas e erros lançados saem depois que o
 * sub-roteador devolveu o controle. O Express atribui `req.route = route`
 * enquanto o `baseUrl` ainda é o do sub-roteador, então um setter guarda a
 * combinação certa na hora (D-6e).
 */
export function instalarCapturaDeRota(req: Request): void {
  if (instaladas.has(req)) return;
  instaladas.add(req);
  let atual: unknown;
  Object.defineProperty(req, "route", {
    configurable: true,
    enumerable: true,
    get: () => atual,
    set(valor: unknown) {
      atual = valor;
      if (valor === undefined || valor === null) return;
      const caminho = (valor as { path?: unknown }).path;
      moldesDasRequisicoes.set(
        req,
        typeof caminho === "string"
          ? `${req.baseUrl}${caminho}` || "/"
          : ROTA_NAO_TEXTUAL,
      );
    },
  });
}

/**
 * A rota REGISTRADA, e não o endereço pedido.
 *
 * `/v1/orders/track/:token` é o que vai para o registro; o token que veio no
 * lugar de `:token` é credencial de acompanhamento e não pode ser gravado. O
 * mesmo raciocínio vale para a consulta (`?...`), que nunca entra.
 */
export function rotaDaRequisicao(req: Request): string | undefined {
  const capturada = moldesDasRequisicoes.get(req);
  if (capturada !== undefined && capturada !== "") return capturada;
  if (instaladas.has(req)) return undefined;
  // Sem a captura instalada (teste que monta só uma parte): melhor esforço.
  const molde = (req as Request & { route?: { path?: unknown } }).route?.path;
  if (molde === undefined) return undefined;
  return typeof molde === "string"
    ? `${req.baseUrl}${molde}` || "/"
    : ROTA_NAO_TEXTUAL;
}

function rotaRegistrada(req: Request): string | undefined {
  return rotaDaRequisicao(req);
}

/**
 * Abre o contexto da requisição e registra o começo e o fim dela.
 *
 * O contexto é aberto AQUI, na primeira camada, porque tudo que vier depois —
 * validação, autenticação, transação do banco, caso de uso — precisa que o
 * identificador já exista para que as linhas deles casem com as daqui.
 *
 * O ouvinte de `finish` é reentrado no contexto de propósito: ele é chamado
 * pelo `res`, que nasceu antes deste contexto existir, e por isso não o herda.
 * Sem a reentrada, a última linha da requisição — a que traz o status — sairia
 * sem identificador, justo a que mais se procura.
 */
export function middlewareDeRegistro(): RequestHandler {
  return function registroDaRequisicao(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    instalarCapturaDeRota(req);
    // Raiz nova: não herda nada de quem quer que esteja em curso.
    const contexto = abrirContextoRaiz({
      requisicaoId: identificadorDaRequisicao(req),
    });
    const ativo = trace.getActiveSpan()?.spanContext();
    if (ativo !== undefined) {
      anotarRastreio(contexto, ativo.traceId, ativo.spanId);
    }
    res.setHeader(CABECALHO_DE_REQUISICAO, contexto.requisicaoId);

    const inicio = process.hrtime.bigint();

    res.on("finish", () => {
      executarNoContexto(contexto, () => {
        registrar.info(EVENTOS.requisicaoTerminou, {
          metodo: req.method,
          rota: rotaRegistrada(req),
          status: res.statusCode,
          duracaoMs: Number(process.hrtime.bigint() - inicio) / 1e6,
        });
      });
    });

    executarNoContexto(contexto, () => {
      registrar.info(EVENTOS.requisicaoIniciou, { metodo: req.method });
      next();
    });
  };
}

/** O contexto em curso, para quem precisa do identificador na resposta. */
export function contextoDoRegistro(): ContextoDaRequisicao | undefined {
  return contextoAtual();
}
