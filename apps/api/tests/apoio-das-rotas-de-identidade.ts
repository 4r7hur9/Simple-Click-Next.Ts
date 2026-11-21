/**
 * Apoio às provas das rotas reais de identidade (T-112): a API montada como
 * em produção (`criarApp` com `NODE_ENV=production`), sobre o banco
 * descartável do arquivo e a credencial que atende requisição, com uma caixa
 * de e-mail de prova e um cache de limite de prova.
 *
 * A caixa guarda as mensagens em vez de mandar: é por ela que a prova pega o
 * link de verificação, o código do login e o link de recuperação, como a
 * pessoa pegaria no e-mail. O cache do limite responde "liberado" ou
 * "barrado" sob comando e anota as chaves que a rota consultou — o script do
 * Redis em si já é provado em `core/limite.redis.test.ts`.
 */
import type { Express } from "express";
import request from "supertest";

import {
  ASSINATURA_DA_PROVA,
  CHAVE_DA_PROVA,
  FRASE_DA_PROVA,
} from "./apoio-da-identidade.ts";
import { criarApp } from "../src/app.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import type { CacheDoLimite } from "../src/core/limite.ts";
import type {
  MensagemDeAcesso,
  SaidaDeEmail,
} from "../src/modules/auth/emails-de-acesso.ts";

/** A origem do site, a única autorizada a mudar estado nesta prova. */
export const ORIGEM = "https://site.exemplo.test";

/** O ambiente de produção da prova: segredos sorteados, nunca do disco. */
export const AMBIENTE_DE_PRODUCAO = {
  NODE_ENV: "production",
  JWT_SECRET: ASSINATURA_DA_PROVA,
  URL_DO_SITE: ORIGEM,
  CHAVE_CIFRA_TOTP: CHAVE_DA_PROVA,
};

export { FRASE_DA_PROVA };

/** Caixa de e-mail de prova: guarda o que a API mandaria. */
export function caixaDeEmail() {
  const mensagens: MensagemDeAcesso[] = [];
  const saida: SaidaDeEmail = {
    disponivel: true,
    enviar: async (mensagem) => {
      mensagens.push(mensagem);
    },
  };
  return {
    mensagens,
    saida,
    /** As mensagens que foram para um endereço. */
    para: (email: string) =>
      mensagens.filter((mensagem) => mensagem.destinatario === email),
    /** O token do último link mandado para o endereço. */
    ultimoToken(email: string): string {
      const corpo = mensagens
        .filter((m) => m.destinatario === email)
        .at(-1)?.corpo;
      const token = corpo?.match(/token=([A-Za-z0-9_%-]+)/)?.[1];
      if (token === undefined) throw new Error("nenhum link para " + email);
      return decodeURIComponent(token);
    },
    /** O último código de seis dígitos mandado para o endereço. */
    ultimoCodigo(email: string): string {
      const corpo = mensagens
        .filter((m) => m.destinatario === email)
        .at(-1)?.corpo;
      const codigo = corpo?.match(/código de acesso é (\d{6})/)?.[1];
      if (codigo === undefined) throw new Error("nenhum código para " + email);
      return codigo;
    },
  };
}

export type CaixaDeEmail = ReturnType<typeof caixaDeEmail>;

/** Cache do limite de prova: libera ou barra sob comando, e anota chaves. */
export function cacheDoLimiteDeProva() {
  const chaves: string[] = [];
  const estado = { barrar: false };
  const cache: CacheDoLimite = {
    async executarScript(_script, chavesDoScript) {
      chaves.push(...chavesDoScript);
      // {barrado, esperaMs, tentativasRestantes, bloqueiosSeguidos, bloqueioNovo}
      return estado.barrar ? [1, 60_000, 0, 1, 0] : [0, 0, 9, 0, 0];
    },
  };
  return { cache, chaves, estado };
}

/** A API inteira, como em produção, sobre o acesso informado. */
export function montarApi(
  acesso: AcessoAoBanco,
  extra: {
    readonly caixa?: CaixaDeEmail;
    readonly limite?: ReturnType<typeof cacheDoLimiteDeProva>;
    readonly fonte?: Record<string, string | undefined>;
  } = {},
): Express {
  return criarApp({
    origens: [ORIGEM],
    identidade: {
      fonte: extra.fonte ?? AMBIENTE_DE_PRODUCAO,
      acesso: () => acesso,
      ...(extra.caixa === undefined ? {} : { email: extra.caixa.saida }),
      cacheDoLimite: (extra.limite ?? cacheDoLimiteDeProva()).cache,
    },
    // As rotas internas da conta (dados, senha, sessões) leem do mesmo banco
    // da prova: sem isto elas abriam o acesso padrão do ambiente e não
    // achavam a identidade criada aqui (401 `nao_autenticado`).
    contaInterna: { acesso },
  });
}

/** POST numa rota de `/v1/auth`, vindo do site. */
export function enviar(
  app: Express,
  caminho: string,
  corpo?: object,
  cabecalhos: Record<string, string> = {},
) {
  const chamada = request(app)
    .post(`/v1/auth${caminho}`)
    .set("Origin", ORIGEM)
    .set(cabecalhos);
  return corpo === undefined ? chamada : chamada.send(corpo);
}

/** Os cabeçalhos Set-Cookie da resposta, sempre como lista. */
export function cookiesDa(resposta: request.Response): string[] {
  const brutos = resposta.headers["set-cookie"] as unknown;
  if (brutos === undefined) return [];
  return Array.isArray(brutos) ? (brutos as string[]) : [String(brutos)];
}

/** O token de renovação do cookie `sc_refresh` da resposta. */
export function refreshDa(resposta: request.Response): string {
  const linha = cookiesDa(resposta).find((c) => c.startsWith("sc_refresh="));
  const valor = linha?.split(";")[0]?.slice("sc_refresh=".length);
  if (valor === undefined || valor === "") throw new Error("sem sc_refresh");
  return decodeURIComponent(valor);
}

/** Cabeçalho de cookie com o token de renovação, como o navegador mandaria. */
export function comCookie(refresh: string): Record<string, string> {
  return { Cookie: `sc_refresh=${encodeURIComponent(refresh)}` };
}

/** Cadastro e verificação pelas rotas de verdade; devolve o e-mail. */
export async function clienteVerificado(
  app: Express,
  _caixa: CaixaDeEmail,
  email: string,
  senha = FRASE_DA_PROVA,
): Promise<string> {
  const cadastro = await enviar(app, "/cadastro", {
    nome: "Pessoa da prova",
    email,
    telefone: "+5511912345678",
    senha,
    aceitouTermos: true,
  });
  // O cadastro já nasce verificado e com a sessão aberta (migração 0047).
  if (cadastro.status !== 201) throw new Error(`cadastro: ${cadastro.status}`);
  return email;
}

/** Login de cliente sem segundo fator: devolve a resposta inteira. */
export function entrar(
  app: Express,
  email: string,
  senha = FRASE_DA_PROVA,
  cabecalhos: Record<string, string> = {},
) {
  return enviar(app, "/login", { email, senha }, cabecalhos);
}
