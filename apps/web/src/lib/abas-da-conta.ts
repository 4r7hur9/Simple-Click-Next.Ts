/**
 * As abas do modal "Minha conta" (card #151) e o endereço que as abre.
 *
 * O modal abre por `?conta=<aba>` em qualquer tela do cliente. O valor da URL
 * NUNCA é refletido nem usado como veio: só o que está na lista abaixo abre o
 * modal (`?conta=excluida`, usado depois de excluir a conta, e qualquer outro
 * texto não abrem nada). As rotas antigas `/conta/dados`, `/conta/enderecos`
 * e `/conta/seguranca` viram redirect para o endereço de `enderecoDoModal`.
 */
export const PARAMETRO_DA_CONTA = "conta";

/** O resultado de uma ação da conta que volta pela URL (`?estado=erro`). */
export const PARAMETRO_DE_ESTADO = "estado";

export const ABAS_DA_CONTA = ["dados", "enderecos", "seguranca"] as const;

export type AbaDaConta = (typeof ABAS_DA_CONTA)[number];

export const ROTULO_DA_ABA: Readonly<Record<AbaDaConta, string>> = {
  dados: "Dados",
  enderecos: "Endereços",
  seguranca: "Segurança",
};

/** A aba que o valor da URL pede, ou nulo para qualquer outra coisa. */
export function lerAbaDaConta(valor: unknown): AbaDaConta | null {
  return ABAS_DA_CONTA.find((aba) => aba === valor) ?? null;
}

/** A página de fundo do modal: onde o cliente cai quando ele abre por link. */
export const PAGINA_DE_FUNDO_DO_MODAL = "/conta/pedidos";

/**
 * O endereço que abre o modal na aba. `estado` só leva `erro` (o aviso da
 * ação "Encerrar todas as sessões" que falhou); qualquer outro valor cai fora.
 */
export function enderecoDoModal(
  aba: AbaDaConta,
  estado?: string | undefined,
): string {
  const consulta = new URLSearchParams({ [PARAMETRO_DA_CONTA]: aba });
  if (estado === "erro") consulta.set(PARAMETRO_DE_ESTADO, "erro");
  return `${PAGINA_DE_FUNDO_DO_MODAL}?${consulta.toString()}`;
}

/** Um valor de `searchParams` do Next (texto ou lista) como texto, ou nada. */
export function textoDaConsulta(valor: unknown): string | undefined {
  return typeof valor === "string" ? valor : undefined;
}
