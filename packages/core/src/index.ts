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
  FormaDeEntregaDoPedido,
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
export type { PrecoAplicado } from "./preco-aplicavel.ts";
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
