/**
 * Contrato do cupom impresso (AC-619, AC-620, AC-621): os tipos que o gerador,
 * a fila, o navegador e o agente de impressão compartilham, a versão do
 * formato e o erro de uso do gerador.
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
 * completo em 32 e 48 colunas — é a referência das linhas que o agente de
 * impressão (T-609, Node/TypeScript no monorepo) imprime: ele chama este mesmo
 * `diagramarCupom`, sem segunda implementação.
 *
 * ── A via (AC-621) ── o número da via é o contador `orders.print_count`
 * depois de somado 1, na MESMA transação em que o cupom é gerado. Quem imprime
 * — navegador ou agente — soma; via > 1 sai marcada como REIMPRESSÃO no topo e
 * no pé do cupom.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type {
  Alinhamento,
  LarguraDoPapel,
  TabelaDeCaracteres,
} from "./cupom-largura.ts";
import type {
  ClienteDoPedido,
  FormaDeEntrega,
  ItemDoPedido,
  PagamentoDoPedido,
  TaxaDeEntrega,
} from "./pedido-descrito.ts";

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
