import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  definirRota,
  ErroDeDefinicaoDeRota,
  ErroDeValidacaoDoContrato,
  montarCatalogo,
  type RotaDoContrato,
} from "./rota.ts";

/** Rota de mentira, com as três partes de entrada, usada nos casos abaixo. */
function rotaDeExemplo() {
  return definirRota({
    metodo: "post",
    caminho: "/v1/lojas/:apelido/pedidos",
    etiqueta: "exemplo",
    resumo: "Cria pedido de mentira",
    parametros: z.object({ apelido: z.string().min(1) }),
    consulta: z.object({ pagina: z.coerce.number().int().min(1).optional() }),
    corpo: z.object({ totalEmCentavos: z.number().int().nonnegative() }),
    resposta: z.object({ id: z.string() }),
    status: 201,
    errosPossiveis: [409],
  });
}

describe("definição de rota do contrato", () => {
  it("@spec:AC-006 a mesma definição valida a entrada e descreve a rota — uma fonte, dois usos", () => {
    const rota = rotaDeExemplo();

    // Uso 1: validar em execução.
    const validada = rota.validar({
      parametros: { apelido: "pizzaria-do-ze" },
      consulta: { pagina: "2" },
      corpo: { totalEmCentavos: 4990 },
    });
    expect(validada.parametros).toEqual({ apelido: "pizzaria-do-ze" });
    // A consulta chega como texto na requisição e sai como número: é o esquema
    // que converte, não o controlador.
    expect(validada.consulta).toEqual({ pagina: 2 });
    expect(validada.corpo).toEqual({ totalEmCentavos: 4990 });

    // Uso 2: descrever para o documento — a partir da MESMA definição.
    expect(rota.caminhoDoDocumento).toBe("/v1/lojas/{apelido}/pedidos");
    expect(rota.identificador).toBe("post_v1_lojas_por_apelido_pedidos");
    expect(rota.nomesDosParametros).toEqual(["apelido"]);
    expect(rota.status).toBe(201);
    expect(rota.errosPossiveis).toEqual([409]);
    // O esquema descrito é o mesmo objeto usado na validação: não há segunda
    // cópia para envelhecer.
    expect(rota.corpo?.safeParse({ totalEmCentavos: -1 }).success).toBe(false);
  });

  it("@spec:AC-006 recusa a entrada nomeando cada campo reprovado, em cada parte da requisição", () => {
    const rota = rotaDeExemplo();

    let capturado: unknown;
    try {
      rota.validar({
        parametros: { apelido: "" },
        consulta: { pagina: "zero" },
        corpo: { totalEmCentavos: 12.5 },
      });
    } catch (erro) {
      capturado = erro;
    }

    expect(capturado).toBeInstanceOf(ErroDeValidacaoDoContrato);
    const erro = capturado as ErroDeValidacaoDoContrato;
    expect(erro.problemas.map((p) => `${p.parte}.${p.campo}`)).toEqual([
      "parametros.apelido",
      "consulta.pagina",
      "corpo.totalEmCentavos",
    ]);
    // Sem o nome do campo na mensagem, quem recebe o 400 não sabe o que
    // corrigir — e a borda de validação vira um "não" sem explicação.
    expect(erro.message).toContain("corpo.totalEmCentavos");
  });

  it("recusa caminho com parâmetro que a rota não declara — entrada sem validação é falha de segurança", () => {
    expect(() =>
      definirRota({
        metodo: "get",
        caminho: "/v1/lojas/:apelido",
        etiqueta: "exemplo",
        resumo: "Sem esquema de parâmetro",
        resposta: z.object({ ok: z.boolean() }),
      }),
    ).toThrow(ErroDeDefinicaoDeRota);
  });

  it("recusa esquema de parâmetro que o caminho não tem, dizendo qual sobra", () => {
    expect(() =>
      definirRota({
        metodo: "get",
        caminho: "/v1/lojas/:apelido",
        etiqueta: "exemplo",
        resumo: "Parâmetro a mais",
        parametros: z.object({ apelido: z.string(), pagina: z.string() }),
        resposta: z.object({ ok: z.boolean() }),
      }),
    ).toThrow(/sem caminho: pagina/);
  });

  it("recusa corpo em GET: o que a rota recebe vai no caminho ou na consulta", () => {
    expect(() =>
      definirRota({
        metodo: "get",
        caminho: "/v1/lojas",
        etiqueta: "exemplo",
        resumo: "GET com corpo",
        corpo: z.object({ filtro: z.string() }),
        resposta: z.object({ ok: z.boolean() }),
      }),
    ).toThrow(ErroDeDefinicaoDeRota);
  });

  it("recusa caminho sem barra no começo e caminho com barra sobrando no fim", () => {
    const base = {
      metodo: "get",
      etiqueta: "exemplo",
      resumo: "Caminho torto",
      resposta: z.object({ ok: z.boolean() }),
    } as const;

    expect(() => definirRota({ ...base, caminho: "v1/lojas" })).toThrow(
      ErroDeDefinicaoDeRota,
    );
    expect(() => definirRota({ ...base, caminho: "/v1/lojas/" })).toThrow(
      ErroDeDefinicaoDeRota,
    );
  });

  it("a rota declarada é imutável: ninguém troca o esquema depois de carregada", () => {
    const rota = rotaDeExemplo();

    expect(Object.isFrozen(rota)).toBe(true);
    expect(() => {
      (rota as { caminho: string }).caminho = "/outro";
    }).toThrow();
  });
});

describe("catálogo de rotas", () => {
  const criar = (metodo: "get" | "post", caminho: string): RotaDoContrato =>
    definirRota({
      metodo,
      caminho,
      etiqueta: "exemplo",
      resumo: `${metodo} ${caminho}`,
      resposta: z.object({ ok: z.boolean() }),
    });

  it("@spec:AC-007 ordena as rotas para o documento sair igual em qualquer máquina", () => {
    const catalogo = montarCatalogo([
      criar("get", "/v1/zebra"),
      criar("post", "/v1/alface"),
      criar("get", "/v1/alface"),
    ]);

    // Se a ordem viesse da ordem dos `import`, o portão acusaria diferença que
    // ninguém escreveu — e a etapa de contrato viraria ruído.
    expect(
      catalogo.map((rota) => `${rota.metodo} ${rota.caminhoDoDocumento}`),
    ).toEqual(["get /v1/alface", "post /v1/alface", "get /v1/zebra"]);
  });

  it("recusa a mesma rota declarada duas vezes", () => {
    expect(() =>
      montarCatalogo([criar("get", "/v1/alface"), criar("get", "/v1/alface")]),
    ).toThrow(/duas vezes/);
  });
});
