/**
 * Composição pública do ramo da loja: quais blocos cada tela mostra (cadastro
 * e detalhe do produto, vitrine). A vitrine a entrega no campo `blocos`; a
 * leitura do JSON do banco mora em `@simpleclick/core` (`vertical.ts`).
 */

import { z } from "zod";

/** Composição pública do preset, já com nomes camelCase. */
export const esquemaDeComposicaoDoRamo = z.strictObject({
  cadastroProduto: z.array(z.string()),
  detalheProduto: z.array(z.string()),
  vitrine: z.array(z.string()),
});
