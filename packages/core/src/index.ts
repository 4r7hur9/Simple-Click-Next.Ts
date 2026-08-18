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
