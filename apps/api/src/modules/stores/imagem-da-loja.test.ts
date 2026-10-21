/**
 * Prova da conferência da logo e da capa pelos bytes (T-905: AC-918).
 */
import { describe, expect, it } from "vitest";

import { conferirImagemDaLoja, formatoPelosBytes } from "./imagem-da-loja.ts";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const WEBP = [
  ...new TextEncoder().encode("RIFF"),
  0,
  0,
  0,
  0,
  ...new TextEncoder().encode("WEBP"),
];

function arquivo(inicio: readonly number[], tamanho = 64): Uint8Array {
  const bytes = new Uint8Array(tamanho);
  bytes.set(inicio);
  return bytes;
}

describe("a imagem é conferida pelo conteúdo (AC-918)", () => {
  it("@spec:AC-918 JPEG, PNG e WebP são reconhecidos pela assinatura, e não pelo nome", () => {
    expect(formatoPelosBytes(arquivo(JPEG))).toBe("jpeg");
    expect(formatoPelosBytes(arquivo(PNG))).toBe("png");
    expect(formatoPelosBytes(arquivo(WEBP))).toBe("webp");
    expect(conferirImagemDaLoja("logo", arquivo(PNG))).toEqual({
      ok: true,
      formato: "png",
      tamanhoBytes: 64,
    });
  });

  it("@spec:AC-918 o que não é imagem é recusado com formatos, tamanho e proporção aceitos", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7 cardápio");
    const resultado = conferirImagemDaLoja("logo", pdf);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.motivo).toBe("NAO_E_IMAGEM");
    expect(resultado.orientacao).toEqual({
      formatosAceitos: ["JPEG", "PNG", "WebP"],
      tamanhoMaximoBytes: 1024 * 1024,
      tamanhoMaximo: "1 MB",
      proporcaoRecomendada: "quadrada (1:1), por exemplo 512 × 512 pixels",
    });
    expect(resultado.mensagem).toContain("JPEG, PNG, WebP");
    expect(resultado.mensagem).toContain("anterior continua no ar");
  });

  it("@spec:AC-918 imagem acima do tamanho é recusada, com o limite de cada uma", () => {
    const logo = conferirImagemDaLoja("logo", arquivo(PNG, 1024 * 1024 + 1));
    const capa = conferirImagemDaLoja(
      "capa",
      arquivo(PNG, 3 * 1024 * 1024 + 1),
    );
    const capaQueCabe = conferirImagemDaLoja(
      "capa",
      arquivo(PNG, 2 * 1024 * 1024),
    );

    expect(logo.ok ? null : logo.motivo).toBe("GRANDE_DEMAIS");
    expect(capa.ok ? null : capa.orientacao.proporcaoRecomendada).toMatch(
      /3:1/,
    );
    expect(capaQueCabe.ok).toBe(true);
  });

  it("@spec:AC-918 arquivo vazio é recusado", () => {
    const vazio = conferirImagemDaLoja("capa", new Uint8Array());
    expect(vazio.ok ? null : vazio.motivo).toBe("VAZIO");
  });
});

describe("as fotos do tema (fundo da vitrine e topo do cardápio)", () => {
  const ROTULOS = {
    fundo: ["A foto de fundo (computador)", "4:3"],
    fundoCelular: ["A foto de fundo (celular)", "9:20"],
    topo: ["A foto do topo (computador)", "4:1"],
    topoCelular: ["A foto do topo (celular)", "19:10"],
  } as const;

  it("aceitam até 3 MB; a recusa diz de qual foto se trata e a proporção dela", () => {
    for (const tipo of [
      "fundo",
      "fundoCelular",
      "topo",
      "topoCelular",
    ] as const) {
      expect(conferirImagemDaLoja(tipo, arquivo(JPEG))).toMatchObject({
        ok: true,
        formato: "jpeg",
      });
      const grande = conferirImagemDaLoja(
        tipo,
        arquivo(JPEG, 3 * 1024 * 1024 + 1),
      );
      expect(grande.ok).toBe(false);
      if (!grande.ok) {
        const [nome, proporcao] = ROTULOS[tipo];
        expect(grande.mensagem).toContain("3 MB");
        expect(grande.mensagem).toContain(proporcao);
        expect(grande.mensagem).toContain(nome);
      }
    }
  });
});

describe("o original da foto (card #36)", () => {
  it("aceita até 6 MB, em qualquer proporção, e a recusa diz que é o original", () => {
    expect(
      conferirImagemDaLoja("original", arquivo(PNG, 5 * 1024 * 1024)),
    ).toMatchObject({
      ok: true,
    });
    const grande = conferirImagemDaLoja(
      "original",
      arquivo(JPEG, 6 * 1024 * 1024 + 1),
    );
    expect(grande.ok).toBe(false);
    if (!grande.ok) {
      expect(grande.mensagem).toContain("6 MB");
      expect(grande.mensagem).toContain("A foto original");
    }
  });
});
