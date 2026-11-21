/**
 * Contrato do carrinho do visitante.
 *
 * QUEM É O DONO DO CARRINHO É UM TOKEN DE SESSÃO, e não uma conta. Comprar na
 * vitrine não exige cadastro — é a decisão de produto que separa o SimpleClick
 * do concorrente que pede login antes do cardápio. O token é emitido pela API
 * como cookie no primeiro contato, viaja sozinho a cada requisição e é o que a
 * política do banco confere (migração 0012). Ele NÃO aparece neste contrato:
 * cookie não é campo de corpo, e declará-lo aqui convidaria alguém a mandá-lo
 * por parâmetro — que é exatamente como um visitante alcançaria o carrinho de
 * outro.
 *
 * O PREÇO NÃO ENTRA NO CORPO como valor a cobrar. `totalVistoCentavos` existe
 * só para a API registrar divergência entre o que a tela mostrou e o que ela
 * cobra (P-006, AC-504) — ele jamais compõe a conta. Ler preço do que o
 * navegador manda foi o erro da primeira versão deste produto, e é o que
 * permite fechar um pedido de mil reais por um.
 */

import { z } from "zod";

import { esquemaDoAtacadoNoItem } from "./atacado.ts";
import { esquemaDoEnderecoParaSalvar } from "./clientes.ts";
import { definirRota } from "./rota.ts";
import { esquemaDoApelido } from "./vitrine.ts";

/** Uma escolha marcada num grupo, como o cliente a envia. */
export const esquemaDeEscolhaEnviada = z.strictObject({
  grupoId: z.uuid(),
  opcaoId: z.uuid(),
  /** Quantas vezes. Só passa de 1 em grupo que permite repetir. */
  quantidade: z.int().positive().max(20).default(1),
});

/** O que o cliente manda para acrescentar um item. */
export const esquemaDeItemParaAcrescentar = z.strictObject({
  produtoId: z.uuid(),
  variacaoId: z.uuid().nullable().optional(),
  /** Teto de 99 para o dedo escorregado não pedir duzentas coxinhas. */
  quantidade: z.int().positive().max(99),
  observacao: z.string().max(280).nullable().optional(),
  escolhas: z.array(esquemaDeEscolhaEnviada).max(50).default([]),
  /** O total que a tela mostrou. Só serve para registrar divergência. */
  totalVistoCentavos: z.int().nonnegative().nullable().optional(),
});

/** Uma opção escolhida, como o carrinho a guarda. */
export const esquemaDeOpcaoNoCarrinho = z.strictObject({
  grupoNome: z.string(),
  opcaoNome: z.string(),
  quantidade: z.int().positive(),
});

/**
 * Um item do carrinho.
 *
 * NÃO TRAZ NOME NEM PREÇO DO PRODUTO, e isso é desenho, não esquecimento. O
 * carrinho guarda O QUE FOI ESCOLHIDO — identificadores, quantidade, observação
 * e os nomes das opções que a cozinha vai ler. Nome e preço do produto vêm do
 * CATÁLOGO, e vêm no momento de conferir (AC-503): entre montar o carrinho e
 * fechar o pedido, o dono pode ter corrigido um preço ou renomeado o item, e
 * congelar isso aqui faria a tela mostrar um valor que não é mais o da loja.
 *
 * A cópia congelada existe, e nasce no PEDIDO — não no carrinho (AC-506).
 */
export const esquemaDeItemDoCarrinho = z.strictObject({
  id: z.uuid(),
  produtoId: z.uuid(),
  variacaoId: z.uuid().nullable(),
  quantidade: z.int().positive(),
  observacao: z.string().nullable(),
  opcoes: z.array(esquemaDeOpcaoNoCarrinho),
});

/** O carrinho inteiro. */
export const esquemaDoCarrinho = z.strictObject({
  itens: z.array(esquemaDeItemDoCarrinho),
  /** Soma das quantidades — é o número do ícone do carrinho. */
  totalDeItens: z.int().nonnegative(),
});

export type CarrinhoNoContrato = z.infer<typeof esquemaDoCarrinho>;

/** A quantidade nova de um item. Zero remove — é o que a gaveta já faz. */
export const esquemaDeQuantidadeNova = z.strictObject({
  quantidade: z.int().nonnegative().max(99),
});

/** O item no endereço, junto do apelido da loja. */
export const esquemaDoApelidoEItem = esquemaDoApelido.extend({
  itemId: z.uuid(),
});

/**
 * `GET /v1/vitrine/:apelido/carrinho` — o carrinho desta sessão.
 *
 * Sessão sem carrinho responde 200 com lista vazia, e não 404: carrinho vazio é
 * um estado legítimo da tela, e 404 faria a gaveta tratar "ainda não comprei
 * nada" como falha de carregamento.
 */
export const rotaDeVerCarrinho = definirRota({
  metodo: "get",
  caminho: "/v1/vitrine/:apelido/carrinho",
  etiqueta: "carrinho",
  resumo: "O carrinho desta sessão",
  descricao:
    "Devolve o carrinho aberto da sessão do visitante naquela loja. Sessão sem carrinho responde com lista vazia. O dono do carrinho é o token de sessão, emitido pela API como cookie no primeiro contato.",
  parametros: esquemaDoApelido,
  resposta: esquemaDoCarrinho,
  errosPossiveis: [400],
});

/**
 * `POST /v1/vitrine/:apelido/carrinho/itens` — acrescenta um item.
 *
 * A API RECALCULA O ITEM antes de guardá-lo, com os preços que ela lê do
 * catálogo, e recusa o que não fecha: grupo obrigatório sem escolha, opção
 * esgotada, escolha que não é do produto. É a mesma função que a tela usa para
 * mostrar o total (`calcularItem`), e é isso que faz o valor conferido no
 * servidor ser o mesmo que a pessoa viu (AC-411).
 */
export const rotaDeAcrescentarItem = definirRota({
  metodo: "post",
  caminho: "/v1/vitrine/:apelido/carrinho/itens",
  etiqueta: "carrinho",
  resumo: "Acrescenta um item ao carrinho",
  descricao:
    "Acrescenta um item ao carrinho da sessão. A API recalcula o preço a partir do catálogo e recusa o item quando falta escolha obrigatória, quando uma opção acabou ou quando a escolha não pertence ao produto. O valor enviado pelo cliente nunca compõe a conta.",
  parametros: esquemaDoApelido,
  corpo: esquemaDeItemParaAcrescentar,
  resposta: esquemaDoCarrinho,
  errosPossiveis: [400, 404, 409],
});

/** `PATCH .../itens/:itemId` — muda a quantidade. Zero remove. */
export const rotaDeMudarQuantidade = definirRota({
  metodo: "patch",
  caminho: "/v1/vitrine/:apelido/carrinho/itens/:itemId",
  etiqueta: "carrinho",
  resumo: "Muda a quantidade de um item",
  descricao:
    "Muda a quantidade de um item do carrinho. Zero remove o item, que é o que a gaveta faz quando a pessoa desce a quantidade até o fim.",
  parametros: esquemaDoApelidoEItem,
  corpo: esquemaDeQuantidadeNova,
  resposta: esquemaDoCarrinho,
  errosPossiveis: [400, 404],
});

/** `DELETE .../itens/:itemId` — tira o item. */
export const rotaDeRemoverItem = definirRota({
  metodo: "delete",
  caminho: "/v1/vitrine/:apelido/carrinho/itens/:itemId",
  etiqueta: "carrinho",
  resumo: "Tira um item do carrinho",
  descricao:
    "Tira um item do carrinho da sessão. O CARRINHO em si não é apagável pelo visitante: carrinho abandonado é o rastro de quem chegou perto de comprar, e o dono precisa dele para saber onde perde venda.",
  parametros: esquemaDoApelidoEItem,
  resposta: esquemaDoCarrinho,
  errosPossiveis: [400, 404],
});

// ---------------------------------------------------------------------------
// Conferência antes de fechar
// ---------------------------------------------------------------------------

/** Uma mudança que a pessoa precisa ver antes de confirmar (AC-503). */
export const esquemaDeMudancaNoCarrinho = z.strictObject({
  itemId: z.uuid(),
  nome: z.string(),
  tipo: z.enum([
    "PRECO_SUBIU",
    "PRECO_CAIU",
    "INDISPONIVEL",
    "SAIU_DO_CATALOGO",
    "SEM_PRECO",
  ]),
  deEmCentavos: z.int().nonnegative().nullable(),
  paraEmCentavos: z.int().nonnegative().nullable(),
  /** Frase pronta para a tela, no lugar de um código que ninguém entende. */
  explicacao: z.string(),
});

/** Um item que segue para o pedido, já com o preço do SERVIDOR. */
export const esquemaDeItemConferido = z.strictObject({
  itemId: z.uuid(),
  produtoId: z.uuid(),
  nome: z.string(),
  quantidade: z.int().positive(),
  precoUnitarioCentavos: z.int().nonnegative(),
  totalDaLinhaCentavos: z.int().nonnegative(),
  /**
   * Qual preço foi usado e por quê, quando não é o normal (AC-310).
   *
   * O atacado entra SOZINHO quando a quantidade alcança a faixa, e o carrinho
   * que cobra menos do que a vitrine anunciava precisa dizer o motivo — senão
   * parece erro. Nulo no preço normal; ausente em cliente de antes do campo.
   */
  precoAplicado: z
    .strictObject({
      /** O nome do preço, como o dono o chamou: "Atacado". */
      rotulo: z.string(),
      /** A frase pronta para a tela. */
      motivo: z.string(),
    })
    .nullable()
    .optional(),
  /** `BASE`, `PROMO` ou `WHOLESALE`: qual preço valeu (card #57). */
  tipoDePreco: z.string().optional(),
  /**
   * O preço de varejo por unidade (com as opções), quando o cobrado é menor —
   * o riscado ao lado. Nulo no preço normal.
   */
  varejoUnitarioCentavos: z.int().positive().nullable().optional(),
  /**
   * O atacado do produto: faixa aplicada, próxima e quantas peças faltam — o
   * "faltam 4 peças para o próximo desconto". Nulo sem faixas.
   */
  atacado: esquemaDoAtacadoNoItem.nullable().optional(),
});

/**
 * O veredito da conferência.
 *
 * OS VALORES SÃO OS DO SERVIDOR, sempre. O que a tela enviou entra apenas como
 * referência para dizer o que mudou — e para registrar a tentativa quando o
 * número não bate (AC-504). Ler preço do que o navegador manda é o que permite
 * fechar um pedido de mil reais por um.
 */
export const esquemaDaConferencia = z.strictObject({
  mudancas: z.array(esquemaDeMudancaNoCarrinho),
  /** Verdadeiro quando algo mudou e a pessoa precisa confirmar de novo. */
  precisaConfirmar: z.boolean(),
  itens: z.array(esquemaDeItemConferido),
  subtotalCentavos: z.int().nonnegative(),
});

/** O que a tela declara ter mostrado. Nunca compõe a conta. */
export const esquemaDaDeclaracao = z.strictObject({
  totalVistoCentavos: z.int().nonnegative().nullable().optional(),
  /** O preço unitário que a tela mostrou de cada item. */
  precosVistos: z.record(z.uuid(), z.int().nonnegative()).optional(),
});

/**
 * `POST /v1/vitrine/:apelido/carrinho/conferencia` — o que mudou e quanto dá.
 *
 * É POST, e não GET, por duas razões que valem mais que a forma: ela carrega
 * uma DECLARAÇÃO no corpo (o que a tela mostrou), e ela REGISTRA a divergência
 * quando os números não batem. Um GET que escreve no registro de segurança
 * mente sobre o que é.
 *
 * É O ÚLTIMO PONTO ANTES DE O PEDIDO EXISTIR, e o único lugar do sistema em que
 * o preço vira dinheiro. Item indisponível, item que saiu do catálogo e item
 * sem preço conhecido NÃO seguem — seguir faria a cozinha receber um pedido que
 * ela não tem como preparar, e o cliente descobrir isso pelo telefone.
 */
export const rotaDeConferirCarrinho = definirRota({
  metodo: "post",
  caminho: "/v1/vitrine/:apelido/carrinho/conferencia",
  etiqueta: "carrinho",
  resumo: "Confere o carrinho contra o catálogo de agora",
  descricao:
    "Confere cada item do carrinho contra o catálogo vivo e devolve o que mudou, os itens que seguem com o preço do servidor e o subtotal. Item indisponível, retirado do cardápio ou sem preço conhecido não segue. O que a tela declarou ter mostrado nunca compõe a conta: serve para dizer o que mudou e para registrar divergência.",
  parametros: esquemaDoApelido,
  corpo: esquemaDaDeclaracao,
  resposta: esquemaDaConferencia,
  errosPossiveis: [400, 404],
});

// ---------------------------------------------------------------------------
// Criar o pedido
// ---------------------------------------------------------------------------

/**
 * Contato no formato antigo (quando o pedido aceitava convidado). Continua
 * aceito por compatibilidade: com conta logada, nome e e-mail vêm da CONTA;
 * o telefone daqui só vale quando a conta ainda não tem; e o endereço daqui
 * vira endereço novo salvo na conta.
 */
export const esquemaDoContato = z.strictObject({
  nome: z.string().min(2).max(120),
  /** Como a pessoa digitou. A API normaliza — a tela não precisa saber E.164. */
  telefone: z.string().min(8).max(24),
  email: z.email().nullable().optional(),
  logradouro: z.string().max(160).nullable().optional(),
  numero: z.string().max(24).nullable().optional(),
  complemento: z.string().max(80).nullable().optional(),
  bairro: z.string().max(80).nullable().optional(),
  cidade: z.string().max(80).nullable().optional(),
  estado: z.string().max(2).nullable().optional(),
  cep: z.string().max(9).nullable().optional(),
});

/**
 * O que a tela envia para fechar o pedido.
 *
 * NÃO HÁ ITENS AQUI, e isso é o ponto. Os itens vêm do CARRINHO daquela sessão,
 * lidos no servidor; os preços vêm do catálogo. Aceitar itens no corpo seria
 * deixar o cliente escolher o que compra e por quanto — o erro que o AC-504
 * existe para impedir.
 */
export const esquemaDoPedidoParaCriar = z.strictObject({
  /** Formato antigo, opcional. Ver `esquemaDoContato`. */
  contato: esquemaDoContato.optional(),
  /**
   * Telefone para o pedido, como a pessoa digitou. Só é exigido quando a
   * conta ainda não tem telefone — e então fica salvo na conta.
   */
  telefone: z.string().min(8).max(24).optional(),
  /** Na entrega: um endereço salvo da conta (`GET /v1/conta/enderecos`). */
  enderecoId: z.uuid().optional(),
  /** Na entrega: um endereço novo, que fica salvo na conta. */
  endereco: esquemaDoEnderecoParaSalvar.optional(),
  entrega: z.enum(["DELIVERY", "PICKUP"]),
  /** `PIX`, `CASH`, `CARD_ON_DELIVERY`. */
  formaDePagamento: z.string().nullable().optional(),
  /** Para quanto a pessoa precisa de troco, quando paga em dinheiro (AC-512). */
  trocoParaCentavos: z.int().nonnegative().nullable().optional(),
  observacao: z.string().max(500).nullable().optional(),
  /**
   * MESMA CHAVE, MESMO PEDIDO DE VOLTA — nunca um segundo (AC-516).
   *
   * Obrigatória: sem ela, dois toques no botão em rede ruim viram dois pedidos,
   * e a cozinha prepara duas vezes. A tela gera uma por tentativa de fechar.
   */
  chaveDeIdempotencia: z.string().min(8).max(64),
  /** O total que a tela mostrou. Só serve para registrar divergência. */
  totalVistoCentavos: z.int().nonnegative().nullable().optional(),
  /**
   * O subtotal dos itens que a tela mostrou (o da conferência). O servidor
   * recalcula com a faixa de atacado de agora e RECUSA o pedido (409) quando
   * não bate: a pessoa confere o preço novo antes de pagar (card #57).
   */
  subtotalVistoCentavos: z.int().nonnegative().nullable().optional(),
});

/** O pedido criado, com o que a tela mostra em seguida. */
export const esquemaDoPedidoCriado = z.strictObject({
  id: z.uuid(),
  /** O número por loja, que é o que o dono e o cliente falam ao telefone. */
  numero: z.int().positive(),
  codigo: z.string(),
  /**
   * O token do acompanhamento. É segredo de quem pediu: quem o tem, vê o
   * pedido — e é por isso que ele não pode ser adivinhável (AC-614).
   */
  tokenPublico: z.string(),
  status: z.string(),
  /** Verdadeiro quando este envio reencontrou um pedido que já existia. */
  jaExistia: z.boolean(),
  subtotalCentavos: z.int().nonnegative(),
  taxaDeEntregaCentavos: z.int().nonnegative(),
  totalCentavos: z.int().nonnegative(),
  /**
   * A mensagem pronta para a loja, e o endereço que abre a conversa (AC-520).
   *
   * O NÚMERO DA LOJA NÃO É CAMPO — ele vem embutido no endereço, e o endereço
   * só volta para quem ACABOU de criar um pedido. Na prática o número da loja e
   * o celular do dono são o mesmo (no pequeno negócio, o dono É o WhatsApp da
   * loja), e publicá-lo como campo seria publicar o celular pessoal dele para
   * todo robô que varresse a plataforma.
   *
   * Nulo quando a loja não cadastrou número: o pedido existe do mesmo jeito, e
   * a tela mostra o código para a pessoa combinar por outro caminho (AC-523).
   */
  whatsapp: z
    .strictObject({
      /** `https://wa.me/...` com a mensagem já codificada. */
      endereco: z.string(),
      /** O mesmo texto, para o caminho de copiar à mão. */
      texto: z.string(),
      /** Falso quando o texto não coube inteiro e foi resumido. */
      completo: z.boolean(),
    })
    .nullable(),
});

/**
 * `POST /v1/vitrine/:apelido/pedidos` — fecha o pedido.
 *
 * O ÚLTIMO PASSO, e o mais cuidadoso. Ele lê o carrinho da sessão, confere cada
 * item contra o catálogo de agora, calcula a taxa de entrega, recusa o que não
 * pode seguir — loja fechada, carrinho vazio, subtotal abaixo do mínimo — e só
 * então cria o pedido, com os valores do SERVIDOR.
 *
 * O pedido nasce como CÓPIA CONGELADA do momento da compra (AC-515): nome,
 * preço e escolhas ficam gravados como texto, e mudar o catálogo depois não
 * mexe em pedido nenhum.
 */
export const rotaDeCriarPedido = definirRota({
  metodo: "post",
  caminho: "/v1/vitrine/:apelido/pedidos",
  etiqueta: "carrinho",
  resumo: "Fecha o pedido",
  descricao:
    "Exige conta logada (Bearer ou cookie `sc_access`); sem sessão, 401 `conta_obrigatoria`. Nome e e-mail vêm da conta; o telefone também, e só é pedido no corpo (`telefone`) quando a conta não tem — sem nenhum, 422 `telefone_obrigatorio`. Na entrega, o endereço é um salvo da conta (`enderecoId`; de outra pessoa ou inexistente, 422 `endereco_nao_encontrado`) ou um novo (`endereco`, que fica salvo na conta); sem nenhum, 422 `endereco_obrigatorio`. Cria o pedido a partir do carrinho da sessão, com os preços que o servidor lê do catálogo. Recusa quando a loja está fechada, quando o carrinho está vazio e quando o subtotal não alcança o mínimo. A mesma chave de idempotência devolve o mesmo pedido, nunca um segundo.",
  parametros: esquemaDoApelido,
  corpo: esquemaDoPedidoParaCriar,
  resposta: esquemaDoPedidoCriado,
  status: 201,
  // 200 = reenvio com a mesma chave de idempotência (`jaExistia: true`).
  statusAlternativosDeSucesso: [200],
  errosPossiveis: [400, 401, 404, 409, 422],
});
