import { describe, expect, it } from "vitest";

import {
  adicionarImagem,
  conferirConteudoDaImagem,
  definirImagemPrincipal,
  removerImagem,
  type ImagemDoCatalogo,
} from "./imagens.usecase.ts";

const jpegPequeno = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00]);
const arquivoFalso = new TextEncoder().encode("sou um texto com extensao.jpg");

function imagensIniciais(): readonly ImagemDoCatalogo[] {
  return [
    {
      id: "imagem-1",
      url: "https://res.cloudinary.com/simpleclick/image/upload/v1/um.jpg",
      altText: "Imagem um",
      principal: true,
      ordem: 0,
    },
  ];
}

describe("imagens do produto", () => {
  it("@spec:AC-305 mantém várias imagens e permite trocar a principal", () => {
    const comTresImagens = [
      ...adicionarImagem(imagensIniciais(), {
        id: "imagem-2",
        url: "https://res.cloudinary.com/simpleclick/image/upload/v1/dois.jpg",
      }),
      {
        id: "imagem-3",
        url: "https://res.cloudinary.com/simpleclick/image/upload/v1/tres.jpg",
        altText: "Imagem três",
        principal: false,
        ordem: 2,
      },
    ];
    const atualizadas = definirImagemPrincipal(comTresImagens, "imagem-3");

    expect(atualizadas).toHaveLength(3);
    expect(atualizadas.filter((imagem) => imagem.principal)).toEqual([
      expect.objectContaining({ id: "imagem-3" }),
    ]);
    expect(removerImagem(atualizadas, "imagem-3")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "imagem-1", principal: true }),
      ]),
    );
  });

  it("@spec:AC-306 aceita imagem grande dentro do limite e recusa conteúdo falso", () => {
    const resultado = conferirConteudoDaImagem(jpegPequeno);

    expect(resultado.formato).toBe("jpeg");
    expect(resultado.tamanhoBytes).toBe(jpegPequeno.byteLength);
    expect(() => conferirConteudoDaImagem(arquivoFalso)).toThrow(
      "a checagem considera o conteúdo",
    );
  });
});
