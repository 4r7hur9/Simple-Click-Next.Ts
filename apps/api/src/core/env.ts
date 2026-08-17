/**
 * Validação das variáveis de ambiente na partida da API (AC-002).
 *
 * A API recusa iniciar quando falta ou está inválida qualquer variável
 * obrigatória, nomeando cada uma e dizendo o que se espera dela. O motivo é
 * concreto: sem esta porta, uma variável ausente só aparece no meio de uma
 * requisição, como erro obscuro, depois que o serviço já se declarou saudável.
 *
 * `carregarAmbiente` é pura de propósito — recebe a fonte por parâmetro e não
 * lê `process.env` por dentro. É isso que permite provar o comportamento de
 * partida sem sujar o ambiente do processo de teste.
 *
 * Nenhum valor real mora aqui: todo segredo vem de fora (P-002). O que existe
 * neste arquivo é a descrição do que se espera, e ela é o texto que a mensagem
 * de erro entrega a quem está configurando o ambiente.
 */

import { z } from "zod";

/** Ambientes de execução reconhecidos. */
const AMBIENTES = ["development", "test", "production"] as const;

/** Níveis do registro estruturado, do mais grave ao mais verboso. */
const NIVEIS_DE_LOG = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
] as const;

/**
 * Segredo de assinatura curto é adivinhável por força bruta. 32 caracteres é o
 * piso para uma chave HMAC de 256 bits representada em texto.
 */
const TAMANHO_MINIMO_DO_SEGREDO = 32;

/** Fonte de onde as variáveis são lidas — normalmente `process.env`. */
export type FonteDeAmbiente = Readonly<Record<string, string | undefined>>;

/** Uma variável que impediu a partida, com o motivo e o que se esperava. */
export interface ProblemaDeAmbiente {
  readonly variavel: string;
  readonly motivo: string;
  readonly esperado: string;
}

/** Verdadeiro quando a cadeia é uma URL de um dos esquemas aceitos. */
function ehUrlDeEsquema(valor: string, esquemas: readonly string[]): boolean {
  try {
    return esquemas.includes(new URL(valor).protocol.replace(":", ""));
  } catch {
    return false;
  }
}

/** Cadeia de conexão de um serviço, checada pelo esquema da URL. */
function cadeiaDeConexao(esquemas: readonly string[]) {
  return z
    .string()
    .trim()
    .min(1)
    .refine((valor) => ehUrlDeEsquema(valor, esquemas), {
      error: `não é uma URL ${esquemas.join(" ou ")} válida`,
    });
}

/**
 * Origem é só esquema, máquina e porta. Aceitar caminho aqui faria a lista de
 * origens autorizadas nunca casar com o cabeçalho `Origin` do navegador, que
 * jamais traz caminho.
 */
function ehOrigemValida(valor: string): boolean {
  try {
    return new URL(valor).origin === valor;
  } catch {
    return false;
  }
}

/** Lista separada por vírgula, já limpa de espaços e itens vazios. */
const listaDeOrigens = z
  .string()
  .transform((valor) =>
    valor
      .split(",")
      .map((origem) => origem.trim())
      .filter((origem) => origem.length > 0),
  )
  .refine((lista) => lista.length > 0, {
    error: "a lista está vazia",
  })
  .refine((lista) => lista.every(ehOrigemValida), {
    error:
      "há item que não é uma origem (esquema, máquina e porta, sem caminho)",
  });

/**
 * Forma declarada das variáveis. A descrição de cada uma não é documentação
 * decorativa: é o texto que a mensagem de recusa mostra quando ela falta.
 */
const forma = z.object({
  NODE_ENV: z
    .enum(AMBIENTES)
    .default("development")
    .describe(`um de: ${AMBIENTES.join(" | ")}`),

  PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(3001)
    .describe("porta TCP em que a API escuta — inteiro entre 1 e 65535"),

  DATABASE_URL: cadeiaDeConexao(["postgres", "postgresql"]).describe(
    "conexão PostgreSQL da aplicação, pelo agrupador em modo transação — postgresql://usuario:senha@maquina:porta/banco",
  ),

  DATABASE_URL_DIRETA: cadeiaDeConexao(["postgres", "postgresql"]).describe(
    "conexão PostgreSQL direta, sem agrupador, usada só pelas migrações — postgresql://usuario:senha@maquina:porta/banco",
  ),

  DATABASE_URL_TEST: cadeiaDeConexao(["postgres", "postgresql"])
    .optional()
    .describe(
      "conexão PostgreSQL do banco descartável de teste, obrigatória fora de produção e sempre diferente do banco da aplicação",
    ),

  REDIS_URL: cadeiaDeConexao(["redis", "rediss"]).describe(
    "conexão do cache — redis://maquina:porta/indice",
  ),

  JWT_SECRET: z
    .string()
    .min(TAMANHO_MINIMO_DO_SEGREDO)
    .describe(
      `segredo de assinatura dos tokens, com ao menos ${TAMANHO_MINIMO_DO_SEGREDO} caracteres, vindo do ambiente e nunca do código`,
    ),

  ORIGENS_PERMITIDAS: listaDeOrigens.describe(
    "lista fechada de origens autorizadas, separadas por vírgula — https://simpleclick.app,https://api.simpleclick.app",
  ),

  LOG_LEVEL: z
    .enum(NIVEIS_DE_LOG)
    .default("info")
    .describe(`um de: ${NIVEIS_DE_LOG.join(" | ")}`),
});

/** Ambiente já validado e tipado, pronto para o resto da API consumir. */
export type Ambiente = z.infer<typeof forma>;

/** Nomes das variáveis que este módulo conhece, na ordem em que são descritas. */
export const VARIAVEIS = Object.keys(forma.shape) as readonly (keyof Ambiente &
  string)[];

/** O que se espera de uma variável, em texto para quem está configurando. */
function esperadoDe(variavel: string): string {
  const campo = forma.shape[variavel as keyof typeof forma.shape];
  return campo?.description ?? "veja .env.example";
}

/** Valor da variável já sem espaços, ou `undefined` quando ela não veio. */
function valorDe(fonte: FonteDeAmbiente, variavel: string): string | undefined {
  const bruto = fonte[variavel]?.trim();
  return bruto === undefined || bruto === "" ? undefined : bruto;
}

/** Monta um problema com a expectativa já resolvida a partir do esquema. */
function problema(variavel: string, motivo: string): ProblemaDeAmbiente {
  return { variavel, motivo, esperado: esperadoDe(variavel) };
}

/**
 * Regras que só existem quando as variáveis são olhadas juntas.
 *
 * Ficam fora do esquema de propósito: o esquema abandona a validação assim que
 * um campo falha, e aí quem está configurando corrigiria o que apareceu, rodaria
 * de novo e levaria um segundo susto — o oposto do que AC-002 pede.
 *
 * A comparação aqui é literal. A checagem completa — máquina, porta e nome do
 * banco, que pegam o mesmo destino escrito de outro jeito — é responsabilidade
 * de `infra/scripts/check-ambientes.sh`, e é lá que AC-031 é provado.
 */
function problemasEntreVariaveis(fonte: FonteDeAmbiente): ProblemaDeAmbiente[] {
  const ambiente = valorDe(fonte, "NODE_ENV") ?? "development";
  const bancoDeTeste = valorDe(fonte, "DATABASE_URL_TEST");

  if (bancoDeTeste === undefined) {
    return ambiente === "production"
      ? []
      : [
          problema(
            "DATABASE_URL_TEST",
            `ausente — obrigatória quando NODE_ENV não é production (agora é ${ambiente})`,
          ),
        ];
  }

  if (bancoDeTeste === valorDe(fonte, "DATABASE_URL")) {
    return [
      problema(
        "DATABASE_URL_TEST",
        "aponta para o mesmo banco da aplicação — a suíte de testes apagaria os dados reais",
      ),
    ];
  }

  return [];
}

/**
 * Traduz as reclamações do esquema em problemas nomeados, um por variável.
 * Uma variável errada costuma render vários apontamentos; quem configura só
 * precisa do primeiro.
 */
function problemasPorCampo(
  erro: z.ZodError,
  fonte: FonteDeAmbiente,
): ProblemaDeAmbiente[] {
  return erro.issues.map((questao) => {
    const variavel = String(questao.path[0] ?? "(ambiente)");
    return problema(
      variavel,
      valorDe(fonte, variavel) === undefined
        ? "ausente"
        : `valor inválido — ${questao.message}`,
    );
  });
}

/** Um problema por variável, em ordem estável, sem repetir a mesma reclamação. */
function consolidar(
  problemas: readonly ProblemaDeAmbiente[],
): ProblemaDeAmbiente[] {
  const porVariavel = new Map<string, ProblemaDeAmbiente>();
  for (const item of problemas) {
    if (!porVariavel.has(item.variavel)) porVariavel.set(item.variavel, item);
  }
  return [...porVariavel.values()].sort((a, b) =>
    a.variavel.localeCompare(b.variavel),
  );
}

/** Mensagem de recusa: uma linha por variável, com nome, motivo e expectativa. */
function montarMensagem(problemas: readonly ProblemaDeAmbiente[]): string {
  const linhas = problemas.map(
    (problema) =>
      `  ✘ ${problema.variavel} — ${problema.motivo}\n      esperado: ${problema.esperado}`,
  );

  return [
    `A API não inicia: ${problemas.length} variável(is) de ambiente inválida(s) ou ausente(s).`,
    "",
    ...linhas,
    "",
    "Cada variável está documentada em .env.example. Segredo vem do ambiente, nunca do código (P-002).",
  ].join("\n");
}

/** Recusa de partida por ambiente mal configurado. */
export class ErroDeAmbiente extends Error {
  readonly problemas: readonly ProblemaDeAmbiente[];
  /** Nomes das variáveis reprovadas, para quem quiser tratar sem parsear texto. */
  readonly variaveis: readonly string[];

  constructor(problemas: readonly ProblemaDeAmbiente[]) {
    super(montarMensagem(problemas));
    this.name = "ErroDeAmbiente";
    this.problemas = problemas;
    this.variaveis = problemas.map((problema) => problema.variavel);
  }
}

/**
 * Valida a fonte de ambiente e devolve os valores já tipados, ou lança
 * `ErroDeAmbiente` nomeando cada variável reprovada (AC-002).
 */
export function carregarAmbiente(fonte: FonteDeAmbiente): Ambiente {
  const resultado = forma.safeParse(fonte);
  const problemas = consolidar([
    ...(resultado.success ? [] : problemasPorCampo(resultado.error, fonte)),
    ...problemasEntreVariaveis(fonte),
  ]);

  if (!resultado.success || problemas.length > 0) {
    throw new ErroDeAmbiente(problemas);
  }
  return resultado.data;
}
