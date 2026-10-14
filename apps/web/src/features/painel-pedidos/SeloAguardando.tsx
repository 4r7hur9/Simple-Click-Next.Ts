import { Selo } from "@simpleclick/ui";

export interface SeloAguardandoProps {
  readonly quantidade?: number | undefined;
}

/** Marca o pedido que abriu o WhatsApp, mas ainda não confirmou o envio. */
export function SeloAguardando({ quantidade }: SeloAguardandoProps) {
  return (
    <Selo tom="atencao">
      Aguardando confirmação no WhatsApp
      {quantidade === undefined ? null : ` · ${quantidade}`}
    </Selo>
  );
}
