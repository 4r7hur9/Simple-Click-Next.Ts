/**
 * A capa padrão de cada tipo de negócio (`vertical_presets.code`).
 *
 * Quando o dono não envia capa, o card de apresentação não fica genérico: o
 * fundo grafite ganha um padrão de ícones do ramo — pastel e copo na
 * lanchonete, cabide e camiseta na loja de roupa — em traço verde-click.
 *
 * Os desenhos moram em `public/capas-padrao/`, um ladrilho SVG por ramo que se
 * repete sem costura. Este é o ÚNICO lugar que liga código a arquivo: ramo
 * novo sem desenho cai no genérico, e não num fundo quebrado.
 */

/** Os ramos que o banco semeia (migrações 0003 e 0063), na mesma ordem. */
export const RAMOS_COM_CAPA_PADRAO = [
  "FOOD_SNACK",
  "FOOD_RESTAURANT",
  "FOOD_ACAI",
  "RETAIL_GENERIC",
  "APPAREL",
  "AUTO_PARTS",
  "ELECTRONICS",
  "BEVERAGES",
  "FOOD_PIZZA",
  "FOOD_MARMITA",
  "FOOD_BAKERY",
  "GROCERY",
  "SHOES",
  "COSMETICS",
  "PHARMACY",
  "PET_SHOP",
  "FLORIST",
  "STATIONERY",
  "BOOKSTORE",
  "TOYS",
  "HARDWARE",
  "TOBACCO",
] as const;

export type RamoComCapaPadrao = (typeof RAMOS_COM_CAPA_PADRAO)[number];

const PASTA = "/capas-padrao";

/** O ladrilho de quem não tem ramo conhecido. */
export const CAPA_PADRAO_GENERICA = `${PASTA}/generico.svg`;

const CAPA_DO_RAMO: Readonly<Record<RamoComCapaPadrao, string>> = {
  FOOD_SNACK: `${PASTA}/food_snack.svg`,
  FOOD_RESTAURANT: `${PASTA}/food_restaurant.svg`,
  FOOD_ACAI: `${PASTA}/food_acai.svg`,
  RETAIL_GENERIC: `${PASTA}/retail_generic.svg`,
  APPAREL: `${PASTA}/apparel.svg`,
  AUTO_PARTS: `${PASTA}/auto_parts.svg`,
  ELECTRONICS: `${PASTA}/electronics.svg`,
  BEVERAGES: `${PASTA}/beverages.svg`,
  FOOD_PIZZA: `${PASTA}/food_pizza.svg`,
  FOOD_MARMITA: `${PASTA}/food_marmita.svg`,
  FOOD_BAKERY: `${PASTA}/food_bakery.svg`,
  GROCERY: `${PASTA}/grocery.svg`,
  SHOES: `${PASTA}/shoes.svg`,
  COSMETICS: `${PASTA}/cosmetics.svg`,
  PHARMACY: `${PASTA}/pharmacy.svg`,
  PET_SHOP: `${PASTA}/pet_shop.svg`,
  FLORIST: `${PASTA}/florist.svg`,
  STATIONERY: `${PASTA}/stationery.svg`,
  BOOKSTORE: `${PASTA}/bookstore.svg`,
  TOYS: `${PASTA}/toys.svg`,
  HARDWARE: `${PASTA}/hardware.svg`,
  TOBACCO: `${PASTA}/tobacco.svg`,
};

function temCapaPropria(ramo: string): ramo is RamoComCapaPadrao {
  return Object.hasOwn(CAPA_DO_RAMO, ramo);
}

/** O endereço do ladrilho do ramo; o genérico para ramo ausente ou novo. */
export function capaPadraoDe(ramo: string | null | undefined): string {
  return ramo && temCapaPropria(ramo) ? CAPA_DO_RAMO[ramo] : CAPA_PADRAO_GENERICA;
}
