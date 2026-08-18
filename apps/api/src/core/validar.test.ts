/**
 * Prova da borda única de validação (P-007).
 *
 * Cada teste sobe um Express de verdade e manda requisição de verdade, porque
 * a afirmação a provar não é "a função valida": é "o domínio não é alcançado
 * por entrada que ninguém validou". Isso só aparece olhando o que a rota
 * recebeu, e o que ela deixou de receber.
 */

import { describe, expect, it } from "vitest";
import express, { type Express, type Request, type Response } from "express";
import request from "supertest";
import { z } from "zod";

import { ErroSemValidacao, validar } from "./validar.ts";

/** Uma aplicação com corpo em JSON, pronta para receber a rota do teste. */
function apiDeProva(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  return app;
}

/** Esquema de um pedido bem simples, com dinheiro em centavos (P-005). */
const ESQUEMA_DO_PEDIDO = z.object({
  produtoId: z.uuid(),
  quantidade: z.coerce.number().int().min(1).max(99),
  observacao: z.string().max(200).optional(),
});

const UUID_VALIDO = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("borda de validação de entrada", () => {
  it("@principle:P-007 corpo reprovado não chega ao domínio, e a rota nem roda", async () => {
    const app = apiDeProva();
    const entrada = validar({ body: ESQUEMA_DO_PEDIDO });
    let dominioRodou = 0;

    app.post("/v1/pedidos", entrada, (_req, res) => {
      dominioRodou += 1;
      res.status(201).json({ criado: true });
    });

    const resposta = await request(app)
      .post("/v1/pedidos")
      .send({ produtoId: "isto-nao-e-um-identificador", quantidade: 0 });

    expect(resposta.status).toBe(400);
    expect(resposta.body.erro).toBe("entrada_invalida");
    // Dois campos reprovados de uma vez: quem está integrando corrige tudo
    // numa passada, em vez de descobrir um erro por tentativa.
    expect(resposta.body.campos).toHaveLength(2);
    expect(
      resposta.body.campos.map((c: { caminho: string }) => c.caminho),
    ).toEqual(["produtoId", "quantidade"]);
    expect(resposta.body.campos[0].onde).toBe("body");
    expect(dominioRodou).toBe(0);
  });

  it("@principle:P-007 campo não declarado é descartado antes do domínio", async () => {
    const app = apiDeProva();
    const entrada = validar({ body: ESQUEMA_DO_PEDIDO });
    let recebido: unknown;
    let corpoCru: unknown;

    app.post("/v1/pedidos", entrada, (req: Request, res: Response) => {
      recebido = entrada.dados(req).body;
      corpoCru = req.body;
      res.status(201).json({ criado: true });
    });

    const resposta = await request(app).post("/v1/pedidos").send({
      produtoId: UUID_VALIDO,
      quantidade: 2,
      // O campo que o atacante acrescenta torcendo para o domínio copiar o
      // corpo inteiro para dentro do banco.
      papel: "OWNER",
      precoEmCentavos: 1,
    });

    expect(resposta.status).toBe(201);
    expect(recebido).toEqual({ produtoId: UUID_VALIDO, quantidade: 2 });
    // Nem pela porta dos fundos: `req.body` também já é o corpo peneirado.
    expect(corpoCru).toEqual({ produtoId: UUID_VALIDO, quantidade: 2 });
  });

  it("@principle:P-007 parâmetro de rota e consulta chegam validados e convertidos", async () => {
    const app = apiDeProva();
    const entrada = validar({
      params: z.object({ slug: z.string().min(3).max(40) }),
      query: z.object({
        pagina: z.coerce.number().int().min(1).default(1),
        busca: z.string().max(60).optional(),
      }),
    });
    let recebido: unknown;

    app.get("/v1/storefront/:slug", entrada, (req: Request, res: Response) => {
      const { params, query } = entrada.dados(req);
      recebido = { params, query };
      res.json({ ok: true });
    });

    const resposta = await request(app).get(
      "/v1/storefront/padaria-do-ze?pagina=3&ordem=preco",
    );

    expect(resposta.status).toBe(200);
    // `pagina` chega como número, não como o texto "3"; `ordem`, que ninguém
    // declarou, não chega de jeito nenhum.
    expect(recebido).toEqual({
      params: { slug: "padaria-do-ze" },
      query: { pagina: 3 },
    });
  });

  it("@principle:P-007 consulta reprovada é recusada dizendo onde estava o erro", async () => {
    const app = apiDeProva();
    const entrada = validar({
      query: z.object({ pagina: z.coerce.number().int().min(1) }),
    });
    let dominioRodou = 0;

    app.get("/v1/storefront", entrada, (_req, res) => {
      dominioRodou += 1;
      res.json({ ok: true });
    });

    const resposta = await request(app).get("/v1/storefront?pagina=zero");

    expect(resposta.status).toBe(400);
    expect(resposta.body.campos[0]).toMatchObject({
      onde: "query",
      caminho: "pagina",
    });
    expect(dominioRodou).toBe(0);
  });

  it("@principle:P-007 cabeçalho declarado é validado como o resto da entrada", async () => {
    const app = apiDeProva();
    const entrada = validar({
      headers: z.object({ "idempotency-key": z.uuid() }),
    });
    let recebido: unknown;

    app.post("/v1/pedidos", entrada, (req: Request, res: Response) => {
      recebido = entrada.dados(req).headers;
      res.status(201).json({ criado: true });
    });

    const semChave = await request(app).post("/v1/pedidos");
    const comChave = await request(app)
      .post("/v1/pedidos")
      .set("Idempotency-Key", UUID_VALIDO);

    expect(semChave.status).toBe(400);
    expect(semChave.body.campos[0].onde).toBe("headers");
    expect(comChave.status).toBe(201);
    // Só o cabeçalho declarado: os outros vinte que o cliente mandou ficam de
    // fora do que o domínio enxerga.
    expect(recebido).toEqual({ "idempotency-key": UUID_VALIDO });
  });

  it("@principle:P-007 a recusa não devolve o valor recebido", async () => {
    const app = apiDeProva();
    const entrada = validar({
      body: z.object({ quantidade: z.number().int() }),
    });
    app.post("/v1/pedidos", entrada, (_req, res) => res.status(201).end());

    const resposta = await request(app)
      .post("/v1/pedidos")
      .send({ quantidade: "cliente@exemplo.com.br" });

    expect(resposta.status).toBe(400);
    // Dado de quem chamou costuma ser dado pessoal (P-009); ecoá-lo na
    // resposta o joga no registro de erro de quem integrou com a API.
    expect(JSON.stringify(resposta.body)).not.toContain(
      "cliente@exemplo.com.br",
    );
    expect(resposta.body.campos[0].mensagem).toBeTypeOf("string");
  });

  it("@principle:P-007 corpo que a rota não declarou não chega ao domínio", async () => {
    const app = apiDeProva();
    // A rota declara só a consulta: para ela, corpo não existe.
    const entrada = validar({ query: z.object({}) });
    let corpoVisto: unknown = "ainda nao rodou";

    app.post("/v1/storefront/busca", entrada, (req: Request, res: Response) => {
      corpoVisto = req.body;
      res.json({ ok: true });
    });

    const resposta = await request(app)
      .post("/v1/storefront/busca")
      .send({ contrabando: "algo que ninguem declarou" });

    expect(resposta.status).toBe(200);
    expect(corpoVisto).toBeUndefined();
  });

  it("@principle:P-007 rota montada sem a borda recebe recusa explícita, e não entrada crua", async () => {
    const app = apiDeProva();
    const entrada = validar({ body: ESQUEMA_DO_PEDIDO });
    let nomeDoErro = "";

    // O esquecimento que este desenho existe para pegar: a borda foi criada,
    // mas ninguém a montou na rota.
    app.post("/v1/pedidos", (req: Request, res: Response) => {
      try {
        entrada.dados(req);
        res.status(201).json({ criado: true });
      } catch (causa) {
        nomeDoErro = causa instanceof ErroSemValidacao ? causa.name : "outro";
        res.status(500).json({ erro: "falha_interna" });
      }
    });

    const resposta = await request(app)
      .post("/v1/pedidos")
      .send({ produtoId: UUID_VALIDO, quantidade: 1 });

    // Falhar alto é o ponto: devolver um objeto vazio faria a rota parecer
    // funcionar e passar entrada nenhuma ao domínio sem ninguém perceber.
    expect(resposta.status).toBe(500);
    expect(nomeDoErro).toBe("ErroSemValidacao");
  });

  it("@principle:P-007 as partes são validadas juntas: erro em duas aparece de uma vez", async () => {
    const app = apiDeProva();
    const entrada = validar({
      params: z.object({ slug: z.string().min(3) }),
      body: z.object({ quantidade: z.number().int().min(1) }),
    });
    app.post("/v1/l/:slug/pedidos", entrada, (_req, res) =>
      res.status(201).end(),
    );

    const resposta = await request(app)
      .post("/v1/l/ab/pedidos")
      .send({ quantidade: -3 });

    expect(resposta.status).toBe(400);
    expect(
      resposta.body.campos.map((c: { onde: string }) => c.onde).sort(),
    ).toEqual(["body", "params"]);
  });
});
