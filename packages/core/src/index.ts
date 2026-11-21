/**
 * Porta única das regras puras.
 *
 * Aqui mora o que não depende de banco, de HTTP nem de framework. Quem consome
 * (API, site, filas) importa deste arquivo, nunca de um interno — é o que
 * permite reorganizar as regras sem quebrar consumidor.
 *
 * A tabela de fronteiras de `.spec/design/arquitetura.md` não autoriza este
 * pacote a importar NADA do projeto, e o ESLint reprova quem tentar.
 */

export {
  ErroDeTextoDoPedido,
  gerarTextoDoPedido,
  LIMITE_PADRAO_DO_LINK,
  medirComprimentoNoLink,
} from "./cupom-texto.ts";
export { momentoNaLoja, situacaoDaLoja } from "./horario-loja.ts";
export {
  estaNaJanelaDeDisponibilidade,
  type JanelaDeDisponibilidade,
} from "./janela-disponibilidade.ts";
export type {
  EstadoDeAbertura,
  ExcecaoDatada,
  FaixaDeHorario,
  HorarioDaLoja,
  SituacaoDeAbertura,
} from "./horario-loja.ts";
export { calcularItem } from "./item-total.ts";
export type {
  EscolhaFeita,
  GrupoDeEscolha,
  ItemDeEscolha,
  MotivoDePendencia,
  Pendencia,
  PedidoDeItem,
  TotalDoItem,
} from "./item-total.ts";
export { precoQueVale, precoValeAgora } from "./preco-vigente.ts";
export type { PrecoCadastrado, PrecoVigente } from "./preco-vigente.ts";
export {
  HORIZONTE_DO_PROXIMO_PRECO_MS,
  proximaQuedaDePreco,
} from "./proximo-preco.ts";
export type { ProximaQuedaDePreco } from "./proximo-preco.ts";
export { conferirCarrinho } from "./pedido-total.ts";
export type {
  Conferencia,
  ItemParaConferir,
  ItemPrecificado,
  MudancaNoCarrinho,
  ProdutoAgora,
  TipoDeMudanca,
} from "./pedido-total.ts";
export { calcularValores, emReais } from "./taxa-entrega.ts";
export type {
  ConfiguracaoDeEntrega,
  ImpedimentoDoFechamento,
  ResumoDeValores,
} from "./taxa-entrega.ts";
export { linkDoWhatsApp, normalizarWhatsApp } from "./telefone.ts";
export type {
  CausaDaRecusa,
  NumeroAceito,
  NumeroRecusado,
  OpcoesDoNumero,
  ResultadoDoNumero,
  TipoDeLinha,
} from "./telefone.ts";
export type {
  AcaoDaOpcao,
  ClienteDoPedido,
  EnderecoDeEntrega,
  FormaDeEntrega,
  FormaDePagamento,
  ItemDoPedido,
  ModoDaTaxaDeEntrega,
  OpcaoDoItem,
  OpcoesDoTexto,
  PagamentoDoPedido,
  PedidoParaTexto,
  TaxaDeEntrega,
  TextoDoPedido,
} from "./cupom-texto.ts";
export {
  acrescentarHistorico,
  decidirTransicao,
  proximosStatus,
  STATUS_DO_PEDIDO,
} from "./maquina-status.ts";
export type {
  DecisaoDeTransicao,
  EntradaDeHistorico,
  OpcaoDeStatus,
  StatusDoPedido,
} from "./maquina-status.ts";
export {
  composicaoDoRamo,
  composicaoVazia,
  temBloco,
  TELAS_DO_RAMO,
} from "./vertical.ts";
export type { ComposicaoDoRamo, TelaDoRamo } from "./vertical.ts";
export {
  centavosDoTexto,
  ErroDeDinheiro,
  exigirCentavos,
  multiplicarCentavos,
  somarCentavos,
} from "./dinheiro.ts";
export { precoAplicavel } from "./preco-aplicavel.ts";
export type { AtacadoDoItem, PrecoAplicado } from "./preco-aplicavel.ts";
// Faixas de atacado com desconto (card #53).
export {
  faixasValidas,
  precoNoAtacado,
  problemasDasFaixas,
  unitarioNaFaixa,
} from "./atacado.ts";
export type {
  FaixaCalculada,
  FaixaDeAtacado,
  PrecoNoAtacado,
  ProblemaDaFaixa,
  TipoDeDescontoDoAtacado,
} from "./atacado.ts";
export type { ExplicacaoDoPreco } from "./pedido-total.ts";
export {
  cnpjValido,
  cpfValido,
  FORMATO_DA_CHAVE_PIX,
  validarChavePix,
} from "./chave-pix.ts";
export type {
  ChavePixAceita,
  ChavePixRecusada,
  ResultadoDaChavePix,
  TipoDaChavePix,
} from "./chave-pix.ts";
export { estaAcabando } from "./estoque.ts";
export {
  agruparPedidosDaFila,
  atualizarFila,
  descreverEspera,
  deveTocarAlerta,
  minutosDeEspera,
  STATUS_FORA_DA_FILA,
} from "./fila-de-pedidos.ts";
export type { GruposDaFila, PedidoDaFila } from "./fila-de-pedidos.ts";
export { resumirVendas, situacaoNaVenda } from "./situacao-na-venda.ts";
export type {
  ParcelaDoResumo,
  PedidoParaVenda,
  ResumoDeVendas,
  SituacaoNaVenda,
} from "./situacao-na-venda.ts";
export {
  CONTEUDO_PADRAO_DO_CUPOM,
  diagramarCupom,
  ErroDoCupom,
  gerarCupom,
  lerCupomImpresso,
  RECUO_DA_CONTINUACAO,
  VERSAO_DO_CUPOM,
} from "./cupom-blocos.ts";
export type {
  BlocoDeCorte,
  BlocoDeEspaco,
  BlocoDePar,
  BlocoDeTexto,
  BlocoDoCupom,
  BlocoSeparador,
  CanalDoPedido,
  ConteudoDoCupom,
  CupomImpresso,
  LinhaDoCupom,
  OpcoesDoCupom,
  PapelDoCupom,
  PedidoParaCupom,
  PerfilDeDiagramacao,
  TamanhoDoTexto,
} from "./cupom-blocos.ts";
export {
  AREA_IMPRESSA_EM_MM,
  COLUNAS_DO_PAPEL,
  colunasDoPapel,
  ehLarguraDoPapel,
  ehTabelaDeCaracteres,
  larguraNoPapel,
  normalizarParaImpressao,
  TABELA_PADRAO,
} from "./cupom-largura.ts";
export type {
  Alinhamento,
  LarguraDoPapel,
  TabelaDeCaracteres,
} from "./cupom-largura.ts";
export {
  compilarEscPos,
  ErroDaSaidaEscPos,
  NUMERO_DA_TABELA_NO_ESCPOS,
} from "./cupom-escpos.ts";
export type { CorteDoPapel, PerfilDaImpressora } from "./cupom-escpos.ts";
export {
  ErroDaLeituraEscPos,
  lerEscPos,
  previaDoPapel,
} from "./cupom-escpos-leitura.ts";
export type { PapelLido } from "./cupom-escpos-leitura.ts";
export { lerJanelasDeDisponibilidade } from "./janela-disponibilidade.ts";
export {
  CATALOGO_DE_FUNCIONALIDADES,
  CHAVES_DE_FUNCIONALIDADE,
  ehChaveDeFuncionalidade,
  funcionalidadeLigada,
  funcionalidadesDaLoja,
} from "./funcionalidades.ts";
export type {
  ChaveDeFuncionalidade,
  DescricaoDaFuncionalidade,
  ExcecaoDeFuncionalidade,
  FuncionalidadeDaLoja,
} from "./funcionalidades.ts";
