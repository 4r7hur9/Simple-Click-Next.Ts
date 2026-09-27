/**
 * Contrato dos clientes da loja e do pedido manual (T-700 a T-707).
 *
 * O QUE O DONO VÊ DO CLIENTE é a projeção por loja (`store_customers`): nome,
 * telefone, e-mail e o que ele comprou ALI. A identidade global — senha,
 * segundo fator, endereços salvos — nunca aparece neste contrato, e é isso que
 * o esquema estrito garante: campo a mais na resposta reprova na prova.
 *
 * O PEDIDO MANUAL NÃO TRAZ PREÇO. A tela manda o que o dono escolheu —
 * produto, variação, quantidade, escolhas — e o servidor precifica com o
 * catálogo de agora (P-006), exatamente como faz com o carrinho da vitrine.
 *
 * DINHEIRO É INTEIRO EM CENTAVOS em todo campo daqui (P-005).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// A lista e a ficha
// ---------------------------------------------------------------------------

/** Um cliente na lista do dono: o que importa para atender (AC-700). */
export const esquemaDoClienteDaLoja = z.strictObject({
  id: z.uuid(),
  nome: z.string(),
  /** Como está guardado; a tela escreve com a máscara. Nulo quando não há. */
  telefone: z.string().nullable(),
  email: z.string().nullable(),
  /** Verdadeiro quando a pessoa tem conta na plataforma (AC-706). */
  temConta: z.boolean(),
  /** Pedidos NÃO cancelados que ele fez nesta loja. */
  totalDePedidos: z.int().nonnegative(),
  totalGastoCentavos: z.int().nonnegative(),
  ultimoPedidoEm: z.string().nullable(),
});

/** `GET /v1/lojas/:apelido/clientes` — os clientes da loja, com busca. */
export const esquemaDaListaDeClientes = z.strictObject({
  clientes: z.array(esquemaDoClienteDaLoja),
});

/** O endereço anotado na ficha do cliente sem conta (AC-703). */
export const esquemaDoEnderecoDaFicha = z.strictObject({
  logradouro: z.string().trim().min(1).max(160),
  numero: z.string().trim().max(24).nullable().optional(),
  complemento: z.string().trim().max(80).nullable().optional(),
  bairro: z.string().trim().max(80).nullable().optional(),
  cidade: z.string().trim().max(80).nullable().optional(),
  estado: z.string().trim().length(2).nullable().optional(),
  cep: z.string().trim().max(9).nullable().optional(),
  pontoDeReferencia: z.string().trim().max(200).nullable().optional(),
});

/** O que o dono informa para cadastrar um cliente (AC-703). */
export const esquemaDoClienteParaCadastrar = z.strictObject({
  nome: z.string().trim().min(2).max(120),
  /** Como o dono digitou; a API normaliza e recusa dizendo o que falta. */
  telefone: z.string().trim().min(8).max(24),
  email: z.email().nullable().optional(),
  endereco: esquemaDoEnderecoDaFicha.nullable().optional(),
  observacao: z.string().trim().max(500).nullable().optional(),
});

/** A correção da ficha: só o que mudou (AC-705). */
export const esquemaDoClienteParaEditar = z
  .strictObject({
    nome: z.string().trim().min(2).max(120).optional(),
    telefone: z.string().trim().min(8).max(24).optional(),
    email: z.email().nullable().optional(),
    endereco: esquemaDoEnderecoDaFicha.nullable().optional(),
    observacao: z.string().trim().max(500).nullable().optional(),
  })
  .refine((valor) => Object.keys(valor).length > 0, {
    message: "Informe ao menos um campo para alterar.",
  });

/**
 * A recusa por cliente já existente (AC-704, AC-706).
 *
 * Diz QUAL cliente já existe e por quê, para a tela oferecer abrir a ficha
 * dele em vez de duplicar — e não um "conflito" mudo que faria o dono
 * cadastrar de novo com um dígito trocado.
 */
export const esquemaDoClienteExistente = z.strictObject({
  erro: z.literal("cliente_existente"),
  clienteId: z.uuid(),
  nome: z.string(),
  /** O campo que bateu com o cadastro existente. */
  motivo: z.enum(["TELEFONE", "EMAIL"]),
  /** `CONTA` quando a pessoa já tem conta na plataforma (AC-706). */
  vinculo: z.enum(["CONTA", "MANUAL"]),
});

/** A ficha inteira: os dados e o que o dono pode anotar. */
export const esquemaDaFichaDoCliente = z.strictObject({
  id: z.uuid(),
  nome: z.string(),
  telefone: z.string().nullable(),
  email: z.string().nullable(),
  temConta: z.boolean(),
  endereco: esquemaDoEnderecoDaFicha.nullable(),
  observacao: z.string().nullable(),
  criadoEm: z.string(),
});

/** Uma escolha guardada no item do pedido, como texto da época. */
export const esquemaDaOpcaoDoHistorico = z.strictObject({
  grupo: z.string(),
  nome: z.string(),
  quantidade: z.int().positive(),
});

/**
 * Um item de um pedido do histórico (AC-711, AC-713).
 *
 * Nome e preço são os DA ÉPOCA (P-010). `indisponivel` diz que o produto não
 * está mais à venda no catálogo — a tela marca, e nada quebra.
 */
export const esquemaDoItemDoHistorico = z.strictObject({
  nome: z.string(),
  variacao: z.string().nullable(),
  quantidade: z.int().positive(),
  totalCentavos: z.int().nonnegative(),
  observacao: z.string().nullable(),
  opcoes: z.array(esquemaDaOpcaoDoHistorico),
  indisponivel: z.boolean(),
});

/** Um pedido do histórico do cliente, do mais novo para o mais antigo. */
export const esquemaDoPedidoDoHistorico = z.strictObject({
  id: z.uuid(),
  numero: z.int().nonnegative(),
  codigo: z.string(),
  status: z.string(),
  canal: z.string(),
  entrega: z.string(),
  totalCentavos: z.int().nonnegative(),
  criadoEm: z.string(),
  itens: z.array(esquemaDoItemDoHistorico),
});

/** `GET /v1/lojas/:apelido/clientes/:id` — a ficha com o histórico. */
export const esquemaDaFichaComHistorico = z.strictObject({
  cliente: esquemaDaFichaDoCliente,
  pedidos: z.array(esquemaDoPedidoDoHistorico),
});

// ---------------------------------------------------------------------------
// O pedido manual
// ---------------------------------------------------------------------------

/** Uma escolha marcada num grupo, como o dono a manda (mesma forma da vitrine). */
export const esquemaDaEscolhaDoPedidoManual = z.strictObject({
  grupoId: z.uuid(),
  opcaoId: z.uuid(),
  quantidade: z.int().positive().max(20).default(1),
});

/** Um item do pedido manual: o que foi escolhido, e nada de preço (P-006). */
export const esquemaDoItemDoPedidoManual = z.strictObject({
  produtoId: z.uuid(),
  variacaoId: z.uuid().nullable().optional(),
  quantidade: z.int().positive().max(99),
  escolhas: z.array(esquemaDaEscolhaDoPedidoManual).max(50).default([]),
  observacao: z.string().trim().max(280).nullable().optional(),
});

/**
 * Quem está pedindo: a ficha de um cliente cadastrado, OU nome e telefone
 * informados no próprio pedido (AC-709). A união é discriminada para que
 * "cliente sem ficha" não seja um cadastro esquecido.
 */
export const esquemaDeQuemPede = z.discriminatedUnion("tipo", [
  z.strictObject({ tipo: z.literal("cadastrado"), clienteId: z.uuid() }),
  z.strictObject({
    tipo: z.literal("avulso"),
    nome: z.string().trim().min(2).max(120),
    telefone: z.string().trim().min(8).max(24),
  }),
]);

/** `POST /v1/lojas/:apelido/pedidos/manual` — o que o dono manda. */
export const esquemaDoPedidoManualParaCriar = z.strictObject({
  cliente: esquemaDeQuemPede,
  itens: z.array(esquemaDoItemDoPedidoManual).min(1).max(100),
  entrega: z.enum(["DELIVERY", "PICKUP"]),
  /** Só na entrega. Ausente na entrega de cliente cadastrado, vale o da ficha. */
  endereco: esquemaDoEnderecoDaFicha.nullable().optional(),
  formaDePagamento: z.enum(["PIX", "CASH", "CARD_ON_DELIVERY", "OTHER"]),
  trocoParaCentavos: z.int().positive().nullable().optional(),
  observacao: z.string().trim().max(500).nullable().optional(),
});

/** O pedido manual criado: entra na fila com número próprio (AC-707). */
export const esquemaDoPedidoManualCriado = z.strictObject({
  id: z.uuid(),
  numero: z.int().nonnegative(),
  codigo: z.string(),
  status: z.string(),
  canal: z.literal("MANUAL"),
  clienteId: z.uuid().nullable(),
  subtotalCentavos: z.int().nonnegative(),
  taxaDeEntregaCentavos: z.int().nonnegative(),
  totalCentavos: z.int().nonnegative(),
});

/** Uma pendência que impede o pedido manual: o grupo obrigatório sem escolha (AC-708). */
export const esquemaDaPendenciaDoPedidoManual = z.strictObject({
  produtoId: z.uuid(),
  produto: z.string(),
  grupoId: z.string().nullable(),
  grupo: z.string().nullable(),
  motivo: z.string(),
  explicacao: z.string(),
});

/** A recusa do pedido manual, com o que falta escolher. */
export const esquemaDaRecusaDoPedidoManual = z.strictObject({
  erro: z.literal("pedido_incompleto"),
  pendencias: z.array(esquemaDaPendenciaDoPedidoManual),
});

// ---------------------------------------------------------------------------
// Repetir um pedido
// ---------------------------------------------------------------------------

/** Um item do pedido antigo, já reprecificado com o catálogo de agora (AC-712). */
export const esquemaDoItemRepetido = z.strictObject({
  produtoId: z.uuid(),
  variacaoId: z.uuid().nullable(),
  nome: z.string(),
  variacao: z.string().nullable(),
  quantidade: z.int().positive(),
  escolhas: z.array(esquemaDaEscolhaDoPedidoManual),
  observacao: z.string().nullable(),
  precoUnitarioCentavos: z.int().nonnegative(),
  totalDaLinhaCentavos: z.int().nonnegative(),
  /** O que custou na época, para a tela mostrar o que mudou. */
  precoUnitarioDaEpocaCentavos: z.int().nonnegative(),
  /** O que ainda falta escolher, quando uma opção da época sumiu. */
  pendencias: z.array(z.string()),
});

/** Um item que saiu do catálogo e não entra na repetição (AC-712). */
export const esquemaDoItemIndisponivel = z.strictObject({
  nome: z.string(),
  variacao: z.string().nullable(),
  quantidade: z.int().positive(),
  precoUnitarioDaEpocaCentavos: z.int().nonnegative(),
  motivo: z.enum(["FORA_DO_CATALOGO", "INDISPONIVEL", "VARIACAO_INDISPONIVEL"]),
});

/** `POST /v1/lojas/:apelido/pedidos/:id/repetir` — o pedido novo montado. */
export const esquemaDaRepeticaoDoPedido = z.strictObject({
  pedidoOriginal: z.strictObject({ id: z.uuid(), codigo: z.string() }),
  clienteId: z.uuid().nullable(),
  entrega: z.string(),
  itens: z.array(esquemaDoItemRepetido),
  indisponiveis: z.array(esquemaDoItemIndisponivel),
  subtotalCentavos: z.int().nonnegative(),
});

// ---------------------------------------------------------------------------
// Endereços salvos do comprador (T-707, AC-509)
// ---------------------------------------------------------------------------

/** O que a pessoa informa ao salvar um endereço. */
export const esquemaDoEnderecoParaSalvar = z.strictObject({
  rotulo: z.string().trim().max(40).nullable().optional(),
  destinatario: z.string().trim().max(120).nullable().optional(),
  logradouro: z.string().trim().min(3).max(160),
  numero: z.string().trim().max(24).nullable().optional(),
  complemento: z.string().trim().max(80).nullable().optional(),
  bairro: z.string().trim().max(80).nullable().optional(),
  cidade: z.string().trim().max(80).nullable().optional(),
  estado: z.string().trim().length(2).nullable().optional(),
  cep: z.string().trim().max(9).nullable().optional(),
  pontoDeReferencia: z.string().trim().max(200).nullable().optional(),
  padrao: z.boolean().default(false),
});

/** Um endereço salvo, como a conta o lista. */
export const esquemaDoEnderecoSalvo = z.strictObject({
  id: z.uuid(),
  rotulo: z.string().nullable(),
  destinatario: z.string().nullable(),
  logradouro: z.string(),
  numero: z.string().nullable(),
  complemento: z.string().nullable(),
  bairro: z.string().nullable(),
  cidade: z.string().nullable(),
  estado: z.string().nullable(),
  cep: z.string().nullable(),
  pontoDeReferencia: z.string().nullable(),
  padrao: z.boolean(),
});

/** `GET /v1/conta/enderecos` — os endereços da pessoa, o padrão primeiro. */
export const esquemaDosEnderecosSalvos = z.strictObject({
  enderecos: z.array(esquemaDoEnderecoSalvo),
});

export type ClienteDaLojaNoContrato = z.infer<typeof esquemaDoClienteDaLoja>;
export type ListaDeClientesNoContrato = z.infer<
  typeof esquemaDaListaDeClientes
>;
export type EnderecoDaFichaNoContrato = z.infer<
  typeof esquemaDoEnderecoDaFicha
>;
export type ClienteParaCadastrarNoContrato = z.input<
  typeof esquemaDoClienteParaCadastrar
>;
export type ClienteParaEditarNoContrato = z.input<
  typeof esquemaDoClienteParaEditar
>;
export type ClienteExistenteNoContrato = z.infer<
  typeof esquemaDoClienteExistente
>;
export type FichaDoClienteNoContrato = z.infer<typeof esquemaDaFichaDoCliente>;
export type PedidoDoHistoricoNoContrato = z.infer<
  typeof esquemaDoPedidoDoHistorico
>;
export type FichaComHistoricoNoContrato = z.infer<
  typeof esquemaDaFichaComHistorico
>;
export type ItemDoPedidoManualNoContrato = z.input<
  typeof esquemaDoItemDoPedidoManual
>;
export type PedidoManualParaCriarNoContrato = z.input<
  typeof esquemaDoPedidoManualParaCriar
>;
export type PedidoManualCriadoNoContrato = z.infer<
  typeof esquemaDoPedidoManualCriado
>;
export type RecusaDoPedidoManualNoContrato = z.infer<
  typeof esquemaDaRecusaDoPedidoManual
>;
export type RepeticaoDoPedidoNoContrato = z.infer<
  typeof esquemaDaRepeticaoDoPedido
>;
export type EnderecoParaSalvarNoContrato = z.input<
  typeof esquemaDoEnderecoParaSalvar
>;
export type EnderecoSalvoNoContrato = z.infer<typeof esquemaDoEnderecoSalvo>;
export type EnderecosSalvosNoContrato = z.infer<
  typeof esquemaDosEnderecosSalvos
>;
