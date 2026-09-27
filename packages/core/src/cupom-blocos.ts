/**
 * Gerador dos blocos do cupom impresso — uma fonte, duas saídas
 * (T-605 — AC-619, AC-620, AC-621).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTRATO DO CUPOM — versão 1
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Quem consome este formato: a página de impressão pelo navegador (T-606), a
 * fila de impressão em banco (T-607, coluna `print_jobs.blocks`) e o agente de
 * impressão (T-609). Mudar qualquer coisa abaixo de forma incompatível exige
 * subir `VERSAO_DO_CUPOM`; o consumidor que receber versão desconhecida RECUSA
 * o trabalho em vez de imprimir errado (`lerCupomImpresso` devolve `null`).
 *
 * São dois níveis, e a separação é de propósito:
 *
 * ── Nível 1: o cupom SEMÂNTICO (`CupomImpresso`) ── é o que se guarda e o que
 * trafega. Não tem byte de impressora nem quebra de linha calculada: descreve
 * O QUE sai no papel, e por isso um pedido de três meses atrás é reimpresso
 * fielmente mesmo depois de a impressora da loja mudar.
 *
 *   {
 *     "versao": 1,
 *     "papel": { "larguraMm": 58 | 80, "colunas": 32 | 48 },
 *     "via": 1,                      // 1 = original; 2, 3… = reimpressão
 *     "blocos": [ BlocoDoCupom, … ]  // na ordem em que saem no papel
 *   }
 *
 * `BlocoDoCupom` é um destes cinco (campo `tipo` decide):
 *
 *   { "tipo": "texto", "texto": string,
 *     "alinhamento"?: "esquerda" | "centro" | "direita",   // padrão esquerda
 *     "negrito"?: boolean,                                  // padrão false
 *     "tamanho"?: "normal" | "duplo",                       // padrão normal
 *     "recuo"?: inteiro >= 0 }                              // padrão 0
 *       Texto corrido. Quebra por palavra na largura útil; cada linha
 *       resultante recebe o mesmo recuo. "\n" no texto força quebra.
 *
 *   { "tipo": "par", "esquerda": string, "direita": string,
 *     "negrito"?: boolean, "tamanho"?: "normal" | "duplo", "recuo"?: inteiro }
 *       Rótulo e valor. O valor termina SEMPRE na última coluna, na primeira
 *       linha; o rótulo que não couber continua nas linhas seguintes com
 *       `RECUO_DA_CONTINUACAO` colunas a mais. Se nem a primeira palavra do
 *       rótulo couber ao lado do valor, o rótulo sai sozinho e o valor vai na
 *       linha de baixo, encostado à direita.
 *
 *   { "tipo": "separador", "caractere": "-" | "=" }
 *       Uma linha inteira do caractere, sempre em tamanho normal.
 *
 *   { "tipo": "espaco", "linhas": inteiro >= 1 }
 *       Linhas em branco (avanço de papel).
 *
 *   { "tipo": "corte" }
 *       Fim do cupom: a impressora corta conforme o perfil dela; o navegador
 *       ignora.
 *
 * Todo texto é GUARDADO como veio do pedido (NFC, sem controle). Quem
 * imprime normaliza para a tabela da impressora na hora de diagramar.
 *
 * ── Nível 2: as LINHAS (`LinhaDoCupom[]`) ── é o cupom diagramado para um
 * perfil (colunas + tabela de caracteres), por `diagramarCupom`. Cada linha:
 *
 *   { "tipo": "texto", "texto": string, "negrito": boolean,
 *     "tamanho": "normal" | "duplo" }   ou   { "tipo": "corte" }
 *
 * Garantias de cada linha de texto, que as duas saídas usam sem recalcular:
 *   - o texto já está normalizado: cada caractere é UMA coluna e existe na
 *     tabela escolhida (`normalizarParaImpressao`, em `cupom-largura.ts`);
 *   - o alinhamento já foi aplicado com espaços à esquerda; não há espaço à
 *     direita;
 *   - comprimento <= colunas (tamanho normal) ou <= colunas/2 (duplo, que
 *     ocupa duas colunas por caractere).
 *
 * As duas saídas partem das MESMAS linhas, e nenhuma decide conteúdo:
 *   - navegador (T-606): uma linha de HTML por linha, `white-space: pre`,
 *     fonte monoespaçada com `colunas` caracteres na área impressa do papel;
 *   - impressora (T-609): `compilarEscPos` (`cupom-escpos.ts`) — ESC @,
 *     ESC t <tabela>, e por linha ESC E <negrito> + GS ! <tamanho> + bytes na
 *     tabela + LF; no corte, GS V conforme o perfil.
 *
 * O teste de `cupom-escpos.test.ts` lê de volta os bytes da impressora e prova
 * que dizem exatamente o que as linhas dizem; o de T-606 prova o mesmo para o
 * HTML. O arquivo `cupom-blocos.test.ts.snap` guarda as linhas de um pedido
 * completo em 32 e 48 colunas — é a referência que o agente em outra
 * linguagem reproduz, caractere por caractere.
 *
 * ── A via (AC-621) ── o número da via é o contador `orders.print_count`
 * depois de somado 1, na MESMA transação em que o cupom é gerado. Quem imprime
 * — navegador ou agente — soma; via > 1 sai marcada como REIMPRESSÃO no topo e
 * no pé do cupom.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Função PURA, como o gerador do texto do WhatsApp (`cupom-texto.ts`), e com
 * os mesmos tipos de pedido: o que o dono lê na conversa e o que a cozinha lê
 * no papel saem da mesma descrição do pedido.
 */

import {
  alinharNaLinha,
  colunasDoPapel,
  ehLarguraDoPapel,
  juntarNaLinha,
  larguraNoPapel,
  normalizarParaImpressao,
  quebrarEmLinhas,
  TABELA_PADRAO,
  type Alinhamento,
  type LarguraDoPapel,
  type TabelaDeCaracteres,
} from "./cupom-largura.ts";
import type {
  ClienteDoPedido,
  EnderecoDeEntrega,
  FormaDeEntrega,
  FormaDePagamento,
  ItemDoPedido,
  OpcaoDoItem,
  PagamentoDoPedido,
  TaxaDeEntrega,
} from "./cupom-texto.ts";
import { emReais } from "./taxa-entrega.ts";
import { normalizarWhatsApp } from "./telefone.ts";

// ── Contrato ────────────────────────────────────────────────────────────────

/** Versão do formato. Consumidor que não a conhece recusa o cupom. */
export const VERSAO_DO_CUPOM = 1;

/** Colunas a mais na continuação do rótulo de um `par` quebrado. */
export const RECUO_DA_CONTINUACAO = 2;

/** Tamanho da letra. `duplo` dobra altura e largura: metade das colunas. */
export type TamanhoDoTexto = "normal" | "duplo";

/** Texto corrido, quebrado por palavra. */
export interface BlocoDeTexto {
  readonly tipo: "texto";
  readonly texto: string;
  readonly alinhamento?: Alinhamento;
  readonly negrito?: boolean;
  readonly tamanho?: TamanhoDoTexto;
  readonly recuo?: number;
}

/** Rótulo à esquerda e valor encostado na margem direita. */
export interface BlocoDePar {
  readonly tipo: "par";
  readonly esquerda: string;
  readonly direita: string;
  readonly negrito?: boolean;
  readonly tamanho?: TamanhoDoTexto;
  readonly recuo?: number;
}

/** Linha inteira de um caractere. */
export interface BlocoSeparador {
  readonly tipo: "separador";
  readonly caractere: "-" | "=";
}

/** Linhas em branco. */
export interface BlocoDeEspaco {
  readonly tipo: "espaco";
  readonly linhas: number;
}

/** Fim do cupom. */
export interface BlocoDeCorte {
  readonly tipo: "corte";
}

/** Um bloco do cupom — o vocabulário inteiro do contrato. */
export type BlocoDoCupom =
  BlocoDeTexto | BlocoDePar | BlocoSeparador | BlocoDeEspaco | BlocoDeCorte;

/** O papel para o qual o cupom foi gerado. */
export interface PapelDoCupom {
  readonly larguraMm: LarguraDoPapel;
  readonly colunas: number;
}

/** O cupom semântico: o que se guarda, o que trafega, o que se reimprime. */
export interface CupomImpresso {
  readonly versao: typeof VERSAO_DO_CUPOM;
  readonly papel: PapelDoCupom;
  readonly via: number;
  readonly blocos: readonly BlocoDoCupom[];
}

/** Uma linha do cupom já diagramado para um perfil de impressão. */
export type LinhaDoCupom =
  | {
      readonly tipo: "texto";
      readonly texto: string;
      readonly negrito: boolean;
      readonly tamanho: TamanhoDoTexto;
    }
  | { readonly tipo: "corte" };

/** Para quem o cupom é diagramado: colunas e tabela de caracteres. */
export interface PerfilDeDiagramacao {
  /** Padrão: as colunas do papel do cupom. */
  readonly colunas?: number;
  /** Padrão: `TABELA_PADRAO` (860, português). */
  readonly tabela?: TabelaDeCaracteres;
}

// ── Entrada do gerador ──────────────────────────────────────────────────────

/** Canal por onde o pedido entrou, como `orders.channel` guarda. */
export type CanalDoPedido = "ONLINE" | "MANUAL";

/**
 * O pedido, do jeito que o cupom precisa dele.
 *
 * Os tipos de item, entrega, taxa e pagamento são os MESMOS do texto do
 * WhatsApp — de propósito: a mensagem e o papel descrevem o mesmo pedido, e
 * dois vocabulários acabariam divergindo em silêncio.
 */
export interface PedidoParaCupom {
  /** Nome da loja, como o cliente o vê. */
  readonly loja: string;
  /** Código que se lê em voz alta na cozinha ("A-1042"). */
  readonly codigo: string;
  /** Instante da compra, em ISO 8601. */
  readonly feitoEm: string;
  /** Fuso COPIADO no pedido: "hoje" é o dia da loja, não o do servidor. */
  readonly fusoHorario: string;
  readonly canal: CanalDoPedido;
  readonly cliente: ClienteDoPedido;
  readonly itens: readonly ItemDoPedido[];
  readonly observacao?: string | null;
  readonly entrega: FormaDeEntrega;
  readonly taxaDeEntrega: TaxaDeEntrega;
  readonly pagamento: PagamentoDoPedido;
  readonly subtotalEmCentavos: number;
  readonly descontoEmCentavos?: number;
  readonly descontoDeRetiradaEmCentavos?: number;
  readonly totalEmCentavos: number;
}

/**
 * O conteúdo opcional que o dono escolhe na configuração (T-906, AC-920).
 * Pedido, itens e total não estão aqui porque nunca saem do cupom.
 */
export interface ConteudoDoCupom {
  /** Endereço de entrega do cliente. */
  readonly enderecoCliente: boolean;
  /**
   * Observação geral do pedido. A observação de CADA ITEM ("sem cebola, é
   * alergia") não obedece a esta chave: ela é parte do item, e cozinha que não
   * a lê erra o prato.
   */
  readonly observacoes: boolean;
  /** Total em letra dupla. */
  readonly totalEmDestaque: boolean;
}

/** O conteúdo quando a loja nunca mexeu na configuração. */
export const CONTEUDO_PADRAO_DO_CUPOM: ConteudoDoCupom = {
  enderecoCliente: true,
  observacoes: true,
  totalEmDestaque: false,
};

/** Ajustes do gerador. */
export interface OpcoesDoCupom {
  /** Largura do papel configurada na loja (T-906). */
  readonly larguraMm: LarguraDoPapel;
  /** Número desta via; 1 é a original. */
  readonly via?: number;
  readonly conteudo?: Partial<ConteudoDoCupom>;
}

/** Erro de uso do gerador: a entrada não descreve um cupom possível. */
export class ErroDoCupom extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDoCupom";
  }
}

// ── Formatação ──────────────────────────────────────────────────────────────

/** Recusa dinheiro que não é inteiro em centavos, em vez de arredondar (P-005). */
function reais(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) {
    throw new ErroDoCupom(
      `valor monetário precisa ser inteiro em centavos (P-005); recebido: ${String(centavos)}`,
    );
  }
  return emReais(centavos);
}

/** Data e hora da compra no fuso da loja: "26/09/2026 14:32". */
function dataEHora(instante: string, fusoHorario: string): string {
  const momento = new Date(instante);
  if (Number.isNaN(momento.getTime())) {
    throw new ErroDoCupom(`instante do pedido inválido: ${instante}`);
  }
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fusoHorario,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(momento);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)?.value ?? "";
  return `${parte("day")}/${parte("month")}/${parte("year")} ${parte("hour")}:${parte("minute")}`;
}

/**
 * Telefone como o dono disca. Número brasileiro perde o "+55", que no balcão
 * só atrapalha; estrangeiro fica com o código do país; o que não for número
 * reconhecível sai como foi guardado, porque escondê-lo seria pior.
 */
function telefoneParaLer(telefone: string): string {
  const numero = normalizarWhatsApp(telefone);
  if (!numero.ok) return telefone;
  return numero.pais === "55"
    ? numero.exibicao.replace(/^\+55 /, "")
    : numero.exibicao;
}

/** Texto opcional: vazio e só-espaço valem como ausente. */
function presente(valor: string | null | undefined): string | null {
  if (valor == null) return null;
  const limpo = valor.normalize("NFC").trim();
  return limpo === "" ? null : limpo;
}

/** Junta as partes preenchidas, descartando as vazias. */
function juntar(
  partes: readonly (string | null | undefined)[],
  entre: string,
): string {
  return partes
    .map(presente)
    .filter((parte): parte is string => parte !== null)
    .join(entre);
}

const NOME_DO_CANAL: Readonly<Record<CanalDoPedido, string>> = {
  ONLINE: "Site",
  MANUAL: "Balcão",
};

const NOME_DO_PAGAMENTO: Readonly<Record<FormaDePagamento, string>> = {
  PIX: "PIX",
  CASH: "Dinheiro",
  CARD_ON_DELIVERY: "Cartão na entrega",
  OTHER: "A combinar",
};

/** Número ordinal da via, como se escreve à mão: "2ª". */
function ordinal(via: number): string {
  return `${String(via)}ª`;
}

// ── Montagem ────────────────────────────────────────────────────────────────

/** Título de seção: negrito, à esquerda. */
function titulo(texto: string): BlocoDeTexto {
  return { tipo: "texto", texto, negrito: true };
}

/** A marca de segunda via, visível de longe (AC-621). */
function marcaDeReimpressao(via: number): BlocoDoCupom[] {
  return [
    {
      tipo: "texto",
      texto: "REIMPRESSÃO",
      alinhamento: "centro",
      negrito: true,
      tamanho: "duplo",
    },
    {
      tipo: "texto",
      texto: `*** ${ordinal(via)} VIA ***`,
      alinhamento: "centro",
      negrito: true,
    },
    { tipo: "separador", caractere: "=" },
  ];
}

/** Uma escolha do item, com a diferença entre acrescentar e tirar. */
function linhaDaOpcao(opcao: OpcaoDoItem): BlocoDeTexto {
  const grupo = presente(opcao.grupo) ?? "";
  const nome = presente(opcao.opcao) ?? "";
  const rotulo = grupo === "" ? "" : `${grupo}: `;
  if (opcao.acao === "REMOVE") {
    return { tipo: "texto", texto: `- ${rotulo}sem ${nome}`, recuo: 3 };
  }
  const quantidade = opcao.quantidade ?? 1;
  const vezes = quantidade > 1 ? ` x${String(quantidade)}` : "";
  const acrescimo = opcao.acrescimoEmCentavos ?? 0;
  const valor = acrescimo > 0 ? ` (+${reais(acrescimo)})` : "";
  return {
    tipo: "texto",
    texto: `+ ${rotulo}${nome}${vezes}${valor}`,
    recuo: 3,
  };
}

/** O item: quantidade, nome e valor; depois as escolhas e a observação dele. */
function blocosDoItem(item: ItemDoPedido): BlocoDoCupom[] {
  if (!Number.isSafeInteger(item.quantidade) || item.quantidade <= 0) {
    throw new ErroDoCupom(
      `quantidade do item "${item.nome}" precisa ser inteiro maior que zero`,
    );
  }
  const variacao = presente(item.variacao);
  const nome = presente(item.nome) ?? "Item";
  const blocos: BlocoDoCupom[] = [
    {
      tipo: "par",
      esquerda: `${String(item.quantidade)}x ${variacao === null ? nome : `${nome} (${variacao})`}`,
      direita: reais(item.totalDaLinhaEmCentavos),
      negrito: true,
    },
  ];
  for (const opcao of item.opcoes ?? []) blocos.push(linhaDaOpcao(opcao));
  const observacao = presente(item.observacao);
  if (observacao !== null) {
    blocos.push({
      tipo: "texto",
      texto: `>> Obs.: ${observacao}`,
      negrito: true,
      recuo: 3,
    });
  }
  return blocos;
}

/** "Rótulo valor" quando o valor existe; vazio quando não. */
function rotulado(rotulo: string, valor: string | null | undefined): string {
  const texto = presente(valor);
  return texto === null ? "" : `${rotulo} ${texto}`;
}

/** O endereço em linhas, como o entregador lê. */
function blocosDoEndereco(endereco: EnderecoDeEntrega): BlocoDoCupom[] {
  const linhas = [
    juntar(
      [
        juntar([endereco.logradouro, endereco.numero], ", "),
        endereco.complemento,
      ],
      " - ",
    ),
    juntar(
      [endereco.bairro, juntar([endereco.cidade, endereco.uf], "/")],
      " - ",
    ),
    rotulado("CEP", endereco.cep),
    rotulado("Ref.:", endereco.pontoDeReferencia),
    rotulado("Receber:", endereco.destinatario),
  ];
  return linhas
    .filter((texto) => texto !== "")
    .map((texto): BlocoDeTexto => ({ tipo: "texto", texto }));
}

/** Como a taxa de entrega é dita no papel, modo a modo. */
function valorDaTaxa(taxa: TaxaDeEntrega): string {
  switch (taxa.modo) {
    case "VALUE":
      return reais(taxa.valorEmCentavos);
    case "FREE":
      return "grátis";
    case "ASK":
    case "OUTSIDE_AREA":
    case "NEIGHBORHOOD_NOT_FOUND":
      return "a combinar";
  }
}

/** Pagamento: forma, troco e — por fim — os valores com o total. */
function blocosDoPagamento(
  pedido: PedidoParaCupom,
  totalEmDestaque: boolean,
): BlocoDoCupom[] {
  const blocos: BlocoDoCupom[] = [
    titulo("PAGAMENTO"),
    {
      tipo: "par",
      esquerda: "Forma",
      direita: NOME_DO_PAGAMENTO[pedido.pagamento.forma],
    },
  ];
  if (pedido.pagamento.trocoParaEmCentavos != null) {
    blocos.push({
      tipo: "par",
      esquerda: "Troco para",
      direita: reais(pedido.pagamento.trocoParaEmCentavos),
    });
  }
  blocos.push({ tipo: "separador", caractere: "-" });
  blocos.push({
    tipo: "par",
    esquerda: "Subtotal",
    direita: reais(pedido.subtotalEmCentavos),
  });
  const desconto = pedido.descontoEmCentavos ?? 0;
  if (desconto > 0) {
    blocos.push({
      tipo: "par",
      esquerda: "Desconto",
      direita: reais(-desconto),
    });
  }
  const descontoDeRetirada = pedido.descontoDeRetiradaEmCentavos ?? 0;
  if (descontoDeRetirada > 0) {
    blocos.push({
      tipo: "par",
      esquerda: "Desconto retirada",
      direita: reais(-descontoDeRetirada),
    });
  }
  // Retirada não paga entrega (AC-506): a linha não existe, em vez de zerada.
  if (pedido.entrega.tipo === "DELIVERY") {
    blocos.push({
      tipo: "par",
      esquerda: presente(pedido.taxaDeEntrega.nome) ?? "Taxa de entrega",
      direita: valorDaTaxa(pedido.taxaDeEntrega),
    });
  }
  blocos.push({
    tipo: "par",
    esquerda: "TOTAL",
    direita: reais(pedido.totalEmCentavos),
    negrito: true,
    tamanho: totalEmDestaque ? "duplo" : "normal",
  });
  return blocos;
}

/**
 * Gera o cupom de um pedido (AC-619, AC-621).
 *
 * A ordem é a de quem trabalha com o papel na mão (AC-619): quem é a loja e
 * qual é o pedido; quando e por onde entrou; de quem é; o que preparar, com as
 * escolhas e as observações em destaque; para onde vai; como será pago e
 * quanto é. Uma via acima da primeira sai marcada como reimpressão no topo e
 * no pé (AC-621) — o topo é o que se vê no espeto de comandas, o pé é o que se
 * vê quando o papel é rasgado.
 */
export function gerarCupom(
  pedido: PedidoParaCupom,
  opcoes: OpcoesDoCupom,
): CupomImpresso {
  if (pedido.itens.length === 0) {
    throw new ErroDoCupom("pedido sem itens não gera cupom");
  }
  if (!ehLarguraDoPapel(opcoes.larguraMm)) {
    throw new ErroDoCupom(
      `largura de papel desconhecida: ${String(opcoes.larguraMm)}`,
    );
  }
  const via = opcoes.via ?? 1;
  if (!Number.isSafeInteger(via) || via < 1) {
    throw new ErroDoCupom(
      `a via precisa ser inteiro a partir de 1: ${String(via)}`,
    );
  }
  const conteudo = { ...CONTEUDO_PADRAO_DO_CUPOM, ...opcoes.conteudo };

  const blocos: BlocoDoCupom[] = [];
  if (via > 1) blocos.push(...marcaDeReimpressao(via));

  blocos.push(
    {
      tipo: "texto",
      texto: presente(pedido.loja) ?? "Loja",
      alinhamento: "centro",
      negrito: true,
      tamanho: "duplo",
    },
    { tipo: "separador", caractere: "=" },
    {
      tipo: "texto",
      texto: `PEDIDO ${presente(pedido.codigo) ?? ""}`,
      alinhamento: "centro",
      negrito: true,
      tamanho: "duplo",
    },
    {
      tipo: "par",
      esquerda: "Data",
      direita: dataEHora(pedido.feitoEm, pedido.fusoHorario),
    },
    { tipo: "par", esquerda: "Canal", direita: NOME_DO_CANAL[pedido.canal] },
    {
      tipo: "par",
      esquerda: "Tipo",
      direita: pedido.entrega.tipo === "DELIVERY" ? "Entrega" : "Retirada",
      negrito: true,
    },
    { tipo: "separador", caractere: "-" },
    titulo("CLIENTE"),
    { tipo: "texto", texto: presente(pedido.cliente.nome) ?? "Sem nome" },
    {
      tipo: "texto",
      texto: telefoneParaLer(presente(pedido.cliente.telefone) ?? ""),
    },
    { tipo: "separador", caractere: "-" },
    titulo("ITENS"),
  );
  for (const item of pedido.itens) blocos.push(...blocosDoItem(item));

  const observacao = presente(pedido.observacao);
  if (conteudo.observacoes && observacao !== null) {
    blocos.push(
      { tipo: "separador", caractere: "=" },
      {
        tipo: "texto",
        texto: "OBSERVAÇÕES DO PEDIDO",
        alinhamento: "centro",
        negrito: true,
      },
      { tipo: "texto", texto: observacao, negrito: true },
      { tipo: "separador", caractere: "=" },
    );
  } else {
    blocos.push({ tipo: "separador", caractere: "-" });
  }

  if (pedido.entrega.tipo === "DELIVERY") {
    blocos.push(titulo("ENTREGA"));
    if (conteudo.enderecoCliente) {
      blocos.push(...blocosDoEndereco(pedido.entrega.endereco));
    }
  } else {
    blocos.push(titulo("RETIRADA NO LOCAL"));
  }
  blocos.push({ tipo: "separador", caractere: "-" });

  blocos.push(...blocosDoPagamento(pedido, conteudo.totalEmDestaque));

  if (via > 1) {
    blocos.push(
      { tipo: "separador", caractere: "=" },
      {
        tipo: "texto",
        texto: `REIMPRESSÃO - ${ordinal(via)} VIA`,
        alinhamento: "centro",
        negrito: true,
      },
    );
  }
  blocos.push({ tipo: "espaco", linhas: 3 }, { tipo: "corte" });

  return {
    versao: VERSAO_DO_CUPOM,
    papel: {
      larguraMm: opcoes.larguraMm,
      colunas: colunasDoPapel(opcoes.larguraMm),
    },
    via,
    blocos,
  };
}

// ── Diagramação ─────────────────────────────────────────────────────────────

/** Estado de letra de uma linha de texto. */
interface Letra {
  readonly negrito: boolean;
  readonly tamanho: TamanhoDoTexto;
}

/** Linha de texto pronta, sem espaço sobrando à direita. */
function linha(texto: string, letra: Letra): LinhaDoCupom {
  return {
    tipo: "texto",
    texto: texto.replace(/ +$/, ""),
    negrito: letra.negrito,
    tamanho: letra.tamanho,
  };
}

/** Caracteres que cabem numa linha de um tamanho de letra. */
function capacidade(colunas: number, tamanho: TamanhoDoTexto): number {
  return tamanho === "duplo" ? Math.floor(colunas / 2) : colunas;
}

/** Recuo válido: inteiro, não negativo e deixando ao menos uma coluna útil. */
function recuoValido(recuo: number | undefined, capacidadeDaLinha: number) {
  const pedido = recuo ?? 0;
  if (!Number.isSafeInteger(pedido) || pedido < 0) return 0;
  return Math.min(pedido, capacidadeDaLinha - 1);
}

function diagramarTexto(
  bloco: BlocoDeTexto,
  colunas: number,
  tabela: TabelaDeCaracteres,
): LinhaDoCupom[] {
  const letra: Letra = {
    negrito: bloco.negrito ?? false,
    tamanho: bloco.tamanho ?? "normal",
  };
  const cabe = capacidade(colunas, letra.tamanho);
  const recuo = recuoValido(bloco.recuo, cabe);
  const util = cabe - recuo;
  const linhas: LinhaDoCupom[] = [];
  for (const paragrafo of bloco.texto.split("\n")) {
    const texto = normalizarParaImpressao(paragrafo, tabela);
    if (texto === "") continue;
    for (const pedaco of quebrarEmLinhas(texto, util)) {
      const posto = alinharNaLinha(
        pedaco,
        util,
        bloco.alinhamento ?? "esquerda",
      );
      linhas.push(linha(" ".repeat(recuo) + posto, letra));
    }
  }
  return linhas;
}

function diagramarPar(
  bloco: BlocoDePar,
  colunas: number,
  tabela: TabelaDeCaracteres,
): LinhaDoCupom[] {
  const letra: Letra = {
    negrito: bloco.negrito ?? false,
    tamanho: bloco.tamanho ?? "normal",
  };
  const cabe = capacidade(colunas, letra.tamanho);
  const recuo = recuoValido(bloco.recuo, cabe);
  const margem = " ".repeat(recuo);
  const util = cabe - recuo;
  const esquerda = normalizarParaImpressao(bloco.esquerda, tabela);
  const direita = normalizarParaImpressao(bloco.direita, tabela);

  const continuacao = Math.max(1, util - RECUO_DA_CONTINUACAO);
  const recuoDaContinuacao = " ".repeat(util - continuacao);

  // Valor à direita em quantas linhas precisar, sempre encostado na margem.
  const valorSozinho = () =>
    quebrarEmLinhas(direita, util).map((pedaco) =>
      linha(margem + alinharNaLinha(pedaco, util, "direita"), letra),
    );

  if (direita === "") {
    return quebrarEmLinhas(esquerda, util).map((pedaco) =>
      linha(margem + pedaco, letra),
    );
  }
  if (esquerda === "") return valorSozinho();

  const aoLadoDoValor = util - larguraNoPapel(direita) - 1;
  const primeiraPalavra = esquerda.split(" ")[0] ?? "";
  if (aoLadoDoValor >= 1 && larguraNoPapel(primeiraPalavra) <= aoLadoDoValor) {
    const [primeira = "", ...demais] = quebrarEmLinhas(
      esquerda,
      aoLadoDoValor,
      continuacao,
    );
    return [
      linha(margem + juntarNaLinha(primeira, direita, util), letra),
      ...demais.map((pedaco) =>
        linha(margem + recuoDaContinuacao + pedaco, letra),
      ),
    ];
  }

  // Nem a primeira palavra cabe ao lado do valor: o rótulo sai inteiro e o
  // valor desce para a linha de baixo, ainda na coluna da direita.
  const [primeira = "", ...demais] = quebrarEmLinhas(
    esquerda,
    util,
    continuacao,
  );
  return [
    linha(margem + primeira, letra),
    ...demais.map((pedaco) =>
      linha(margem + recuoDaContinuacao + pedaco, letra),
    ),
    ...valorSozinho(),
  ];
}

const NORMAL: Letra = { negrito: false, tamanho: "normal" };

/**
 * Diagrama o cupom para um perfil: colunas e tabela de caracteres.
 *
 * É daqui que as duas saídas partem (navegador e impressora) — e nenhuma delas
 * mede, quebra ou alinha texto por conta própria. Se a medida morasse em cada
 * saída, a coluna de valores de uma poderia andar uma casa em relação à da
 * outra, e o "mesmo cupom" deixaria de ser o mesmo.
 */
export function diagramarCupom(
  cupom: CupomImpresso,
  perfil: PerfilDeDiagramacao = {},
): LinhaDoCupom[] {
  const colunas = perfil.colunas ?? cupom.papel.colunas;
  const tabela = perfil.tabela ?? TABELA_PADRAO;
  if (!Number.isSafeInteger(colunas) || colunas < 8) {
    throw new ErroDoCupom(
      `colunas insuficientes para um cupom: ${String(colunas)}`,
    );
  }

  const linhas: LinhaDoCupom[] = [];
  for (const bloco of cupom.blocos) {
    switch (bloco.tipo) {
      case "texto":
        linhas.push(...diagramarTexto(bloco, colunas, tabela));
        break;
      case "par":
        linhas.push(...diagramarPar(bloco, colunas, tabela));
        break;
      case "separador":
        linhas.push(linha(bloco.caractere.repeat(colunas), NORMAL));
        break;
      case "espaco":
        for (let i = 0; i < bloco.linhas; i += 1)
          linhas.push(linha("", NORMAL));
        break;
      case "corte":
        linhas.push({ tipo: "corte" });
        break;
    }
  }
  return linhas;
}

// ── Leitura do contrato ─────────────────────────────────────────────────────

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function opcional<T>(valor: unknown, aceita: (v: unknown) => v is T): boolean {
  return valor === undefined || aceita(valor);
}

const ehTexto = (v: unknown): v is string => typeof v === "string";
const ehBooleano = (v: unknown): v is boolean => typeof v === "boolean";
const ehTamanho = (v: unknown): v is TamanhoDoTexto =>
  v === "normal" || v === "duplo";
const ehAlinhamento = (v: unknown): v is Alinhamento =>
  v === "esquerda" || v === "centro" || v === "direita";
const ehInteiroNaoNegativo = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

function ehBloco(valor: unknown): valor is BlocoDoCupom {
  if (!ehObjeto(valor)) return false;
  switch (valor.tipo) {
    case "texto":
      return (
        ehTexto(valor.texto) &&
        opcional(valor.alinhamento, ehAlinhamento) &&
        opcional(valor.negrito, ehBooleano) &&
        opcional(valor.tamanho, ehTamanho) &&
        opcional(valor.recuo, ehInteiroNaoNegativo)
      );
    case "par":
      return (
        ehTexto(valor.esquerda) &&
        ehTexto(valor.direita) &&
        opcional(valor.negrito, ehBooleano) &&
        opcional(valor.tamanho, ehTamanho) &&
        opcional(valor.recuo, ehInteiroNaoNegativo)
      );
    case "separador":
      return valor.caractere === "-" || valor.caractere === "=";
    case "espaco":
      return ehInteiroNaoNegativo(valor.linhas) && valor.linhas >= 1;
    case "corte":
      return true;
    default:
      return false;
  }
}

/**
 * Lê um cupom que chegou de fora (JSON da API, linha da fila, disco do
 * agente). Devolve `null` para qualquer coisa fora do contrato — inclusive
 * versão desconhecida: imprimir errado é pior que não imprimir.
 */
export function lerCupomImpresso(valor: unknown): CupomImpresso | null {
  if (!ehObjeto(valor) || valor.versao !== VERSAO_DO_CUPOM) return null;
  const papel = valor.papel;
  if (
    !ehObjeto(papel) ||
    !ehLarguraDoPapel(papel.larguraMm) ||
    !ehInteiroNaoNegativo(papel.colunas) ||
    papel.colunas < 8
  ) {
    return null;
  }
  if (!ehInteiroNaoNegativo(valor.via) || valor.via < 1) return null;
  if (!Array.isArray(valor.blocos) || !valor.blocos.every(ehBloco)) return null;
  return {
    versao: VERSAO_DO_CUPOM,
    papel: { larguraMm: papel.larguraMm, colunas: papel.colunas },
    via: valor.via,
    blocos: valor.blocos,
  };
}
