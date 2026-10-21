/**
 * Banners de demonstração, para ver a faixa promocional funcionando antes de o
 * cadastro dos banners existir.
 *
 * SÓ EM DESENVOLVIMENTO: a página do cardápio usa esta lista com `?banners=demo`
 * fora de produção, e a prévia `/ui/banners` a usa sempre. As artes são SVG
 * próprios na paleta do SimpleClick (`public/banners-demo/`), uma larga para o
 * computador e outra para o celular em cada banner.
 */
import type { BannerNaTela } from "./BannersPromocionais.tsx";

export const BANNERS_DE_DEMONSTRACAO: readonly BannerNaTela[] = [
  {
    id: "demo-combo",
    imagemDesktop: "/banners-demo/combo-desktop.svg",
    imagemMobile: "/banners-demo/combo-mobile.svg",
    alt: "Combo da semana: pastel, refrigerante e sobremesa com 20% de desconto",
    titulo: "Combo da semana com 20% off",
    link: "?categoria=combos",
  },
  {
    id: "demo-entrega",
    imagemDesktop: "/banners-demo/entrega-desktop.svg",
    imagemMobile: "/banners-demo/entrega-mobile.svg",
    alt: "Entrega grátis nos pedidos acima de R$ 50",
    titulo: null,
    link: null,
  },
  {
    id: "demo-novidade",
    imagemDesktop: "/banners-demo/novidade-desktop.svg",
    imagemMobile: "/banners-demo/novidade-mobile.svg",
    alt: "Novidade da casa: conheça os sabores doces",
    titulo: "Novos sabores doces",
    link: "?categoria=pasteis-doces",
  },
];

/** O valor de `?banners=` que liga a demonstração. */
export const PARAMETRO_DOS_BANNERS_DE_DEMONSTRACAO = "demo";
