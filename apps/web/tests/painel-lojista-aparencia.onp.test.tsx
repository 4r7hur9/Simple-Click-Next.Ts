// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  PASTAS_DO_PAINEL,
  arquivos,
  ler,
} from "./apoio-painel-lojista.ts";

/** Onde a cor de destaque da LOJA pode aparecer: só dentro das prévias. */
const PREVIAS = [/PreviaDaLojaReal\.tsx$/, /PreviaNoFeed\.tsx$/, /SeletorDeCor\.tsx$/];

describe("painel · aparência e prévia", () => {
  it("[CA-1] @spec:AC-11229 a cor da loja (--cor-marca) só existe nas prévias", () => {
    const fora = PASTAS_DO_PAINEL.flatMap((p) =>
      arquivos(p, [".tsx", ".ts", ".css"]),
    ).filter(
      (f) =>
        !PREVIAS.some((r) => r.test(f)) && /var\(--cor-(sobre-)?marca/.test(ler(f)),
    );
    expect(fora).toEqual([]);
  });
});
