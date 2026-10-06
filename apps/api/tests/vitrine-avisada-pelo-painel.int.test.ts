/**
 * Prova, contra banco de verdade, de que salvar pelo painel AVISA O SITE com o
 * apelido da loja antes de a resposta sair (dívida 93).
 *
 * `apps/api/src/core/aviso-ao-site.test.ts` prova a regra do ponto único com
 * rotas de mentira. Aqui a prova passa pela aplicação montada por `criarApp` —
 * origem, autenticação do dono, vínculo em `store_members`, transação com a
 * loja declarada — e confere que a ligação em `app.ts` está mesmo na frente
 * das rotas do dono: só a gravação aceita avisa; leitura, recusa e dono de
 * outra loja não.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarIdentidade,
  criarLoja,
} from "@simpleclick/testing";
import type { IdentidadeDeTeste } from "@simpleclick/testing";

import {
  gravarSecao,
  lerSecao,
  montarAppDaConfiguracao,
  tokenDoDono,
} from "./apoio-de-configuracao.ts";
import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import type { AvisarOSite } from "../src/core/aviso-ao-site.ts";
import type { AvisoDeMudanca } from "../src/core/cache.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let dono: IdentidadeDeTeste;

/** Avisos recebidos, e quantos terminaram antes de a resposta chegar. */
const avisos: AvisoDeMudanca[] = [];
let concluidos = 0;

/** O site de mentira demora um pouco para responder, como o de verdade. */
const avisarSite: AvisarOSite = async (aviso) => {
  avisos.push(aviso);
  await new Promise((pronto) => setTimeout(pronto, 50));
  concluidos += 1;
  return "enviado";
};

let app: ReturnType<typeof montarAppDaConfiguracao>;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = montarAppDaConfiguracao(acesso, { avisarSite });
  dono = await criarIdentidade({ nome: "Dona Zica" });
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

function limparAvisos(): void {
  avisos.length = 0;
  concluidos = 0;
}

const CONTATO_VALIDO = {
  numero: "(11) 9 1234-5678",
  saudacao: "Olá!",
  publico: true,
};

describe("salvar pelo painel avisa o site (dívida 93)", () => {
  it(
    "@spec:AC-028 a gravação aceita avisa o site com o apelido da loja, e a resposta só sai depois do aviso",
    async () => {
      const loja = await criarLoja({ nome: "Salgaderia Avisada", dono });
      limparAvisos();

      const salvo = await gravarSecao(app, {
        apelido: loja.apelido,
        secao: "contato",
        corpo: CONTATO_VALIDO,
        token: tokenDoDono(dono.id),
      });

      expect(salvo.status).toBe(204);
      expect(avisos).toEqual([{ apelido: loja.apelido }]);
      expect(concluidos).toBe(1);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-028 ler a seção e ter a gravação recusada não avisam: nada mudou na loja",
    async () => {
      const loja = await criarLoja({ nome: "Salgaderia Quieta", dono });
      const token = tokenDoDono(dono.id);
      limparAvisos();

      const lido = await lerSecao(app, loja.apelido, "contato", token);
      const recusado = await gravarSecao(app, {
        apelido: loja.apelido,
        secao: "contato",
        corpo: { ...CONTATO_VALIDO, numero: "(20) 91234-5678" },
        token,
      });

      expect(lido.status).toBe(200);
      expect(recusado.status).toBeGreaterThanOrEqual(400);
      expect(avisos).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-028 dono de outra loja não consegue fazer o site esquecer uma vitrine que não é dele",
    async () => {
      const loja = await criarLoja({ nome: "Salgaderia Alheia", dono });
      const intruso = await criarIdentidade({ nome: "Dono de Outra Loja" });
      limparAvisos();

      const tentativa = await gravarSecao(app, {
        apelido: loja.apelido,
        secao: "contato",
        corpo: CONTATO_VALIDO,
        token: tokenDoDono(intruso.id),
      });

      expect(tentativa.status).toBe(404);
      expect(avisos).toEqual([]);
    },
    ESPERA_LONGA,
  );
});
