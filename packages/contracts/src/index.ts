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
export { esquemaDoAcompanhamento } from "./acompanhamento.ts";
export type { AcompanhamentoNoContrato } from "./acompanhamento.ts";
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
export {
  conferirDocumento,
  documentoValido,
  MENSAGEM_DE_DOCUMENTO_INVALIDO,
  somenteDigitos,
} from "./documento.ts";
export type { DocumentoConferido, TipoDeDocumento } from "./documento.ts";
export {
  APELIDOS_RESERVADOS,
  esquemaDaLojaCriada,
  esquemaDaNovaLoja,
  esquemaDaRecusaDeCadastro,
  esquemaDaSituacaoDaLoja,
  esquemaDoApelidoDaLoja,
  esquemaDoCampoRecusado,
  esquemaDoDocumento,
  esquemaDoEmail,
  esquemaDoEnderecoDaLoja,
  esquemaDosTiposDeNegocio,
  esquemaDoTelefone,
  esquemaDoTipoDeNegocio,
  esquemaDoTipoDeNegocioDisponivel,
  FORMATO_DO_APELIDO,
  MENSAGEM_DE_APELIDO_EM_USO,
  SITUACOES_DA_LOJA,
  UNIDADES_DA_FEDERACAO,
} from "./admin.ts";
export type {
  LojaCriadaNoContrato,
  NovaLojaEnviada,
  NovaLojaNoContrato,
  RecusaDeCadastroNoContrato,
  TipoDeNegocioNoContrato,
} from "./admin.ts";
export {
  CONFIGURACOES_DA_PLATAFORMA,
  ehSecaoDoDono,
  esquemaDaChavePixDaLoja,
  esquemaDaConfiguracaoDeAparencia,
  esquemaDaConfiguracaoDeContato,
  esquemaDaConfiguracaoDeEntrega,
  esquemaDaConfiguracaoDeHorario,
  esquemaDaConfiguracaoDePagamento,
  esquemaDaRecusaDeConfiguracao,
  FORMAS_DE_PAGAMENTO_DA_LOJA,
  problemasPorCampo,
  ROTULOS_DAS_SECOES,
  SECOES_DO_DONO,
  TIPOS_DE_CHAVE_PIX,
} from "./store-settings.ts";
export type {
  SecaoDeAparencia,
  SecaoDeContato,
  SecaoDeEntrega,
  SecaoDeHorario,
  SecaoDePagamento,
  RecusaDeConfiguracao,
  SecaoDoDono,
  TipoDeChavePix,
} from "./store-settings.ts";
export { REGRAS_DAS_IMAGENS_DA_LOJA } from "./store-settings.ts";
export type { TipoDeImagemDaLoja } from "./store-settings.ts";
export {
  esquemaDaLojaDoMeuPedido,
  esquemaDoMeuPedido,
  esquemaDoPedidoDaConta,
  esquemaDosMeusPedidos,
} from "./conta.ts";
export type {
  MeuPedidoNoContrato,
  MeusPedidosNoContrato,
  PedidoDaContaNoContrato,
} from "./conta.ts";
