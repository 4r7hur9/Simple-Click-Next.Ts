/**
 * O selo que marca o modo administração: "Administração SimpleClick".
 *
 * Verde como o resto da marca (tokens `--admin-selo-*`). O texto é o sentido;
 * a cor só reforça. Folha: `styles/administracao-da-plataforma.css`.
 */

export type SeloDaAdministracaoProps = {
  /** Troca o texto, quando a tela precisa de uma forma curta. */
  texto?: string | undefined;
  className?: string | undefined;
};

export const TEXTO_DO_SELO_DA_ADMINISTRACAO = "Administração SimpleClick";

export function SeloDaAdministracao({
  texto = TEXTO_DO_SELO_DA_ADMINISTRACAO,
  className,
}: SeloDaAdministracaoProps) {
  return (
    <span
      className={["sc-selo-admin", className].filter(Boolean).join(" ")}
      data-modo="administracao"
    >
      {texto}
    </span>
  );
}
