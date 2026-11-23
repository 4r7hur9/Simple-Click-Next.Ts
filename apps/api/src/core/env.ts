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

/** Estados de uma feature flag de ambiente (mesmo vocabulário do segundo plano). */
const ESTADOS_DE_UMA_FLAG = ["ligado", "desligado"] as const;

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

  // Opcional no ESQUEMA e obrigatória fora de produção pela regra
  // `problemasDaCredencialDeMigracao` (M-1 da revisão #149): o processo que
  // atende tráfego nunca abre conexão com ela — só o pré-deploy (migrar) e a
  // cópia de segurança. Exigi-la na partida obrigava a API de produção a
  // carregar a credencial dona do esquema sem precisar dela.
  DATABASE_URL_DIRETA: cadeiaDeConexao(["postgres", "postgresql"])
    .optional()
    .describe(
      "conexão PostgreSQL direta, sem agrupador, usada só pelas migrações — postgresql://usuario:senha@maquina:porta/banco; obrigatória fora de production, dispensável no processo da API em production",
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

  // Feature flag do próximo preço na vitrine (card #140). Opcional e FECHADA:
  // sem valor, desligado em qualquer ambiente. O catálogo das flags e a leitura
  // moram em `flags.ts`; aqui só o valor é validado, para que um erro de
  // digitação (`ligada`, `sim`) recuse a partida em vez de virar "desligado"
  // em silêncio.
  FLAG_VITRINE_PROXIMO_PRECO: z
    .enum(ESTADOS_DE_UMA_FLAG)
    .optional()
    .describe(
      `anuncia na página pública do produto a próxima QUEDA de preço dos próximos 7 dias — ${ESTADOS_DE_UMA_FLAG.join(" | ")}; sem valor, desligado em qualquer ambiente`,
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
    ...problemasDosSegredosDeProducao(fonte),
    ...problemasDaCredencialDeMigracao(fonte),
  ];
}

/**
 * A credencial de migração é obrigatória fora de produção — a máquina do
 * desenvolvedor e a suíte migram pelo mesmo `.env` — e dispensável no processo
 * da API em produção, que nunca a usa (M-1 da revisão #149).
 */
function problemasDaCredencialDeMigracao(
  fonte: FonteDeAmbiente,
): ProblemaDeAmbiente[] {
  const ambiente = valorDe(fonte, "NODE_ENV") ?? "development";
  if (ambiente === "production") return [];
  if (valorDe(fonte, "DATABASE_URL_DIRETA") !== undefined) return [];
  return [
    problema(
      "DATABASE_URL_DIRETA",
      `ausente — obrigatória quando NODE_ENV não é production (agora é ${ambiente})`,
    ),
  ];
}

/** Prefixo dos marcadores do `.env.example`: texto PÚBLICO no repositório. */
const MARCADOR_DO_MODELO = "TROQUE_";

/**
 * Abaixo disto, o segredo é repetição ("a" × 32) e não sorteio. Um valor de
 * `openssl rand -base64 48` tem dezenas de caracteres distintos; 10 é o piso
 * que nenhum segredo gerado de verdade deixa de cruzar.
 */
const VARIEDADE_MINIMA_DO_SEGREDO = 10;

/** Segredos conferidos por marcador E variedade quando presentes em produção. */
const SEGREDOS_DE_PRODUCAO = [
  "JWT_SECRET",
  "SEGREDO_DE_REVALIDACAO",
  "SEGREDO_DA_PONTE",
  "METRICAS_TOKEN",
] as const;

/** Cadeias que levam credencial: conferidas só pelo marcador. */
const CONEXOES_DE_PRODUCAO = [
  "DATABASE_URL",
  "DATABASE_URL_DIRETA",
  "DATABASE_URL_ADMINISTRACAO",
  "REDIS_URL",
  "CLOUDINARY_URL",
  "SENHA_BANCO_ADMINISTRACAO",
] as const;

const COMO_GERAR_UM_SEGREDO =
  "um segredo gerado só para este ambiente — openssl rand -base64 48";

/**
 * Produção não parte com segredo de EXEMPLO nem com segredo FRACO (A-1 da
 * revisão #149).
 *
 * O marcador `TROQUE_...` do `.env.example` tem tamanho suficiente para passar
 * na regra de 32 caracteres, e está publicado no repositório: quem copiasse o
 * modelo sem regenerar subiria produção com um `JWT_SECRET` que qualquer um
 * conhece — e com ele forjaria um token de administrador. O gitleaks não
 * alerta, porque o marcador é justamente uma exceção dele.
 *
 * Fora de produção o modelo copiado continua subindo, que é o ponto de ele
 * existir. A mensagem NUNCA repete o valor recusado.
 */
function problemasDosSegredosDeProducao(
  fonte: FonteDeAmbiente,
): ProblemaDeAmbiente[] {
  const ambiente = valorDe(fonte, "NODE_ENV") ?? "development";
  if (ambiente !== "production") return [];

  const problemas: ProblemaDeAmbiente[] = [];
  for (const nome of SEGREDOS_DE_PRODUCAO) {
    const valor = valorDe(fonte, nome);
    if (valor === undefined) continue;
    if (valor.includes(MARCADOR_DO_MODELO)) {
      problemas.push({
        variavel: nome,
        motivo:
          "é o marcador TROQUE_ do .env.example, público no repositório — recusado em production",
        esperado: COMO_GERAR_UM_SEGREDO,
      });
      continue;
    }
    const distintos = new Set(valor).size;
    if (distintos < VARIEDADE_MINIMA_DO_SEGREDO) {
      problemas.push({
        variavel: nome,
        motivo: `segredo fraco: só ${distintos} caracteres distintos (mínimo ${VARIEDADE_MINIMA_DO_SEGREDO}) — recusado em production`,
        esperado: COMO_GERAR_UM_SEGREDO,
      });
    }
  }
  for (const nome of CONEXOES_DE_PRODUCAO) {
    if (valorDe(fonte, nome)?.includes(MARCADOR_DO_MODELO)) {
      problemas.push({
        variavel: nome,
        motivo:
          "ainda tem o marcador TROQUE_ do .env.example (usuário ou senha de exemplo) — recusado em production",
        esperado: "a credencial real deste ambiente, guardada no provedor",
      });
    }
  }
  return problemas;
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

// ---------------------------------------------------------------------------
// Administração permanente (card #3)
// ---------------------------------------------------------------------------

/** O pedido de uma administração permanente, lido das variáveis do serviço. */
export type PedidoDaAdministracaoPermanente =
  | { readonly situacao: "ausente" }
  | { readonly situacao: "incompleta"; readonly campos: readonly string[] }
  | { readonly situacao: "invalida"; readonly campos: readonly string[] }
  | {
      readonly situacao: "pronta";
      readonly email: string;
      readonly senha: string;
      readonly segredo: string;
      readonly nome: string;
    };

const VARIEDADE_MINIMA_DA_ADMINISTRACAO = 10;

const emailDaAdministracao = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email());
const senhaDaAdministracao = z
  .string()
  .min(12)
  .max(256)
  .refine((valor) => !valor.includes("TROQUE_"))
  .refine((valor) => new Set(valor).size >= VARIEDADE_MINIMA_DA_ADMINISTRACAO);
const segredoDaAdministracao = z
  .string()
  .transform((valor) => valor.replace(/\s+/g, "").toUpperCase())
  .pipe(z.string().regex(/^[A-Z2-7]{32}$/))
  .refine((valor) => new Set(valor).size >= VARIEDADE_MINIMA_DA_ADMINISTRACAO);
const nomeDaAdministracao = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[\p{L}\p{M} .'-]+$/u);

function presente(fonte: FonteDeAmbiente, nome: string): string | undefined {
  const valor = fonte[nome];
  return valor === undefined || valor.trim() === "" ? undefined : valor;
}

/**
 * Lê `ADMIN_EMAIL`, `ADMIN_SENHA`, `ADMIN_TOTP_SEGREDO` e `ADMIN_NOME` e diz o
 * que dá para fazer com elas. Fica FORA do `forma`/`Ambiente` de propósito: a
 * senha e o segredo não viajam no objeto de ambiente que a API inteira recebe,
 * e variável opcional errada vira aviso em vez de derrubar a partida. Só os
 * NOMES das variáveis problemáticas saem daqui, nunca os valores.
 *
 * - sem senha e sem segredo: `ausente` (só o e-mail, ou o nome, não pede nada);
 * - só um dos três obrigatórios: `incompleta`;
 * - formato fora do esperado: `invalida`.
 */
export function lerPedidoDaAdministracaoPermanente(
  fonte: FonteDeAmbiente,
): PedidoDaAdministracaoPermanente {
  const email = presente(fonte, "ADMIN_EMAIL");
  const senha = presente(fonte, "ADMIN_SENHA");
  const segredo = presente(fonte, "ADMIN_TOTP_SEGREDO");
  const nome = presente(fonte, "ADMIN_NOME");
  if (senha === undefined && segredo === undefined)
    return { situacao: "ausente" };

  const faltando = [
    ["ADMIN_EMAIL", email],
    ["ADMIN_SENHA", senha],
    ["ADMIN_TOTP_SEGREDO", segredo],
  ]
    .filter(([, valor]) => valor === undefined)
    .map(([variavel]) => variavel as string);
  if (faltando.length > 0) return { situacao: "incompleta", campos: faltando };

  const emailLido = emailDaAdministracao.safeParse(email);
  const senhaLida = senhaDaAdministracao.safeParse(senha);
  const segredoLido = segredoDaAdministracao.safeParse(segredo);
  const nomeLido =
    nome === undefined ? undefined : nomeDaAdministracao.safeParse(nome);
  const invalidas = [
    emailLido.success ? undefined : "ADMIN_EMAIL",
    senhaLida.success ? undefined : "ADMIN_SENHA",
    segredoLido.success ? undefined : "ADMIN_TOTP_SEGREDO",
    nomeLido === undefined || nomeLido.success ? undefined : "ADMIN_NOME",
    problemaDaChaveDeCifra(fonte["CHAVE_CIFRA_TOTP"]?.trim() ?? "") ===
    undefined
      ? undefined
      : "CHAVE_CIFRA_TOTP",
  ].filter((variavel): variavel is string => variavel !== undefined);
  if (
    invalidas.length > 0 ||
    !emailLido.success ||
    !senhaLida.success ||
    !segredoLido.success
  ) {
    return { situacao: "invalida", campos: invalidas };
  }
  return {
    situacao: "pronta",
    email: emailLido.data,
    senha: senhaLida.data,
    segredo: segredoLido.data,
    nome: nomeLido?.success ? nomeLido.data : "Administração",
  };
}
