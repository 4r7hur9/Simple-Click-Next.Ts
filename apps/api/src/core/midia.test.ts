/**
 * Prova da porta de mídia (T-905: AC-916).
 *
 * O serviço de terceiro não é chamado: o `fetch` é trocado por um que anota o
 * envio. O que se prova é o que a API manda — assinado, na pasta da loja — e o
 * que ela aceita de volta. A credencial é montada em tempo de execução, e não
 * escrita no código (P-002).
 */
import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  armazenamentoDoAmbiente,
  armazenamentoNoCloudinary,
  assinarEnvio,
  credenciaisDoCloudinary,
  ErroDeArmazenamentoIndisponivel,
} from "./midia.ts";

const segredoDeTeste = randomBytes(12).toString("hex");
const chaveDeTeste = randomBytes(6).toString("hex");

describe("o serviço de mídia (AC-916)", () => {
  it("@spec:AC-916 a credencial vem do ambiente, no formato do serviço", () => {
    expect(
      credenciaisDoCloudinary(
        `cloudinary://${chaveDeTeste}:${segredoDeTeste}@minha-nuvem`,
      ),
    ).toEqual({
      nuvem: "minha-nuvem",
      chave: chaveDeTeste,
      segredo: segredoDeTeste,
    });
    expect(credenciaisDoCloudinary(undefined)).toBeNull();
    expect(() => credenciaisDoCloudinary("https://nuvem")).toThrow(
      /cloudinary:\/\//,
    );
  });

  it("@spec:AC-916 a imagem vai assinada, na pasta da loja, e volta com endereço https", async () => {
    const envios: { endereco: string; corpo: URLSearchParams }[] = [];
    const armazenamento = armazenamentoNoCloudinary(
      { nuvem: "minha-nuvem", chave: chaveDeTeste, segredo: segredoDeTeste },
      async (endereco, init) => {
        envios.push({
          endereco: String(endereco),
          corpo: init?.body as URLSearchParams,
        });
        return Response.json({
          secure_url: "https://res.exemplo.test/lojas/l1/logo.png",
        });
      },
      () => new Date(Date.UTC(2026, 8, 26, 12, 0, 0)),
    );

    const { url } = await armazenamento.guardar({
      lojaId: "l1",
      nome: "logo",
      bytes: Uint8Array.from([0x89, 0x50]),
      tipoDeConteudo: "image/png",
    });

    expect(url).toBe("https://res.exemplo.test/lojas/l1/logo.png");
    const envio = envios[0];
    expect(envio?.endereco).toBe(
      "https://api.cloudinary.com/v1_1/minha-nuvem/image/upload",
    );
    expect(envio?.corpo.get("folder")).toBe("lojas/l1");
    expect(envio?.corpo.get("file")).toBe("data:image/png;base64,iVA=");
    // O nome é único em cada envio: o mesmo nome no mesmo segundo reaproveitaria
    // o endereço, e o CDN entregaria a imagem de antes ("a troca não pegou").
    const publicId = envio?.corpo.get("public_id") ?? "";
    expect(publicId).toMatch(/^logo-1790424000-[0-9a-f]{8}$/);
    const esperada = createHash("sha1")
      .update(
        `folder=lojas/l1&public_id=${publicId}&timestamp=1790424000${segredoDeTeste}`,
      )
      .digest("hex");
    expect(envio?.corpo.get("signature")).toBe(esperada);
    expect(
      assinarEnvio(
        {
          timestamp: "1790424000",
          folder: "lojas/l1",
          public_id: publicId,
        },
        segredoDeTeste,
      ),
    ).toBe(esperada);
  });

  it("@spec:AC-916 dois envios no mesmo segundo ganham endereços diferentes", async () => {
    const nomes: string[] = [];
    const armazenamento = armazenamentoNoCloudinary(
      { nuvem: "minha-nuvem", chave: chaveDeTeste, segredo: segredoDeTeste },
      async (_endereco, init) => {
        nomes.push((init?.body as URLSearchParams).get("public_id") ?? "");
        return Response.json({ secure_url: "https://res.exemplo.test/x.png" });
      },
      () => new Date(Date.UTC(2026, 8, 26, 12, 0, 0)),
    );
    const envio = {
      lojaId: "l1",
      nome: "logo",
      bytes: Uint8Array.from([0x89, 0x50]),
      tipoDeConteudo: "image/png",
    };
    await armazenamento.guardar(envio);
    await armazenamento.guardar(envio);
    expect(new Set(nomes).size).toBe(2);
  });

  it("@spec:AC-916 sem credencial, o envio responde indisponível em vez de inventar endereço", async () => {
    const armazenamento = armazenamentoDoAmbiente({});
    await expect(
      armazenamento.guardar({
        lojaId: "l1",
        nome: "capa",
        bytes: new Uint8Array(1),
        tipoDeConteudo: "image/png",
      }),
    ).rejects.toBeInstanceOf(ErroDeArmazenamentoIndisponivel);
  });

  it("@spec:AC-916 resposta sem endereço https é recusada", async () => {
    const armazenamento = armazenamentoNoCloudinary(
      { nuvem: "n", chave: chaveDeTeste, segredo: segredoDeTeste },
      async () => Response.json({ secure_url: "http://sem-tls.test/x.png" }),
    );
    await expect(
      armazenamento.guardar({
        lojaId: "l1",
        nome: "logo",
        bytes: new Uint8Array(1),
        tipoDeConteudo: "image/png",
      }),
    ).rejects.toThrow(/https/);
  });
});
