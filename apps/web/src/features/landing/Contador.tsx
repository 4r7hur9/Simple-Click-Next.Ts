/**
 * Um número que a narrativa faz contar até o valor quando entra na tela.
 *
 * O SERVIDOR JÁ ENTREGA O VALOR FINAL: sem script, ou com movimento reduzido,
 * é ele que fica. O leitor de tela ouve só o valor final (a cópia escondida),
 * e nunca os números intermediários da contagem.
 */
export interface ContadorProps {
  readonly texto: string;
  readonly className?: string;
}

/** Separa "até 23%" em prefixo, número e sufixo. Sem número, não conta. */
export function partesDoContador(
  texto: string,
): { antes: string; valor: number; casas: number; depois: string } | null {
  const achado = /^(.*?)(\d+(?:\.\d{3})*(?:,\d+)?)(.*)$/.exec(texto);
  if (!achado) return null;
  const [, antes = "", numero = "", depois = ""] = achado;
  const casas = numero.includes(",") ? (numero.split(",")[1]?.length ?? 0) : 0;
  const valor = Number(numero.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(valor) ? { antes, valor, casas, depois } : null;
}

export function Contador({ texto, className }: ContadorProps) {
  const partes = partesDoContador(texto);
  return (
    <span className={className}>
      <span
        aria-hidden="true"
        {...(partes
          ? {
              "data-contador": String(partes.valor),
              "data-casas": String(partes.casas),
              "data-antes": partes.antes,
              "data-depois": partes.depois,
            }
          : {})}
      >
        {texto}
      </span>
      <span className="sc-lp-so-leitor">{texto}</span>
    </span>
  );
}
