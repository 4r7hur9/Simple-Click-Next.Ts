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
export type { CarrinhoNoContrato } from "./carrinho.ts";
export {
  esquemaDaVitrine,
  esquemaDeAbertura,
  esquemaDoHorarioPublico,
  esquemaDoBannerPublico,
  esquemaDeEnderecoDaLoja,
  esquemaDeLojaPublica,
  esquemaDeRotulosDoRamo,
  esquemaDoApelido,
  rotaDaVitrine,
  esquemaDaBuscaDoCatalogo,
  atacadoLigado,
  estoqueLigado,
  esquemaDoFiltroDeEstoque,
  esquemaDoPrecoDoFiltro,
  TETO_DO_PRECO_DO_FILTRO_EM_CENTAVOS,
  MAXIMO_DE_FILTROS_NA_CONSULTA,
  MAXIMO_DE_CARACTERES_DO_FILTRO,
  esquemaDoCatalogo,
  esquemaDeProdutoNaVitrine,
  esquemaDeSecaoDaVitrine,
  rotaDoCatalogo,
  esquemaDaOrdemDoCatalogo,
  esquemaDaConsultaDoResumo,
  esquemaDaSecaoNoResumo,
  esquemaDoResumoDoCatalogo,
  esquemaDaConsultaDaPagina,
  esquemaDaPaginaDoCatalogo,
  rotaDoResumoDoCatalogo,
  rotaDaPaginaDoCatalogo,
  MAXIMO_DA_PAGINA_DO_CATALOGO,
  PAGINA_PADRAO_DO_CATALOGO,
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
  OrdemDoCatalogoNoContrato,
  ResumoDoCatalogoNoContrato,
  PaginaDoCatalogoNoContrato,
  LojaPublicaNoContrato,
  ProdutoNaVitrineNoContrato,
  FechamentoNoContrato,
  HorarioPublicoNoContrato,
  BannerPublicoNoContrato,
  ProdutoNoContrato,
  Vitrine,
} from "./vitrine.ts";
export {
  conferirDocumento,
  MENSAGEM_DE_DOCUMENTO_INVALIDO,
  somenteDigitos,
} from "./documento.ts";
export type { DocumentoConferido, TipoDeDocumento } from "./documento.ts";
export {
  APELIDOS_RESERVADOS,
  esquemaDaConsultaDeLojas,
  esquemaDaListaDeLojas,
  esquemaDaLojaCriada,
  esquemaDaLojaNaLista,
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
  ROTULOS_DAS_SITUACOES,
  SITUACOES_DA_LOJA,
  UNIDADES_DA_FEDERACAO,
} from "./admin.ts";
export type {
  ConsultaDeLojasNoContrato,
  ListaDeLojasNoContrato,
  LojaCriadaNoContrato,
  LojaNaListaNoContrato,
  NovaLojaEnviada,
  NovaLojaNoContrato,
  SituacaoDaLoja,
  TipoDeNegocioNoContrato,
} from "./admin.ts";
// Ficha, edição e trilha da administração (T-202).
export {
  esquemaDaEdicaoDaLoja,
  esquemaDaFichaDaLoja,
  esquemaDoCampoDaTrilha,
  esquemaDoRegistroDaTrilha,
  ROTULOS_DOS_ATOS,
  ROTULOS_DOS_CAMPOS_DA_LOJA,
} from "./admin.ts";
export type {
  CampoDaTrilhaNoContrato,
  EdicaoDaLojaEnviada,
  EdicaoDaLojaNoContrato,
  FichaDaLojaNoContrato,
  RegistroDaTrilhaNoContrato,
} from "./admin.ts";
// Tipo de negócio trocado pela administração (T-203).
export { esquemaDaTrocaDeTipoDeNegocio } from "./admin.ts";
// Apelido trocado pela administração (T-204).
export { esquemaDaTrocaDeApelido } from "./admin.ts";
// Contrato e documentos da loja (T-205).
export {
  esquemaDoDocumentoDaLoja,
  esquemaDoEnvioDeDocumento,
  esquemaDoLinkDoDocumento,
  esquemaDosDocumentosDaLoja,
  FORMATOS_POR_TIPO_DE_DOCUMENTO,
  LIMITE_DA_IMAGEM_EM_BYTES,
  LIMITE_DO_PDF_EM_BYTES,
  ROTULOS_DOS_TIPOS_DE_DOCUMENTO,
  TIPOS_DE_DOCUMENTO,
} from "./admin.ts";
export type {
  DocumentoDaLojaNoContrato,
  TipoDeDocumentoDaLoja,
} from "./admin.ts";
// Suspender, reativar, excluir e restaurar a loja (T-206).
export {
  confirmacaoConfere,
  DIAS_DE_RETENCAO_DA_LOJA_EXCLUIDA,
  esquemaDaExclusaoDaLoja,
  esquemaDaReativacaoDaLoja,
  esquemaDaRetencaoDaLoja,
  esquemaDaSituacaoParaODono,
  esquemaDaSuspensaoDaLoja,
  esquemaDaSuspensaoEmCurso,
  MENSAGEM_DE_CONFIRMACAO_DIFERENTE,
} from "./admin.ts";
export type { SituacaoParaODonoNoContrato } from "./admin.ts";
// Aprovação da loja (card #25): aprovar, recusar, ativar e desativar.
export {
  ATOS_DA_APROVACAO,
  esquemaDaDesativacaoDaLoja,
  esquemaDaRecusaDaLoja,
  esquemaDaTransicaoInvalida,
  esquemaDoAtoSemCorpo,
  TRANSICOES_DA_LOJA,
} from "./admin.ts";
export type { AtoDaAprovacao } from "./admin.ts";
export {
  CONFIGURACOES_DA_PLATAFORMA,
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
export type { MeuPedidoNoContrato, PedidoDaContaNoContrato } from "./conta.ts";
export {
  esquemaDaEscolhaDoPedidoManual,
  esquemaDaFichaComHistorico,
  esquemaDaFichaDoCliente,
  esquemaDaListaDeClientes,
  esquemaDaOpcaoDoHistorico,
  esquemaDaPendenciaDoPedidoManual,
  esquemaDaRecusaDoPedidoManual,
  esquemaDaRepeticaoDoPedido,
  esquemaDeQuemPede,
  esquemaDoClienteDaLoja,
  esquemaDoClienteExistente,
  esquemaDoClienteParaCadastrar,
  esquemaDoClienteParaEditar,
  esquemaDoEnderecoDaFicha,
  esquemaDoEnderecoParaSalvar,
  esquemaDoEnderecoSalvo,
  esquemaDoItemDoHistorico,
  esquemaDoItemDoPedidoManual,
  esquemaDoItemIndisponivel,
  esquemaDoItemRepetido,
  esquemaDoPedidoDoHistorico,
  esquemaDoPedidoManualCriado,
  esquemaDoPedidoManualParaCriar,
  esquemaDosEnderecosSalvos,
} from "./clientes.ts";
export type {
  ClienteDaLojaNoContrato,
  ClienteExistenteNoContrato,
  ClienteParaCadastrarNoContrato,
  EnderecoDaFichaNoContrato,
  EnderecoParaSalvarNoContrato,
  EnderecoSalvoNoContrato,
  FichaComHistoricoNoContrato,
  FichaDoClienteNoContrato,
  PedidoDoHistoricoNoContrato,
  PedidoManualCriadoNoContrato,
  PedidoManualParaCriarNoContrato,
  RecusaDoPedidoManualNoContrato,
  RepeticaoDoPedidoNoContrato,
} from "./clientes.ts";
export {
  ESTADOS_DO_TRABALHO_DE_IMPRESSAO,
  esquemaDaConfirmacaoDeImpressao,
  esquemaDaFalhaDeImpressao,
  esquemaDaFalhaRegistrada,
  esquemaDoAgentePareado,
  esquemaDoBlocoDoCupom,
  esquemaDoCodigoDePareamento,
  esquemaDoCupomImpresso,
  esquemaDoEstadoDaImpressaoAutomatica,
  esquemaDoEstadoDoTrabalho,
  esquemaDoPedidoDePareamento,
  esquemaDosTrabalhosEntregues,
  esquemaDosTrabalhosPendentes,
  esquemaDoTrabalhoDeImpressao,
  esquemaDoTrabalhoPendente,
} from "./impressao.ts";
export type {
  AgentePareadoNoContrato,
  CodigoDePareamentoNoContrato,
  ConfirmacaoDeImpressaoNoContrato,
  EstadoDaImpressaoAutomaticaNoContrato,
  FalhaRegistradaNoContrato,
  PedidoDePareamentoNoContrato,
  TrabalhoDeImpressaoNoContrato,
  TrabalhoPendenteNoContrato,
  TrabalhosEntreguesNoContrato,
} from "./impressao.ts";
export {
  esquemaDaComparacaoDeMetricas,
  esquemaDaRecusaDePeriodo,
  esquemaDasMetricas,
  esquemaDeDataCivilDasMetricas,
  esquemaDeParcelaDeMetrica,
  esquemaDeVariacaoDeMetrica,
  esquemaDoPeriodoDeMetricas,
  esquemaDoPontoDiario,
  esquemaDoPontoHorario,
  esquemaDoProdutoMaisVendido,
  esquemaDoResumoDeMetricas,
} from "./metricas.ts";
export type {
  ComparacaoDeMetricasNoContrato,
  DetalhesDeMetricasNoContrato,
  MetricasNoContrato,
  ParcelaDeMetricaNoContrato,
  PeriodoDeMetricasNoContrato,
  PontoDiarioNoContrato,
  PontoHorarioNoContrato,
  ProdutoMaisVendidoNoContrato,
  ResumoDeMetricasNoContrato,
  VariacaoDeMetricaNoContrato,
} from "./metricas.ts";
// Histórico de auditoria consultável pela administração (T-208).
export {
  esquemaDaConsultaDaAuditoria,
  esquemaDaLojaDoRegistro,
  esquemaDaPaginaDaAuditoria,
  esquemaDoRegistroDaAuditoria,
  FORMATO_DO_ATO,
  FORMATO_DO_DIA,
} from "./admin-auditoria.ts";
export type {
  ConsultaDaAuditoriaNoContrato,
  PaginaDaAuditoriaNoContrato,
  RegistroDaAuditoriaNoContrato,
} from "./admin-auditoria.ts";
// Funcionalidades liberadas por loja (T-207).
export {
  esquemaDaAlteracaoDeFuncionalidade,
  esquemaDaExcecaoDeFuncionalidade,
  esquemaDaFuncionalidadeNaAdministracao,
  esquemaDasFuncionalidadesDaLoja,
  esquemaDasFuncionalidadesParaODono,
} from "./admin-funcionalidades.ts";
export type {
  FuncionalidadeNaAdministracaoNoContrato,
  FuncionalidadesDaLojaNoContrato,
} from "./admin-funcionalidades.ts";
export * from "./auth.ts";
export * from "./auth-rotas.ts";
export * from "./eu.ts";
// Fundação do card #25: permissões por papel, limites, feed, equipe, tema e
// etapas do pedido.
export * from "./permissoes.ts";
export * from "./limites.ts";
export * from "./feed.ts";
export * from "./equipe.ts";
export * from "./tema.ts";
export * from "./endereco-de-imagem.ts";
export * from "./etapas-do-pedido.ts";
// Gestão de lojas e contas pela administração (card #29).
export * from "./admin-gestao.ts";

export {
  esquemaDaConsultaDeMetricasDoAdmin,
  esquemaDasMetricasDoAdmin,
  MAXIMO_DE_DIAS_DO_PAINEL_DO_ADMIN,
} from "./admin-metricas.ts";
export type {
  ConsultaDeMetricasDoAdmin,
  MetricasDoAdminNoContrato,
} from "./admin-metricas.ts";
export * from "./conta-metricas.ts";
// Vídeo do produto e Stories de 24 horas (card #46).
export * from "./midia.ts";
export * from "./stories.ts";
// Curtidas e comentários com aprovação da loja (card #47).
export * from "./social.ts";
// Atacado e varejo: faixas de desconto por quantidade (card #53).
export * from "./atacado.ts";
// Importador de clientes da loja: CSV, TSV, JSON, JSON Lines e XLSX (card #60).
export * from "./importacao-clientes.ts";
// LGPD funcional: aceite versionado dos documentos e direitos do titular (card #79).
export * from "./legal.ts";
