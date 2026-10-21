/**
 * Clientes e pedidos GERADOS para as lojas novas da demonstração (card #50).
 *
 * As duas lojas do seed original têm o roteiro escrito à mão em `dados.ts`.
 * As 22 novas teriam centenas de linhas iguais, então o roteiro sai daqui, de
 * funções puras e previsíveis (`sorteio` por nome, nunca `Math.random`):
 *
 * - **do mês**: pedidos espalhados pelos últimos 29 dias, quase todos
 *   concluídos e alguns cancelados — o que as métricas e o histórico do
 *   cliente precisam. A chave não tem data: entram uma vez e ficam.
 * - **de hoje**: um pedido em cada etapa do quadro (gerado, confirmado, em
 *   preparo, pronto para retirada, saiu para entrega, concluído, cancelado). A
 *   chave leva a DATA de hoje, então rodar a carga num dia novo planta o
 *   quadro do dia de novo, e rodar duas vezes no mesmo dia não duplica.
 */

import type {
  ClienteDemo,
  ItemDemo,
  LojaDemo,
  PedidoDemo,
  StatusDemo,
} from "./dados.ts";
import { sorteio } from "./escrita.ts";

/** A conta de cliente de teste aparece nos clientes com esta chave. */
export const CHAVE_DA_CLIENTE_DE_TESTE = "ana";

/** Gente de Fortaleza que compra nas lojas novas. */
const CLIENTES_DE_FORTALEZA: readonly ClienteDemo[] = [
  ["francisca", "Francisca Holanda", "Rua Silva Paulet", "1420", "Apto 302", "Aldeota"],
  ["joao", "João Batista Freitas", "Rua Tibúrcio Cavalcante", "880", null, "Meireles"],
  ["raimunda", "Raimunda Nogueira", "Rua Padre Valdevino", "2155", "Casa B", "Joaquim Távora"],
  ["antonio", "Antônio Carlos Bezerra", "Avenida 13 de Maio", "1700", null, "Fátima"],
  ["luana", "Luana Cavalcante", "Rua Canuto de Aguiar", "500", "Apto 1104", "Meireles"],
  ["pedro", "Pedro Henrique Sales", "Rua Carapinima", "1001", null, "Benfica"],
  ["livia", "Lívia Maia", "Rua Frei Mansueto", "410", "Bloco 2, apto 23", "Varjota"],
  ["marcos", "Marcos Vinícius Lima", "Avenida João Pessoa", "4890", null, "Damas"],
  ["juliana", "Juliana Sampaio", "Rua Monsenhor Bruno", "1600", "Apto 801", "Aldeota"],
  ["cicero", "Cícero Rocha", "Rua Jaime Benévolo", "1210", null, "Bairro de Fátima"],
  ["tereza", "Tereza Mourão", "Avenida Washington Soares", "3663", "Torre 1, apto 506", "Edson Queiroz"],
  ["rafael", "Rafael Teixeira", "Rua Coronel Nunes de Melo", "1300", null, "Rodolfo Teófilo"],
].map(([chave, nome, logradouro, numero, complemento, bairro], i) => ({
  chave: chave!,
  nome: nome!,
  telefone: `+5585988${String(410000 + i * 137).padStart(6, "0")}`,
  email: `${chave}.cliente@exemplo.test`,
  endereco: {
    logradouro: logradouro!,
    numero: numero!,
    complemento: complemento ?? null,
    bairro: bairro!,
  },
}));

/** A conta de teste do cliente, como cliente das lojas (o vínculo é pela conta). */
export const CLIENTE_DE_TESTE: ClienteDemo = {
  chave: CHAVE_DA_CLIENTE_DE_TESTE,
  nome: "Ana Ribeiro",
  telefone: "+5585999990101",
  email: "ana.ribeiro@cliente.test",
  endereco: {
    logradouro: "Rua Andrade Furtado",
    numero: "1250",
    complemento: "Apto 702",
    bairro: "Cocó",
  },
  observacao: "Prefere receber pelo interfone.",
};

/** A Ana compra em duas de cada três lojas novas. */
export function anaCompraNa(loja: LojaDemo): boolean {
  return sorteio(`ana:${loja.chave}`, 3) !== 0;
}

/** Os clientes de uma loja nova: seis da cidade e, às vezes, a Ana. */
export function clientesGerados(loja: LojaDemo): readonly ClienteDemo[] {
  const inicio = sorteio(`clientes:${loja.chave}`, CLIENTES_DE_FORTALEZA.length);
  const escolhidos = Array.from(
    { length: 6 },
    (_v, i) => CLIENTES_DE_FORTALEZA[(inicio + i * 2) % CLIENTES_DE_FORTALEZA.length]!,
  );
  return anaCompraNa(loja) ? [...escolhidos, CLIENTE_DE_TESTE] : escolhidos;
}

export interface PedidoDoRoteiro {
  /** Nome estável do pedido, de onde sai o id. */
  readonly chave: string;
  readonly pedido: PedidoDemo;
  /** Número fixo do seed escrito à mão; sem ele, a carga tira da sequência. */
  readonly numero?: number;
}

type Forma = "DELIVERY" | "PICKUP";

function formasDa(loja: LojaDemo): readonly Forma[] {
  return loja.nova?.formas ?? ["DELIVERY", "PICKUP"];
}

function formasDePagamento(
  loja: LojaDemo,
): readonly PedidoDemo["pagamento"][] {
  const formas = loja.pagamento["formas"];
  return Array.isArray(formas) && formas.length > 0
    ? (formas as PedidoDemo["pagamento"][])
    : ["PIX"];
}

/** Itens previsíveis: de 1 a 3 produtos publicados da loja. */
function itensDo(loja: LojaDemo, chave: string): readonly ItemDemo[] {
  const vendaveis = loja.produtos.filter((p) => p.rascunho !== true);
  const quantos = 1 + sorteio(`${chave}:quantos`, Math.min(3, vendaveis.length));
  const itens: ItemDemo[] = [];
  const usados = new Set<string>();
  for (let k = 0; itens.length < quantos && k < 12; k++) {
    const produto = vendaveis[sorteio(`${chave}:produto:${k}`, vendaveis.length)]!;
    if (usados.has(produto.chave)) continue;
    usados.add(produto.chave);
    itens.push([
      produto.chave,
      1 + sorteio(`${chave}:qtd:${k}`, loja.ehComida ? 3 : 2),
      sorteio(`${chave}:variante:${k}`, 8),
    ]);
  }
  return itens;
}

function entregaPara(loja: LojaDemo, status: StatusDemo, chave: string): Forma {
  const formas = formasDa(loja);
  if (formas.length === 1) return formas[0]!;
  if (status === "READY_FOR_PICKUP") return "PICKUP";
  if (status === "OUT_FOR_DELIVERY") return "DELIVERY";
  return sorteio(`${chave}:entrega`, 3) === 0 ? "PICKUP" : "DELIVERY";
}

/** A etapa só existe se a loja tem a forma de receber que ela pede. */
function statusPossivel(loja: LojaDemo, status: StatusDemo): StatusDemo {
  const formas = formasDa(loja);
  if (status === "OUT_FOR_DELIVERY" && !formas.includes("DELIVERY")) {
    return "READY_FOR_PICKUP";
  }
  if (status === "READY_FOR_PICKUP" && !formas.includes("PICKUP")) {
    return "OUT_FOR_DELIVERY";
  }
  return status;
}

const MOTIVOS_DE_CANCELAMENTO = [
  "Cliente desistiu do pedido.",
  "Produto em falta no estoque.",
  "Endereço fora da área de entrega.",
] as const;

function montarPedido(
  loja: LojaDemo,
  chave: string,
  { status, minutosAtras, clientes, cliente }: {
    readonly status: StatusDemo;
    readonly minutosAtras: number;
    readonly clientes: readonly ClienteDemo[];
    /** Sem ele, um dos clientes da lista. */
    readonly cliente?: string | undefined;
  },
): PedidoDemo {
  const real = statusPossivel(loja, status);
  const pagamentos = formasDePagamento(loja);
  return {
    status: real,
    minutosAtras,
    cliente:
      cliente ?? clientes[sorteio(`${chave}:cliente`, clientes.length)]!.chave,
    entrega: entregaPara(loja, real, chave),
    pagamento: pagamentos[sorteio(`${chave}:pagamento`, pagamentos.length)]!,
    itens: itensDo(loja, chave),
    ...(real === "CANCELLED"
      ? {
          observacao:
            MOTIVOS_DE_CANCELAMENTO[
              sorteio(`${chave}:motivo`, MOTIVOS_DE_CANCELAMENTO.length)
            ],
        }
      : {}),
  };
}

/** Pedidos dos últimos 29 dias (nunca de hoje). */
export function pedidosDoMes(loja: LojaDemo): readonly PedidoDoRoteiro[] {
  const clientes = clientesGerados(loja).filter(
    (c) => c.chave !== CHAVE_DA_CLIENTE_DE_TESTE,
  );
  const comAna = anaCompraNa(loja);
  return Array.from({ length: 16 }, (_v, i) => {
    const chave = `${loja.chave}:mes:${i}`;
    const dias = 1 + sorteio(`${chave}:dia`, 29);
    // Entre 11h e 21h do dia, contados de agora.
    const minutosAtras = dias * 1440 + sorteio(`${chave}:hora`, 600);
    const status: StatusDemo = i % 8 === 5 ? "CANCELLED" : "COMPLETED";
    const daAna = comAna && (i === 3 || i === 10);
    return {
      chave,
      pedido: montarPedido(loja, chave, {
        status,
        minutosAtras,
        clientes,
        cliente: daAna ? CHAVE_DA_CLIENTE_DE_TESTE : undefined,
      }),
    };
  });
}

/** Uma linha do quadro de hoje: a etapa e quão recente (fração do dia). */
const QUADRO_DE_HOJE: readonly (readonly [StatusDemo, number])[] = [
  ["PENDING", 0.03],
  ["PENDING", 0.08],
  ["ACCEPTED", 0.14],
  ["PREPARING", 0.2],
  ["READY_FOR_PICKUP", 0.26],
  ["OUT_FOR_DELIVERY", 0.32],
  ["COMPLETED", 0.5],
  ["COMPLETED", 0.68],
  ["CANCELLED", 0.6],
  ["COMPLETED", 0.85],
];

/**
 * O quadro de hoje. `minutosDesdeAMeiaNoite` é o relógio da loja: os pedidos
 * caem todos dentro do dia de hoje dela.
 *
 * `clientes` é a lista da loja (a escrita à mão ou a gerada).
 */
export function pedidosDeHoje(
  loja: LojaDemo,
  dia: string,
  minutosDesdeAMeiaNoite: number,
  clientes: readonly ClienteDemo[],
): readonly PedidoDoRoteiro[] {
  const daCidade = clientes.filter((c) => c.chave !== CHAVE_DA_CLIENTE_DE_TESTE);
  const anaHoje =
    clientes.some((c) => c.chave === CHAVE_DA_CLIENTE_DE_TESTE) &&
    sorteio(`ana-hoje:${loja.chave}`, 2) === 0;
  const janela = Math.max(minutosDesdeAMeiaNoite - 2, 1);
  return QUADRO_DE_HOJE.map(([status, fracao], i) => {
    const chave = `${loja.chave}:dia:${dia}:${i}`;
    return {
      chave,
      pedido: montarPedido(loja, chave, {
        status,
        minutosAtras: Math.max(1, Math.round(fracao * janela)),
        clientes: daCidade,
        // A Ana tem um pedido a caminho em algumas lojas.
        cliente:
          anaHoje && status === "OUT_FOR_DELIVERY"
            ? CHAVE_DA_CLIENTE_DE_TESTE
            : undefined,
      }),
    };
  });
}
