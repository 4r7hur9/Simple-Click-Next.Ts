import { TemaDaLoja, PALETA_CLARA } from "@simpleclick/ui";

import { BannersPromocionais } from "../../../../features/vitrine/BannersPromocionais.tsx";
import { BANNERS_DE_DEMONSTRACAO } from "../../../../features/vitrine/banners-de-demonstracao.ts";

/**
 * Página `/ui/catalogo`: as peças novas do cardápio com dados de exemplo —
 * os banners promocionais (3, 1 e nenhum) e a sacola flutuante arrastável —,
 * para conferir sem depender do cadastro de banners nem da API do carrinho.
 *
 * No cardápio de verdade, `?banners=demo` mostra os mesmos banners, só fora de
 * produção.
 */
export default function PreviaDoCatalogo() {
  return (
    <TemaDaLoja
      corPrincipal={PALETA_CLARA.primaria}
      className="sc-pagina-da-loja"
    >
      <main className="sc-vitrine">
        <h1 className="sc-vitrine__secao-nome">Prévia do catálogo</h1>

        <h2>Três banners (giram a cada 5 s)</h2>
        <BannersPromocionais banners={BANNERS_DE_DEMONSTRACAO} />

        <h2>Um banner (parado, sem pontos nem setas)</h2>
        <BannersPromocionais banners={BANNERS_DE_DEMONSTRACAO.slice(1, 2)} />

        <h2>Nenhum banner (a seção não aparece)</h2>
        <BannersPromocionais banners={[]} />

        <div style={{ blockSize: "120vh" }} />
      </main>
    </TemaDaLoja>
  );
}
