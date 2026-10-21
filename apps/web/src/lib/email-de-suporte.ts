/** O e-mail público do suporte mostrado na tela (configurável por ambiente). */
export function emailDeSuporte(
  fonte: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return fonte["EMAIL_DE_SUPORTE"]?.trim() || "suporte@simpleclick.com.br";
}
