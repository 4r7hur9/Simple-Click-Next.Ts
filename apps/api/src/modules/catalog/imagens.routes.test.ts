import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { AcessoAoBanco } from "../../core/db.ts";
import { criarRotasDasImagens } from "./imagens.routes.ts";
import { TAMANHO_MAXIMO_DA_IMAGEM_EM_BYTES } from "./imagens.usecase.ts";

/**
 * A porta do arquivo recusa o que não é imagem ANTES de tudo (AC-306).
 *
 * Esta prova roda sem banco de propósito: o acesso ao banco e a hospedagem
 * são dublês que falham se forem tocados. Se a recusa passar a acontecer
 * depois de resolver a loja ou de enviar à hospedagem, este teste quebra —
 * que é o que protege a cota de mídia e a resposta rápida ao dono.
 */
function montar() {
  const acesso = {
    emTransacao: () => {
      throw new Error("o banco não deveria ser consultado");
    },
  } as unknown as AcessoAoBanco;
  const hospedar = vi.fn(async () => {
    throw new Error("a hospedagem não deveria ser chamada");
  });
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(
    "/v1/lojas",
    criarRotasDasImagens({
      acesso,
      autenticar: () => ({ identidadeId: "dono", papel: "OWNER" }),
      resolverLoja: async () => ({ encontrada: false }),
      hospedar,
    }),
  );
  return { app, hospedar };
}

const ENDERECO =
  "/v1/lojas/loja/catalogo/produtos/7f1c2a9e-4b5d-4c3e-9f10-1a2b3c4d5e6f/imagens/arquivo";

describe("envio do arquivo da foto (AC-306)", () => {
  it("@spec:AC-306 texto com nome e tipo de imagem é recusado pelo conteúdo, com aviso claro", async () => {
    const { app, hospedar } = montar();

    const resposta = await request(app)
      .post(ENDERECO)
      .set("content-type", "image/jpeg")
      .set("x-nome-do-arquivo", "foto.jpg")
      .send(Buffer.from("sou um texto com extensao .jpg"));

    expect(resposta.status).toBe(400);
    expect(resposta.body).toEqual({
      erro: "imagem_invalida",
      mensagem:
        "O arquivo enviado não é uma imagem válida; a checagem considera o conteúdo, não a extensão.",
    });
    expect(hospedar).not.toHaveBeenCalled();
  });

  it("@spec:AC-306 arquivo acima de 10 MB é recusado com o limite explicado", async () => {
    const { app, hospedar } = montar();
    const grande = Buffer.alloc(TAMANHO_MAXIMO_DA_IMAGEM_EM_BYTES + 1);
    grande.set([0xff, 0xd8, 0xff, 0xe0]);

    const resposta = await request(app)
      .post(ENDERECO)
      .set("content-type", "image/jpeg")
      .send(grande);

    expect(resposta.status).toBe(413);
    expect(resposta.body).toMatchObject({ erro: "imagem_grande_demais" });
    expect(String(resposta.body.mensagem)).toContain("10 MB");
    expect(hospedar).not.toHaveBeenCalled();
  });

  it("@spec:AC-306 arquivo vazio também é recusado antes de qualquer envio", async () => {
    const { app, hospedar } = montar();

    const resposta = await request(app)
      .post(ENDERECO)
      .set("content-type", "application/octet-stream")
      .send(Buffer.alloc(0));

    expect(resposta.status).toBe(400);
    expect(resposta.body).toMatchObject({ erro: "imagem_invalida" });
    expect(hospedar).not.toHaveBeenCalled();
  });
});
