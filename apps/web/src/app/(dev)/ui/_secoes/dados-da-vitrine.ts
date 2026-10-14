// Dados fixos que as seções da vitrine do design system mostram (AC-013): pedidos de
// exemplo, a paleta oficial da marca e as duas cores de loja que exercitam o contraste.
import { PALETA_CLARA, PALETA_ESCURA } from "@simpleclick/ui";

export type Pedido = { id: string; cliente: string; total: string };

export const PEDIDOS: Pedido[] = [
  { id: "p-1041", cliente: "Ana", total: "R$ 48,90" },
  { id: "p-1042", cliente: "Bruno", total: "R$ 112,00" },
  { id: "p-1043", cliente: "Carla", total: "R$ 27,50" },
];

/** A lista vazia precisa do tipo: é dela que os estados de exceção partem. */
export const SEM_PEDIDOS: Pedido[] = [];

export const CORES_OFICIAIS = [
  ["Verde Click", "var(--marca-verde-click)"],
  ["Verde Digital", "var(--marca-verde-digital)"],
  ["Mint", "var(--marca-mint)"],
  ["Grafite", "var(--marca-grafite)"],
  ["Cinza UI", "var(--marca-cinza-ui)"],
  ["Névoa", "var(--marca-nevoa)"],
  ["Branco", "var(--marca-branco)"],
  ["Preto Tecnológico", "var(--marca-preto-tecnologico)"],
] as const;

/**
 * Duas cores de loja escolhidas de propósito: uma que já se lê, outra que
 * exige conserto.
 *
 * Elas vêm dos próprios valores declarados do tema, e não escritas aqui à mão —
 * a vitrine do design system é a última tela que poderia abrir exceção à regra
 * que ela existe para demonstrar (AC-014).
 */
export const CORES_DE_EXEMPLO = [
  {
    cor: PALETA_CLARA.sucesso,
    nome: "Tom escuro",
    observacao:
      "A tinta tecnológica não alcança o mínimo; o sistema escolhe branco para o botão.",
  },
  {
    cor: PALETA_ESCURA.atencao,
    nome: "Tom claro",
    observacao:
      "Letra clara ficaria ilegível: o sistema troca a letra e escurece o tom usado como texto.",
  },
];

export type PedidoDaTabela = {
  numero: number;
  cliente: string;
  status: "Pago" | "Em preparo" | "Recusado" | "Novo";
  centavos: number;
};

/** Linhas da tabela de exemplo: o bastante para o cabeçalho fixo aparecer. */
export const PEDIDOS_DA_TABELA: readonly PedidoDaTabela[] = [
  { numero: 1041, cliente: "Ana", status: "Pago", centavos: 4890 },
  { numero: 1042, cliente: "Bruno", status: "Recusado", centavos: 11200 },
  { numero: 1043, cliente: "Carla", status: "Em preparo", centavos: 2750 },
  { numero: 1044, cliente: "Davi", status: "Novo", centavos: 6300 },
  { numero: 1045, cliente: "Elisa", status: "Pago", centavos: 1990 },
  { numero: 1046, cliente: "Fábio", status: "Em preparo", centavos: 8540 },
];
