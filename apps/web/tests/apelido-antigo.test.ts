/**
 * O link antigo da loja leva ao endereço novo (AC-208).
 *
 * A troca e o registro do apelido antigo estão provados contra o banco em
 * `apps/api/tests/admin-apelido.test.ts`, junto com a rota que diz qual é o
 * apelido atual. Aqui se prova a outra metade: o site, ao receber o link
 * antigo, manda a pessoa ao MESMO lugar no endereço novo — com o resto do
 * caminho e a consulta —, e segue como veio quando o apelido é o atual ou
 * quando a API não responde.
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import {
  apelidoDoCaminho,
  caminhoComApelidoNovo,
  hostComApelidoNovo,
  LembrancaDeApelidos,
} from "../src/lib/apelido-antigo.ts";
import {
  buscarApelidoAtual,
  redirecionarApelidoAntigo,
} from "../src/server/apelido-antigo.ts";

function requisicao(endereco: string, host?: string): NextRequest {
  return new NextRequest(
    endereco,
    host === undefined ? undefined : { headers: { host } },
  );
}

describe("o endereço antigo da loja (AC-208)", () => {
  it("@spec:AC-208 o link antigo vai ao mesmo lugar no endereço novo, com o resto do caminho e a consulta", async () => {
    const consultar = vi.fn(async (apelido: string) =>
      apelido === "pastel-da-joi" ? "pastelaria-joi" : null,
    );

    const resposta = await redirecionarApelidoAntigo(
      requisicao("https://simpleclick.app/l/pastel-da-joi/produto/42?de=zap"),
      consultar,
      new LembrancaDeApelidos(),
    );

    expect(resposta?.status).toBe(307);
    expect(resposta?.headers.get("location")).toBe(
      "https://simpleclick.app/l/pastelaria-joi/produto/42?de=zap",
    );
    expect(consultar).toHaveBeenCalledWith("pastel-da-joi");
  });

  it("@spec:AC-208 o endereço novo e o de loja qualquer seguem como vieram, e a resposta é lembrada por um minuto", async () => {
    const consultar = vi.fn(async () => null);
    const lembranca = new LembrancaDeApelidos(60_000);
    let agora = 1_000;

    for (let vez = 0; vez < 3; vez += 1) {
      const resposta = await redirecionarApelidoAntigo(
        requisicao("https://simpleclick.app/l/pastelaria-joi/catalogo"),
        consultar,
        lembranca,
        () => agora,
      );
      expect(resposta).toBeNull();
    }
    // Uma pergunta à API para três visitas no mesmo minuto.
    expect(consultar).toHaveBeenCalledTimes(1);

    agora += 60_001;
    await redirecionarApelidoAntigo(
      requisicao("https://simpleclick.app/l/pastelaria-joi"),
      consultar,
      lembranca,
      () => agora,
    );
    expect(consultar).toHaveBeenCalledTimes(2);
  });

  it("@spec:AC-208 API fora do ar não trava a loja nem vira lembrança", async () => {
    const consultar = vi.fn(async () => undefined);
    const lembranca = new LembrancaDeApelidos();

    expect(
      await redirecionarApelidoAntigo(
        requisicao("https://simpleclick.app/l/pastel-da-joi"),
        consultar,
        lembranca,
      ),
    ).toBeNull();
    expect(lembranca.consultar("pastel-da-joi", Date.now())).toBeUndefined();

    // A rede falhando também vira "não deu para saber".
    const semRede = vi.fn(async () => {
      throw new Error("sem rede");
    }) as unknown as typeof fetch;
    expect(await buscarApelidoAtual("pastel-da-joi", semRede)).toBeUndefined();
  });

  it("@spec:AC-208 a pergunta vai à rota do endereço atual, e 404 quer dizer que o apelido não é antigo de loja no ar", async () => {
    const chamadas: string[] = [];
    const buscar = (async (endereco: RequestInfo | URL) => {
      chamadas.push(String(endereco));
      return String(endereco).includes("pastel-da-joi")
        ? Response.json({ apelido: "pastelaria-joi" })
        : Response.json({ erro: "nao_encontrado" }, { status: 404 });
    }) as typeof fetch;

    expect(await buscarApelidoAtual("pastel-da-joi", buscar)).toBe(
      "pastelaria-joi",
    );
    expect(await buscarApelidoAtual("qualquer-uma", buscar)).toBeNull();
    expect(chamadas[0]).toMatch(
      /\/v1\/vitrine\/pastel-da-joi\/endereco-atual$/,
    );
  });

  it("@spec:AC-208 o apelido também é trocado quando vem no endereço da loja, e as rotas internas do site ficam de fora", async () => {
    const consultar = vi.fn(async () => "pastelaria-joi");
    const pelaLoja = await redirecionarApelidoAntigo(
      requisicao(
        "https://pastel-da-joi.simpleclick.app/catalogo",
        "pastel-da-joi.simpleclick.app",
      ),
      consultar,
      new LembrancaDeApelidos(),
    );
    expect(pelaLoja?.headers.get("location")).toBe(
      "https://pastelaria-joi.simpleclick.app/catalogo",
    );

    const interna = await redirecionarApelidoAntigo(
      requisicao("https://simpleclick.app/api/loja/pagamento"),
      consultar,
      new LembrancaDeApelidos(),
    );
    expect(interna).toBeNull();

    expect(apelidoDoCaminho("/l/Pastel-Da-Joi/sobre")).toBe("pastel-da-joi");
    expect(apelidoDoCaminho("/painel")).toBeNull();
    expect(
      caminhoComApelidoNovo("/l/pastel-da-joi", "pastel-da-joi", "novo"),
    ).toBe("/l/novo");
    expect(
      hostComApelidoNovo(
        "pastel-da-joi.simpleclick.app",
        "pastel-da-joi",
        "novo",
      ),
    ).toBe("novo.simpleclick.app");
  });
});
