import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  apelidoDaAlteracao,
  avisarOSiteQuandoODonoAltera,
  type AvisarOSite,
} from "./aviso-ao-site.ts";
import type { AvisoDeMudanca } from "./cache.ts";

/**
 * Prova de que a alteração do dono AVISA O SITE antes de a resposta sair
 * (dívida 93, a outra metade de AC-028).
 *
 * O site guarda a vitrine por um minuto. Sem aviso, o dono salva, abre a
 * própria loja e vê a versão de antes — e conclui que o produto não funciona.
 * O aviso já existia (`criarAvisoDoSite`, T-015), mas nenhuma rota do painel o
 * chamava (dívida 43).
 *
 * As rotas daqui têm só o FORMATO das rotas do dono (`/:apelido/catalogo/...`,
 * `/:apelido/configuracao/...`): o que se prova é a regra do ponto único —
 * quais alterações avisam, quando, e que o aviso nunca derruba a alteração.
 */

const APELIDO = "pastelaria-da-vila";

/** Um avisador que anota cada aviso e responde depois de `esperaMs`. */
function avisadorQueAnota(esperaMs = 0) {
  const avisos: AvisoDeMudanca[] = [];
  let concluidos = 0;
  const avisar: AvisarOSite = async (aviso) => {
    avisos.push(aviso);
    await new Promise((pronto) => setTimeout(pronto, esperaMs));
    concluidos += 1;
    return "enviado";
  };
  return { avisar, avisos, concluidos: () => concluidos };
}

/** Rotas com o formato das do dono, atrás do ponto único de aviso. */
function montar(avisar: AvisarOSite): Express {
  const app = express();
  app.use(express.json());
  app.use("/v1/lojas", avisarOSiteQuandoODonoAltera(avisar));
  app.put("/v1/lojas/:apelido/configuracao/:secao", (_req, res) => {
    res.status(204).end();
  });
  app.patch("/v1/lojas/:apelido/catalogo/produtos/:id", (req, res) => {
    res.json({ id: req.params.id, nome: "Pastel de queijo especial" });
  });
  app.post("/v1/lojas/:apelido/catalogo/categorias", (_req, res) => {
    res.status(400).json({ erro: "corpo_invalido" });
  });
  app.get("/v1/lojas/:apelido/catalogo/produtos", (_req, res) => {
    res.json({ produtos: [] });
  });
  app.patch("/v1/lojas/:apelido/pedidos/:id/status", (_req, res) => {
    res.json({ status: "PREPARING" });
  });
  return app;
}

describe("a alteração do dono avisa o site (dívida 93)", () => {
  it("@spec:AC-028 alterar um produto avisa o site com o apelido da loja, e a resposta chega inteira", async () => {
    const { avisar, avisos } = avisadorQueAnota();

    const resposta = await request(montar(avisar))
      .patch(`/v1/lojas/${APELIDO}/catalogo/produtos/p1`)
      .send({ nome: "Pastel de queijo especial" });

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({
      id: "p1",
      nome: "Pastel de queijo especial",
    });
    expect(avisos).toEqual([{ apelido: APELIDO }]);
  });

  it("@spec:AC-028 salvar uma seção da configuração também avisa — horário e apresentação aparecem na vitrine", async () => {
    const { avisar, avisos } = avisadorQueAnota();

    const resposta = await request(montar(avisar))
      .put(`/v1/lojas/${APELIDO}/configuracao/horario`)
      .send({});

    expect(resposta.status).toBe(204);
    expect(avisos).toEqual([{ apelido: APELIDO }]);
  });

  it("@spec:AC-028 a resposta só sai depois do aviso: a próxima visita já encontra o site avisado", async () => {
    const { avisar, concluidos } = avisadorQueAnota(80);

    const resposta = await request(montar(avisar))
      .patch(`/v1/lojas/${APELIDO}/catalogo/produtos/p1`)
      .send({});

    // Se o aviso saísse depois da resposta, o dono que abre a loja logo em
    // seguida chegaria ao site ANTES do aviso — e veria a versão velha.
    expect(resposta.status).toBe(200);
    expect(concluidos()).toBe(1);
  });

  it("@spec:AC-028 alteração recusada não avisa: nada mudou na loja", async () => {
    const { avisar, avisos } = avisadorQueAnota();

    const recusada = await request(montar(avisar))
      .post(`/v1/lojas/${APELIDO}/catalogo/categorias`)
      .send({});

    expect(recusada.status).toBe(400);
    expect(avisos).toEqual([]);
  });

  it("@spec:AC-028 ler o painel não avisa, e mexer na fila de pedidos também não — a vitrine não mostra pedido", async () => {
    const { avisar, avisos } = avisadorQueAnota();
    const app = montar(avisar);

    await request(app).get(`/v1/lojas/${APELIDO}/catalogo/produtos`);
    await request(app)
      .patch(`/v1/lojas/${APELIDO}/pedidos/p1/status`)
      .send({ status: "PREPARING" });

    expect(avisos).toEqual([]);
  });

  it("@spec:AC-028 site fora do ar não derruba a alteração do dono", async () => {
    const avisar: AvisarOSite = () =>
      Promise.reject(new Error("site fora do ar"));

    const resposta = await request(montar(avisar))
      .patch(`/v1/lojas/${APELIDO}/catalogo/produtos/p1`)
      .send({});

    expect(resposta.status).toBe(200);
    expect(resposta.body.nome).toBe("Pastel de queijo especial");
  });
});

describe("quais alterações a vitrine mostra", () => {
  it("@spec:AC-028 catálogo e configuração da loja, por qualquer verbo que altera", () => {
    expect(apelidoDaAlteracao("POST", `/${APELIDO}/catalogo/produtos`)).toBe(
      APELIDO,
    );
    expect(
      apelidoDaAlteracao(
        "DELETE",
        `/${APELIDO}/catalogo/produtos/p1/imagens/i1`,
      ),
    ).toBe(APELIDO);
    expect(
      apelidoDaAlteracao("PUT", `/${APELIDO}/configuracao/aparencia`),
    ).toBe(APELIDO);
    expect(
      apelidoDaAlteracao(
        "POST",
        `/${APELIDO}/configuracao/aparencia/imagem/logo`,
      ),
    ).toBe(APELIDO);
  });

  it("@spec:AC-028 leitura, pedido e apelido fora do formato ficam de fora", () => {
    expect(apelidoDaAlteracao("GET", `/${APELIDO}/catalogo/produtos`)).toBe(
      null,
    );
    expect(apelidoDaAlteracao("PATCH", `/${APELIDO}/pedidos/p1/status`)).toBe(
      null,
    );
    expect(apelidoDaAlteracao("POST", `/${APELIDO}/pedidos/p1/cupom`)).toBe(
      null,
    );
    expect(apelidoDaAlteracao("PUT", `/Loja:Outra/configuracao/horario`)).toBe(
      null,
    );
    expect(apelidoDaAlteracao("PUT", `/${APELIDO}`)).toBe(null);
  });
});
