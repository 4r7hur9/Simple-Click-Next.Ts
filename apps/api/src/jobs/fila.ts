/**
 * Fila de trabalho em segundo plano sobre o Redis (AC-025, AC-026).
 *
 * Existe para tirar do caminho da resposta tudo que é demorado e que a pessoa
 * do outro lado não precisa esperar. O caso que motivou a peça é o e-mail de
 * verificação do cadastro: enviar e-mail leva de centenas de milissegundos a
 * vários segundos, e o serviço de e-mail cai sozinho de vez em quando — se o
 * envio ficasse dentro do `POST /v1/auth/register`, o cadastro herdaria a
 * lentidão e a indisponibilidade de um sistema que nem é nosso.
 *
 * Este arquivo é só a infraestrutura: abre fila, abre trabalhador, aplica a
 * política de repetição e sabe listar o que falhou. Quem diz QUE trabalho
 * existe é `index.ts`; quem sabe COMO se envia um e-mail é `email.job.ts`.
 *
 * ## Por que o Redis aguenta este uso, e por que não aguenta o outro
 *
 * O Redis deste projeto está configurado como cache — `maxmemory-policy` é
 * `allkeys-lru` (veja `infra/compose/docker-compose.yml`). A própria BullMQ
 * avisa na partida que a política recomendada seria `noeviction`, e o aviso
 * está certo: sob pressão de memória o Redis pode descartar chave de fila junto
 * com chave de cache. Além disso, no plano gratuito o Redis é o primeiro
 * serviço a cair quando o crédito termina.
 *
 * Isso é aceitável para e-mail e para webhook: e-mail atrasado — ou perdido num
 * incidente de memória — não para a operação da loja, e a pessoa pede o reenvio.
 * NÃO é aceitável para impressão: cupom que não sai é pedido que a cozinha não
 * vê. Por isso a decisão de 17/08 põe a fila de impressão no PostgreSQL, na
 * mesma transação que cria o pedido, e não aqui. A distinção está codificada em
 * `MOTOR_DAS_FILAS`, em `index.ts`, e não apenas neste comentário.
 */

import {
  Queue,
  Worker,
  type Job,
  type JobsOptions,
  type Processor,
} from "bullmq";
import { Redis } from "ioredis";

/**
 * Espaço de nomes das chaves da fila dentro do Redis.
 *
 * O mesmo Redis guarda cache de loja (T-015) e fila. Sem prefixo próprio, uma
 * limpeza de cache por padrão de chave levaria trabalho enfileirado junto.
 */
export const PREFIXO_PADRAO = "sc-filas";

/** Quantas tentativas um trabalho ganha antes de ser dado como falho. */
export const TENTATIVAS_PADRAO = 5;

/**
 * Espera antes da segunda tentativa, em milissegundos. As seguintes dobram.
 *
 * Cinco segundos é curto o bastante para um soluço de rede se resolver na
 * segunda tentativa, e a duplicação leva a última espera a 40 segundos —
 * tempo suficiente para um serviço de e-mail voltar de uma queda curta sem
 * que o trabalho fique horas parado.
 */
export const ESPERA_INICIAL_PADRAO_MS = 5_000;

/** Quantos trabalhos concluídos ficam guardados, só para conferência recente. */
const CONCLUIDOS_GUARDADOS = 100;

/** Como um trabalho repete quando falha. */
export interface PoliticaDeRepeticao {
  /** Total de tentativas, contando a primeira. Sempre maior que 1. */
  readonly tentativas: number;
  /** Espera antes da segunda tentativa; as seguintes dobram. */
  readonly esperaInicialMs: number;
}

/** Política aplicada a todo trabalho que não pedir outra. */
export const REPETICAO_PADRAO: PoliticaDeRepeticao = {
  tentativas: TENTATIVAS_PADRAO,
  esperaInicialMs: ESPERA_INICIAL_PADRAO_MS,
};

/**
 * Espera, em milissegundos, ANTES da tentativa de número `tentativa`.
 *
 * A primeira tentativa não espera; da segunda em diante a espera dobra. É a
 * mesma fórmula que a BullMQ aplica no modo exponencial
 * (`espera = inicial × 2^(falhas − 1)`), escrita aqui para que a espera
 * crescente exigida por AC-026 seja verificável sem subir Redis — e para que,
 * se a biblioteca mudar de fórmula, o teste de integração acuse a divergência
 * em vez de ela passar despercebida.
 */
export function esperaAntesDaTentativa(
  tentativa: number,
  politica: PoliticaDeRepeticao = REPETICAO_PADRAO,
): number {
  if (tentativa <= 1) return 0;
  return politica.esperaInicialMs * 2 ** (tentativa - 2);
}

/**
 * Opções de trabalho que realizam a política: repete com espera crescente e
 * **guarda** o que esgotou as tentativas (AC-026).
 *
 * `removeOnFail: false` é o coração do critério e está escrito de propósito,
 * mesmo sendo o padrão da biblioteca: trabalho falho que some é defeito
 * invisível, e o padrão de uma dependência pode mudar de versão. Concluído,
 * ao contrário, é descartável — guardamos poucos, só para conferir o recente,
 * porque fila que nunca esquece o sucesso vira consumo de memória sem leitor.
 */
export function opcoesDeTrabalho(
  politica: PoliticaDeRepeticao = REPETICAO_PADRAO,
): JobsOptions {
  return {
    attempts: politica.tentativas,
    backoff: { type: "exponential", delay: politica.esperaInicialMs },
    removeOnFail: false,
    removeOnComplete: { count: CONCLUIDOS_GUARDADOS },
  };
}

/**
 * Conexão dedicada da fila.
 *
 * `maxRetriesPerRequest: null` é exigência da BullMQ, não preferência: o
 * trabalhador fica bloqueado num comando de leitura esperando trabalho chegar,
 * e um limite de tentativas por comando derrubaria essa espera com erro a cada
 * ciclo, fazendo o trabalhador parecer quebrado num sistema saudável.
 */
export function criarConexaoDeFila(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}

/** O que é preciso para abrir uma fila. */
export interface OpcoesDeFila {
  readonly nome: string;
  readonly urlDoRedis: string;
  readonly prefixo?: string | undefined;
  readonly repeticao?: PoliticaDeRepeticao | undefined;
}

/**
 * A fila da BullMQ com os parâmetros de tipo já resolvidos.
 *
 * A biblioteca deriva o tipo dos dados, do resultado e do nome por tipo
 * condicional a partir do primeiro parâmetro, para aceitar tanto `Queue<Dados>`
 * quanto `Queue<Job<…>>`. Tipo condicional não resolve contra um parâmetro de
 * tipo ainda desconhecido, e por isso `fila.add(nome, dados)` dentro de uma
 * função genérica como `abrirFila` não compila. Informar todos explicitamente
 * tira a condição do caminho.
 */
export type FilaDeTrabalho<Dados> = Queue<
  Dados,
  void,
  string,
  Dados,
  void,
  string
>;

/** Trabalho que esgotou as tentativas, do jeito que se olha para ele. */
export interface TrabalhoFalho {
  readonly id: string;
  readonly nome: string;
  readonly tentativasFeitas: number;
  readonly motivo: string;
  readonly falhouEm: Date | undefined;
}

/** Fila aberta, com a conexão que ela usa presa ao seu tempo de vida. */
export interface FilaAberta<Dados> {
  readonly nome: string;
  readonly politica: PoliticaDeRepeticao;
  /** A fila da BullMQ, para quem precisa inspecionar além do que expomos. */
  readonly fila: FilaDeTrabalho<Dados>;
  enfileirar(
    trabalho: string,
    dados: Dados,
    extras?: JobsOptions,
  ): Promise<Job<Dados>>;
  /** O que esgotou as tentativas e ficou registrado para inspeção (AC-026). */
  falhos(): Promise<TrabalhoFalho[]>;
  fechar(): Promise<void>;
}

/** Traduz o trabalho falho da biblioteca para o resumo que se lê. */
function resumir(trabalho: Job): TrabalhoFalho {
  return {
    id: String(trabalho.id ?? ""),
    nome: trabalho.name,
    tentativasFeitas: trabalho.attemptsMade,
    motivo: trabalho.failedReason ?? "",
    falhouEm:
      trabalho.finishedOn === undefined
        ? undefined
        : new Date(trabalho.finishedOn),
  };
}

/**
 * Abre uma fila com a política de repetição já aplicada como padrão.
 *
 * A política entra em `defaultJobOptions` de propósito: se cada chamada de
 * `enfileirar` tivesse de lembrar de pedir repetição, o primeiro lugar que
 * esquecesse enfileiraria trabalho de uma tentativa só — e a perda seria
 * silenciosa, porque nada no código diria que ali falta alguma coisa.
 */
export function abrirFila<Dados>(opcoes: OpcoesDeFila): FilaAberta<Dados> {
  const conexao = criarConexaoDeFila(opcoes.urlDoRedis);
  const politica = opcoes.repeticao ?? REPETICAO_PADRAO;
  const fila: FilaDeTrabalho<Dados> = new Queue(opcoes.nome, {
    connection: conexao,
    prefix: opcoes.prefixo ?? PREFIXO_PADRAO,
    defaultJobOptions: opcoesDeTrabalho(politica),
  });

  return {
    nome: opcoes.nome,
    politica,
    fila,
    enfileirar: (trabalho, dados, extras) => fila.add(trabalho, dados, extras),
    falhos: async () => (await fila.getFailed()).map(resumir),
    fechar: async () => {
      await fila.close();
      await conexao.quit();
    },
  };
}

/** Uma tentativa frustrada, no formato que o registro estruturado consome. */
export interface FalhaDeTentativa {
  readonly fila: string;
  readonly trabalhoId: string;
  readonly trabalhoNome: string;
  readonly tentativasFeitas: number;
  readonly tentativasPermitidas: number;
  /** Verdadeiro quando esta foi a última tentativa e o trabalho ficou falho. */
  readonly esgotou: boolean;
  readonly motivo: string;
}

/** O que é preciso para pôr um trabalhador de pé. */
export interface OpcoesDeTrabalhador<Dados> {
  readonly nome: string;
  readonly urlDoRedis: string;
  readonly processar: Processor<Dados, void>;
  readonly prefixo?: string | undefined;
  readonly concorrencia?: number | undefined;
  /**
   * Chamado a cada tentativa frustrada.
   *
   * Recebe identificador e contagem, nunca o conteúdo do trabalho — é assim
   * que o registro do servidor fala de um e-mail que falhou sem escrever o
   * endereço de ninguém (P-009). Quem escreve o adaptador de envio tem a mesma
   * obrigação na mensagem de erro que lança.
   */
  readonly aoFalhar?: ((falha: FalhaDeTentativa) => void) | undefined;
}

/** Trabalhador de pé, com a conexão presa ao seu tempo de vida. */
export interface TrabalhadorAberto {
  readonly trabalhador: Worker;
  fechar(): Promise<void>;
}

/**
 * Põe um trabalhador de pé consumindo a fila.
 *
 * O trabalhador vive fora do caminho da requisição: em produção sobe junto com
 * o processo da API, e é ele — não quem respondeu ao navegador — que espera o
 * serviço de e-mail. É essa separação que faz AC-025 valer.
 */
export function abrirTrabalhador<Dados>(
  opcoes: OpcoesDeTrabalhador<Dados>,
): TrabalhadorAberto {
  const conexao = criarConexaoDeFila(opcoes.urlDoRedis);
  const trabalhador = new Worker<Dados, void>(opcoes.nome, opcoes.processar, {
    connection: conexao,
    prefix: opcoes.prefixo ?? PREFIXO_PADRAO,
    ...(opcoes.concorrencia === undefined
      ? {}
      : { concurrency: opcoes.concorrencia }),
  });

  const aoFalhar = opcoes.aoFalhar;
  if (aoFalhar !== undefined) {
    trabalhador.on("failed", (trabalho, erro) => {
      const permitidas = trabalho?.opts.attempts ?? 1;
      const feitas = trabalho?.attemptsMade ?? 0;
      aoFalhar({
        fila: opcoes.nome,
        trabalhoId: String(trabalho?.id ?? ""),
        trabalhoNome: trabalho?.name ?? "",
        tentativasFeitas: feitas,
        tentativasPermitidas: permitidas,
        esgotou: feitas >= permitidas,
        motivo: erro.message,
      });
    });
  }

  // Sem ouvinte de `error` o Node derruba o processo quando a conexão com o
  // Redis oscila — e derrubar a API por causa da fila de e-mail é exatamente
  // a dependência que esta camada existe para evitar.
  trabalhador.on("error", () => {});

  return {
    trabalhador,
    fechar: async () => {
      await trabalhador.close();
      await conexao.quit();
    },
  };
}
