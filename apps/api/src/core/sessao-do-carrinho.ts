/**
 * O token que diz de quem é o carrinho (AC-500, AC-502).
 *
 * COMPRAR NA VITRINE NÃO EXIGE CADASTRO. É a decisão de produto que separa o
 * SimpleClick do concorrente que pede login antes do cardápio — e ela obriga a
 * responder: se não há conta, quem é o dono do carrinho?
 *
 * A RESPOSTA É UM TOKEN DE SESSÃO, emitido pela API no primeiro contato e
 * guardado num cookie. Ele é o mesmo desenho do token de acompanhamento do
 * pedido (migração 0009): um segredo longo e aleatório, e apresentá-lo é a
 * prova de que foi você quem montou aquele carrinho. É ele que a política do
 * banco confere (migração 0012) — sem o token na transação, o visitante não
 * alcança carrinho nenhum, nem o próprio.
 *
 * O COOKIE É `HttpOnly`, e isso não é excesso: script da página não tem por que
 * ler o token, e não podendo lê-lo, nenhuma biblioteca de terceiro carregada na
 * vitrine consegue roubá-lo. O `SameSite=Lax` funciona porque o site e a API
 * moram no MESMO domínio registrável (decisão de 17/08) — em domínios
 * diferentes o navegador recusaria o cookie e o carrinho se perderia a cada
 * requisição, que foi justamente o problema que aquela decisão evitou.
 *
 * POR QUE ELE MORA EM `core`, e não no módulo do carrinho. Ele nasceu lá na
 * T-511, quando só o carrinho o usava. A rota que fecha o pedido precisa da
 * MESMA sessão — é ela que diz de quem é o carrinho que está sendo fechado —, e
 * a tabela de fronteiras não autoriza um módulo a importar outro. A regra do
 * projeto para isso é uma só: o que dois módulos precisam sobe. Aqui ele fica
 * ao lado de `cors.ts` e `validar.ts`, que são da mesma natureza — cuidado de
 * borda com o que chega pelo HTTP.
 *
 * QUEM EMITE É A API, e não a tela. Se o cliente escolhesse o próprio token,
 * escolheria o de outra pessoa: os dois carrinhos passariam a ser o mesmo, e o
 * visitante veria o que o vizinho está prestes a comprar.
 */
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";

/** O nome do cookie. Prefixo `sc_` para não colidir com o de ninguém. */
export const COOKIE_DA_SESSAO = "sc_carrinho";

/**
 * Quanto tempo o carrinho sobrevive.
 *
 * Trinta dias porque o AC-500 pede que ele sobreviva a fechar o navegador, e
 * quem monta um pedido no ônibus costuma terminá-lo em casa. Menos que isso
 * transformaria "voltar amanhã" em "começar de novo".
 */
const DURACAO_EM_SEGUNDOS = 30 * 24 * 60 * 60;

/** 32 bytes de aleatoriedade — o mesmo tamanho do token de acompanhamento. */
const BYTES_DO_TOKEN = 32;

/**
 * Lê os cookies do cabeçalho, sem biblioteca.
 *
 * O Express 5 não os analisa sozinho, e trazer uma dependência para partir uma
 * linha por ponto e vírgula não se paga — é a mesma decisão que a verificação
 * do cache tomou ao falar o protocolo do Redis à mão.
 *
 * Valor com `=` dentro é preservado inteiro: `base64url` não gera `=`, mas
 * partir só no primeiro separador é o comportamento correto para qualquer
 * cookie que venha a morar aqui.
 */
export function lerCookies(cabecalho: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (cabecalho === undefined || cabecalho === "") return cookies;

  for (const pedaco of cabecalho.split(";")) {
    const separador = pedaco.indexOf("=");
    if (separador <= 0) continue;
    const nome = pedaco.slice(0, separador).trim();
    const valor = pedaco.slice(separador + 1).trim();
    if (nome !== "") cookies.set(nome, decodeURIComponent(valor));
  }

  return cookies;
}

/**
 * Um token só é aceito se TIVER CARA DE TOKEN NOSSO.
 *
 * Sem esta conferência, um cookie escrito à mão com um valor curto viraria uma
 * sessão válida — e duas pessoas que escolhessem o mesmo valor dividiriam o
 * carrinho. Não é autenticação: é recusar entrada malformada na borda (P-007).
 */
const FORMATO_DO_TOKEN = /^[A-Za-z0-9_-]{40,64}$/;

export function pareceToken(valor: string | undefined): valor is string {
  return valor !== undefined && FORMATO_DO_TOKEN.test(valor);
}

/** Cria um token novo. */
export function novoToken(): string {
  return randomBytes(BYTES_DO_TOKEN).toString("base64url");
}

/**
 * Devolve o token da requisição, emitindo um se ainda não houver.
 *
 * O COOKIE É REESCRITO A CADA CONTATO, de propósito: sem isso o prazo de trinta
 * dias contaria do primeiro acesso, e o carrinho de quem volta toda semana
 * morreria no mesmo dia mesmo em uso constante.
 */
export function sessaoDoCarrinho(req: Request, res: Response): string {
  const existente = lerCookies(req.headers.cookie).get(COOKIE_DA_SESSAO);
  const token = pareceToken(existente) ? existente : novoToken();

  res.cookie(COOKIE_DA_SESSAO, token, {
    httpOnly: true,
    sameSite: "lax",
    // Fora de desenvolvimento o cookie só viaja em conexão cifrada. Em
    // desenvolvimento o ambiente local já serve TLS, mas quem rodar a API sem o
    // roteador na frente perderia o carrinho sem entender por quê.
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge: DURACAO_EM_SEGUNDOS * 1000,
  });

  return token;
}
