/**
 * Card #47 — curtidas e comentários com aprovação da loja.
 *
 * Pela API inteira, sobre o banco do arquivo:
 *
 * - curtir e descurtir produto e loja exigem conta, não duplicam e aparecem no
 *   feed (`curtidas`, `curtiu`) e na vitrine;
 * - o comentário nasce PENDENTE: o público não vê, o autor vê com o aviso; a
 *   loja aprova e ele aparece (e conta no feed); recusar tira do público;
 * - permissões: dono e equipe moderam; a equipe não liga a aprovação
 *   automática; cliente sem vínculo não entra no painel;
 * - isolamento: a loja B não lê nem modera comentário da loja A;
 * - anti-abuso: tamanho, limite de envio, bloqueio pela loja e denúncia;
 * - aprovação automática; trilha de auditoria das moderações.
 */

import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  conectarNoBancoDoArquivo,
  criarIdentidade,
  criarLoja,
  criarMembro,
  type IdentidadeDeTeste,
  type LojaDeTeste,
} from "@simpleclick/testing";

import { ESPERA_DA_ADMINISTRACAO } from "./apoio-da-administracao.ts";
import {
  cliente,
  montarApiCompleta,
  sessao,
  type ApiCompleta,
} from "./apoio-da-fundacao.ts";

let api: ApiCompleta;
let http: ReturnType<typeof cliente>;
let migrador: pg.Client;
let lojaA: LojaDeTeste;
let lojaB: LojaDeTeste;
let ana: IdentidadeDeTeste;
let bruno: IdentidadeDeTeste;
let equipeA: IdentidadeDeTeste;
let produtoA = "";
let produtoB = "";

async function produto(loja: LojaDeTeste, nome: string): Promise<string> {
  const dono = sessao(loja.dono.id, "OWNER");
  const categoria = await http.post(
    `/v1/lojas/${loja.apelido}/catalogo/categorias`,
    { nome: "Destaques", descricao: null, visivel: true },
    dono,
  );
  const criado = await http.post(
    `/v1/lojas/${loja.apelido}/catalogo/produtos`,
    {
      nome,
      descricao: `${nome} feito na hora`,
      categoriaId: String(categoria.body.id),
      precoCentavos: 1000,
      status: "PUBLISHED",
      disponivel: true,
      publicarNoFeed: true,
    },
    dono,
  );
  if (criado.status !== 201) {
    throw new Error(
      `produto não criado: ${criado.status} ${JSON.stringify(criado.body)}`,
    );
  }
  return String(criado.body.id);
}

const doProduto = (id: string) => `/v1/feed/produtos/${id}`;
const painel = (loja: LojaDeTeste) => `/v1/lojas/${loja.apelido}/comentarios`;

async function comentar(
  pessoa: IdentidadeDeTeste,
  produtoId: string,
  texto: string,
) {
  return http.post(
    `${doProduto(produtoId)}/comentarios`,
    { texto },
    sessao(pessoa.id),
  );
}

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  api = montarApiCompleta();
  http = cliente(api);
  lojaA = await criarLoja({ nome: "Pastelaria da Praça", ramo: "lanchonete" });
  lojaB = await criarLoja({ nome: "Moda Centro", ramo: "roupas" });
  produtoA = await produto(lojaA, "Pastel de queijo");
  produtoB = await produto(lojaB, "Camiseta preta");
  ana = await criarIdentidade({ nome: "Ana Maria Ribeiro" });
  bruno = await criarIdentidade({ nome: "Bruno" });
  equipeA = await criarIdentidade();
  await criarMembro({ loja: lojaA, identidade: equipeA, papel: "STAFF" });
}, ESPERA_DA_ADMINISTRACAO);

afterAll(async () => {
  await api?.encerrar();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

describe("curtidas", () => {
  it("exigem conta, não duplicam e aparecem no feed e na vitrine", async () => {
    expect((await http.post(`${doProduto(produtoA)}/curtida`, {})).status).toBe(
      401,
    );

    const primeira = await http.post(
      `${doProduto(produtoA)}/curtida`,
      {},
      sessao(ana.id),
    );
    expect(primeira.status).toBe(200);
    expect(primeira.body).toEqual({ curtiu: true, curtidas: 1 });
    const repetida = await http.post(
      `${doProduto(produtoA)}/curtida`,
      {},
      sessao(ana.id),
    );
    expect(repetida.body).toEqual({ curtiu: true, curtidas: 1 });
    await http.post(`${doProduto(produtoA)}/curtida`, {}, sessao(bruno.id));

    const linhas = await migrador.query(
      `SELECT count(*)::int AS n FROM app.product_likes WHERE product_id = $1`,
      [produtoA],
    );
    expect(linhas.rows[0].n).toBe(2);

    const comSessao = await http.get("/v1/feed/produtos", sessao(ana.id));
    const pastel = comSessao.body.produtos.find(
      (p: { id: string }) => p.id === produtoA,
    );
    expect(pastel).toMatchObject({ curtidas: 2, curtiu: true, comentarios: 0 });
    const semSessao = await http.get("/v1/feed/produtos");
    const pastelPublico = semSessao.body.produtos.find(
      (p: { id: string }) => p.id === produtoA,
    );
    expect(pastelPublico).toMatchObject({ curtidas: 2, curtiu: false });

    const naVitrine = await http.get(
      `/v1/vitrine/${lojaA.apelido}/produto/${produtoA}`,
    );
    expect(naVitrine.body).toMatchObject({ curtidas: 2, comentarios: 0 });

    const descurtida = await http.delete(
      `${doProduto(produtoA)}/curtida`,
      sessao(bruno.id),
    );
    expect(descurtida.body).toEqual({ curtiu: false, curtidas: 1 });
    const deNovo = await http.delete(
      `${doProduto(produtoA)}/curtida`,
      sessao(bruno.id),
    );
    expect(deNovo.body).toEqual({ curtiu: false, curtidas: 1 });
  });

  it("curtir a loja e produto que não existe", async () => {
    const loja = await http.post(
      `/v1/feed/lojas/${lojaB.apelido}/curtida`,
      {},
      sessao(ana.id),
    );
    expect(loja.body).toEqual({ curtiu: true, curtidas: 1 });
    const lojas = await http.get("/v1/feed/lojas", sessao(ana.id));
    const moda = lojas.body.lojas.find(
      (l: { apelido: string }) => l.apelido === lojaB.apelido,
    );
    expect(moda).toMatchObject({ curtidas: 1, curtiu: true, comentarios: 0 });
    const vitrine = await http.get(`/v1/vitrine/${lojaB.apelido}`);
    expect(vitrine.body.loja).toMatchObject({ curtidas: 1, comentarios: 0 });

    const inexistente = await http.post(
      `${doProduto("00000000-0000-4000-8000-000000000000")}/curtida`,
      {},
      sessao(ana.id),
    );
    expect(inexistente.status).toBe(404);
  });
});

describe("comentários com aprovação", () => {
  let comentarioId = "";

  it("nasce pendente: o público não vê, o autor vê com o aviso", async () => {
    const criado = await comentar(ana, produtoA, "  Que pastel bom!  ");
    expect(criado.status).toBe(201);
    expect(criado.body).toMatchObject({
      texto: "Que pastel bom!",
      autor: { nome: "Ana R.", iniciais: "AR" },
      situacao: "PENDENTE",
      meu: true,
      aviso: "Aguardando aprovação da loja",
    });
    comentarioId = String(criado.body.id);

    const publico = await http.get(`${doProduto(produtoA)}/comentarios`);
    expect(publico.body).toMatchObject({
      comentarios: [],
      total: 0,
      meusPendentes: 0,
    });
    const outro = await http.get(
      `${doProduto(produtoA)}/comentarios`,
      sessao(bruno.id),
    );
    expect(outro.body.comentarios).toEqual([]);
    const autor = await http.get(
      `${doProduto(produtoA)}/comentarios`,
      sessao(ana.id),
    );
    expect(autor.body.meusPendentes).toBe(1);
    expect(autor.body.comentarios).toEqual([criado.body]);
    expect(JSON.stringify(publico.body)).not.toContain(ana.email);
  });

  it("dono e equipe veem a fila e a contagem; cliente e outra loja não", async () => {
    const doDono = await http.get(
      painel(lojaA),
      sessao(lojaA.dono.id, "OWNER"),
    );
    expect(doDono.status).toBe(200);
    expect(doDono.body.contagem).toEqual({
      pendentes: 1,
      aprovados: 0,
      recusados: 0,
      denunciados: 0,
    });
    expect(doDono.body.aprovarAutomaticamente).toBe(false);
    expect(doDono.body.comentarios[0]).toMatchObject({
      id: comentarioId,
      situacao: "PENDENTE",
      alvo: {
        tipo: "produto",
        produtoId: produtoA,
        produtoNome: "Pastel de queijo",
      },
      autor: { nome: "Ana R.", bloqueado: false },
      denuncias: 0,
    });
    expect(JSON.stringify(doDono.body)).not.toContain(ana.id);

    const daEquipe = await http.get(
      `${painel(lojaA)}/contagem`,
      sessao(equipeA.id),
    );
    expect(daEquipe.status).toBe(200);
    expect(daEquipe.body.pendentes).toBe(1);

    const doCliente = await http.get(painel(lojaA), sessao(ana.id));
    expect([401, 403, 404]).toContain(doCliente.status);

    // A loja B não vê nem modera o comentário da loja A.
    const lojaBLista = await http.get(
      painel(lojaB),
      sessao(lojaB.dono.id, "OWNER"),
    );
    expect(lojaBLista.body.comentarios).toEqual([]);
    const lojaBAprova = await http.post(
      `${painel(lojaB)}/${comentarioId}/aprovar`,
      {},
      sessao(lojaB.dono.id, "OWNER"),
    );
    expect(lojaBAprova.status).toBe(404);
    const lojaBApaga = await http.delete(
      `${painel(lojaB)}/${comentarioId}`,
      sessao(lojaB.dono.id, "OWNER"),
    );
    expect(lojaBApaga.status).toBe(404);
    const donoBNaLojaA = await http.get(
      painel(lojaA),
      sessao(lojaB.dono.id, "OWNER"),
    );
    expect([401, 403, 404]).toContain(donoBNaLojaA.status);
  });

  it("a equipe aprova; aparece para todos e conta no feed; a trilha registra", async () => {
    const aprovado = await http.post(
      `${painel(lojaA)}/${comentarioId}/aprovar`,
      {},
      sessao(equipeA.id),
    );
    expect(aprovado.status).toBe(200);
    expect(aprovado.body.situacao).toBe("APROVADO");
    expect(aprovado.body.moderadoEm).not.toBeNull();

    const publico = await http.get(`${doProduto(produtoA)}/comentarios`);
    expect(publico.body.total).toBe(1);
    expect(publico.body.comentarios[0]).toMatchObject({
      id: comentarioId,
      situacao: "APROVADO",
      meu: false,
      aviso: null,
    });
    const feed = await http.get("/v1/feed/produtos");
    const pastel = feed.body.produtos.find(
      (p: { id: string }) => p.id === produtoA,
    );
    expect(pastel.comentarios).toBe(1);

    const trilha = await migrador.query(
      `SELECT action, actor_role, after_data FROM app.audit_log
        WHERE store_id = $1 AND entity = 'comments' AND entity_id = $2`,
      [lojaA.id, comentarioId],
    );
    expect(trilha.rows).toEqual([
      {
        action: "COMENTARIO_APROVADO",
        actor_role: "STAFF",
        after_data: { situacao: "APROVADO", comMotivo: false },
      },
    ]);
  });

  it("recusar tira do público; a denúncia aparece no painel; apagar some", async () => {
    const denuncia = await http.post(
      `/v1/feed/comentarios/${comentarioId}/denuncia`,
      { motivo: "spam" },
      sessao(bruno.id),
    );
    expect(denuncia.status).toBe(200);
    expect(denuncia.body).toEqual({ denunciado: true });
    const denunciados = await http.get(
      `${painel(lojaA)}?situacao=APROVADO&denunciados=true`,
      sessao(lojaA.dono.id, "OWNER"),
    );
    expect(denunciados.body.comentarios[0]).toMatchObject({
      id: comentarioId,
      denuncias: 1,
    });
    expect(denunciados.body.contagem.denunciados).toBe(1);

    const recusado = await http.post(
      `${painel(lojaA)}/${comentarioId}/recusar`,
      { motivo: "fora do tema" },
      sessao(lojaA.dono.id, "OWNER"),
    );
    expect(recusado.body).toMatchObject({
      situacao: "RECUSADO",
      motivoDaRecusa: "fora do tema",
    });
    expect(
      (await http.get(`${doProduto(produtoA)}/comentarios`)).body.total,
    ).toBe(0);
    // Recusado não se denuncia (não está à vista).
    expect(
      (
        await http.post(
          `/v1/feed/comentarios/${comentarioId}/denuncia`,
          {},
          sessao(bruno.id),
        )
      ).status,
    ).toBe(404);

    const apagado = await http.delete(
      `${painel(lojaA)}/${comentarioId}`,
      sessao(lojaA.dono.id, "OWNER"),
    );
    expect(apagado.status).toBe(204);
    const restantes = await migrador.query(
      `SELECT 1 FROM app.comments WHERE id = $1`,
      [comentarioId],
    );
    expect(restantes.rowCount).toBe(0);
    const trilha = await migrador.query(
      `SELECT action FROM app.audit_log WHERE entity = 'comments' AND entity_id = $1 ORDER BY id`,
      [comentarioId],
    );
    expect(trilha.rows.map((r) => r.action)).toEqual([
      "COMENTARIO_APROVADO",
      "COMENTARIO_RECUSADO",
      "COMENTARIO_APAGADO",
    ]);
  });

  it("comentário na loja e o autor apaga o seu", async () => {
    const naLoja = await http.post(
      `/v1/feed/lojas/${lojaB.apelido}/comentarios`,
      { texto: "Atendimento ótimo" },
      sessao(bruno.id),
    );
    expect(naLoja.status).toBe(201);
    const fila = await http.get(
      `${painel(lojaB)}?alvo=loja`,
      sessao(lojaB.dono.id, "OWNER"),
    );
    expect(fila.body.comentarios[0]).toMatchObject({
      alvo: { tipo: "loja", produtoId: null, produtoNome: null },
      autor: { nome: "Bruno" },
    });
    // Outra pessoa não apaga; o autor apaga.
    expect(
      (
        await http.delete(
          `/v1/conta/comentarios/${naLoja.body.id}`,
          sessao(ana.id),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await http.delete(
          `/v1/conta/comentarios/${naLoja.body.id}`,
          sessao(bruno.id),
        )
      ).status,
    ).toBe(204);
  });
});

describe("configuração e anti-abuso", () => {
  it("só o dono liga a aprovação automática; aí o comentário já nasce aprovado", async () => {
    const pelaEquipe = await http.put(
      `${painel(lojaA)}/configuracao`,
      { aprovarAutomaticamente: true },
      sessao(equipeA.id),
    );
    expect(pelaEquipe.status).toBe(403);
    expect(pelaEquipe.body).toMatchObject({
      erro: "sem_permissao",
      permissao: "configuracoes",
    });

    const peloDono = await http.put(
      `${painel(lojaA)}/configuracao`,
      { aprovarAutomaticamente: true },
      sessao(lojaA.dono.id, "OWNER"),
    );
    expect(peloDono.body).toEqual({ aprovarAutomaticamente: true });
    const criado = await comentar(bruno, produtoA, "Chegou quentinho");
    expect(criado.body).toMatchObject({ situacao: "APROVADO", aviso: null });
    await http.put(
      `${painel(lojaA)}/configuracao`,
      { aprovarAutomaticamente: false },
      sessao(lojaA.dono.id, "OWNER"),
    );
    const config = await http.get(
      `${painel(lojaA)}/configuracao`,
      sessao(lojaA.dono.id, "OWNER"),
    );
    expect(config.body).toEqual({ aprovarAutomaticamente: false });
  });

  it("texto vazio ou longo demais é recusado", async () => {
    expect((await comentar(ana, produtoB, "   ")).status).toBe(400);
    expect((await comentar(ana, produtoB, "a".repeat(501))).status).toBe(400);
    expect((await comentar(ana, produtoB, "a".repeat(500))).status).toBe(201);
  });

  it("a loja bloqueia o autor: pendentes recusados e novos comentários barrados", async () => {
    const pessoa = await criarIdentidade({ nome: "Carla Souza" });
    const primeiro = await comentar(pessoa, produtoB, "Comentário chato");
    const segundo = await comentar(pessoa, produtoB, "Outro chato");
    const bloqueio = await http.post(
      `${painel(lojaB)}/${primeiro.body.id}/bloquear-autor`,
      { motivo: "ofensivo" },
      sessao(lojaB.dono.id, "OWNER"),
    );
    expect(bloqueio.status).toBe(201);
    expect(bloqueio.body).toMatchObject({
      nome: "Carla S.",
      iniciais: "CS",
      motivo: "ofensivo",
    });
    const situacoes = await migrador.query(
      `SELECT status FROM app.comments WHERE id = ANY ($1::uuid[])`,
      [[primeiro.body.id, segundo.body.id]],
    );
    expect(situacoes.rows.map((r) => r.status)).toEqual([
      "RECUSADO",
      "RECUSADO",
    ]);

    const barrado = await comentar(pessoa, produtoB, "Voltei");
    expect(barrado.status).toBe(403);
    expect(barrado.body.erro).toBe("comentario_bloqueado");
    // Na outra loja ela continua comentando.
    expect((await comentar(pessoa, produtoA, "Aqui pode")).status).toBe(201);

    const lista = await http.get(
      `${painel(lojaB)}/bloqueios`,
      sessao(lojaB.dono.id, "OWNER"),
    );
    expect(lista.body.bloqueios).toHaveLength(1);
    // A loja A não vê nem desfaz o bloqueio da loja B.
    expect(
      (
        await http.get(
          `${painel(lojaA)}/bloqueios`,
          sessao(lojaA.dono.id, "OWNER"),
        )
      ).body.bloqueios,
    ).toEqual([]);
    expect(
      (
        await http.delete(
          `${painel(lojaA)}/bloqueios/${bloqueio.body.id}`,
          sessao(lojaA.dono.id, "OWNER"),
        )
      ).status,
    ).toBe(404);

    expect(
      (
        await http.delete(
          `${painel(lojaB)}/bloqueios/${bloqueio.body.id}`,
          sessao(lojaB.dono.id, "OWNER"),
        )
      ).status,
    ).toBe(204);
    expect((await comentar(pessoa, produtoB, "Desculpa")).status).toBe(201);
  });

  it("limite de envio: o sexto comentário em 10 minutos recebe 429", async () => {
    const pessoa = await criarIdentidade({ nome: "Dani" });
    for (let i = 1; i <= 5; i += 1) {
      expect((await comentar(pessoa, produtoA, `Comentário ${i}`)).status).toBe(
        201,
      );
    }
    const sexto = await comentar(pessoa, produtoA, "Comentário 6");
    expect(sexto.status).toBe(429);
    expect(sexto.body.erro).toBe("limite_de_comentarios");
  });

  it("o banco não deixa o cliente escolher a situação nem comentar por outro", async () => {
    // Direto no banco, como a aplicação: o gatilho decide a situação.
    await migrador.query("BEGIN");
    try {
      await migrador.query("SET LOCAL ROLE sc_app");
      await migrador.query(`SELECT set_config('app.user_id', $1, true)`, [
        bruno.id,
      ]);
      await migrador.query(`SELECT set_config('app.role', 'CUSTOMER', true)`);
      const criado = await migrador.query(
        `INSERT INTO app.comments (store_id, product_id, identity_id, author_name, body, status)
         VALUES ($1, $2, $3, 'Falso', 'oi', 'APROVADO') RETURNING status, author_name`,
        [lojaB.id, produtoB, bruno.id],
      );
      expect(criado.rows[0]).toEqual({
        status: "PENDENTE",
        author_name: "Bruno",
      });
      await expect(
        migrador.query(
          `INSERT INTO app.comments (store_id, product_id, identity_id, author_name, body)
           VALUES ($1, $2, $3, '-', 'oi')`,
          [lojaB.id, produtoB, ana.id],
        ),
      ).rejects.toThrow();
    } finally {
      await migrador.query("ROLLBACK");
    }
  });
});
