import type { MetadataRoute } from "next";

import { ROTAS_LEGAIS } from "../features/legal/contato.ts";
import { enderecoDoSite } from "../server/endereco-do-site.ts";

/** Páginas públicas fixas do site (as lojas têm o próprio mapa em /loja/{apelido}/sitemap.xml). */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = enderecoDoSite().replace(/\/+$/, "");
  const fixas = ["/", "/explorar", "/vender"];
  return [...fixas, ...ROTAS_LEGAIS.map((item) => item.rota)].map((rota) => ({
    url: `${base}${rota === "/" ? "" : rota}`,
    changeFrequency: rota === "/" || rota === "/explorar" ? "daily" : "yearly",
  }));
}
