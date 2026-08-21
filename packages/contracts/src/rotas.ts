/**
 * Catálogo do contrato: tudo que a API promete, num lugar só.
 *
 * É a lista que a geração do documento percorre e a que o Express vai montar.
 * Rota que não está aqui não existe para o aplicativo nativo — e é por isso
 * que a etapa do portão compara este catálogo com o documento publicado.
 */

import type { z } from "zod";
import { esquemaDeErro } from "./erro.ts";
import { montarCatalogo, type RotaDoContrato } from "./rota.ts";
import { esquemaDeIdentificacaoDaApi, rotaDeIdentificacao } from "./saude.ts";
import {
  esquemaDaVitrine,
  esquemaDeAbertura,
  esquemaDeEnderecoDaLoja,
  esquemaDeLojaPublica,
  rotaDaVitrine,
  rotaDoCatalogo,
} from "./vitrine.ts";

export const ROTAS_DO_CONTRATO: readonly RotaDoContrato[] = montarCatalogo([
  rotaDeIdentificacao,
  rotaDaVitrine,
  rotaDoCatalogo,
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
    Abertura: esquemaDeAbertura,
    EnderecoDaLoja: esquemaDeEnderecoDaLoja,
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
  });
