import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  assinaturaDoEnvio,
  ErroDeHospedagemIndisponivel,
  ErroDeHospedagemRecusada,
  hospedagemNoCloudinary,
} from "./hospedagem-de-imagem.ts";

/** Credencial de mentira, montada em execução: nada aqui abre conta real. */
const AMBIENTE = {
  CLOUDINARY_CLOUD_NAME: "nuvem-da-prova",
  CLOUDINARY_API_KEY: ["chave", "da", "prova"].join("-"),
  CLOUDINARY_API_SECRET: ["segredo", "da", "prova"].join("-"),
};

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const AGORA = new Date("2026-09-26T12:00:00.000Z");

describe("hospedagem da foto do produto (AC-306)", () => {
  it("@spec:AC-306 envia os bytes assinados, sem o segredo, e devolve o endereço servido pelo CDN", async () => {
    const enviados: { endereco: string; corpo: FormData }[] = [];
    const hospedar = hospedagemNoCloudinary(
      AMBIENTE,
      async (endereco, pedido) => {
        enviados.push({ endereco, corpo: pedido.body });
        return Response.json({
          secure_url:
            "https://res.cloudinary.com/nuvem-da-prova/image/upload/v1/foto.jpg",
          width: 4000,
          height: 3000,
        });
      },
      () => AGORA,
    );

    const hospedada = await hospedar({
      bytes: JPEG,
      formato: "jpeg",
      lojaId: "loja-1",
      produtoId: "produto-1",
    });

    expect(hospedada).toEqual({
      url: "https://res.cloudinary.com/nuvem-da-prova/image/upload/v1/foto.jpg",
      largura: 4000,
      altura: 3000,
    });
    const [envio] = enviados;
    expect(envio?.endereco).toBe(
      "https://api.cloudinary.com/v1_1/nuvem-da-prova/image/upload",
    );
    const timestamp = String(AGORA.getTime() / 1000);
    expect(envio?.corpo.get("folder")).toBe("simpleclick/loja-1");
    expect(envio?.corpo.get("timestamp")).toBe(timestamp);
    expect(envio?.corpo.get("signature")).toBe(
      createHash("sha1")
        .update(
          `folder=simpleclick/loja-1&timestamp=${timestamp}${AMBIENTE.CLOUDINARY_API_SECRET}`,
        )
        .digest("hex"),
    );
    // O segredo assina, mas não viaja.
    for (const [, valor] of envio?.corpo.entries() ?? []) {
      expect(String(valor)).not.toContain(AMBIENTE.CLOUDINARY_API_SECRET);
    }
    const arquivo = envio?.corpo.get("file") as Blob;
    expect(new Uint8Array(await arquivo.arrayBuffer())).toEqual(JPEG);
  });

  it("@spec:AC-306 sem credencial de mídia, recusa com erro próprio em vez de fingir que guardou", async () => {
    const hospedar = hospedagemNoCloudinary({}, async () => {
      throw new Error("não deveria enviar nada");
    });
    await expect(
      hospedar({ bytes: JPEG, formato: "jpeg", lojaId: "l", produtoId: "p" }),
    ).rejects.toBeInstanceOf(ErroDeHospedagemIndisponivel);
  });

  it("@spec:AC-306 a recusa da hospedagem chega com o motivo dela", async () => {
    const hospedar = hospedagemNoCloudinary(AMBIENTE, async () =>
      Response.json(
        { error: { message: "Invalid image file" } },
        { status: 400 },
      ),
    );
    await expect(
      hospedar({ bytes: JPEG, formato: "jpeg", lojaId: "l", produtoId: "p" }),
    ).rejects.toThrow(new ErroDeHospedagemRecusada("Invalid image file"));
  });

  it("assina os parâmetros em ordem alfabética", () => {
    expect(assinaturaDoEnvio({ timestamp: "2", folder: "a" }, "s")).toBe(
      createHash("sha1").update("folder=a&timestamp=2s").digest("hex"),
    );
  });
});
