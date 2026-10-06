/**
 * Prova das rotas de identidade do que vem depois da entrada (T-112):
 * encerrar todas as sessões, recuperar a senha, aceitar o convite do dono,
 * ativar o aplicativo autenticador e entrar com código de recuperação.
 *
 * Mesma montagem de `rotas-de-identidade.test.ts`: API como em produção,
 * banco descartável, credencial que atende requisição e caixa de e-mail de
 * prova.
 */
import type { Express } from "express";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarAdministradorDaPlataforma,
  criarLoja,
} from "@simpleclick/testing";

import { emailNovo } from "./apoio-da-conta.ts";
import { OUTRA_FRASE_DA_PROVA } from "./apoio-da-identidade.ts";
import {
  caixaDeEmail,
  clienteVerificado,
  comCookie,
  enviar,
  entrar,
  FRASE_DA_PROVA,
  montarApi,
  refreshDa,
} from "./apoio-das-rotas-de-identidade.ts";
import {
  codigoDoAplicativo,
  codigoDiferente,
  darSenha,
  sessoesDe,
} from "./apoio-do-segundo-fator.ts";
import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import {
  gerarTokenDeConvite,
  resumirTokenDeConvite,
} from "../src/modules/auth/convite.usecase.ts";
import { ASSUNTOS_DE_ACESSO } from "../src/modules/auth/emails-de-acesso.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: Express;
const caixa = caixaDeEmail();

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = montarApi(acesso, { caixa });
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

/** O Bearer da sessão aberta pela resposta. */
function comBearer(resposta: { body: { tokenDeAcesso?: string } }) {
  return { Authorization: `Bearer ${resposta.body.tokenDeAcesso ?? ""}` };
}

/** Cliente com o aplicativo ativado pelas rotas; devolve segredo e códigos. */
async function clienteComAplicativo() {
  const email = await clienteVerificado(app, caixa, emailNovo());
  const sessao = await entrar(app, email);
  const preparada = await enviar(
    app,
    "/aplicativo/preparar",
    undefined,
    comBearer(sessao),
  );
  const segredo = preparada.body.segredo as string;
  const ativado = await enviar(
    app,
    "/aplicativo/confirmar",
    { codigo: codigoDoAplicativo(segredo) },
    comBearer(sessao),
  );
  return {
    email,
    sessao,
    segredo,
    preparada,
    ativado,
    codigos: ativado.body.codigosDeRecuperacao as string[],
  };
}

describe("sessões e recuperação de senha", () => {
  it(
    "@spec:AC-113 encerrar todas derruba as sessões dos dois dispositivos na próxima renovação",
    async () => {
      const email = await clienteVerificado(app, caixa, emailNovo());
      const celular = await entrar(app, email);
      const computador = await entrar(app, email);

      const semSessao = await enviar(app, "/sessoes/encerrar-todas");
      expect(semSessao.status).toBe(401);
      const todas = await enviar(
        app,
        "/sessoes/encerrar-todas",
        undefined,
        comBearer(celular),
      );
      expect(todas.body).toEqual({ encerradas: true });

      for (const dispositivo of [celular, computador]) {
        const renovar = await enviar(
          app,
          "/renovar",
          undefined,
          comCookie(refreshDa(dispositivo)),
        );
        expect(renovar.status).toBe(401);
      }
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-114 o pedido de recuperação responde igual exista ou não a conta, e só a conta recebe o link",
    async () => {
      const existente = await clienteVerificado(app, caixa, emailNovo());
      const inexistente = emailNovo();

      const [paraConta, paraNinguem] = await Promise.all(
        [existente, inexistente].map((email) =>
          enviar(app, "/senha/esqueci", { email }),
        ),
      );
      expect(paraConta?.status).toBe(202);
      expect(paraNinguem?.status).toBe(202);
      expect(paraConta?.body).toEqual(paraNinguem?.body);
      expect(caixa.para(existente).at(-1)?.assunto).toBe(
        ASSUNTOS_DE_ACESSO.recuperacao,
      );
      expect(caixa.para(inexistente)).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-115 a nova senha entra, o link não serve de novo e as sessões antigas caem",
    async () => {
      const email = await clienteVerificado(app, caixa, emailNovo());
      const antiga = refreshDa(await entrar(app, email));
      await enviar(app, "/senha/esqueci", { email });
      const token = caixa.ultimoToken(email);

      const fraca = await enviar(app, "/senha/redefinir", {
        token,
        senha: "123456",
      });
      expect(fraca.status).toBe(422);
      const nova = await enviar(app, "/senha/redefinir", {
        token,
        senha: OUTRA_FRASE_DA_PROVA,
      });
      expect(nova.body).toEqual({ redefinida: true });
      const deNovo = await enviar(app, "/senha/redefinir", {
        token,
        senha: OUTRA_FRASE_DA_PROVA,
      });
      expect(deNovo.status).toBe(410);

      expect(
        (await enviar(app, "/renovar", undefined, comCookie(antiga))).status,
      ).toBe(401);
      expect((await entrar(app, email, FRASE_DA_PROVA)).status).toBe(401);
      expect((await entrar(app, email, OUTRA_FRASE_DA_PROVA)).body.status).toBe(
        "SESSAO_CRIADA",
      );
    },
    ESPERA_LONGA,
  );
});

describe("convite do dono", () => {
  it(
    "@spec:AC-200 @spec:AC-103 o convite define a primeira senha uma vez só, e o dono entra pelo segundo fator",
    async () => {
      const loja = await criarLoja();
      const email = emailNovo();
      const token = gerarTokenDeConvite();
      const {
        rows: [convidada],
      } = await migrador.query<{ id: string }>(
        `INSERT INTO app.identities (email_norm, display_name)
       VALUES ($1, 'Dona convidada') RETURNING id`,
        [email],
      );
      await migrador.query(
        `INSERT INTO app.store_members
         (store_id, identity_id, role, invite_token_hash, invite_expires_at)
       VALUES ($1, $2, 'OWNER', $3, now() + interval '7 days')`,
        [loja.id, convidada?.id, resumirTokenDeConvite(token)],
      );

      const aceito = await enviar(app, "/convite/aceitar", {
        token,
        senha: FRASE_DA_PROVA,
      });
      expect(aceito.body).toEqual({ acessoLiberado: true });
      const deNovo = await enviar(app, "/convite/aceitar", {
        token,
        senha: FRASE_DA_PROVA,
      });
      expect(deNovo.status).toBe(410);

      const login = await entrar(app, email);
      expect(login.body).toMatchObject({
        status: "DESAFIO_DE_SEGUNDO_FATOR",
        canal: "EMAIL",
      });
    },
    ESPERA_LONGA,
  );
});

describe("aplicativo autenticador e códigos de recuperação", () => {
  it(
    "@spec:AC-121 @spec:AC-124 ativar exige o código do aplicativo, o login passa a pedir o aplicativo, e o mesmo código não vale duas vezes",
    async () => {
      const email = await clienteVerificado(app, caixa, emailNovo());
      const sessao = await entrar(app, email);
      const preparada = await enviar(
        app,
        "/aplicativo/preparar",
        undefined,
        comBearer(sessao),
      );
      expect(preparada.body.uriDoAplicativo).toMatch(/^otpauth:\/\/totp\//);
      const segredo = preparada.body.segredo as string;

      const errado = await enviar(
        app,
        "/aplicativo/confirmar",
        { codigo: codigoDiferente(codigoDoAplicativo(segredo)) },
        comBearer(sessao),
      );
      expect(errado.status).toBe(422);
      const ativado = await enviar(
        app,
        "/aplicativo/confirmar",
        { codigo: codigoDoAplicativo(segredo) },
        comBearer(sessao),
      );
      expect(ativado.body.status).toBe("ATIVADO");
      expect(ativado.body.codigosDeRecuperacao).toHaveLength(10);

      const codigosPorEmail = () =>
        caixa
          .para(email)
          .filter((m) => m.assunto === ASSUNTOS_DE_ACESSO.codigoDoLogin).length;
      const antes = codigosPorEmail();
      const login = await entrar(app, email);
      expect(login.body).toMatchObject({ canal: "TOTP" });
      expect(codigosPorEmail()).toBe(antes);

      const codigo = codigoDoAplicativo(segredo, 1);
      const aceito = await enviar(app, "/segundo-fator", {
        desafioId: login.body.desafioId,
        codigo,
      });
      expect(aceito.body.status).toBe("SESSAO_CRIADA");

      const outroLogin = await entrar(app, email);
      const repetido = await enviar(app, "/segundo-fator", {
        desafioId: outroLogin.body.desafioId,
        codigo,
      });
      expect(repetido.body.status).toBe("CODIGO_INCORRETO");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-123 o código de recuperação entra uma vez, avisa por e-mail e orienta a configurar o aplicativo",
    async () => {
      const { email, sessao, codigos } = await clienteComAplicativo();
      const [primeiro] = codigos;

      const login = await entrar(app, email);
      const entrada = await enviar(app, "/segundo-fator/recuperacao", {
        desafioId: login.body.desafioId,
        codigo: primeiro,
      });
      expect(entrada.body).toMatchObject({
        status: "SESSAO_CRIADA",
        orientarPara: "/minha-conta/seguranca/aplicativo",
      });
      expect(caixa.para(email).at(-1)?.assunto).toBe(
        ASSUNTOS_DE_ACESSO.codigoDeRecuperacaoUsado,
      );

      const outroLogin = await entrar(app, email);
      const deNovo = await enviar(app, "/segundo-fator/recuperacao", {
        desafioId: outroLogin.body.desafioId,
        codigo: primeiro,
      });
      expect(deNovo.body).toEqual({ status: "CODIGO_INVALIDO" });

      const novos = await enviar(
        app,
        "/aplicativo/codigos-de-recuperacao",
        undefined,
        comBearer(sessao),
      );
      expect(novos.body.codigosDeRecuperacao).toHaveLength(10);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-122 a administração sem aplicativo não recebe sessão nem código por e-mail",
    async () => {
      const administracao = await criarAdministradorDaPlataforma();
      await darSenha(migrador, administracao.id);

      const login = await entrar(app, administracao.email);
      expect(login.body).toEqual({
        status: "CONFIGURACAO_DO_APLICATIVO_OBRIGATORIA",
        caminho: "/minha-conta/seguranca/aplicativo",
      });
      expect(await sessoesDe(migrador, administracao.id)).toHaveLength(0);
      expect(caixa.para(administracao.email)).toEqual([]);
    },
    ESPERA_LONGA,
  );
});
