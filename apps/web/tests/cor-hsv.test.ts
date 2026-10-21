import { describe, expect, it } from "vitest";

import { hexParaHsv, hsvParaHex, normalizarHex } from "../src/lib/cor-hsv.ts";

describe("conversões do seletor de cor", () => {
  it("normaliza hexadecimal com ou sem #, curto ou longo", () => {
    expect(normalizarHex("B7FF00")).toBe("#b7ff00");
    expect(normalizarHex("#f0a")).toBe("#ff00aa");
    expect(normalizarHex("#12")).toBeNull();
    expect(normalizarHex("#gggggg")).toBeNull();
  });

  it("vai e volta sem perder a cor", () => {
    for (const hex of [
      "#b7ff00",
      "#ff0000",
      "#00ff00",
      "#0000ff",
      "#ffffff",
      "#000000",
      "#4da3ff",
      "#1a237e",
      "#808080",
    ]) {
      expect(hsvParaHex(hexParaHsv(hex))).toBe(hex);
    }
  });

  it("o quadro: canto de cima à direita é o matiz puro; embaixo é preto", () => {
    expect(hsvParaHex({ h: 120, s: 1, v: 1 })).toBe("#00ff00");
    expect(hsvParaHex({ h: 120, s: 0, v: 1 })).toBe("#ffffff");
    expect(hsvParaHex({ h: 120, s: 1, v: 0 })).toBe("#000000");
  });
});
