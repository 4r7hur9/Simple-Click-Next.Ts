/**
 * Prova da apresentação da loja (T-905: AC-916, AC-918).
 *
 * O que o dono publica no painel é o que a página pública mostra — nome,
 * boas-vindas, sobre, logo e capa. A imagem enviada é conferida pelos bytes:
 * o que não é imagem, ou passa do tamanho, é recusado com orientação, e a
 * imagem anterior continua no ar.
 *
 * O serviço de mídia é trocado por um que guarda em memória: o que se prova
 * aqui é a conferência e a costura, e não o serviço de terceiro.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarIdentidade,
  criarLoja,
} from "@simpleclick/testing";
import type { IdentidadeDeTeste, LojaDeTeste } from "@simpleclick/testing";

import {
  gravarSecao,
  lerSecao,
  montarAppDaConfiguracao,
  ORIGEM_DO_PAINEL,
  tokenDoDono,
} from "./apoio-de-configuracao.ts";
import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import type { ImagemParaGuardar } from "../src/core/midia.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: ReturnType<typeof montarAppDaConfiguracao>;
let dono: IdentidadeDeTeste;
let token: string;
const guardadas: ImagemParaGuardar[] = [];

/** Os oito bytes que abrem todo PNG, e um corpo qualquer depois deles. */
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

const APRESENTACAO = {
  nome: "Pastelaria da Zica",
  boasVindas: "O pastel mais crocante do bairro.",
  sobre: "Desde 1998 na feira de domingo, agora com entrega.",
  logo: "https://imagens.exemplo.test/logo.png",
  capa: "https://imagens.exemplo.test/capa.jpg",
  corPrimaria: "#8a3b12",
};

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = montarAppDaConfiguracao(acesso, {
    configuracoes: {
      armazenamento: {
        guardar: async (imagem) => {
          guardadas.push(imagem);
          return {
            url: `https://midia.exemplo.test/${imagem.lojaId}/${imagem.nome}-${guardadas.length}`,
          };
        },
      },
    },
  });
  dono = await criarIdentidade({ nome: "Dona Zica" });
  token = tokenDoDono(dono.id);
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

function publicar(loja: LojaDeTeste, corpo: unknown) {
  return gravarSecao(app, {
    apelido: loja.apelido,
    secao: "aparencia",
    corpo,
    token,
  });
}

function enviarImagem(
  loja: LojaDeTeste,
  tipo: string,
  bytes: Uint8Array,
  tipoDeConteudo = "image/png",
) {
  return request(app)
    .put(`/v1/lojas/${loja.apelido}/configuracao/aparencia/imagem/${tipo}`)
    .set("Origin", ORIGEM_DO_PAINEL)
    .set("Authorization", `Bearer ${token}`)
    .set("Content-Type", tipoDeConteudo)
    .send(Buffer.from(bytes));
}

async function vitrine(loja: LojaDeTeste) {
  const resposta = await request(app).get(`/v1/vitrine/${loja.apelido}`);
  expect(resposta.status).toBe(200);
  return resposta.body.loja as Record<string, unknown>;
}

describe("a apresentação editada aparece na página da loja (AC-916)", () => {
  it(
    "@spec:AC-916 nome, boas-vindas, sobre, logo, capa e cor publicados aparecem exatamente na vitrine",
    async () => {
      const loja = await criarLoja({ nome: "Nome de Cadastro", dono });
      const publicado = await publicar(loja, APRESENTACAO);
      expect(publicado.status).toBe(204);

      const publica = await vitrine(loja);
      expect(publica["nome"]).toBe(APRESENTACAO.nome);
      expect(publica["boasVindas"]).toBe(APRESENTACAO.boasVindas);
      expect(publica["sobre"]).toBe(APRESENTACAO.sobre);
      expect(publica["logo"]).toBe(APRESENTACAO.logo);
      expect(publica["capa"]).toBe(APRESENTACAO.capa);
      expect(publica["cores"]).toMatchObject({ primaria: "#8a3b12" });

      const lido = await lerSecao(app, loja.apelido, "aparencia", token);
      expect(lido.body).toEqual(APRESENTACAO);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-916 a logo enviada como arquivo vai para o serviço de mídia e passa a aparecer na vitrine",
    async () => {
      const loja = await criarLoja({ nome: "Pastelaria do Arquivo", dono });
      await publicar(loja, APRESENTACAO);

      const enviado = await enviarImagem(loja, "logo", PNG);
      expect(enviado.status).toBe(200);
      expect(enviado.body.url).toMatch(/^https:\/\/midia\.exemplo\.test\//);
      expect(guardadas.at(-1)?.tipoDeConteudo).toBe("image/png");
      expect(guardadas.at(-1)?.lojaId).toBe(loja.id);

      expect((await vitrine(loja))["logo"]).toBe(enviado.body.url);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-916 nome de exibição vazio é recusado: a loja não fica sem nome na vitrine",
    async () => {
      const loja = await criarLoja({ nome: "Pastelaria Nomeada", dono });
      const recusado = await publicar(loja, { ...APRESENTACAO, nome: "  " });
      expect(recusado.status).toBe(400);
      expect((await vitrine(loja))["nome"]).toBe("Pastelaria Nomeada");
    },
    ESPERA_LONGA,
  );
});

describe("imagem fora do padrão é recusada com orientação (AC-918)", () => {
  it(
    "@spec:AC-918 arquivo que não é imagem é recusado explicando formato, tamanho e proporção, e a logo anterior continua",
    async () => {
      const loja = await criarLoja({ nome: "Pastelaria do PDF", dono });
      await publicar(loja, APRESENTACAO);
      const antes = guardadas.length;

      const pdf = new TextEncoder().encode("%PDF-1.7 cardápio da semana");
      const recusado = await enviarImagem(loja, "logo", pdf, "image/png");

      expect(recusado.status).toBe(400);
      expect(recusado.body.erro).toBe("imagem_invalida");
      expect(recusado.body.orientacao).toMatchObject({
        formatosAceitos: ["JPEG", "PNG", "WebP"],
        tamanhoMaximo: "1 MB",
      });
      expect(recusado.body.orientacao.proporcaoRecomendada).toMatch(/1:1/);
      expect(recusado.body.mensagem).toMatch(/anterior continua no ar/);
      expect(guardadas.length).toBe(antes);
      expect((await vitrine(loja))["logo"]).toBe(APRESENTACAO.logo);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-918 capa acima do tamanho permitido é recusada, com a proporção larga recomendada, e a anterior continua",
    async () => {
      const loja = await criarLoja({ nome: "Pastelaria Pesada", dono });
      await publicar(loja, APRESENTACAO);
      const antes = guardadas.length;

      const grande = new Uint8Array(3 * 1024 * 1024 + 1);
      grande.set(PNG);
      const recusado = await enviarImagem(loja, "capa", grande);

      expect(recusado.status).toBe(413);
      expect(recusado.body.orientacao).toMatchObject({ tamanhoMaximo: "3 MB" });
      expect(recusado.body.orientacao.proporcaoRecomendada).toMatch(/3:1/);
      expect(guardadas.length).toBe(antes);
      expect((await vitrine(loja))["capa"]).toBe(APRESENTACAO.capa);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-918 sem serviço de mídia no ambiente, o envio diz que está indisponível e nada muda",
    async () => {
      const semServico = montarAppDaConfiguracao(acesso, {
        configuracoes: {
          armazenamento: {
            guardar: async () => {
              const { ErroDeArmazenamentoIndisponivel } =
                await import("../src/core/midia.ts");
              throw new ErroDeArmazenamentoIndisponivel();
            },
          },
        },
      });
      const loja = await criarLoja({ nome: "Pastelaria Offline", dono });
      await publicar(loja, APRESENTACAO);

      const resposta = await request(semServico)
        .put(`/v1/lojas/${loja.apelido}/configuracao/aparencia/imagem/logo`)
        .set("Origin", ORIGEM_DO_PAINEL)
        .set("Authorization", `Bearer ${token}`)
        .set("Content-Type", "image/png")
        .send(Buffer.from(PNG));

      expect(resposta.status).toBe(503);
      expect(resposta.body.mensagem).toMatch(/https:\/\//);
      expect((await vitrine(loja))["logo"]).toBe(APRESENTACAO.logo);
    },
    ESPERA_LONGA,
  );
});
