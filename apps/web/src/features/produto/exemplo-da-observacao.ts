/**
 * O exemplo do campo "Observação para este item", pelo tipo de negócio da loja
 * (card #70).
 *
 * "Sem cebola" numa loja de autopeças não ensina nada: o exemplo tem de ser o
 * que um cliente DAQUELE ramo escreveria. Ramo sem exemplo próprio cai num
 * texto neutro, que serve para qualquer loja.
 */
const EXEMPLO_DO_RAMO: Readonly<Record<string, string>> = {
  FOOD_SNACK: "sem cebola, carne bem passada",
  FOOD_RESTAURANT: "sem cebola, molho à parte",
  FOOD_PIZZA: "metade sem azeitona, massa bem assada",
  FOOD_MARMITA: "sem feijão, mais salada",
  FOOD_ACAI: "granola à parte, sem leite condensado",
  FOOD_BAKERY: "pão bem moreninho, fatiado",
  BEVERAGES: "bem gelada",
  GROCERY: "banana mais verde, sacola separada",
  APPAREL: "embrulhar para presente",
  SHOES: "embrulhar para presente",
  AUTO_PARTS: "confirmar se serve no Gol G5 2012",
  ELECTRONICS: "confirmar se vem com carregador",
  HARDWARE: "cortar em 2 pedaços de 1 m",
  COSMETICS: "embrulhar para presente",
  PHARMACY: "aceito genérico",
  PET_SHOP: "para cachorro de porte pequeno",
  FLORIST: "cartão escrito “Feliz aniversário, mãe”",
  STATIONERY: "capa na cor azul",
  BOOKSTORE: "embrulhar para presente",
  TOYS: "embrulhar para presente",
};

const EXEMPLO_NEUTRO = "uma cor ou um detalhe que você prefere";

/** "Ex.: …" pronto para o placeholder. */
export function exemploDaObservacao(ramo: string | null | undefined): string {
  const exemplo =
    ramo && Object.hasOwn(EXEMPLO_DO_RAMO, ramo)
      ? EXEMPLO_DO_RAMO[ramo]
      : EXEMPLO_NEUTRO;
  return `Ex.: ${exemplo}`;
}
