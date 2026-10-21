/**
 * Conversões de cor do seletor da aparência da loja: hexadecimal ⇄ HSV.
 *
 * O quadro do seletor é saturação (esquerda → direita) por brilho (baixo →
 * cima) para UM matiz; por isso o seletor pensa em HSV e só fala hexadecimal
 * com o resto do sistema.
 */

export interface Hsv {
  /** Matiz, de 0 a 360. */
  readonly h: number;
  /** Saturação, de 0 a 1. */
  readonly s: number;
  /** Brilho, de 0 a 1. */
  readonly v: number;
}

const entre = (valor: number, minimo: number, maximo: number): number =>
  Math.min(maximo, Math.max(minimo, valor));

/** Aceita `#rgb`, `#rrggbb`, com ou sem `#`; devolve `#rrggbb` minúsculo ou nulo. */
export function normalizarHex(texto: string): string | null {
  const limpo = texto.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(limpo)) {
    return `#${[...limpo].map((letra) => letra + letra).join("")}`;
  }
  return /^[0-9a-f]{6}$/.test(limpo) ? `#${limpo}` : null;
}

export function hexParaHsv(hex: string): Hsv {
  const normal = normalizarHex(hex);
  // Texto que não é cor vira o canto escuro do quadro.
  if (normal === null) return { h: 0, s: 0, v: 0 };
  const r = Number.parseInt(normal.slice(1, 3), 16) / 255;
  const g = Number.parseInt(normal.slice(3, 5), 16) / 255;
  const b = Number.parseInt(normal.slice(5, 7), 16) / 255;
  const maximo = Math.max(r, g, b);
  const minimo = Math.min(r, g, b);
  const delta = maximo - minimo;

  let h = 0;
  if (delta !== 0) {
    if (maximo === r) h = ((g - b) / delta) % 6;
    else if (maximo === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: maximo === 0 ? 0 : delta / maximo, v: maximo };
}

export function hsvParaHex({ h, s, v }: Hsv): string {
  const matiz = ((h % 360) + 360) % 360;
  const sat = entre(s, 0, 1);
  const brilho = entre(v, 0, 1);
  const c = brilho * sat;
  const x = c * (1 - Math.abs(((matiz / 60) % 2) - 1));
  const m = brilho - c;

  let rgb: [number, number, number];
  if (matiz < 60) rgb = [c, x, 0];
  else if (matiz < 120) rgb = [x, c, 0];
  else if (matiz < 180) rgb = [0, c, x];
  else if (matiz < 240) rgb = [0, x, c];
  else if (matiz < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  return `#${rgb
    .map((canal) =>
      Math.round((canal + m) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
