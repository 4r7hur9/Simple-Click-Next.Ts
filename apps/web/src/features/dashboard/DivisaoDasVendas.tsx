/**
 * Divisões das vendas em barras horizontais de CSS (card #34): por forma de
 * pagamento, entrega contra retirada e por categoria. A barra é só desenho;
 * o valor e a quantidade estão escritos em cada linha.
 */
import { escreverDinheiro } from "../../lib/metricas.ts";

export interface LinhaDeDivisao {
  readonly chave: string;
  readonly rotulo: string;
  readonly valorCentavos: number;
  /** "3 pedidos", "5 itens". */
  readonly quantidade: string;
}

export function DivisaoDasVendas({
  titulo,
  linhas,
  nome,
}: {
  readonly titulo: string;
  readonly linhas: readonly LinhaDeDivisao[];
  readonly nome: string;
}) {
  const total = linhas.reduce((soma, l) => soma + l.valorCentavos, 0);
  return (
    <section
      aria-label={titulo}
      data-divisao={nome}
      className="sc-cartao min-w-0"
    >
      <h2 className="sc-cartao__titulo">{titulo}</h2>
      {linhas.length === 0 ? (
        <p className="text-sm text-tinta-suave">Sem vendas neste período.</p>
      ) : (
        <ul className="space-y-3">
          {linhas.map((linha) => {
            const parte = total > 0 ? (linha.valorCentavos / total) * 100 : 0;
            return (
              <li key={linha.chave} data-linha={linha.chave}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium">
                    {linha.rotulo}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {escreverDinheiro(linha.valorCentavos)}
                    <span className="ml-2 text-tinta-suave">
                      {Math.round(parte)}%
                    </span>
                  </span>
                </div>
                <div
                  aria-hidden="true"
                  className="mt-1 h-2 overflow-hidden rounded-[var(--raio-completo)] bg-superficie"
                >
                  <div
                    className="h-full rounded-[var(--raio-completo)] bg-[var(--cor-primaria)]"
                    style={{ width: `${Math.max(parte, 2)}%` }}
                  />
                </div>
                <p className="mt-0.5 text-xs text-tinta-suave">
                  {linha.quantidade}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
