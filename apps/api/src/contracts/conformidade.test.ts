import { describe, expect, it } from "vitest";
import request from "supertest";
import {
  CODIGO_NAO_ENCONTRADO,
  esquemaDeErro,
  esquemaDeIdentificacaoDaApi,
  rotaDeIdentificacao,
} from "@simpleclick/contracts";
import { criarApp } from "../app.ts";

/**
 * O contrato só vale se descrever a API de verdade.
 *
 * Sem esta conferência, `packages/contracts` viraria documentação: alguém
 * mudaria a resposta em `app.ts`, o documento continuaria bonito e o
 * aplicativo nativo quebraria na loja do cliente. Aqui a API é chamada de
 * verdade e a resposta é conferida pelo MESMO esquema que gera o documento.
 */
describe("a API responde o que o contrato promete", () => {
  it("@spec:AC-006 a resposta da raiz passa pelo esquema do contrato, sem campo a mais", async () => {
    const resposta = await request(criarApp()).get(rotaDeIdentificacao.caminho);

    expect(resposta.status).toBe(rotaDeIdentificacao.status);
    // `parse` estrito: campo a mais na resposta reprova aqui, que é o único
    // lugar onde a divergência aparece antes de chegar ao cliente.
    expect(() =>
      esquemaDeIdentificacaoDaApi.parse(resposta.body),
    ).not.toThrow();
  });

  it("@spec:AC-006 a resposta de endereço desconhecido passa pelo esquema de erro do contrato", async () => {
    const resposta = await request(criarApp()).get("/v1/rota-que-nao-existe");

    expect(resposta.status).toBe(404);
    expect(esquemaDeErro.parse(resposta.body)).toEqual({
      erro: CODIGO_NAO_ENCONTRADO,
    });
  });
});
