/**
 * Porta única do contrato compartilhado.
 *
 * Site, API e — pelo documento gerado — os aplicativos nativos leem daqui.
 * Quem consome importa deste arquivo, nunca de um interno: é o que permite
 * reorganizar os domínios sem quebrar nenhum consumidor.
 */

export {
  esquemaDeCodigoDeMaquina,
  esquemaDeNomeDeServico,
  esquemaDeReferencia,
  esquemaDeTextoCurto,
} from "./comum.ts";

export { CODIGO_NAO_ENCONTRADO, esquemaDeErro } from "./erro.ts";
export type { ErroDaApi } from "./erro.ts";

export {
  definirRota,
  ErroDeDefinicaoDeRota,
  ErroDeValidacaoDoContrato,
  METODOS_HTTP,
  montarCatalogo,
} from "./rota.ts";
export type {
  DefinicaoDeRota,
  EntradaBruta,
  EntradaValidada,
  MetodoHttp,
  ParteDaRequisicao,
  ProblemaDeValidacao,
  RotaDoContrato,
} from "./rota.ts";

export { esquemaDeIdentificacaoDaApi, rotaDeIdentificacao } from "./saude.ts";
export type { IdentificacaoDaApi } from "./saude.ts";

export {
  ERROS_DE_TODA_ROTA,
  ESQUEMAS_DO_CONTRATO,
  ETIQUETAS_DO_CONTRATO,
  ROTAS_DO_CONTRATO,
} from "./rotas.ts";

export {
  esquemaDeEscolhaEnviada,
  esquemaDeItemDoCarrinho,
  esquemaDeItemParaAcrescentar,
  esquemaDeOpcaoNoCarrinho,
  esquemaDeQuantidadeNova,
  esquemaDoApelidoEItem,
  esquemaDoCarrinho,
  rotaDeAcrescentarItem,
  rotaDeMudarQuantidade,
  rotaDeRemoverItem,
  rotaDeVerCarrinho,
  esquemaDaConferencia,
  esquemaDaDeclaracao,
  esquemaDeItemConferido,
  esquemaDeMudancaNoCarrinho,
  rotaDeConferirCarrinho,
  esquemaDoContato,
  esquemaDoPedidoCriado,
  esquemaDoPedidoParaCriar,
  rotaDeCriarPedido,
} from "./carrinho.ts";
export type {
  CarrinhoNoContrato,
  ConferenciaNoContrato,
  PedidoCriadoNoContrato,
  ItemParaAcrescentarNoContrato,
} from "./carrinho.ts";
export {
  esquemaDaVitrine,
  esquemaDeAbertura,
  esquemaDeEnderecoDaLoja,
  esquemaDeLojaPublica,
  esquemaDeRotulosDoRamo,
  esquemaDoApelido,
  rotaDaVitrine,
  esquemaDaBuscaDoCatalogo,
  esquemaDoCatalogo,
  esquemaDeProdutoNaVitrine,
  esquemaDeSecaoDaVitrine,
  rotaDoCatalogo,
  esquemaDeGrupoDeEscolha,
  esquemaDeImagemDoProduto,
  esquemaDeIndisponibilidade,
  esquemaDeOpcao,
  esquemaDeVariacao,
  esquemaDoApelidoEProduto,
  esquemaDoProduto,
  rotaDoProduto,
  esquemaDaChavePix,
  esquemaDaEntregaDaLoja,
  esquemaDoFechamento,
  rotaDoFechamento,
} from "./vitrine.ts";
export { esquemaDeComposicaoDoRamo } from "./vertical.ts";
export type {
  CatalogoDaVitrineNoContrato,
  GrupoDeEscolhaNoContrato,
  LojaPublicaNoContrato,
  ProdutoNaVitrineNoContrato,
  FechamentoNoContrato,
  ProdutoNoContrato,
  RotulosNoContrato,
  VariacaoNoContrato,
  Vitrine,
} from "./vitrine.ts";
export type { ComposicaoDoRamoNoContrato } from "./vertical.ts";
