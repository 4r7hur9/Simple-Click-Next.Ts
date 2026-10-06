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

import {
  COMO_GERAR_A_CHAVE,
  problemaDaChaveDeCifra,
  VARIAVEL_DA_CHAVE_DO_TOTP,
} from "./cifra.ts";

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

/** Porta em que a API escuta quando o ambiente não diz outra. */
export const PORTA_PADRAO = 3001;

/** Estados do segundo plano (filas e trabalhadores) neste processo. */
const ESTADOS_DO_SEGUNDO_PLANO = ["ligado", "desligado"] as const;

/**
 * Nomes que a API já leu e não lê mais (AC-048).
 *
 * `API_PORT` era o nome da porta em `main.ts` enquanto `core/env.ts` e o
 * provedor de hospedagem chamavam a mesma coisa de `PORT`. A porta agora tem
 * um nome só; o antigo continua sendo olhado, mas só para recusar a partida
 * quando ele aponta para OUTRA porta — que é exatamente o caso em que alguém
 * acha que configurou uma coisa e a API faz outra.
 */
export const VARIAVEIS_APOSENTADAS = ["API_PORT"] as const;

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
    .default(PORTA_PADRAO)
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

  // Opcional de propósito, e sem padrão fixo: o padrão depende de NODE_ENV e é
  // resolvido por `segundoPlanoLigado`. Produção liga sem ninguém precisar
  // lembrar; fora dela, quem sobe a API para um teste não precisa de Redis.
  SEGUNDO_PLANO: z
    .enum(ESTADOS_DO_SEGUNDO_PLANO)
    .optional()
    .describe(
      `filas e trabalhadores neste processo — ${ESTADOS_DO_SEGUNDO_PLANO.join(" | ")}; sem valor, liga em production e fica desligado fora dela`,
    ),

  // Obrigatória só em produção, e a regra mora em `problemasDaChaveDeCifra`:
  // fora dela, quem não mexe no aplicativo autenticador não precisa gerar
  // chave para subir a API. Presente, vale sempre o mesmo formato (AC-130).
  // Valor vazio conta como ausente — é o que sobra de um modelo copiado.
  CHAVE_CIFRA_TOTP: z
    .preprocess(
      (valor) =>
        typeof valor === "string" && valor.trim() === "" ? undefined : valor,
      z
        .string()
        .trim()
        .refine((valor) => problemaDaChaveDeCifra(valor) === undefined, {
          error: "não é uma chave de 32 bytes em base64",
        })
        .optional(),
    )
    .describe(
      `chave AES-256 que cifra o segredo do aplicativo autenticador, obrigatória em production — ${COMO_GERAR_A_CHAVE}`,
    ),
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
 * A comparação do banco de teste é literal. A checagem completa — máquina,
 * porta e nome do banco, que pegam o mesmo destino escrito de outro jeito — é
 * responsabilidade de `infra/scripts/check-ambientes.sh`, e é lá que AC-031 é
 * provado.
 */
function problemasEntreVariaveis(fonte: FonteDeAmbiente): ProblemaDeAmbiente[] {
  return [
    ...problemasDoBancoDeTeste(fonte),
    ...problemasDoNomeDaPorta(fonte),
    ...problemasDaChaveDeCifra(fonte),
  ];
}

/**
 * Produção não parte sem a chave que cifra o segredo do aplicativo
 * autenticador (AC-130). Sem ela, a primeira pessoa a ativar o aplicativo
 * descobriria o problema — e a administração, para quem o aplicativo é
 * obrigatório (AC-122), não teria como entrar. O formato da chave presente é
 * conferido pelo esquema, em qualquer ambiente.
 */
function problemasDaChaveDeCifra(fonte: FonteDeAmbiente): ProblemaDeAmbiente[] {
  const ambiente = valorDe(fonte, "NODE_ENV") ?? "development";
  if (ambiente !== "production") return [];
  if (valorDe(fonte, VARIAVEL_DA_CHAVE_DO_TOTP) !== undefined) return [];
  return [
    problema(
      VARIAVEL_DA_CHAVE_DO_TOTP,
      "ausente — obrigatória em production, porque o segredo do aplicativo autenticador só é guardado cifrado",
    ),
  ];
}

/**
 * O nome antigo da porta só reprova quando aponta para outra porta (AC-048).
 *
 * Igual à porta efetiva, ele é inofensivo — é o que todo `.env` local copiado
 * do modelo antigo tem — e recusar ali quebraria a máquina de todo mundo sem
 * proteger ninguém. Diferente, ele é a configuração que alguém escolheu e a
 * API ignoraria em silêncio. Se `PORT` já é inválida, quem reclama é ela.
 */
function problemasDoNomeDaPorta(fonte: FonteDeAmbiente): ProblemaDeAmbiente[] {
  const antiga = valorDe(fonte, "API_PORT");
  if (antiga === undefined) return [];

  const declarada = valorDe(fonte, "PORT");
  const efetiva = declarada === undefined ? PORTA_PADRAO : Number(declarada);
  if (!Number.isInteger(efetiva)) return [];
  if (Number(antiga) === efetiva) return [];

  return [
    {
      variavel: "API_PORT",
      motivo: `nome aposentado da porta, valendo ${antiga}, enquanto a API escuta em PORT (${efetiva}${declarada === undefined ? ", o padrão" : ""}) — a porta tem um nome só`,
      esperado:
        "apague API_PORT e ponha o número em PORT, o nome que a API e o provedor de hospedagem leem",
    },
  ];
}

/** O banco de teste é obrigatório fora de produção e nunca é o da aplicação. */
function problemasDoBancoDeTeste(fonte: FonteDeAmbiente): ProblemaDeAmbiente[] {
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

/**
 * Se este processo sobe as filas de segundo plano (AC-046).
 *
 * Sem valor explícito, liga em produção e fica desligado fora dela: produção
 * não pode depender de alguém lembrar de uma variável para mandar e-mail, e o
 * teste que sobe a API para conferir a partida não pode passar a exigir Redis.
 */
export function segundoPlanoLigado(
  ambiente: Pick<Ambiente, "NODE_ENV" | "SEGUNDO_PLANO">,
): boolean {
  const estado =
    ambiente.SEGUNDO_PLANO ??
    (ambiente.NODE_ENV === "production" ? "ligado" : "desligado");
  return estado === "ligado";
}

/**
 * Nomes aposentados que ainda aparecem na fonte. A partida só avisa: quando
 * eles contradizem o nome atual, `carregarAmbiente` já recusou antes.
 */
export function variaveisAposentadasPresentes(
  fonte: FonteDeAmbiente,
): readonly string[] {
  return VARIAVEIS_APOSENTADAS.filter(
    (nome) => valorDe(fonte, nome) !== undefined,
  );
}
