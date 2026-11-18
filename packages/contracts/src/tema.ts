/**
 * O tema da loja (card #25): o que o dono personaliza na vitrine.
 *
 * - `corDestaque`: a cor dos botões e destaques, em `#rrggbb`. Padrão: o verde
 *   do SimpleClick, `#b7ff00`.
 * - `fundoVitrine`: imagem de fundo da página da loja (opcional).
 * - `topoCardapio`: imagem do topo do cardápio/catálogo (opcional; sem ela, a
 *   tela usa a capa da loja).
 * - `seloDeStatus` (card #64): a pílula ABERTO/FECHADO sobre a capa —
 *   `AUTOMATICO` (padrão: escolhe pelo contraste com a capa), `CLARO` ou
 *   `ESCURO`.
 * - `coresDasImagens` (card #64): a cor dominante de cada imagem da loja
 *   (capa, topo, fundo), pelo endereço dela, medida no painel quando o dono
 *   salva. É o que o automático usa; imagem trocada sem medir fica sem cor.
 *
 * O FUNDO DA VITRINE É SEMPRE PRETO e não é configurável: a imagem de fundo
 * fica por cima do preto, e o texto é sempre claro.
 *
 * Editar o tema é da permissão `personalizacao` (só o dono):
 * `GET`/`PUT /v1/lojas/:apelido/tema`. A vitrine pública devolve o tema em
 * `loja.tema`.
 */

import { z } from "zod";

import { ehEnderecoDeImagem } from "./endereco-de-imagem.ts";

export const COR_DE_DESTAQUE_PADRAO = "#b7ff00";

/** Não é configurável. */
export const COR_DE_FUNDO_DA_VITRINE = "#000000";

/** Cor em `#rrggbb` (seis dígitos), validada. */
export const esquemaDaCorHexadecimal = z
  .string("Informe a cor.")
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a cor no formato #1a2b3c.")
  .transform((valor) => valor.toLowerCase());

/** A cor é válida? Serve para ler o que já está guardado. */
export function ehCorHexadecimal(valor: unknown): valor is string {
  return typeof valor === "string" && /^#[0-9a-fA-F]{6}$/.test(valor);
}

/** As preferências do selo de status (a regra mora em `@simpleclick/ui`). */
export const PREFERENCIAS_DO_SELO_DE_STATUS = [
  "AUTOMATICO",
  "CLARO",
  "ESCURO",
] as const;
export type PreferenciaDoSeloDeStatus =
  (typeof PREFERENCIAS_DO_SELO_DE_STATUS)[number];
/** Capa, logo, topo e fundo cabem com folga. */
export const MAXIMO_DE_CORES_DE_IMAGEM = 6;

export const SELO_DE_STATUS_PADRAO: PreferenciaDoSeloDeStatus = "AUTOMATICO";

const enderecoDeImagem = (rotulo: string) =>
  z
    .string(`${rotulo}: informe um endereço completo, começando por https://.`)
    .max(1_000, `${rotulo}: o endereço é longo demais.`)
    .refine((valor) => ehEnderecoDeImagem(valor), {
      message: `${rotulo}: o endereço precisa começar por https://.`,
    })
    .nullable();

/** As fotos que guardam o ajuste do recorte (o original e como foi enquadrado). */
export const CHAVES_DE_AJUSTE_DE_FOTO = [
  "fundoVitrine",
  "topoCardapio",
  "logo",
] as const;
export type ChaveDeAjusteDeFoto = (typeof CHAVES_DE_AJUSTE_DE_FOTO)[number];

const numeroDoAjuste = z.number().finite().min(-1_000_000).max(1_000_000);

/** Como a foto foi enquadrada em UMA moldura (na medida do arquivo de saída). */
export const esquemaDoEstadoDoAjuste = z.strictObject({
  modo: z.enum(["preencher", "ajustar"]),
  zoom: z.number().finite().min(1).max(4),
  x: numeroDoAjuste,
  y: numeroDoAjuste,
  giro: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  espelhado: z.boolean(),
});

const enderecoGuardado = z
  .string()
  .max(1_000)
  .refine((valor) => ehEnderecoDeImagem(valor), {
    message: "Use o endereço da imagem.",
  });

/**
 * O AJUSTE de uma foto (card #36): o original SEM corte e como o dono o
 * enquadrou em cada moldura. É o que deixa reabrir "Ajustar a foto" sem
 * reenviar o arquivo e sem perder qualidade: o corte parte sempre do original.
 *
 * `computador` e `celular` são os endereços finais que este ajuste gerou; ele
 * só vale enquanto a foto do tema for a mesma (trocou a foto por outra, o
 * ajuste antigo é ignorado).
 */
export const esquemaDoAjusteDaFoto = z.strictObject({
  original: enderecoGuardado,
  computador: enderecoGuardado,
  celular: enderecoGuardado.nullable().optional(),
  /** O celular segue o ajuste do computador. */
  iguais: z.boolean(),
  /** O fundo das sobras no modo "ajustar". */
  fundo: z.strictObject({
    tipo: z.enum(["media", "preto", "branco", "transparente", "cor"]),
    // Sem `transform`: este esquema entra no documento OpenAPI (JSON Schema).
    cor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Use a cor no formato #1a2b3c.")
      .optional(),
  }),
  estados: z.partialRecord(
    z.enum(["computador", "celular", "unica"]),
    esquemaDoEstadoDoAjuste,
  ),
});

export type AjusteDaFoto = z.infer<typeof esquemaDoAjusteDaFoto>;

export const esquemaDosAjustesDasFotos = z.partialRecord(
  z.enum(CHAVES_DE_AJUSTE_DE_FOTO),
  esquemaDoAjusteDaFoto,
);

export type AjustesDasFotos = z.infer<typeof esquemaDosAjustesDasFotos>;

/** O tema guardado, como o dono e a vitrine o leem. */
export const esquemaDoTemaDaLoja = z.strictObject({
  corDestaque: z.string(),
  /** Sempre `#000000`. */
  corDeFundo: z.literal(COR_DE_FUNDO_DA_VITRINE),
  fundoVitrine: z.string().nullable(),
  topoCardapio: z.string().nullable(),
  /**
   * As versões das duas fotos para o CELULAR (telas estreitas), cada uma com o
   * enquadramento que o dono ajustou para o telefone. Sem elas, o celular usa a
   * foto do computador.
   */
  fundoVitrineCelular: z.string().nullable().optional(),
  topoCardapioCelular: z.string().nullable().optional(),
  seloDeStatus: z.enum(PREFERENCIAS_DO_SELO_DE_STATUS).optional(),
  coresDasImagens: z.record(z.string(), z.string()).optional(),
  /** Só o dono lê: o original de cada foto e o enquadramento. */
  ajustesDasFotos: esquemaDosAjustesDasFotos.optional(),
});

export type TemaDaLoja = z.infer<typeof esquemaDoTemaDaLoja>;

/** `PUT /v1/lojas/:apelido/tema` — só os campos enviados mudam. */
export const esquemaDaEdicaoDoTema = z
  .strictObject({
    corDestaque: esquemaDaCorHexadecimal.optional(),
    fundoVitrine: enderecoDeImagem("Fundo da vitrine").optional(),
    topoCardapio: enderecoDeImagem("Topo do cardápio").optional(),
    fundoVitrineCelular: enderecoDeImagem(
      "Fundo da vitrine no celular",
    ).optional(),
    topoCardapioCelular: enderecoDeImagem(
      "Topo do cardápio no celular",
    ).optional(),
    /** Troca o conjunto inteiro: foto sem ajuste na lista perde o ajuste. */
    ajustesDasFotos: esquemaDosAjustesDasFotos.optional(),
    seloDeStatus: z
      .enum(
        PREFERENCIAS_DO_SELO_DE_STATUS,
        "Escolha Automático, Claro ou Escuro.",
      )
      .optional(),
    coresDasImagens: z
      .record(
        z
          .string()
          .max(1_000)
          .refine((valor) => ehEnderecoDeImagem(valor), {
            message: "Cores das imagens: use o endereço da imagem.",
          }),
        esquemaDaCorHexadecimal,
      )
      .refine((mapa) => Object.keys(mapa).length <= MAXIMO_DE_CORES_DE_IMAGEM, {
        message: "Cores das imagens: no máximo 6.",
      })
      .optional(),
  })
  .refine((valor) => Object.keys(valor).length > 0, {
    message: "Informe ao menos um ajuste do tema.",
  });

export type EdicaoDoTema = z.output<typeof esquemaDaEdicaoDoTema>;

/** Monta o tema a partir do que está guardado, com os padrões. */
export function temaDaLoja(guardado: {
  readonly corDestaque?: unknown;
  readonly fundoVitrine?: unknown;
  readonly topoCardapio?: unknown;
  readonly fundoVitrineCelular?: unknown;
  readonly topoCardapioCelular?: unknown;
  readonly seloDeStatus?: unknown;
  readonly coresDasImagens?: unknown;
  readonly ajustesDasFotos?: unknown;
}): TemaDaLoja {
  const imagem = (valor: unknown) => (ehEnderecoDeImagem(valor) ? valor : null);
  return {
    // Sem cor própria por loja: o valor guardado é ignorado (compatibilidade).
    corDestaque: COR_DE_DESTAQUE_PADRAO,
    corDeFundo: COR_DE_FUNDO_DA_VITRINE,
    fundoVitrine: imagem(guardado.fundoVitrine),
    topoCardapio: imagem(guardado.topoCardapio),
    fundoVitrineCelular: imagem(guardado.fundoVitrineCelular),
    topoCardapioCelular: imagem(guardado.topoCardapioCelular),
    seloDeStatus: (
      PREFERENCIAS_DO_SELO_DE_STATUS as readonly unknown[]
    ).includes(guardado.seloDeStatus)
      ? (guardado.seloDeStatus as PreferenciaDoSeloDeStatus)
      : SELO_DE_STATUS_PADRAO,
    coresDasImagens: coresGuardadas(guardado.coresDasImagens),
    ajustesDasFotos: ajustesGuardados(guardado.ajustesDasFotos),
  };
}

/** Só os ajustes que passam no esquema: o resto é descartado em silêncio. */
function ajustesGuardados(valor: unknown): AjustesDasFotos {
  const ajustes: AjustesDasFotos = {};
  if (typeof valor !== "object" || valor === null || Array.isArray(valor))
    return ajustes;
  for (const chave of CHAVES_DE_AJUSTE_DE_FOTO) {
    const lido = esquemaDoAjusteDaFoto.safeParse(
      (valor as Record<string, unknown>)[chave],
    );
    if (lido.success) ajustes[chave] = lido.data;
  }
  return ajustes;
}

/** Só pares endereço https → `#rrggbb`: o valor vai para a folha de estilo. */
function coresGuardadas(valor: unknown): Record<string, string> {
  const cores: Record<string, string> = {};
  if (typeof valor !== "object" || valor === null || Array.isArray(valor))
    return cores;
  for (const [endereco, cor] of Object.entries(valor)) {
    if (Object.keys(cores).length >= MAXIMO_DE_CORES_DE_IMAGEM) break;
    if (ehEnderecoDeImagem(endereco) && ehCorHexadecimal(cor))
      cores[endereco] = cor.toLowerCase();
  }
  return cores;
}

/** A cor medida da imagem em uso, ou nula. */
export function corDaImagem(
  tema: Pick<TemaDaLoja, "coresDasImagens"> | null | undefined,
  imagem: string | null | undefined,
): string | null {
  if (!imagem) return null;
  return tema?.coresDasImagens?.[imagem] ?? null;
}
