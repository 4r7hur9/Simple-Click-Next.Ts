import { describe, expect, it } from "vitest";
import {
  CAMINHO_DA_IDENTIFICACAO,
  descreverIdentificacao,
  lerErroDaApi,
  lerIdentificacao,
  mensagemDoErro,
} from "../src/lib/api-contrato";
import {
  ENDERECO_PADRAO_DA_API,
  consultarIdentificacaoDaApi,
  enderecoDaApi,
} from "../src/server/api-client";

/** Resposta de mentira, no formato que o `fetch` devolve. */
function responder(corpo: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(corpo), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("leitura das respostas da API pelo contrato", () => {
  it("@spec:AC-006 o endereço consultado é o que o contrato declara, não um texto solto no site", () => {
    expect(CAMINHO_DA_IDENTIFICACAO).toBe("/");
    expect(enderecoDaApi()).toBe(ENDERECO_PADRAO_DA_API);
  });

  it("@spec:AC-006 lê o sinal de vida e monta a frase da tela a partir dos campos do contrato", () => {
    const leitura = lerIdentificacao({
      servico: "simpleclick-api",
      status: "viva",
    });

    expect(leitura.lida).toBe(true);
    if (!leitura.lida) return;
    expect(descreverIdentificacao(leitura.identificacao)).toBe(
      "simpleclick-api está viva",
    );
  });

  it("@spec:AC-006 recusa resposta fora do contrato dizendo qual campo reprovou", () => {
    const leitura = lerIdentificacao({ servico: "simpleclick-api" });

    expect(leitura.lida).toBe(false);
    if (leitura.lida) return;
    expect(leitura.motivo).toContain("status");
  });

  it("@spec:AC-006 lê o corpo de erro da API e monta a mensagem sem inventar detalhe interno", () => {
    const erro = lerErroDaApi({
      erro: "limite_excedido",
      mensagem: "tente de novo em um minuto",
      referencia: "ref-7f3a",
    });

    expect(erro).not.toBeNull();
    if (erro === null) return;
    expect(mensagemDoErro(erro)).toBe(
      "tente de novo em um minuto (referência ref-7f3a)",
    );
    expect(lerErroDaApi({ erro: "Não Encontrado" })).toBeNull();
  });
});

describe("porta de saída do site para a API", () => {
  it("@spec:AC-006 traduz o sinal de vida da API em estado de tela", async () => {
    const estado = await consultarIdentificacaoDaApi(
      responder({ servico: "simpleclick-api", status: "viva" }),
    );

    expect(estado).toEqual({
      estado: "no-ar",
      descricao: "simpleclick-api está viva",
    });
  });

  it("@spec:AC-006 API fora do ar vira estado de tela, e não exceção sem tratamento", async () => {
    const recusar = (async () => {
      throw new Error("conexão recusada");
    }) as unknown as typeof fetch;

    expect(await consultarIdentificacaoDaApi(recusar)).toEqual({
      estado: "indisponivel",
      motivo: "conexão recusada",
    });
  });

  it("@spec:AC-006 resposta fora do contrato não é exibida como se estivesse tudo bem", async () => {
    const estado = await consultarIdentificacaoDaApi(
      responder({ servico: "simpleclick-api", status: "morta" }),
    );

    expect(estado.estado).toBe("indisponivel");
  });

  it("@spec:AC-006 situação de erro da API não vira sinal de vida", async () => {
    const estado = await consultarIdentificacaoDaApi(
      responder({ erro: "falha_interna" }, 500),
    );

    expect(estado).toEqual({
      estado: "indisponivel",
      motivo: "a API respondeu 500",
    });
  });
});
