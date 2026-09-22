export interface SeloAguardandoProps {
  readonly quantidade?: number | undefined;
}

/** Marca o pedido que abriu o WhatsApp, mas ainda não confirmou o envio. */
export function SeloAguardando({ quantidade }: SeloAguardandoProps) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-500" />
      Aguardando confirmação no WhatsApp
      {quantidade === undefined ? null : ` · ${quantidade}`}
    </span>
  );
}
