/**
 * Prova das rotas reais de identidade (T-112): cadastro, verificação de
 * e-mail, login, segundo fator, sessão, limite de tentativas e o que a API
 * publicada faz sem atalho de desenvolvimento e sem provedor de e-mail.
 *
 * Contra PostgreSQL de verdade, pela credencial que atende requisição, com a
 * API montada como em produção e chamada por HTTP. Recuperação de senha,
 * convite, aplicativo autenticador e "encerrar todas" estão em
 * `rotas-da-conta-segura.test.ts`.
 */
import { createHash } from "node:crypto";

import type { Express } from "express";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MENSAGEM_DE_ENVIO_INDISPONIVEL } from "@simpleclick/contracts";
import { bancoDoArquivo, conectarNoBancoDoArquivo } from "@simpleclick/testing";

import { emailNovo } from "./apoio-da-conta.ts";
import {
  cacheDoLimiteDeProva,
  caixaDeEmail,
  clienteVerificado,
  comCookie,
  cookiesDa,
  enviar,
  entrar,
  FRASE_DA_PROVA,
  montarApi,
  refreshDa,
} from "./apoio-das-rotas-de-identidade.ts";
import {
  codigoDiferente,
  donaComSenha,
  sessoesDe,
} from "./apoio-do-segundo-fator.ts";
import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { ASSUNTOS_DE_ACESSO } from "../src/modules/auth/emails-de-acesso.ts";
import { derivarSenha } from "../src/modules/auth/senha.ts";
import {
  gerarTokenDeVerificacao,
  resumirTokenDeVerificacao,
} from "../src/modules/auth/verificar-email.usecase.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let outraInstancia: AcessoAoBanco;
let app: Express;
const caixa = caixaDeEmail();
const limite = cacheDoLimiteDeProva();

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  outraInstancia = abrirAcessoDaAplicacao(bancoDoArquivo().url, {
    maxDeConexoes: 4,
  });
  app = montarApi(acesso, { caixa, limite });
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await outraInstancia?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

async function contasCom(email: string): Promise<number> {
  const { rows } = await migrador.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM app.identities WHERE email_norm = $1`,
    [email],
  );
  return rows[0]?.total ?? 0;
}

function cadastrar(aplicacao: Express, email: string, senha = FRASE_DA_PROVA) {
  return enviar(aplicacao, "/cadastro", {
    nome: "Pessoa da prova",
    email,
    telefone: "+5511912345678",
    senha,
    aceitouTermos: true,
  });
}

/**
 * Conta antiga, ainda pendente de verificação, com um link aberto. O cadastro
 * de hoje já nasce verificado; o link continua valendo para essas contas.
 */
async function contaPendenteComLink(email: string): Promise<string> {
  const { rows } = await migrador.query<{ id: string }>(
    `INSERT INTO app.identities (email_norm, display_name, password_hash)
     VALUES ($1, 'Pessoa da prova', $2) RETURNING id::text AS id`,
    [email, await derivarSenha(FRASE_DA_PROVA)],
  );
  const token = gerarTokenDeVerificacao();
  await migrador.query(
    `INSERT INTO app.verification_codes
       (identity_id, purpose, channel, code_hash, expires_at)
     VALUES ($1, 'EMAIL_VERIFY', 'EMAIL', $2, now() + interval '1 day')`,
    [rows[0]?.id, resumirTokenDeVerificacao(token)],
  );
  return token;
}

describe("cadastro e verificação de e-mail", () => {
  it(
    "@spec:AC-132 @spec:AC-100 cadastro cria a conta já verificada e devolve a sessão aberta, sem link nem código",
    async () => {
      const email = emailNovo();
      const cadastro = await cadastrar(app, email);
      expect(cadastro.status).toBe(201);
      expect(cadastro.body).toMatchObject({
        status: "SESSAO_CRIADA",
        papel: "CUSTOMER",
        cadastrado: true,
      });
      expect(typeof cadastro.body.tokenDeAcesso).toBe("string");
      expect(refreshDa(cadastro)).toBeDefined();
      expect(caixa.para(email)).toEqual([]);

      const { rows } = await migrador.query<{ verificado: boolean }>(
        `SELECT email_verified_at IS NOT NULL AS verificado
           FROM app.identities WHERE email_norm = $1`,
        [email],
      );
      expect(rows[0]?.verificado).toBe(true);

      const depois = await entrar(app, email);
      expect(depois.status).toBe(200);
      expect(depois.body.status).toBe("SESSAO_CRIADA");
    },
    ESPERA_LONGA,
  );

  it(
    "telefone é opcional no cadastro",
    async () => {
      const email = emailNovo();
      const cadastro = await enviar(app, "/cadastro", {
        nome: "Pessoa sem telefone",
        email,
        senha: FRASE_DA_PROVA,
        aceitouTermos: true,
      });
      expect(cadastro.status).toBe(201);
    },
    ESPERA_LONGA,
  );

  it(
    "e-mail que já tem conta volta 409 email_em_uso e não troca a senha",
    async () => {
      const email = emailNovo();
      await cadastrar(app, email);
      const repetido = await cadastrar(
        app,
        email,
        "outra frase longa da tentativa",
      );

      expect(repetido.status).toBe(409);
      expect(repetido.body.erro).toBe("email_em_uso");
      expect(await contasCom(email)).toBe(1);
      expect((await entrar(app, email)).status).toBe(200);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-102 senha fraca volta com o motivo de cada regra e não cria conta",
    async () => {
      const email = emailNovo();
      const resposta = await cadastrar(app, email, "123456");

      expect(resposta.status).toBe(422);
      expect(resposta.body.erro).toBe("senha_fraca");
      expect(resposta.body.mensagem).toContain("12 caracteres");
      expect(resposta.body.mensagem).toContain("vazamentos");
      expect(await contasCom(email)).toBe(0);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-103 o link de uma conta antiga pendente verifica uma vez só",
    async () => {
      const email = emailNovo();
      const token = await contaPendenteComLink(email);
      const primeira = await enviar(app, "/email/verificar", { token });
      expect(primeira.body).toEqual({ situacao: "verificado" });
      const segunda = await enviar(app, "/email/verificar", { token });
      expect(segunda.body).toEqual({ situacao: "invalido" });
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-104 link expirado oferece reenvio, que manda link novo e respeita o limite do período",
    async () => {
      const email = emailNovo();
      const vencido = await contaPendenteComLink(email);
      await migrador.query(
        `UPDATE app.verification_codes SET expires_at = now() - interval '1 minute'
        WHERE code_hash = $1`,
        [resumirTokenDeVerificacao(vencido)],
      );

      const aberto = await enviar(app, "/email/verificar", { token: vencido });
      expect(aberto.body).toEqual({ situacao: "expirado" });

      // O limite é de 3 links por hora, contando o do cadastro.
      for (let vez = 1; vez <= 2; vez += 1) {
        const reenvio = await enviar(app, "/email/reenviar", {
          token: vencido,
        });
        expect(reenvio.body).toEqual({ situacao: "reenviado" });
      }
      const alem = await enviar(app, "/email/reenviar", { token: vencido });
      expect(alem.body.situacao).toBe("limite_atingido");
      expect(Date.parse(alem.body.disponivelEm)).toBeGreaterThan(Date.now());

      const novo = caixa.ultimoToken(email);
      expect(novo).not.toBe(vencido);
      const verificado = await enviar(app, "/email/verificar", { token: novo });
      expect(verificado.body).toEqual({ situacao: "verificado" });
    },
    ESPERA_LONGA,
  );
});

describe("login, segundo fator e sessão", () => {
  it(
    "@spec:AC-105 @spec:AC-106 dona recebe o desafio por e-mail, nenhuma sessão nasce antes do código, e o código vale uma vez",
    async () => {
      const dona = await donaComSenha(migrador);
      const login = await entrar(app, dona.email);
      expect(login.body).toMatchObject({
        status: "DESAFIO_DE_SEGUNDO_FATOR",
        canal: "EMAIL",
      });
      expect(cookiesDa(login)).toEqual([]);
      expect(await sessoesDe(migrador, dona.id)).toHaveLength(0);

      const codigo = caixa.ultimoCodigo(dona.email);
      const desafioId = login.body.desafioId as string;
      const aceito = await enviar(app, "/segundo-fator", { desafioId, codigo });
      expect(aceito.body).toMatchObject({
        status: "SESSAO_CRIADA",
        papel: "OWNER",
      });
      expect(await sessoesDe(migrador, dona.id)).toEqual([
        { role_at_issue: "OWNER" },
      ]);

      const deNovo = await enviar(app, "/segundo-fator", { desafioId, codigo });
      expect(deNovo.body.status).toBe("DESAFIO_INVALIDO");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-107 cinco códigos errados bloqueiam o desafio, e o código certo não vale mais",
    async () => {
      const dona = await donaComSenha(migrador);
      const login = await entrar(app, dona.email);
      const desafioId = login.body.desafioId as string;
      const certo = caixa.ultimoCodigo(dona.email);
      const errado = codigoDiferente(certo);

      for (let restantes = 4; restantes >= 1; restantes -= 1) {
        const tentativa = await enviar(app, "/segundo-fator", {
          desafioId,
          codigo: errado,
        });
        expect(tentativa.body).toEqual({
          status: "CODIGO_INCORRETO",
          tentativasRestantes: restantes,
        });
      }
      const quinta = await enviar(app, "/segundo-fator", {
        desafioId,
        codigo: errado,
      });
      expect(quinta.body.status).toBe("BLOQUEADO");
      const depois = await enviar(app, "/segundo-fator", {
        desafioId,
        codigo: certo,
      });
      expect(depois.body.status).toBe("DESAFIO_INVALIDO");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-108 @spec:AC-109 cliente sem segundo fator entra direto, e o refresh só sai em cookie HttpOnly, Secure e SameSite",
    async () => {
      const email = await clienteVerificado(app, caixa, emailNovo());
      const login = await entrar(app, email);

      expect(login.body).toMatchObject({
        status: "SESSAO_CRIADA",
        papel: "CUSTOMER",
      });
      expect(login.body.tokenDeRenovacao).toBeUndefined();
      const cookie = cookiesDa(login).find((c) => c.startsWith("sc_refresh="));
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=Strict");
      expect(cookie).toContain("Path=/v1/auth");
      expect(JSON.stringify(login.body)).not.toContain(refreshDa(login));
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-110 @spec:AC-129 outra instância renova pelo banco, e o token antigo derruba a família e avisa",
    async () => {
      const email = await clienteVerificado(app, caixa, emailNovo());
      const login = await entrar(app, email);
      const primeiro = refreshDa(login);
      const outra = montarApi(outraInstancia, { caixa, limite });

      const renovada = await enviar(
        outra,
        "/renovar",
        undefined,
        comCookie(primeiro),
      );
      expect(renovada.status).toBe(200);
      const segundo = refreshDa(renovada);
      expect(segundo).not.toBe(primeiro);

      const reuso = await enviar(
        app,
        "/renovar",
        undefined,
        comCookie(primeiro),
      );
      expect(reuso.status).toBe(401);
      expect(caixa.para(email).at(-1)?.assunto).toBe(
        ASSUNTOS_DE_ACESSO.reusoDeSessao,
      );
      const familiaCaiu = await enviar(
        outra,
        "/renovar",
        undefined,
        comCookie(segundo),
      );
      expect(familiaCaiu.status).toBe(401);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-111 cliente nativo recebe o par no corpo, sem cookie, e renova pelo corpo",
    async () => {
      const email = await clienteVerificado(app, caixa, emailNovo());
      const nativo = { "x-simpleclick-client": "nativo" };
      const login = await entrar(app, email, FRASE_DA_PROVA, nativo);

      expect(cookiesDa(login)).toEqual([]);
      expect(login.body.tokenDeRenovacao).toEqual(expect.any(String));
      const renovada = await enviar(
        app,
        "/renovar",
        { tokenDeRenovacao: login.body.tokenDeRenovacao },
        nativo,
      );
      expect(renovada.status).toBe(200);
      expect(renovada.body.tokenDeRenovacao).not.toBe(
        login.body.tokenDeRenovacao,
      );
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-112 sair revoga no servidor e apaga o cookie; o token anterior não renova mais",
    async () => {
      const email = await clienteVerificado(app, caixa, emailNovo());
      const refresh = refreshDa(await entrar(app, email));

      const saida = await enviar(
        app,
        "/sessoes/atual/encerrar",
        undefined,
        comCookie(refresh),
      );
      expect(saida.body).toEqual({ encerrada: true });
      expect(cookiesDa(saida).join()).toContain("sc_refresh=; Max-Age=0");
      const depois = await enviar(
        app,
        "/renovar",
        undefined,
        comCookie(refresh),
      );
      expect(depois.status).toBe(401);
    },
    ESPERA_LONGA,
  );
});

describe("limite, atalho de desenvolvimento e e-mail", () => {
  function balde(escopo: string, identificador: string): string {
    const resumo = createHash("sha256")
      .update(identificador)
      .digest("base64url")
      .slice(0, 32);
    return `sc:limite:login:${escopo}:${resumo}`;
  }

  it(
    "@spec:AC-119 @spec:AC-120 o limite está montado: barra antes da senha e conta a conta e o endereço real da borda",
    async () => {
      const email = await clienteVerificado(app, caixa, emailNovo());
      const borda = { "X-Forwarded-For": "203.0.113.7" };

      limite.estado.barrar = true;
      const barrada = await entrar(app, email, FRASE_DA_PROVA, borda);
      limite.estado.barrar = false;
      expect(barrada.status).toBe(429);
      expect(barrada.body.erro).toBe("muitas_tentativas");

      limite.chaves.length = 0;
      const errada = await entrar(app, email, "senha errada da prova", borda);
      expect(errada.status).toBe(401);
      expect(limite.chaves).toContain(balde("origem", "203.0.113.7"));
      // Consulta antes da senha e a falha contada depois dela.
      expect(
        limite.chaves.filter((c) => c === balde("conta", email)),
      ).toHaveLength(2);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-132 em produção o atalho de desenvolvimento não existe, mesmo com a credencial no ambiente",
    async () => {
      const anterior = { ...process.env };
      process.env.SIMPLECLICK_DEV_TEST_EMAIL = "atalho@exemplo.test";
      process.env.SIMPLECLICK_DEV_TEST_PHRASE =
        "frase do atalho local da prova";
      process.env.JWT_SECRET ??= "segredo-qualquer-com-mais-de-trinta-e-dois";
      try {
        const producao = montarApi(acesso, { caixa });
        const resposta = await entrar(
          producao,
          "atalho@exemplo.test",
          "frase do atalho local da prova",
        );
        expect(resposta.status).toBe(401);
        expect(resposta.body.erro).toBe("credenciais_invalidas");
        expect(await contasCom("atalho@exemplo.test")).toBe(0);
      } finally {
        process.env = anterior;
      }
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-133 sem provedor, o cadastro funciona e a recuperação diz que o envio está indisponível, igual para conta existente e inexistente",
    async () => {
      const semProvedor = montarApi(acesso);
      const existente = await clienteVerificado(app, caixa, emailNovo());
      const inexistente = emailNovo();

      // O cadastro não manda e-mail: funciona mesmo sem provedor.
      const cadastro = await cadastrar(semProvedor, emailNovo());
      expect(cadastro.status).toBe(201);
      const pedidos = await Promise.all(
        [existente, inexistente].map((email) =>
          enviar(semProvedor, "/senha/esqueci", { email }),
        ),
      );
      for (const resposta of pedidos) {
        expect(resposta.status).toBe(503);
        expect(resposta.body).toEqual({
          erro: "envio_indisponivel",
          mensagem: MENSAGEM_DE_ENVIO_INDISPONIVEL,
        });
      }
      expect(await contasCom(inexistente)).toBe(0);
    },
    ESPERA_LONGA,
  );
});
