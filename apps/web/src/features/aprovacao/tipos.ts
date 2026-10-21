/** Os dados da loja em análise, como a API entrega ao dono. */
export interface LojaEmAnaliseNaTela {
  readonly nome: string;
  readonly tipoDeNegocio: string;
  readonly whatsapp: string | null;
  readonly cidade: string | null;
  readonly uf: string | null;
  readonly status: "PENDING_APPROVAL" | "REJECTED";
  readonly recusa: { readonly desde: string; readonly motivo: string } | null;
}
