/**
 * Alterna a medida de uma lista ou gráfico do painel entre quantidade de
 * pedidos e valor vendido (T-805; AC-807, AC-808).
 *
 * São dois botões com `aria-pressed`, e não um seletor escondido: no celular
 * o toque é um só, e o leitor de tela anuncia qual medida está valendo. O par
 * fica numa pílula só, como um interruptor de duas posições.
 */
import { Botao } from "@simpleclick/ui";

export type MedidaDoPainel = "quantidade" | "valor";

export interface AlternarMedidaProps {
  /** O rótulo do grupo, como "Ordenar por" ou "Mostrar". */
  readonly rotulo: string;
  readonly medida: MedidaDoPainel;
  readonly aoTrocar: (medida: MedidaDoPainel) => void;
  /** Os nomes curtos de cada medida na tela. */
  readonly nomes?: Readonly<Record<MedidaDoPainel, string>> | undefined;
}

const NOMES_PADRAO: Readonly<Record<MedidaDoPainel, string>> = {
  quantidade: "Quantidade",
  valor: "Valor",
};

export function AlternarMedida({
  rotulo,
  medida,
  aoTrocar,
  nomes = NOMES_PADRAO,
}: AlternarMedidaProps) {
  return (
    <div
      role="group"
      aria-label={rotulo}
      className="flex flex-wrap items-center gap-2"
    >
      <span aria-hidden="true" className="text-sm text-tinta-suave">
        {rotulo}:
      </span>
      <span className="inline-flex gap-1 rounded-[var(--raio-completo)] border border-borda bg-superficie p-1">
      {(["quantidade", "valor"] as const).map((opcao) => (
        <Botao
          key={opcao}
          data-medida={opcao}
          aria-pressed={medida === opcao}
          variante={medida === opcao ? "primaria" : "discreta"}
          forma="pilula"
          onClick={() => aoTrocar(opcao)}
        >
          {nomes[opcao]}
        </Botao>
      ))}
      </span>
    </div>
  );
}
