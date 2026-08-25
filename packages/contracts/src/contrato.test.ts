import { describe, expect, it } from "vitest";
import {
  CODIGO_NAO_ENCONTRADO,
  ERROS_DE_TODA_ROTA,
  ESQUEMAS_DO_CONTRATO,
  ETIQUETAS_DO_CONTRATO,
  ROTAS_DO_CONTRATO,
  esquemaDeErro,
  esquemaDeIdentificacaoDaApi,
  rotaDeIdentificacao,
} from "./index.ts";

describe("contrato compartilhado", () => {
  it("@spec:AC-006 declara só as rotas que a API serve hoje", () => {
    // Contrato de domínio que ainda não existe não entra: documento que promete
    // rota inexistente faz o aplicativo nativo nascer chamando o vazio.
    expect(
      ROTAS_DO_CONTRATO.map(
        (rota) => `${rota.metodo} ${rota.caminhoDoDocumento}`,
      ),
    ).toEqual([
      "get /",
      "get /v1/vitrine/{apelido}",
      "get /v1/vitrine/{apelido}/catalogo",
      "get /v1/vitrine/{apelido}/produto/{produtoId}",
    ]);
  });

  it("@spec:AC-006 o sinal de vida tem uma forma só, e ela é estrita", () => {
    expect(
      esquemaDeIdentificacaoDaApi.parse({
        servico: "simpleclick-api",
        status: "viva",
      }),
    ).toEqual({ servico: "simpleclick-api", status: "viva" });

    // Campo a mais é divergência entre o que a API devolve e o que o contrato
    // promete — e divergência silenciosa é o que esta tarefa existe para
    // impedir.
    expect(
      esquemaDeIdentificacaoDaApi.safeParse({
        servico: "simpleclick-api",
        status: "viva",
        versaoInterna: "3",
      }).success,
    ).toBe(false);

    expect(
      esquemaDeIdentificacaoDaApi.safeParse({
        servico: "simpleclick-api",
        status: "morta",
      }).success,
    ).toBe(false);
  });

  it("@spec:AC-006 o erro tem código de máquina, e recusa código fora do formato", () => {
    expect(esquemaDeErro.parse({ erro: CODIGO_NAO_ENCONTRADO })).toEqual({
      erro: CODIGO_NAO_ENCONTRADO,
    });
    expect(
      esquemaDeErro.parse({
        erro: "limite_excedido",
        mensagem: "tente de novo em um minuto",
        referencia: "ref-7f3a",
      }).referencia,
    ).toBe("ref-7f3a");

    // Cliente nativo faz `switch` em cima do código: espaço e maiúscula
    // quebrariam o aplicativo, não o site.
    expect(esquemaDeErro.safeParse({ erro: "Não Encontrado" }).success).toBe(
      false,
    );
    // Detalhe interno não viaja no corpo de erro (AC-024, P-009).
    expect(
      esquemaDeErro.safeParse({
        erro: "falha",
        pilha: "at Object.<anonymous> (/app/src/db.ts:12)",
      }).success,
    ).toBe(false);
  });

  it("@spec:AC-007 toda rota do catálogo tem etiqueta descrita e resposta declarada", () => {
    for (const rota of ROTAS_DO_CONTRATO) {
      expect(ETIQUETAS_DO_CONTRATO[rota.etiqueta]).toBeTypeOf("string");
      expect(rota.resposta).toBeDefined();
      expect(rota.resumo.length).toBeGreaterThan(0);
    }
    expect(ERROS_DE_TODA_ROTA).toContain(404);
  });

  it("@spec:AC-007 os esquemas publicados com nome são os mesmos objetos usados pelas rotas", () => {
    // Se fossem cópias, o documento descreveria uma coisa e a validação faria
    // outra — as duas verdades que a decisão de 17/08 existe para evitar.
    expect(ESQUEMAS_DO_CONTRATO["IdentificacaoDaApi"]).toBe(
      esquemaDeIdentificacaoDaApi,
    );
    expect(ESQUEMAS_DO_CONTRATO["Erro"]).toBe(esquemaDeErro);
    expect(ROTAS_DO_CONTRATO[0]?.resposta).toBe(rotaDeIdentificacao.resposta);
  });
});
