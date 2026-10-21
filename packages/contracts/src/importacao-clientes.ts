/**
 * O importador de clientes da loja (card #60): leads de uma planilha viram
 * CLIENTES DA LOJA, pelo mesmo cadastro do painel (`POST .../clientes`).
 *
 * DOIS PASSOS, O MESMO ARQUIVO. O painel manda o arquivo CRU no corpo
 * (`Content-Type: application/octet-stream` ou o tipo do arquivo; NUNCA
 * `application/json`, que o leitor geral da API consome com limite de 1 MB) e
 * as escolhas na consulta:
 *
 *   POST /v1/lojas/:apelido/clientes/importacao/previa      — lê e prevê, sem gravar
 *   POST /v1/lojas/:apelido/clientes/importacao/confirmar   — grava em lotes
 *   POST /v1/lojas/:apelido/clientes/importacao/relatorio   — {linhas} → CSV para baixar
 *
 * A consulta (`esquemaDaConsultaDaImportacao`) leva o nome do arquivo, o
 * formato e o separador quando o painel quer forçar, a regra dos repetidos e
 * o MAPEAMENTO MANUAL como `mapa.<campo>=<coluna>` (ex.:
 * `mapa.telefone=Celular`). Campo ausente da consulta fica com a sugestão
 * automática; `mapa.<campo>=` vazio tira o campo da importação.
 *
 * Mesma permissão das outras rotas de clientes (`clientes`: dono e equipe).
 */

import { z } from "zod";

/** Até 5 MB por arquivo. */
export const TAMANHO_MAXIMO_DA_IMPORTACAO_EM_BYTES = 5 * 1024 * 1024;

/** Até 5 mil linhas de dados (sem contar o cabeçalho). */
export const MAXIMO_DE_LINHAS_DA_IMPORTACAO = 5000;

/** Quantas linhas a prévia devolve. */
export const LINHAS_DA_PREVIA_DA_IMPORTACAO = 10;

/** Quantos problemas a prévia lista (a contagem é sempre completa). */
export const PROBLEMAS_NA_PREVIA_DA_IMPORTACAO = 100;

export const FORMATOS_DA_IMPORTACAO = [
  "csv",
  "tsv",
  "json",
  "jsonl",
  "xlsx",
] as const;
export type FormatoDaImportacao = (typeof FORMATOS_DA_IMPORTACAO)[number];

/** Separador do texto: `tab` é a tabulação. */
export const SEPARADORES_DA_IMPORTACAO = [",", ";", "tab", "|"] as const;
export type SeparadorDaImportacao = (typeof SEPARADORES_DA_IMPORTACAO)[number];

/** `latin1` é o Windows-1252 das planilhas antigas do Excel brasileiro. */
export const CODIFICACOES_DA_IMPORTACAO = [
  "utf-8",
  "utf-16",
  "latin1",
] as const;
export type CodificacaoDaImportacao =
  (typeof CODIFICACOES_DA_IMPORTACAO)[number];

/**
 * O que fazer com quem JÁ É cliente da loja (mesmo telefone ou e-mail):
 * `ignorar` não toca na ficha; `completar` preenche só os campos VAZIOS dela
 * (nunca troca o que o dono já anotou).
 */
export const REGRAS_DE_REPETIDOS_DA_IMPORTACAO = [
  "ignorar",
  "completar",
] as const;
export type RegraDeRepetidosDaImportacao =
  (typeof REGRAS_DE_REPETIDOS_DA_IMPORTACAO)[number];

/** Os campos do cadastro que uma coluna pode alimentar. */
export const CAMPOS_DA_IMPORTACAO = [
  "nome",
  "telefone",
  "email",
  "observacao",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "estado",
  "cep",
  "pontoDeReferencia",
] as const;
export type CampoDaImportacao = (typeof CAMPOS_DA_IMPORTACAO)[number];

export const ROTULOS_DOS_CAMPOS_DA_IMPORTACAO: Readonly<
  Record<CampoDaImportacao, string>
> = Object.freeze({
  nome: "Nome",
  telefone: "Telefone / WhatsApp",
  email: "E-mail",
  observacao: "Observação",
  logradouro: "Endereço (rua)",
  numero: "Número",
  complemento: "Complemento",
  bairro: "Bairro",
  cidade: "Cidade",
  estado: "Estado (UF)",
  cep: "CEP",
  pontoDeReferencia: "Ponto de referência",
});

/** Sem estes dois o cadastro não acontece (o mínimo do cadastro manual). */
export const CAMPOS_OBRIGATORIOS_DA_IMPORTACAO: readonly CampoDaImportacao[] =
  Object.freeze(["nome", "telefone"]);

const esquemaDoCampo = z.enum(CAMPOS_DA_IMPORTACAO);

/** O mapeamento: campo → nome da coluna (como a prévia a devolve) ou nulo. */
export const esquemaDoMapeamentoDaImportacao = z.partialRecord(
  esquemaDoCampo,
  z.string().max(200).nullable(),
);
export type MapeamentoDaImportacao = z.infer<
  typeof esquemaDoMapeamentoDaImportacao
>;

/**
 * A consulta das rotas de prévia e de confirmação. As chaves `mapa.<campo>`
 * são lidas à parte (`mapeamentoDaConsulta`), porque o nome é dinâmico.
 */
export const esquemaDaConsultaDaImportacao = z
  .object({
    arquivo: z.string().trim().max(200).optional(),
    formato: z.enum(FORMATOS_DA_IMPORTACAO).optional(),
    separador: z.enum(SEPARADORES_DA_IMPORTACAO).optional(),
    codificacao: z.enum(CODIFICACOES_DA_IMPORTACAO).optional(),
    repetidos: z.enum(REGRAS_DE_REPETIDOS_DA_IMPORTACAO).default("ignorar"),
  })
  .catchall(z.string().max(200));
export type ConsultaDaImportacao = z.output<
  typeof esquemaDaConsultaDaImportacao
>;

/** O mapeamento manual que veio na consulta, já conferido. */
export function mapeamentoDaConsulta(
  consulta: Readonly<Record<string, unknown>>,
): MapeamentoDaImportacao {
  const mapa: Record<string, string | null> = {};
  for (const [chave, valor] of Object.entries(consulta)) {
    if (!chave.startsWith("mapa.") || typeof valor !== "string") continue;
    const campo = esquemaDoCampo.safeParse(chave.slice("mapa.".length));
    if (!campo.success) continue;
    mapa[campo.data] = valor.trim() === "" ? null : valor;
  }
  return mapa;
}

/** Por que a linha não entra. */
export const esquemaDoProblemaDaImportacao = z.strictObject({
  /**
   * Onde está no arquivo: a linha da planilha (cabeçalho = 1) no CSV, TSV e
   * XLSX; a linha do texto no JSON Lines; a posição do item (1 = primeiro) na
   * lista do JSON.
   */
  linha: z.number().int().positive(),
  campo: esquemaDoCampo.nullable(),
  motivo: z.string(),
});
export type ProblemaDaImportacao = z.infer<
  typeof esquemaDoProblemaDaImportacao
>;

/** Quem já existe: na loja (cliente cadastrado) ou numa linha anterior. */
export const esquemaDoRepetidoDaImportacao = z.strictObject({
  linha: z.number().int().positive(),
  onde: z.enum(["loja", "arquivo"]),
  motivo: z.enum(["TELEFONE", "EMAIL"]),
  /** Na loja: o cliente que já existe. */
  clienteId: z.uuid().nullable(),
  nome: z.string().nullable(),
  /** No arquivo: a primeira linha com o mesmo telefone ou e-mail. */
  linhaOriginal: z.number().int().positive().nullable(),
});
export type RepetidoDaImportacao = z.infer<
  typeof esquemaDoRepetidoDaImportacao
>;

export const esquemaDaColunaDaImportacao = z.strictObject({
  /** O nome como o painel deve mandar no `mapa.<campo>`. */
  nome: z.string(),
  indice: z.number().int().nonnegative(),
  /** Até três valores não vazios, para o dono reconhecer a coluna. */
  exemplos: z.array(z.string()),
  campoSugerido: esquemaDoCampo.nullable(),
});

export const esquemaDaLinhaDaPrevia = z.strictObject({
  linha: z.number().int().positive(),
  /** Os valores crus, por coluna. */
  valores: z.record(z.string(), z.string()),
  situacao: z.enum(["novo", "repetido", "invalido"]),
  motivo: z.string().nullable(),
});

export const esquemaDaContagemDaImportacao = z.strictObject({
  total: z.number().int().nonnegative(),
  novos: z.number().int().nonnegative(),
  repetidos: z.number().int().nonnegative(),
  repetidosNaLoja: z.number().int().nonnegative(),
  repetidosNoArquivo: z.number().int().nonnegative(),
  invalidos: z.number().int().nonnegative(),
});

export const esquemaDoLimiteNaImportacao = z.strictObject({
  limite: z.number().int().nonnegative(),
  uso: z.number().int().nonnegative(),
  restante: z.number().int().nonnegative(),
  /** Quantos dos novos ficam de fora por causa do limite. */
  excedentes: z.number().int().nonnegative(),
});

export const esquemaDoArquivoLido = z.strictObject({
  nome: z.string().nullable(),
  formato: z.enum(FORMATOS_DA_IMPORTACAO),
  codificacao: z.enum(CODIFICACOES_DA_IMPORTACAO).nullable(),
  separador: z.enum(SEPARADORES_DA_IMPORTACAO).nullable(),
  linhas: z.number().int().nonnegative(),
});

/** `POST .../clientes/importacao/previa` — nada é gravado. */
export const esquemaDaPreviaDaImportacao = z.strictObject({
  arquivo: esquemaDoArquivoLido,
  colunas: z.array(esquemaDaColunaDaImportacao),
  mapeamento: z.record(esquemaDoCampo, z.string().nullable()),
  campos: z.array(
    z.strictObject({
      campo: esquemaDoCampo,
      rotulo: z.string(),
      obrigatorio: z.boolean(),
    }),
  ),
  primeirasLinhas: z.array(esquemaDaLinhaDaPrevia),
  previsao: esquemaDaContagemDaImportacao,
  limite: esquemaDoLimiteNaImportacao,
  /** Os primeiros problemas (até `PROBLEMAS_NA_PREVIA_DA_IMPORTACAO`). */
  problemas: z.array(esquemaDoProblemaDaImportacao),
  avisos: z.array(z.string()),
});
export type PreviaDaImportacaoNoContrato = z.infer<
  typeof esquemaDaPreviaDaImportacao
>;

/** Uma linha do relatório de erros (o CSV para baixar). */
export const esquemaDaLinhaDoRelatorio = z.strictObject({
  linha: z.number().int().positive(),
  situacao: z.enum(["invalido", "repetido", "fora_do_limite"]),
  motivo: z.string(),
  nome: z.string().nullable(),
  telefone: z.string().nullable(),
  email: z.string().nullable(),
});
export type LinhaDoRelatorioDaImportacao = z.infer<
  typeof esquemaDaLinhaDoRelatorio
>;

/** `POST .../clientes/importacao/relatorio` — devolve `text/csv`. */
export const esquemaDoPedidoDeRelatorio = z.strictObject({
  linhas: z
    .array(esquemaDaLinhaDoRelatorio)
    .max(MAXIMO_DE_LINHAS_DA_IMPORTACAO),
});

/** `POST .../clientes/importacao/confirmar` — o resultado final. */
export const esquemaDoResultadoDaImportacao = z.strictObject({
  arquivo: esquemaDoArquivoLido,
  repetidosComo: z.enum(REGRAS_DE_REPETIDOS_DA_IMPORTACAO),
  total: z.number().int().nonnegative(),
  criados: z.number().int().nonnegative(),
  /** Repetidos com ao menos um campo vazio completado (`completar`). */
  atualizados: z.number().int().nonnegative(),
  repetidos: z.array(esquemaDoRepetidoDaImportacao),
  invalidos: z.array(esquemaDoProblemaDaImportacao),
  /** Novos que ficaram de fora porque a loja chegou ao limite de clientes. */
  foraDoLimite: z.array(z.number().int().positive()),
  limite: esquemaDoLimiteNaImportacao,
  /**
   * O relatório de erros (inválidos, repetidos e fora do limite). `csv` já é
   * o arquivo pronto (UTF-8 com BOM, separador `;`, abre no Excel); quem
   * prefere um link manda `linhas` para `.../importacao/relatorio`.
   */
  relatorio: z
    .strictObject({
      nomeDoArquivo: z.string(),
      tipo: z.literal("text/csv"),
      csv: z.string(),
      linhas: z.array(esquemaDaLinhaDoRelatorio),
    })
    .nullable(),
});
export type ResultadoDaImportacaoNoContrato = z.infer<
  typeof esquemaDoResultadoDaImportacao
>;

/** Os códigos de recusa do importador (corpo `{erro, mensagem}`). */
export const ERROS_DA_IMPORTACAO = [
  "arquivo_vazio",
  "arquivo_grande_demais",
  "linhas_demais",
  "formato_nao_suportado",
  "arquivo_ilegivel",
] as const;
export type ErroDaImportacao = (typeof ERROS_DA_IMPORTACAO)[number];

export const esquemaDaRecusaDaImportacao = z.strictObject({
  erro: z.enum(ERROS_DA_IMPORTACAO),
  mensagem: z.string(),
});
