/**
 * Prova da lista fechada de origens (AC-125 a AC-128).
 *
 * Tudo aqui é requisição de verdade contra um Express montado — quase sempre
 * o `criarApp()` de produção, para que a prova cubra também a MONTAGEM: um
 * `cors.ts` perfeito que ninguém instalou na aplicação não protege nada.
 *
 * Onde o critério fala de "a operação não acontece", o alvo é uma aplicação com
 * uma rota que muda estado de verdade — um contador — porque a única forma de
 * provar que o domínio não foi tocado é olhar o efeito que ele teria causado.
 */

import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

import { criarApp } from "../app.ts";
import {
  canonizarOrigem,
  corsDeOrigensFechadas,
  ErroDeOrigemConfigurada,
  ListaDeOrigens,
  origensDoAmbiente,
} from "./cors.ts";

/** As duas origens do ambiente: o site e a própria API. */
const SITE = "https://app.localhost";
const API = "https://api.localhost";
const AUTORIZADAS = [SITE, API];

/** Origem de um site qualquer que tenta usar a sessão da vítima. */
const SITE_DE_TERCEIRO = "https://loja-falsa.example";

/** Cookie de sessão válido, do jeito que o navegador o anexaria sozinho. */
const COOKIE_DE_SESSAO = "sc_sessao=token-de-sessao-valido";

/**
 * Servidores abertos por este arquivo, fechados ao fim de cada teste.
 *
 * `request(app)` abriria um servidor efêmero NOVO a cada requisição. Um por
 * aplicação, reaproveitado, mantém baixo o número de portas efêmeras que a
 * suíte inteira abre e devolve em segundos — é o que evita a classe de falha em
 * que uma conexão cai numa porta recém-largada por outro teste e recebe a
 * resposta do servidor errado.
 */
const servidoresAbertos: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servidoresAbertos.splice(0).map(
      (servidor) =>
        new Promise<void>((pronto) => {
          servidor.closeAllConnections();
          servidor.close(() => pronto());
        }),
    ),
  );
});

/** Põe a aplicação no ar numa porta que o sistema escolhe. */
function noAr(app: Express): Server {
  // Escutar em `127.0.0.1`, e não no endereço curinga, é o que torna esta prova
  // reproduzível quando a suíte inteira roda junto (AC-042). Sem o endereço,
  // o Node escuta em `::` com pilha dupla; um servidor de OUTRO processo de
  // teste que pegue a mesma porta em `0.0.0.0` casa mais especificamente com o
  // `127.0.0.1` que o supertest chama, e a requisição chega ao servidor
  // errado — a falha aparece como um 404 num caminho que existe. O resto da
  // suíte já escuta assim.
  const servidor = app.listen(0, "127.0.0.1");
  servidoresAbertos.push(servidor);
  return servidor;
}

/** A aplicação de verdade, com a lista fechada que o ambiente traria. */
function apiComListaFechada(): Server {
  return noAr(criarApp({ origens: AUTORIZADAS }));
}

/** Aplicação de prova: as mesmas defesas, mais uma rota que muda estado. */
function apiComEfeitoObservavel(): {
  app: Server;
  efeitos: () => number;
} {
  let pedidosCriados = 0;
  const app = express();
  app.disable("x-powered-by");
  app.use(corsDeOrigensFechadas({ origens: AUTORIZADAS }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // O domínio: se esta linha rodar, o pedido foi criado de verdade.
  app.post("/v1/store/orders", (_req, res) => {
    pedidosCriados += 1;
    res.status(201).json({ criado: true });
  });
  app.delete("/v1/store/products/1", (_req, res) => {
    pedidosCriados += 1;
    res.status(204).end();
  });

  return { app: noAr(app), efeitos: () => pedidosCriados };
}

describe("lista de origens autorizadas", () => {
  it("@spec:AC-125 chamada de origem fora da lista não recebe o cabeçalho que liberaria a leitura", async () => {
    const resposta = await request(apiComListaFechada())
      .get("/")
      .set("Origin", SITE_DE_TERCEIRO)
      .set("Cookie", COOKIE_DE_SESSAO);

    // Sem `Access-Control-Allow-Origin` o navegador descarta a resposta antes
    // de entregá-la ao script da página que chamou.
    expect(resposta.headers["access-control-allow-origin"]).toBeUndefined();
    expect(
      resposta.headers["access-control-allow-credentials"],
    ).toBeUndefined();
  });

  it("@spec:AC-125 a lista é fechada: a origem recebida nunca volta refletida no cabeçalho", async () => {
    const app = apiComListaFechada();
    const forasteiras = [
      SITE_DE_TERCEIRO,
      // Prefixo que parece o nosso site para leitura humana desatenta.
      "https://app.localhost.loja-falsa.example",
      // Mesmo nome, outro esquema.
      "http://app.localhost",
      // Origem opaca de quadro isolado.
      "null",
      // Mesmo nome, outra porta.
      "https://app.localhost:8443",
    ];

    for (const origem of forasteiras) {
      const resposta = await request(app).get("/").set("Origin", origem);

      expect(resposta.headers["access-control-allow-origin"]).toBeUndefined();
      // A checagem que importa: em NENHUMA resposta o valor recebido aparece
      // como autorização. Refletir seria autorizar o mundo com cara de lista.
      expect(JSON.stringify(resposta.headers)).not.toContain(origem);
    }
  });

  it("@spec:AC-125 origem autorizada recebe o item guardado na lista, e nunca o coringa", async () => {
    // Esquema e máquina não distinguem caixa; o valor publicado é o da lista.
    const resposta = await request(apiComListaFechada())
      .get("/")
      .set("Origin", "HTTPS://APP.LOCALHOST");

    expect(resposta.status).toBe(200);
    expect(resposta.headers["access-control-allow-origin"]).toBe(SITE);
    expect(resposta.headers["access-control-allow-origin"]).not.toBe("*");
    expect(resposta.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("@spec:AC-125 a resposta avisa que varia por origem, para o cache não vazar a liberação", async () => {
    const resposta = await request(apiComListaFechada())
      .get("/")
      .set("Origin", SITE);

    expect(resposta.headers["vary"]).toMatch(/Origin/i);
  });
});

describe("requisição que muda dados", () => {
  it("@spec:AC-126 sem indicação de origem, é recusada antes de tocar o domínio", async () => {
    const { app, efeitos } = apiComEfeitoObservavel();

    const resposta = await request(app)
      .post("/v1/store/orders")
      .set("Cookie", COOKIE_DE_SESSAO)
      .send({ itens: [] });

    expect(resposta.status).toBe(403);
    expect(resposta.body).toEqual({
      erro: "origem_nao_autorizada",
      motivo: "ausente",
    });
    // Nenhum pedido criado: a recusa aconteceu antes do domínio.
    expect(efeitos()).toBe(0);
  });

  it("@spec:AC-126 com origem fora da lista e cookie de sessão válido, nada acontece", async () => {
    const { app, efeitos } = apiComEfeitoObservavel();

    const resposta = await request(app)
      .post("/v1/store/orders")
      .set("Origin", SITE_DE_TERCEIRO)
      .set("Cookie", COOKIE_DE_SESSAO)
      .send({ itens: [{ produto: "abc" }] });

    expect(resposta.status).toBe(403);
    expect(resposta.body.motivo).toBe("fora_da_lista");
    expect(resposta.headers["access-control-allow-origin"]).toBeUndefined();
    expect(efeitos()).toBe(0);
  });

  it("@spec:AC-126 a exigência vale para todo método que muda estado, não só POST", async () => {
    const app = apiComListaFechada();

    for (const metodo of ["post", "put", "patch", "delete"] as const) {
      const semOrigem = await request(app)[metodo]("/v1/store/settings");
      const daForasteira = request(app)[metodo]("/v1/store/settings");
      const forasteira = await daForasteira.set("Origin", SITE_DE_TERCEIRO);

      expect(semOrigem.status).toBe(403);
      expect(forasteira.status).toBe(403);
      // 404 é a resposta do roteamento; 403 antes dele prova que a recusa
      // aconteceu sem a requisição chegar a procurar rota.
      expect(semOrigem.body.erro).toBe("origem_nao_autorizada");
    }
  });

  it("@spec:AC-126 a mesma requisição, vinda da nossa própria interface, passa", async () => {
    const { app, efeitos } = apiComEfeitoObservavel();

    const resposta = await request(app)
      .post("/v1/store/orders")
      .set("Origin", SITE)
      .set("Cookie", COOKIE_DE_SESSAO)
      .send({ itens: [{ produto: "abc" }] });

    expect(resposta.status).toBe(201);
    expect(resposta.headers["access-control-allow-origin"]).toBe(SITE);
    expect(efeitos()).toBe(1);
  });
});

describe("leitura pública da vitrine", () => {
  it("@spec:AC-127 consulta de qualquer origem funciona normalmente", async () => {
    const app = apiComListaFechada();

    for (const origem of [SITE_DE_TERCEIRO, "https://outro-site.example"]) {
      const resposta = await request(app).get("/").set("Origin", origem);

      expect(resposta.status).toBe(200);
      expect(resposta.body).toMatchObject({ status: "viva" });
    }
  });

  it("@spec:AC-127 consulta sem origem nenhuma também funciona", async () => {
    // É o caso do aplicativo nativo e de qualquer servidor: não existe
    // navegador para mandar `Origin`, e o conteúdo público é público.
    const resposta = await request(apiComListaFechada()).get("/");

    expect(resposta.status).toBe(200);
    expect(resposta.body).toMatchObject({ status: "viva" });
  });

  it("@spec:AC-127 a liberação de leitura não vira liberação de escrita", async () => {
    const { app, efeitos } = apiComEfeitoObservavel();

    const leitura = await request(app)
      .get("/qualquer")
      .set("Origin", SITE_DE_TERCEIRO);
    const escrita = await request(app)
      .post("/v1/store/orders")
      .set("Origin", SITE_DE_TERCEIRO)
      .send({});

    // A leitura passou pela borda de origem (chegou ao roteamento e virou 404);
    // a escrita, da MESMA origem, foi barrada.
    expect(leitura.status).toBe(404);
    expect(escrita.status).toBe(403);
    expect(efeitos()).toBe(0);
  });
});

describe("sessão do navegador em requisição de outro site", () => {
  it("@spec:AC-128 formulário de site de terceiros enviado com o cookie da vítima não executa a operação", async () => {
    const { app, efeitos } = apiComEfeitoObservavel();

    // Formulário HTML comum: o navegador envia sem consulta prévia, com o
    // tipo de conteúdo simples, e anexa o cookie da vítima sozinho.
    const resposta = await request(app)
      .post("/v1/store/orders")
      .set("Origin", SITE_DE_TERCEIRO)
      .set("Content-Type", "application/x-www-form-urlencoded")
      .set("Cookie", COOKIE_DE_SESSAO)
      .send("produto=abc&quantidade=99");

    expect(resposta.status).toBe(403);
    expect(efeitos()).toBe(0);
  });

  it("@spec:AC-128 a remoção disparada de outro site também não acontece", async () => {
    const { app, efeitos } = apiComEfeitoObservavel();

    const resposta = await request(app)
      .delete("/v1/store/products/1")
      .set("Origin", SITE_DE_TERCEIRO)
      .set("Cookie", COOKIE_DE_SESSAO);

    expect(resposta.status).toBe(403);
    expect(efeitos()).toBe(0);
  });

  it("@spec:AC-128 a consulta prévia de origem estranha é recusada sem liberar nada", async () => {
    const resposta = await request(apiComListaFechada())
      .options("/v1/store/orders")
      .set("Origin", SITE_DE_TERCEIRO)
      .set("Access-Control-Request-Method", "DELETE");

    expect(resposta.status).toBe(403);
    expect(resposta.headers["access-control-allow-origin"]).toBeUndefined();
    expect(resposta.headers["access-control-allow-methods"]).toBeUndefined();
  });

  it("@spec:AC-128 a consulta prévia da nossa interface é respondida com credencial", async () => {
    const resposta = await request(apiComListaFechada())
      .options("/v1/store/orders")
      .set("Origin", SITE)
      .set("Access-Control-Request-Method", "DELETE");

    expect(resposta.status).toBe(204);
    expect(resposta.headers["access-control-allow-origin"]).toBe(SITE);
    expect(resposta.headers["access-control-allow-credentials"]).toBe("true");
    expect(resposta.headers["access-control-allow-methods"]).toContain(
      "DELETE",
    );
  });
});

describe("ambiente mal configurado", () => {
  it("@spec:AC-125 lista vazia fecha a porta em vez de abrir todas", async () => {
    const app = noAr(criarApp({ origens: [] }));

    const escrita = await request(app)
      .post("/v1/store/orders")
      .set("Origin", SITE);
    const leitura = await request(app).get("/").set("Origin", SITE);

    expect(escrita.status).toBe(403);
    expect(leitura.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("@spec:AC-125 origem configurada com caminho é recusada na montagem, e não em produção", () => {
    // Origem com caminho jamais casaria com o `Origin` de um navegador, que
    // nunca traz caminho: a lista pareceria certa e recusaria todo mundo.
    expect(() => new ListaDeOrigens(["https://app.localhost/painel"])).toThrow(
      ErroDeOrigemConfigurada,
    );
    expect(() => new ListaDeOrigens(["app.localhost"])).toThrow(
      ErroDeOrigemConfigurada,
    );
  });

  it("@spec:AC-125 a lista do ambiente é lida por vírgula, sem sobrar espaço nem item vazio", () => {
    expect(
      origensDoAmbiente(" https://a.example , ,https://b.example "),
    ).toEqual(["https://a.example", "https://b.example"]);
    expect(origensDoAmbiente(undefined)).toEqual([]);

    const lista = new ListaDeOrigens([
      "https://A.Example:443",
      "https://b.example",
    ]);
    // Porta padrão do esquema não entra na forma canônica.
    expect(lista.origens).toEqual(["https://a.example", "https://b.example"]);
    expect(lista.autorizada("https://a.example")).toBe("https://a.example");
    expect(lista.autorizada("https://c.example")).toBeUndefined();
    expect(canonizarOrigem("null")).toBeUndefined();
  });
});
