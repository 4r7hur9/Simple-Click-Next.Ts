/**
 * MODELO PARA REVISÃO JURÍDICA ANTES DE PUBLICAR.
 *
 * Dados de contato das páginas legais. O e-mail do encarregado (DPO) vem de
 * variável de ambiente para o dono trocar sem mexer em código.
 */

export const EMAIL_PADRAO_DO_ENCARREGADO = "privacidade@simpleclick.com.br";

/** Quando a política foi escrita pela última vez (texto de exibição). */
export const DATA_DE_ATUALIZACAO = "19 de outubro de 2026";
export const DATA_DE_ATUALIZACAO_ISO = "2026-10-19";
export const VERSAO_DOS_TEXTOS = "1.0";

export function emailDoEncarregado(
  ambiente: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const declarado = ambiente["NEXT_PUBLIC_EMAIL_DO_ENCARREGADO"]?.trim();
  return declarado !== undefined && declarado !== ""
    ? declarado
    : EMAIL_PADRAO_DO_ENCARREGADO;
}

export const ROTAS_LEGAIS = [
  { rota: "/termos-de-uso", rotulo: "Termos de Uso" },
  { rota: "/politica-de-privacidade", rotulo: "Política de Privacidade" },
  { rota: "/cookies", rotulo: "Cookies" },
  { rota: "/lgpd", rotulo: "Seus direitos (LGPD)" },
] as const;
