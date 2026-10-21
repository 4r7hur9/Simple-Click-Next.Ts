/**
 * Quem está logado, no começo da seção Conta: avatar com as iniciais, nome e
 * e-mail. Na faixa de ícones fica só o avatar.
 */
export function PessoaDoMenu({
  nome,
  email,
  iniciais,
}: {
  readonly nome: string;
  readonly email: string;
  readonly iniciais: string;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 md:max-lg:justify-center md:max-lg:px-0">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-[var(--raio-completo)] bg-[var(--cor-superficie-alta)] text-sm font-semibold text-[var(--cor-tinta)]"
      >
        {iniciais}
      </span>
      <span className="flex min-w-0 flex-col md:max-lg:sr-only">
        <strong className="truncate text-sm font-semibold text-[var(--cor-tinta)]">
          {nome}
        </strong>
        <span className="truncate text-xs text-[var(--cor-tinta-suave)]">
          {email}
        </span>
      </span>
    </div>
  );
}
