/**
 * Catálogo do contrato: o que a API promete ao aplicativo nativo. A geração do
 * documento publicado (`apps/api/src/contracts/gerar.ts`) percorre esta lista;
 * o Express monta as rotas à parte. Rota fora daqui não existe para o
 * aplicativo, e o portão compara o catálogo com o documento publicado.
 */

import type { z } from "zod";
import { esquemaDeErro } from "./erro.ts";
import {
  esquemaDeItemDoCarrinho,
  esquemaDeItemParaAcrescentar,
  esquemaDeOpcaoNoCarrinho,
  esquemaDoCarrinho,
  esquemaDaConferencia,
  esquemaDaDeclaracao,
  esquemaDeItemConferido,
  esquemaDeMudancaNoCarrinho,
  rotaDeAcrescentarItem,
  rotaDeConferirCarrinho,
  rotaDeMudarQuantidade,
  rotaDeRemoverItem,
  rotaDeVerCarrinho,
  esquemaDoContato,
  esquemaDoPedidoCriado,
  esquemaDoPedidoParaCriar,
  rotaDeCriarPedido,
} from "./carrinho.ts";
import { montarCatalogo, type RotaDoContrato } from "./rota.ts";
import {
  esquemaDaSessaoAberta,
  esquemaDoResultadoDoLogin,
  esquemaDoResultadoDoSegundoFator,
} from "./auth.ts";
import { ROTAS_DA_IDENTIDADE } from "./auth-rotas.ts";
import { esquemaDaLojaDaSessao, esquemaDoEu, rotaDoEu } from "./eu.ts";
import { esquemaDeIdentificacaoDaApi, rotaDeIdentificacao } from "./saude.ts";
import {
  esquemaDaVitrine,
  esquemaDeAbertura,
  esquemaDeEnderecoDaLoja,
  esquemaDeLojaPublica,
  esquemaDeRotulosDoRamo,
  esquemaDeGrupoDeEscolha,
  esquemaDeImagemDoProduto,
  esquemaDeOpcao,
  esquemaDeVariacao,
  esquemaDoProduto,
  rotaDaVitrine,
  rotaDoCatalogo,
  rotaDoProduto,
  esquemaDaChavePix,
  esquemaDaEntregaDaLoja,
  esquemaDoFechamento,
  rotaDoFechamento,
} from "./vitrine.ts";

export const ROTAS_DO_CONTRATO: readonly RotaDoContrato[] = montarCatalogo([
  rotaDeIdentificacao,
  rotaDaVitrine,
  rotaDoCatalogo,
  rotaDoProduto,
  rotaDeVerCarrinho,
  rotaDeAcrescentarItem,
  rotaDeMudarQuantidade,
  rotaDeRemoverItem,
  rotaDeConferirCarrinho,
  rotaDoFechamento,
  rotaDeCriarPedido,
  ...ROTAS_DA_IDENTIDADE,
  rotaDoEu,
]);

/**
 * Esquemas que o documento publica com nome próprio.
 *
 * Sem nome, cada rota levaria uma cópia do mesmo esquema para dentro do
 * documento, e o cliente gerado do aplicativo nasceria com quatro tipos
 * idênticos de nomes diferentes. Com nome, vira uma referência só.
 */
export const ESQUEMAS_DO_CONTRATO: Readonly<Record<string, z.ZodType>> =
  Object.freeze({
    Erro: esquemaDeErro,
    IdentificacaoDaApi: esquemaDeIdentificacaoDaApi,
    Vitrine: esquemaDaVitrine,
    LojaPublica: esquemaDeLojaPublica,
    RotulosDoRamo: esquemaDeRotulosDoRamo,
    Abertura: esquemaDeAbertura,
    EnderecoDaLoja: esquemaDeEnderecoDaLoja,
    Produto: esquemaDoProduto,
    GrupoDeEscolha: esquemaDeGrupoDeEscolha,
    Opcao: esquemaDeOpcao,
    Variacao: esquemaDeVariacao,
    ImagemDoProduto: esquemaDeImagemDoProduto,
    Carrinho: esquemaDoCarrinho,
    ItemDoCarrinho: esquemaDeItemDoCarrinho,
    OpcaoNoCarrinho: esquemaDeOpcaoNoCarrinho,
    ItemParaAcrescentar: esquemaDeItemParaAcrescentar,
    Conferencia: esquemaDaConferencia,
    ItemConferido: esquemaDeItemConferido,
    MudancaNoCarrinho: esquemaDeMudancaNoCarrinho,
    DeclaracaoDaTela: esquemaDaDeclaracao,
    Fechamento: esquemaDoFechamento,
    ChavePix: esquemaDaChavePix,
    EntregaDaLoja: esquemaDaEntregaDaLoja,
    PedidoParaCriar: esquemaDoPedidoParaCriar,
    PedidoCriado: esquemaDoPedidoCriado,
    ContatoDoPedido: esquemaDoContato,
    SessaoAberta: esquemaDaSessaoAberta,
    ResultadoDoLogin: esquemaDoResultadoDoLogin,
    ResultadoDoSegundoFator: esquemaDoResultadoDoSegundoFator,
    Eu: esquemaDoEu,
    LojaDaSessao: esquemaDaLojaDaSessao,
  });

/**
 * Situação de falha que vale para toda rota.
 *
 * A API responde 404 em JSON para endereço desconhecido desde a T-019; deixar
 * isso fora do documento faria o aplicativo nativo tratar a resposta como
 * corpo vazio.
 */
export const ERROS_DE_TODA_ROTA: readonly number[] = Object.freeze([404]);

/** Descrição de cada domínio, como o documento agrupa as rotas. */
export const ETIQUETAS_DO_CONTRATO: Readonly<Record<string, string>> =
  Object.freeze({
    saude: "Sinais de vida e prontidão da API",
    vitrine:
      "O que o público vê de uma loja. Nunca devolve chave PIX, documento, telefone do dono nem configuração interna.",
    carrinho:
      "O carrinho do visitante, identificado por um token de sessão que a API emite como cookie. Comprar não exige cadastro.",
    identidade:
      "Cadastro, verificação de e-mail, login com segundo fator, sessão, recuperação de senha, aplicativo autenticador e convite do dono. Respostas neutras: nada revela se um e-mail tem conta.",
  });
