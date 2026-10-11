/**
 * Gerador dos blocos do cupom impresso — uma fonte, duas saídas (AC-619,
 * AC-620, AC-621). Função PURA, como o gerador do texto do WhatsApp
 * (`cupom-texto.ts`), e com os mesmos tipos de pedido: o que o dono lê na
 * conversa e o que a cozinha lê no papel saem da mesma descrição do pedido.
 *
 * Porta de entrada: o contrato mora em `cupom-contrato.ts`, a diagramação em
 * `cupom-diagramacao.ts` e a leitura em `cupom-validacao.ts`; daqui eles são
 * reexportados para os imports antigos continuarem.
 */

import {
  blocosDoEndereco,
  blocosDoItem,
  blocosDoPagamento,
  marcaDeReimpressao,
  ordinal,
  presente,
  titulo,
} from "./cupom-blocos-partes.ts";
import {
  CONTEUDO_PADRAO_DO_CUPOM,
  ErroDoCupom,
  VERSAO_DO_CUPOM,
  type BlocoDoCupom,
  type CanalDoPedido,
  type CupomImpresso,
  type OpcoesDoCupom,
  type PedidoParaCupom,
} from "./cupom-contrato.ts";
import { colunasDoPapel, ehLarguraDoPapel } from "./cupom-largura.ts";
import { normalizarWhatsApp } from "./telefone.ts";

export * from "./cupom-contrato.ts";
export { diagramarCupom } from "./cupom-diagramacao.ts";
export { lerCupomImpresso } from "./cupom-validacao.ts";

// ── Formatação ──────────────────────────────────────────────────────────────

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

const NOME_DO_CANAL: Readonly<Record<CanalDoPedido, string>> = {
  ONLINE: "Site",
  MANUAL: "Balcão",
};

// ── Montagem ────────────────────────────────────────────────────────────────

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
