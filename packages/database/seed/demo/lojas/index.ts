/**
 * As lojas novas da demonstração (card #50): uma por tipo de negócio, todas
 * em Fortaleza/CE e arredores. Os dados moram um arquivo por grupo; aqui só
 * se juntam, na ordem em que a carga as planta.
 */

import type { LojaDemo } from "../dados.ts";
import { LOJAS_DE_COMIDA } from "./comida.ts";
import { LOJAS_DE_VAREJO_A } from "./varejo-a.ts";
import { LOJAS_DE_VAREJO_B } from "./varejo-b.ts";

export const LOJAS_NOVAS: readonly LojaDemo[] = [
  ...LOJAS_DE_COMIDA,
  ...LOJAS_DE_VAREJO_A,
  ...LOJAS_DE_VAREJO_B,
];
