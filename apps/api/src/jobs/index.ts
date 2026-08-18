/**
 * As filas de segundo plano da API, declaradas em um lugar só.
 *
 * São três, e elas NÃO vivem no mesmo lugar. A escolha do motor de cada uma é
 * consequência direta da decisão de 17/08 registrada em
 * `.spec/design/decisoes.md` ("Fila de impressão em PostgreSQL, não em Redis"),
 * e está escrita aqui como dado (`MOTOR_DAS_FILAS`) para que ela seja
 * verificável por teste, e não apenas prometida em comentário:
 *
 * | Fila       | Motor      | Por quê                                            |
 * | ---------- | ---------- | -------------------------------------------------- |
 * | email      | Redis      | e-mail atrasado não para a operação da loja        |
 * | webhook    | Redis      | aviso a sistema externo tolera atraso e reenvio    |
 * | impressao  | PostgreSQL | cupom que não sai é pedido que a cozinha não vê    |
 *
 * O Redis deste projeto é cache: sobe com `maxmemory-policy allkeys-lru` e, no
 * plano gratuito, é o primeiro serviço a cair quando o crédito termina. Perder
 * um e-mail de verificação nesse cenário custa um reenvio; perder um cupom
 * custa um pedido. Por isso a fila de impressão é enfileirada na MESMA
 * transação que cria o pedido, no PostgreSQL, com reivindicação por travamento
 * — nunca aqui.
 *
 * ## O que esta tarefa entrega e o que ela apenas declara
 *
 * Entregue de verdade: a fila `email`, com trabalhador, política de repetição e
 * inspeção do que falhou. Apenas declaradas: `webhook` (o processador nasce com
 * a integração que a consumir) e `impressao` (que pertence à fatia de impressão
 * e ao PostgreSQL). Declarar sem implementar é de propósito: `abrirFilaEmRedis`
 * recusa a fila de impressão com uma mensagem que explica a decisão, em vez de
 * abrir silenciosamente uma fila no motor errado.
 */

import {
  abrirFila,
  abrirTrabalhador,
  type FalhaDeTentativa,
  type FilaAberta,
  type OpcoesDeFila,
  type PoliticaDeRepeticao,
  type TrabalhadorAberto,
} from "./fila.ts";
import {
  criarProcessadorDeEmail,
  type DadosDeEmail,
  type EnviadorDeEmail,
} from "./email.job.ts";

export * from "./fila.ts";
export * from "./email.job.ts";

/** As três filas previstas pela arquitetura. */
export const NOMES_DAS_FILAS = ["email", "webhook", "impressao"] as const;

/** Nome de fila que este projeto reconhece. */
export type NomeDeFila = (typeof NOMES_DAS_FILAS)[number];

/** Onde uma fila guarda o trabalho enfileirado. */
export type MotorDeFila = "redis" | "postgres";

/**
 * Motor de cada fila. É a decisão de 17/08 em forma de dado.
 *
 * Mudar `impressao` para `"redis"` aqui é mudar a decisão, e o teste que
 * confere esta tabela existe justamente para que essa mudança precise ser
 * deliberada.
 */
export const MOTOR_DAS_FILAS: Readonly<Record<NomeDeFila, MotorDeFila>> = {
  email: "redis",
  webhook: "redis",
  impressao: "postgres",
};

/** Pedido de abrir no Redis uma fila que não mora no Redis. */
export class ErroDeMotorDeFila extends Error {
  readonly fila: NomeDeFila;
  readonly motorEsperado: MotorDeFila;

  constructor(fila: NomeDeFila, motorEsperado: MotorDeFila) {
    super(
      [
        `A fila "${fila}" não vive no Redis: o motor dela é ${motorEsperado}.`,
        "A decisão de 17/08 (.spec/design/decisoes.md) põe a fila de impressão no",
        "PostgreSQL, enfileirada na mesma transação que cria o pedido, porque no",
        "plano gratuito o Redis é o primeiro serviço a cair — e a cozinha não pode",
        "parar. E-mail e webhook toleram o Redis porque atraso neles não interrompe",
        "a operação da loja.",
      ].join(" "),
    );
    this.name = "ErroDeMotorDeFila";
    this.fila = fila;
    this.motorEsperado = motorEsperado;
  }
}

/** Abre uma das filas declaradas, recusando a que não mora no Redis. */
export function abrirFilaEmRedis<Dados>(
  nome: NomeDeFila,
  opcoes: Omit<OpcoesDeFila, "nome">,
): FilaAberta<Dados> {
  const motor = MOTOR_DAS_FILAS[nome];
  if (motor !== "redis") throw new ErroDeMotorDeFila(nome, motor);
  return abrirFila<Dados>({ ...opcoes, nome });
}

/** O que o segundo plano precisa para subir junto com a API. */
export interface OpcoesDoSegundoPlano {
  readonly urlDoRedis: string;
  readonly enviadorDeEmail: EnviadorDeEmail;
  readonly prefixo?: string | undefined;
  readonly repeticao?: PoliticaDeRepeticao | undefined;
  readonly concorrencia?: number | undefined;
  readonly aoFalhar?: ((falha: FalhaDeTentativa) => void) | undefined;
}

/** Filas e trabalhadores de pé, com um único ponto de desligamento. */
export interface SegundoPlano {
  readonly email: FilaAberta<DadosDeEmail>;
  readonly trabalhadores: readonly TrabalhadorAberto[];
  fechar(): Promise<void>;
}

/**
 * Sobe as filas e os trabalhadores do processo.
 *
 * É o único ponto de composição do segundo plano: quem inicia a API chama isto
 * uma vez e guarda o `fechar` para o desligamento. Fechar importa — conexão de
 * Redis viva segura o processo de pé, e um trabalhador derrubado no meio de um
 * trabalho devolve o trabalho à fila em vez de perdê-lo.
 */
export function montarSegundoPlano(opcoes: OpcoesDoSegundoPlano): SegundoPlano {
  const email = abrirFilaEmRedis<DadosDeEmail>("email", {
    urlDoRedis: opcoes.urlDoRedis,
    prefixo: opcoes.prefixo,
    repeticao: opcoes.repeticao,
  });

  const trabalhadorDeEmail = abrirTrabalhador<DadosDeEmail>({
    nome: email.nome,
    urlDoRedis: opcoes.urlDoRedis,
    prefixo: opcoes.prefixo,
    concorrencia: opcoes.concorrencia,
    aoFalhar: opcoes.aoFalhar,
    processar: criarProcessadorDeEmail(opcoes.enviadorDeEmail),
  });

  const trabalhadores = [trabalhadorDeEmail];

  return {
    email,
    trabalhadores,
    fechar: async () => {
      // Trabalhadores primeiro: com a fila fechada antes, o trabalhador
      // perderia a conexão no meio de um trabalho em curso.
      for (const trabalhador of trabalhadores) await trabalhador.fechar();
      await email.fechar();
    },
  };
}
