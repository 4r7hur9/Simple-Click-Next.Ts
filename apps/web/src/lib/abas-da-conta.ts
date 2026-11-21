/**
 * As abas do modal "Minha conta" (card #151) e o endereço que as abre.
 *
 * O modal abre por `?conta=<aba>` em qualquer tela do cliente. O valor da URL
 * NUNCA é refletido nem usado como veio: só o que está na lista abaixo abre o
 * modal (`?conta=excluida`, usado depois de excluir a conta, e qualquer outro
 * texto não abrem nada). As rotas antigas `/conta/dados`, `/conta/enderecos`
 * e `/conta/seguranca` viram redirect para o endereço de `enderecoDoModal`.
 *
 * O modal abre por cima de uma página de fundo FIXA: Meus pedidos para o
 * cliente e `/admin` para a administração (card #170, T-6), que não tem
 * Pedidos. A página de fundo é uma lista fechada, nunca um valor da URL.
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

/** A página de fundo do modal na administração (sem itens de cliente). */
export const PAGINA_DE_FUNDO_DO_MODAL_NA_ADMINISTRACAO = "/admin";

/** As únicas páginas que o modal aceita como fundo. */
export const PAGINAS_DE_FUNDO_DO_MODAL = [
  PAGINA_DE_FUNDO_DO_MODAL,
  PAGINA_DE_FUNDO_DO_MODAL_NA_ADMINISTRACAO,
] as const;

export type PaginaDeFundoDoModal = (typeof PAGINAS_DE_FUNDO_DO_MODAL)[number];

/**
 * O endereço que abre o modal na aba, sobre a página de fundo (por padrão,
 * Meus pedidos). `estado` só leva `erro` (o aviso da ação "Encerrar todas as
 * sessões" que falhou) e a aba só vale se está na lista fechada: qualquer
 * outro valor cai fora, e o endereço é sempre montado, nunca concatenado.
 */
export function enderecoDoModal(
  aba: AbaDaConta,
  estado?: string | undefined,
  paginaDeFundo: PaginaDeFundoDoModal = PAGINA_DE_FUNDO_DO_MODAL,
): string {
  const fundo =
    PAGINAS_DE_FUNDO_DO_MODAL.find((pagina) => pagina === paginaDeFundo) ??
    PAGINA_DE_FUNDO_DO_MODAL;
  const consulta = new URLSearchParams({
    [PARAMETRO_DA_CONTA]: lerAbaDaConta(aba) ?? ABAS_DA_CONTA[0],
  });
  if (estado === "erro") consulta.set(PARAMETRO_DE_ESTADO, "erro");
  return `${fundo}?${consulta.toString()}`;
}

/** Um valor de `searchParams` do Next (texto ou lista) como texto, ou nada. */
export function textoDaConsulta(valor: unknown): string | undefined {
  return typeof valor === "string" ? valor : undefined;
}
