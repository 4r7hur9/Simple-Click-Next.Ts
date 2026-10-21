/**
 * Card #46 — vídeo no produto e Stories de 24 horas, pela API inteira sobre o
 * banco do arquivo, com a mídia guardada em memória.
 *
 * - vídeo do produto: tipo real pelos bytes, tamanho, duração, limite por
 *   produto, capa, galeria mista com ordem, vitrine e feed com `midias`, e o
 *   arquivo apagado junto com o vídeo;
 * - stories: a loja (dono e equipe) posta foto e vídeo, lista e apaga; o
 *   público vê os ativos agrupados por loja com a foto de perfil; "visto"
 *   conta uma vez por pessoa; limite da administração; EXPIRAÇÃO: some da
 *   lista na hora e a limpeza (relógio simulado) apaga arquivo e linha.
 */

import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarAdministradorDaPlataforma,
  criarIdentidade,
  criarLoja,
  criarMembro,
  type IdentidadeDeTeste,
  type LojaDeTeste,
} from "@simpleclick/testing";

import { criarApp } from "../src/app.ts";
import { midiaEmMemoria } from "../src/core/armazenamento-de-midia.ts";
import { limitesDeMidiaDoAmbiente } from "../src/core/conferencia-de-midia.ts";
import {
  bancoDaAdministracao,
  encerrarBanco,
  encerrarBancoDaAdministracao,
} from "../src/core/db.ts";
import { criarLimpezaDosStories } from "../src/core/limpeza-dos-stories.ts";
import { ESPERA_DA_ADMINISTRACAO, ORIGEM_DA_ADMINISTRACAO } from "./apoio-da-administracao.ts";
import { sessao } from "./apoio-da-fundacao.ts";
import { exigirVariavel, SENHA_DA_APLICACAO } from "./apoio-de-isolamento.ts";
import { mp4DeProva, pngDeProva, webmDeProva } from "./apoio-de-midia.ts";

const armazenamento = midiaEmMemoria();
const limites = {
  ...limitesDeMidiaDoAmbiente({}),
  videoTamanhoMaximoBytes: 4_096,
  videoDuracaoMaximaSegundos: 60,
  videosPorProduto: 2,
};

let app: ReturnType<typeof criarApp>;
let migrador: pg.Client;
let pastelaria: LojaDeTeste;
let roupas: LojaDeTeste;
let equipe: IdentidadeDeTeste;
let pessoa: IdentidadeDeTeste;
let admin: IdentidadeDeTeste;
let produtoId = "";

const dono = () => sessao(pastelaria.dono.id, "OWNER");

function enviar(caminho: string, bytes: Buffer, cabecalhos: Record<string, string>) {
  return request(app)
    .post(caminho)
    .set({ ...cabecalhos, "content-type": "application/octet-stream" })
    .send(bytes);
}

async function criarProduto(loja: LojaDeTeste, nome: string): Promise<string> {
  const cabecalhos = sessao(loja.dono.id, "OWNER");
  const categoria = await request(app)
    .post(`/v1/lojas/${loja.apelido}/catalogo/categorias`)
    .set(cabecalhos)
    .send({ nome: "Destaques", descricao: null, visivel: true });
  const criado = await request(app)
    .post(`/v1/lojas/${loja.apelido}/catalogo/produtos`)
    .set(cabecalhos)
    .send({
      nome,
      descricao: `${nome} feito na hora`,
      categoriaId: String(categoria.body.id),
      precoCentavos: 1500,
      status: "PUBLISHED",
      disponivel: true,
      publicarNoFeed: true,
    });
  if (criado.status !== 201) {
    throw new Error(`produto não criado: ${criado.status} ${JSON.stringify(criado.body)}`);
  }
  return String(criado.body.id);
}

beforeAll(async () => {
  const url = new URL(bancoDoArquivo().url);
  const daAplicacao = new URL(url);
  daAplicacao.username = "sc_app";
  daAplicacao.password = SENHA_DA_APLICACAO;
  const daAdministracao = new URL(url);
  daAdministracao.username = "sc_admin";
  daAdministracao.password = exigirVariavel("SENHA_BANCO_ADMINISTRACAO");
  process.env.DATABASE_URL = daAplicacao.toString();
  process.env.DATABASE_URL_ADMINISTRACAO = daAdministracao.toString();
  app = criarApp({
    origens: [ORIGEM_DA_ADMINISTRACAO],
    administracao: { enviarConvite: async () => {} },
    midia: { armazenamento, limites },
  });

  migrador = await conectarNoBancoDoArquivo();
  pastelaria = await criarLoja({ nome: "Pastelaria da Vila", ramo: "lanchonete" });
  roupas = await criarLoja({ nome: "Moda Centro", ramo: "roupas" });
  equipe = await criarIdentidade();
  await criarMembro({ loja: pastelaria, identidade: equipe, papel: "STAFF" });
  pessoa = await criarIdentidade();
  admin = await criarAdministradorDaPlataforma();
  await migrador.query(
    `INSERT INTO app.store_settings (store_id, landing)
     VALUES ($1, '{"logo":"https://midia.teste/logo-pastelaria.png"}'::jsonb)
     ON CONFLICT (store_id) DO UPDATE SET landing = excluded.landing`,
    [pastelaria.id],
  );
  produtoId = await criarProduto(pastelaria, "Pastel de queijo");
}, ESPERA_DA_ADMINISTRACAO);

afterAll(async () => {
  await encerrarBanco();
  await encerrarBancoDaAdministracao();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

describe("vídeo do produto", () => {
  const base = () => `/v1/lojas/${pastelaria.apelido}/catalogo/produtos/${produtoId}`;

  it("confere o tipo REAL, a duração e o tamanho antes de guardar", async () => {
    const falso = await enviar(`${base()}/videos`, Buffer.from("nao sou video".repeat(30)), dono());
    expect(falso.status).toBe(400);
    expect(falso.body.erro).toBe("video_invalido");

    const mov = await enviar(`${base()}/videos`, mp4DeProva(5_000, { marca: "qt  " }), dono());
    expect(mov.body.erro).toBe("video_invalido");

    const longo = await enviar(`${base()}/videos`, mp4DeProva(90_000), dono());
    expect(longo.status).toBe(400);
    expect(longo.body.erro).toBe("video_longo_demais");

    const semDuracao = await enviar(`${base()}/videos`, webmDeProva(), dono());
    expect(semDuracao.body.erro).toBe("video_sem_duracao");

    const grande = await enviar(`${base()}/videos`, mp4DeProva(5_000, { recheio: 8_000 }), dono());
    expect(grande.status).toBe(413);
    expect(grande.body.erro).toBe("video_grande_demais");

    expect(armazenamento.arquivos.size).toBe(0);
  });

  it("guarda mp4 e webm (com a duração do painel), até o limite por produto", async () => {
    const mp4 = await enviar(`${base()}/videos`, mp4DeProva(12_345), dono());
    expect(mp4.status).toBe(201);
    expect(mp4.body).toMatchObject({
      tipo: "video",
      duracaoSegundos: 12.3,
      largura: 1080,
      altura: 1920,
      formato: "video/mp4",
      principal: false,
    });

    // A equipe com catalogo.produtos também envia.
    const webm = await enviar(
      `${base()}/videos?duracaoSegundos=8`,
      webmDeProva(),
      sessao(equipe.id, "CUSTOMER"),
    );
    expect(webm.status).toBe(201);
    expect(webm.body.duracaoSegundos).toBe(8);

    const terceiro = await enviar(`${base()}/videos`, mp4DeProva(3_000), dono());
    expect(terceiro.status).toBe(400);
    expect(terceiro.body.erro).toBe("limite_de_videos");
    expect(armazenamento.arquivos.size).toBe(2);
  });

  it("quem não é da loja não envia", async () => {
    const estranho = await enviar(
      `${base()}/videos`,
      mp4DeProva(3_000),
      sessao(pessoa.id, "CUSTOMER"),
    );
    expect([401, 403]).toContain(estranho.status);
  });

  it("capa, galeria mista e ordem; vitrine e feed devolvem as mídias", async () => {
    await migrador.query(
      `INSERT INTO app.product_images (store_id, product_id, url, is_primary, sort_order)
       VALUES ($1, $2, 'https://midia.teste/foto.png', true, 0)`,
      [pastelaria.id, produtoId],
    );
    const galeria = await request(app).get(`${base()}/midias`).set(dono());
    expect(galeria.status).toBe(200);
    const tipos = galeria.body.midias.map((m: { tipo: string }) => m.tipo);
    expect(tipos).toEqual(["imagem", "video", "video"]);
    const [foto, primeiroVideo, segundoVideo] = galeria.body.midias as {
      id: string;
      tipo: "imagem" | "video";
    }[];

    const capa = await enviar(`${base()}/videos/${segundoVideo!.id}/capa`, pngDeProva(), dono());
    expect(capa.status).toBe(200);
    expect(capa.body.capa).toMatch(/^https:\/\/midia\.teste\/.+\.png$/);

    const reordenada = await request(app)
      .put(`${base()}/midias/ordem`)
      .set(dono())
      .send({ ordem: [segundoVideo, foto].map((m) => ({ tipo: m!.tipo, id: m!.id })) });
    expect(reordenada.status).toBe(200);
    expect(reordenada.body.midias.map((m: { id: string }) => m.id)).toEqual([
      segundoVideo!.id,
      foto!.id,
      primeiroVideo!.id,
    ]);

    const estranha = await request(app)
      .put(`${base()}/midias/ordem`)
      .set(dono())
      .send({ ordem: [{ tipo: "video", id: "00000000-0000-4000-8000-000000000000" }] });
    expect(estranha.body.erro).toBe("midia_desconhecida");

    const vitrine = await request(app).get(
      `/v1/vitrine/${pastelaria.apelido}/produto/${produtoId}`,
    );
    expect(vitrine.status).toBe(200);
    expect(vitrine.body.midias.map((m: { tipo: string }) => m.tipo)).toEqual([
      "video",
      "imagem",
      "video",
    ]);
    expect(vitrine.body.midias[0].capa).toBe(capa.body.capa);

    const feed = await request(app).get("/v1/feed/produtos");
    const post = feed.body.produtos.find((p: { id: string }) => p.id === produtoId);
    expect(post.midias.map((m: { tipo: string }) => m.tipo)).toEqual([
      "video",
      "imagem",
      "video",
    ]);
    expect(post.loja).toMatchObject({
      fotoDePerfil: "https://midia.teste/logo-pastelaria.png",
      iniciais: "PV",
    });
  });

  it("apagar o vídeo apaga o arquivo", async () => {
    const galeria = await request(app).get(`${base()}/midias`).set(dono());
    const video = galeria.body.midias.find((m: { tipo: string }) => m.tipo === "video");
    const antes = armazenamento.arquivos.size;
    const apagado = await request(app).delete(`${base()}/videos/${video.id}`).set(dono());
    expect(apagado.status).toBe(204);
    expect(armazenamento.arquivos.size).toBeLessThan(antes);
    const de_novo = await request(app).delete(`${base()}/videos/${video.id}`).set(dono());
    expect(de_novo.status).toBe(404);
  });
});

describe("stories de 24 horas", () => {
  const caminho = (loja: LojaDeTeste) => `/v1/lojas/${loja.apelido}/stories`;
  let fotoId = "";

  it("a loja posta foto (com legenda e link) e vídeo; recusa link de fora", async () => {
    const foto = await enviar(
      `${caminho(pastelaria)}?legenda=${encodeURIComponent("Saiu agora!")}&link=/loja/${pastelaria.apelido}`,
      pngDeProva(),
      dono(),
    );
    expect(foto.status).toBe(201);
    expect(foto.body).toMatchObject({
      tipo: "imagem",
      legenda: "Saiu agora!",
      link: `/loja/${pastelaria.apelido}`,
      visualizacoes: 0,
    });
    fotoId = foto.body.id;
    const vinteQuatroHoras =
      new Date(foto.body.expiraEm).getTime() - new Date(foto.body.criadoEm).getTime();
    expect(vinteQuatroHoras).toBe(24 * 3_600_000);

    const video = await enviar(caminho(pastelaria), mp4DeProva(10_000), sessao(equipe.id, "CUSTOMER"));
    expect(video.status).toBe(201);
    expect(video.body.tipo).toBe("video");

    const deFora = await enviar(`${caminho(pastelaria)}?link=https://golpe.example`, pngDeProva(), dono());
    expect(deFora.status).toBe(400);

    const outra = await enviar(caminho(roupas), pngDeProva(), sessao(roupas.dono.id, "OWNER"));
    expect(outra.status).toBe(201);

    const painel = await request(app).get(caminho(pastelaria)).set(dono());
    expect(painel.body.stories).toHaveLength(2);
    expect(painel.body.limite).toEqual({ limite: 30, uso: 2, restante: 28 });
  });

  it("o público vê os ativos por loja, com foto de perfil e iniciais", async () => {
    const lista = await request(app).get("/v1/stories");
    expect(lista.status).toBe(200);
    const pastel = lista.body.lojas.find(
      (l: { loja: { apelido: string } }) => l.loja.apelido === pastelaria.apelido,
    );
    expect(pastel.loja).toEqual({
      apelido: pastelaria.apelido,
      nome: "Pastelaria da Vila",
      fotoDePerfil: "https://midia.teste/logo-pastelaria.png",
      iniciais: "PV",
      corDestaque: null,
    });
    expect(pastel.stories.map((s: { tipo: string }) => s.tipo)).toEqual(["imagem", "video"]);
    expect(pastel.temNaoVistos).toBe(true);

    const soDaLoja = await request(app).get(`/v1/stories?loja=${roupas.apelido}`);
    expect(soDaLoja.body.lojas.map((l: { loja: { iniciais: string } }) => l.loja.iniciais)).toEqual([
      "MC",
    ]);
  });

  it("visto conta uma vez por pessoa; favoritas e não vistas vêm primeiro", async () => {
    const visitante = await request(app)
      .post(`/v1/stories/${fotoId}/visto`)
      .set({ origin: ORIGEM_DA_ADMINISTRACAO });
    expect(visitante.status).toBe(401);

    const comoPessoa = sessao(pessoa.id, "CUSTOMER");
    for (let vez = 0; vez < 2; vez++) {
      const visto = await request(app).post(`/v1/stories/${fotoId}/visto`).set(comoPessoa);
      expect(visto.body).toEqual({ id: fotoId, visto: true });
    }
    const painel = await request(app).get(caminho(pastelaria)).set(dono());
    const foto = painel.body.stories.find((s: { id: string }) => s.id === fotoId);
    expect(foto.visualizacoes).toBe(1);

    // Roupas vira favorita; Pastelaria segue com um story não visto.
    await request(app).post(`/v1/conta/favoritos/${roupas.apelido}`).set(comoPessoa);
    const lista = await request(app).get("/v1/stories").set(comoPessoa);
    const ordem = lista.body.lojas.map(
      (l: { loja: { apelido: string }; favorita: boolean }) => [l.loja.apelido, l.favorita],
    );
    expect(ordem).toEqual([
      [roupas.apelido, true],
      [pastelaria.apelido, false],
    ]);
    const pastel = lista.body.lojas[1];
    expect(pastel.stories.map((s: { visto: boolean }) => s.visto)).toEqual([true, false]);

    // Tudo visto: a loja vai para depois das que têm novidade.
    for (const story of lista.body.lojas[0].stories) {
      await request(app).post(`/v1/stories/${story.id}/visto`).set(comoPessoa);
    }
    const depois = await request(app).get("/v1/stories").set(comoPessoa);
    expect(depois.body.lojas[0].loja.apelido).toBe(pastelaria.apelido);
  });

  it("a administração ajusta o limite de stories ativos (409 acima dele)", async () => {
    const comoAdmin = sessao(admin.id, "ADMIN");
    const ajuste = await request(app)
      .put(`/v1/admin/lojas/${pastelaria.id}/stories/limite`)
      .set(comoAdmin)
      .send({ limite: 2 });
    expect(ajuste.status).toBe(200);
    expect(ajuste.body).toEqual({ padrao: 30, ajuste: 2, limite: 2, ativos: 2 });

    const acima = await enviar(caminho(pastelaria), pngDeProva(), dono());
    expect(acima.status).toBe(409);
    expect(acima.body).toMatchObject({ erro: "limite_atingido", recurso: "stories", limite: 2, uso: 2 });

    const padrao = await request(app)
      .put("/v1/admin/stories/limite")
      .set(comoAdmin)
      .send({ padrao: 50 });
    expect(padrao.body).toEqual({ padrao: 50 });
    const devolvido = await request(app)
      .put(`/v1/admin/lojas/${pastelaria.id}/stories/limite`)
      .set(comoAdmin)
      .send({ limite: null });
    expect(devolvido.body).toMatchObject({ ajuste: null, limite: 50 });

    const lojista = await request(app)
      .put("/v1/admin/stories/limite")
      .set(dono())
      .send({ padrao: 999 });
    expect([401, 403]).toContain(lojista.status);
  });

  it("a loja apaga o story na hora, com o arquivo", async () => {
    const extra = await enviar(caminho(pastelaria), pngDeProva(), dono());
    const antes = armazenamento.arquivos.size;
    const apagado = await request(app).delete(`${caminho(pastelaria)}/${extra.body.id}`).set(dono());
    expect(apagado.status).toBe(204);
    expect(armazenamento.arquivos.size).toBe(antes - 1);
  });

  it("EXPIRA: some das listas na hora e a limpeza apaga arquivo e linha", async () => {
    const limpar = criarLimpezaDosStories({
      armazenamento,
      acesso: () => bancoDaAdministracao(),
    });
    const quantosNoBanco = async () =>
      Number(
        (await migrador.query<{ n: string }>(`SELECT count(*) AS n FROM app.stories`)).rows[0]?.n,
      );
    const total = await quantosNoBanco();
    expect(total).toBe(3);

    // Relógio simulado: agora nada venceu, e a limpeza não toca em nada.
    expect(await limpar(new Date())).toEqual({ apagados: 0, arquivosQueFicaram: 0 });

    // A foto da Pastelaria "envelhece" 25 horas.
    await migrador.query(
      `UPDATE app.stories SET created_at = now() - interval '25 hours',
                               expires_at = now() - interval '1 hour'
        WHERE id = $1`,
      [fotoId],
    );
    const publico = await request(app).get(`/v1/stories?loja=${pastelaria.apelido}`);
    expect(publico.body.lojas[0].stories.map((s: { id: string }) => s.id)).not.toContain(fotoId);
    const painel = await request(app).get(caminho(pastelaria)).set(dono());
    expect(painel.body.stories.map((s: { id: string }) => s.id)).not.toContain(fotoId);
    const visto = await request(app)
      .post(`/v1/stories/${fotoId}/visto`)
      .set(sessao(pessoa.id, "CUSTOMER"));
    expect(visto.status).toBe(404);

    // A limpeza de agora apaga só o vencido: arquivo e linha.
    const arquivosAntes = armazenamento.arquivos.size;
    expect(await limpar(new Date())).toEqual({ apagados: 1, arquivosQueFicaram: 0 });
    expect(armazenamento.arquivos.size).toBe(arquivosAntes - 1);
    expect(await quantosNoBanco()).toBe(2);
    expect(
      (await migrador.query(`SELECT 1 FROM app.story_views WHERE story_id = $1`, [fotoId])).rowCount,
    ).toBe(0);

    // Daqui a 25 horas (relógio simulado), o resto também sai.
    const daquiA25h = new Date(Date.now() + 25 * 3_600_000);
    expect(await limpar(daquiA25h)).toEqual({ apagados: 2, arquivosQueFicaram: 0 });
    expect(await quantosNoBanco()).toBe(0);
    const vazio = await request(app).get("/v1/stories");
    expect(vazio.body.lojas).toEqual([]);
  });

  it("arquivo que não sai mantém a linha para a próxima rodada", async () => {
    const criado = await enviar(caminho(roupas), pngDeProva(), sessao(roupas.dono.id, "OWNER"));
    expect(criado.status).toBe(201);
    const quebrado = {
      ...armazenamento,
      apagar: async () => {
        throw new Error("serviço fora do ar");
      },
    };
    const limpar = criarLimpezaDosStories({
      armazenamento: quebrado,
      acesso: () => bancoDaAdministracao(),
    });
    const depois = new Date(Date.now() + 25 * 3_600_000);
    expect(await limpar(depois)).toEqual({ apagados: 0, arquivosQueFicaram: 1 });
    const limparDeVerdade = criarLimpezaDosStories({
      armazenamento,
      acesso: () => bancoDaAdministracao(),
    });
    expect(await limparDeVerdade(depois)).toEqual({ apagados: 1, arquivosQueFicaram: 0 });
  });
});
