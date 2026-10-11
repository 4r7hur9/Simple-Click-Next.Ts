import { z } from "zod";

/** Composição pública do preset, já com nomes camelCase. */
export const esquemaDeComposicaoDoRamo = z.strictObject({
  cadastroProduto: z.array(z.string()),
  detalheProduto: z.array(z.string()),
  vitrine: z.array(z.string()),
});
