/**
 * Documentos legais e direitos do titular (LGPD, card #79).
 *
 * A versão de cada documento mora AQUI, num lugar só, e é a que site e API
 * comparam. Mudou o texto de forma que exija novo aceite? Troque a versão: na
 * próxima visita, a pessoa vê a janela de novo aceite e, até aceitar, a API
 * recusa só as ações de criação (403 `aceite_pendente`) — navegar, ver pedidos,
 * exportar e excluir os dados continuam liberados.
 *
 * A versão é a data da revisão dos textos (`AAAA-MM-DD`) e acompanha a
 * `VERSAO_DA_POLITICA` do aviso de cookies.
 */
import { z } from "zod";

export const DOCUMENTOS_LEGAIS = [
  "TERMS_OF_USE",
  "PRIVACY_POLICY",
  "MERCHANT_TERMS",
] as const;

export type DocumentoLegal = (typeof DOCUMENTOS_LEGAIS)[number];

export const esquemaDoDocumentoLegal = z.enum(DOCUMENTOS_LEGAIS);

/** A versão vigente de cada documento. */
export const VERSAO_DOS_DOCUMENTOS_LEGAIS: Readonly<
  Record<DocumentoLegal, string>
> = {
  TERMS_OF_USE: "2026-10-19",
  PRIVACY_POLICY: "2026-10-19",
  MERCHANT_TERMS: "2026-10-19",
};

/** Como a pessoa lê o nome de cada documento. */
export const ROTULO_DOS_DOCUMENTOS_LEGAIS: Readonly<
  Record<DocumentoLegal, string>
> = {
  TERMS_OF_USE: "Termos de Uso",
  PRIVACY_POLICY: "Política de Privacidade",
  MERCHANT_TERMS: "Termos do Lojista",
};

/** Onde cada documento é lido (páginas do card #78). */
export const CAMINHO_DOS_DOCUMENTOS_LEGAIS: Readonly<
  Record<DocumentoLegal, string>
> = {
  TERMS_OF_USE: "/termos-de-uso",
  PRIVACY_POLICY: "/politica-de-privacidade",
  // Os termos do lojista são uma seção dos Termos de Uso.
  MERCHANT_TERMS: "/termos-de-uso#lojistas",
};

/** Quem aceita o quê: toda conta aceita os dois primeiros; dono, também o terceiro. */
export const DOCUMENTOS_DE_TODA_CONTA: readonly DocumentoLegal[] = [
  "TERMS_OF_USE",
  "PRIVACY_POLICY",
];

/** Cabeçalho com o navegador do visitante, que o site repassa pela ponte. */
export const CABECALHO_DO_AGENTE_DO_VISITANTE = "x-simpleclick-agente-do-visitante";

/** Marca obrigatória do cadastro: "Li e aceito os Termos de Uso e a Política". */
export const esquemaDoAceiteDoCadastro = z.literal(true, {
  error: "Aceite os Termos de Uso e a Política de Privacidade para criar a conta.",
});

/** Marca obrigatória de quem abre loja: os termos do lojista. */
export const esquemaDoAceiteDoLojista = z.literal(true, {
  error: "Aceite os Termos do Lojista para abrir a loja.",
});

/** `POST /v1/conta/aceites` — o novo aceite dado na janela de versão nova. */
export const esquemaDoNovoAceite = z.strictObject({
  documentos: z.array(esquemaDoDocumentoLegal).min(1).max(DOCUMENTOS_LEGAIS.length),
});

export const esquemaDoAceiteRegistrado = z.strictObject({
  documento: esquemaDoDocumentoLegal,
  versao: z.string(),
  aceitoEm: z.iso.datetime(),
  origem: z.enum(["SIGNUP", "RENEWAL"]),
});

/** `GET /v1/conta/aceites` — o que a conta precisa aceitar e o que já aceitou. */
export const esquemaDaSituacaoDosAceites = z.strictObject({
  /** Documentos na versão vigente que a conta ainda não aceitou. */
  pendentes: z.array(
    z.strictObject({ documento: esquemaDoDocumentoLegal, versao: z.string() }),
  ),
  /** Todo o histórico de aceites, do mais novo para o mais antigo. */
  historico: z.array(esquemaDoAceiteRegistrado),
});

export type SituacaoDosAceites = z.infer<typeof esquemaDaSituacaoDosAceites>;

/** `POST /v1/conta/excluir` — a confirmação forte (senha e a palavra EXCLUIR). */
export const PALAVRA_DE_CONFIRMACAO_DA_EXCLUSAO = "EXCLUIR";

export const esquemaDaExclusaoDaConta = z.strictObject({
  senha: z.string().min(1).max(200),
  confirmacao: z.literal(PALAVRA_DE_CONFIRMACAO_DA_EXCLUSAO, {
    error: `Digite ${PALAVRA_DE_CONFIRMACAO_DA_EXCLUSAO} para confirmar.`,
  }),
});

/** `POST /v1/conta/privacidade/exportar` — pede o arquivo com os dados. */
export const esquemaDoPedidoDeExportacao = z.strictObject({
  senha: z.string().min(1).max(200),
  formato: z.enum(["json", "csv"]).default("json"),
});
