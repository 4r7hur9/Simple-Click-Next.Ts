/**
 * A mensagem de um campo recusado, ao lado do campo (AC-923).
 *
 * O campo aponta para a mensagem por `aria-describedby` e se declara inválido
 * por `aria-invalid`: quem usa leitor de tela ouve o problema ao chegar no
 * campo, e não só um aviso solto no topo da página.
 */

/** O identificador da mensagem de um campo. */
export function idDoErro(campo: string): string {
  return `erro-${campo.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

/** Os atributos que ligam o campo à mensagem dele, quando há mensagem. */
export function atributosDeErro(
  campo: string,
  erros: Readonly<Record<string, string>>,
): { "aria-invalid"?: true; "aria-describedby"?: string } {
  return erros[campo] === undefined
    ? {}
    : { "aria-invalid": true, "aria-describedby": idDoErro(campo) };
}

export function ErroDoCampo({
  campo,
  erros,
}: {
  readonly campo: string;
  readonly erros: Readonly<Record<string, string>>;
}) {
  const mensagem = erros[campo];
  if (mensagem === undefined) return null;
  return (
    <p
      id={idDoErro(campo)}
      className="mt-2 text-sm font-medium text-[var(--cor-erro)]"
      role="alert"
    >
      {mensagem}
    </p>
  );
}
