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
import {
  esquemaDaLojaDoFeed,
  esquemaDasLojasDoFeed,
  esquemaDoProdutoDoFeed,
  esquemaDosProdutosDoFeed,
  ROTAS_DO_FEED,
} from "./feed.ts";
import { esquemaDoTemaDaLoja } from "./tema.ts";
import { esquemaDaMidiaPublica, ROTAS_DA_MIDIA } from "./midia.ts";
import {
  esquemaDaLojaComStories,
  esquemaDoPerfilDaLoja,
  esquemaDoStoryPublico,
  ROTAS_DOS_STORIES,
} from "./stories.ts";
import {
  esquemaDaCurtida,
  esquemaDoComentarioDaLoja,
  esquemaDoComentarioPublico,
  esquemaDoResumoSocial,
  ROTAS_DO_SOCIAL,
} from "./social.ts";
import { rotaDaLojaSolicitada } from "./equipe.ts";
import {
  esquemaDoAcompanhamento,
  rotaDoAcompanhamento,
} from "./acompanhamento.ts";
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
  rotaDoResumoDoCatalogo,
  rotaDaPaginaDoCatalogo,
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
  rotaDoResumoDoCatalogo,
  rotaDaPaginaDoCatalogo,
  rotaDoProduto,
  rotaDeVerCarrinho,
  rotaDeAcrescentarItem,
  rotaDeMudarQuantidade,
  rotaDeRemoverItem,
  rotaDeConferirCarrinho,
  rotaDoFechamento,
  rotaDeCriarPedido,
  rotaDoAcompanhamento,
  ...ROTAS_DA_IDENTIDADE,
  rotaDoEu,
  ...ROTAS_DO_FEED,
  rotaDaLojaSolicitada,
  ...ROTAS_DA_MIDIA,
  ...ROTAS_DOS_STORIES,
  ...ROTAS_DO_SOCIAL,
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
    Acompanhamento: esquemaDoAcompanhamento,
    ContatoDoPedido: esquemaDoContato,
    SessaoAberta: esquemaDaSessaoAberta,
    ResultadoDoLogin: esquemaDoResultadoDoLogin,
    ResultadoDoSegundoFator: esquemaDoResultadoDoSegundoFator,
    Eu: esquemaDoEu,
    LojaDaSessao: esquemaDaLojaDaSessao,
    TemaDaLoja: esquemaDoTemaDaLoja,
    ProdutoDoFeed: esquemaDoProdutoDoFeed,
    ProdutosDoFeed: esquemaDosProdutosDoFeed,
    LojaDoFeed: esquemaDaLojaDoFeed,
    LojasDoFeed: esquemaDasLojasDoFeed,
    MidiaPublica: esquemaDaMidiaPublica,
    PerfilDaLoja: esquemaDoPerfilDaLoja,
    StoryPublico: esquemaDoStoryPublico,
    LojaComStories: esquemaDaLojaComStories,
    ResumoSocial: esquemaDoResumoSocial,
    Curtida: esquemaDaCurtida,
    ComentarioPublico: esquemaDoComentarioPublico,
    ComentarioDaLoja: esquemaDoComentarioDaLoja,
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
    feed:
      "O feed do SimpleClick (/explorar): produtos e lojas de várias lojas, tipos de negócio, e as lojas favoritas e recentes da conta. Só aparece loja ativa que aceita o feed e produto marcado 'publicar no feed'.",
    midia:
      "Fotos e vídeos do produto (o post da loja): envio do vídeo pelo arquivo cru, capa, ordem da galeria e os limites de envio.",
    stories:
      "Stories da loja: foto ou vídeo que fica no ar 24 horas e depois é apagado. O painel posta, lista e apaga; o público vê os ativos agrupados por loja, com a foto de perfil, e marca como visto.",
    social:
      "Curtidas e comentários em produtos e lojas. Curtir e comentar exigem conta; o comentário nasce pendente e só aparece depois que a loja aprova (ou já nasce aprovado, se a loja ligou a aprovação automática). O painel modera, bloqueia e vê as denúncias.",
    identidade:
      "Cadastro, verificação de e-mail, login com segundo fator, sessão, recuperação de senha, aplicativo autenticador e convite do dono. Respostas neutras: nada revela se um e-mail tem conta.",
  });
