/**
 * O total de UM item do carrinho, com as escolhas que a pessoa fez
 * (AC-411, AC-412).
 *
 * POR QUE ESTA REGRA MORA AQUI, E NÃO NA TELA. O AC-411 exige duas coisas ao
 * mesmo tempo: que o total mude na hora enquanto a pessoa marca as opções, e
 * que o valor conferido no servidor ao adicionar seja o MESMO. Duas contas
 * escritas em dois lugares atendem a primeira e falham a segunda no dia em que
 * uma delas mudar — e o jeito de descobrir seria um cliente reclamando de um
 * total diferente do que viu.
 *
 * Então a conta é uma só, PURA, e os dois lados a chamam: a tela para mostrar,
 * a API para cobrar. É o que o P-006 protege — uma implementação, e não a
 * proibição de usá-la.
 *
 * O PREÇO BASE NUNCA VEM DO NAVEGADOR. Quem chama passa o preço que LEU do
 * catálogo; na API isso é o banco, na tela é o que o servidor mandou naquela
 * página. Aceitar um preço enviado pelo cliente é o que permite fechar um
 * pedido de mil reais por um, e foi o erro da primeira versão deste produto.
 */

/** Uma opção dentro de um grupo de escolha. */
export interface ItemDeEscolha {
  readonly itemId: string;
  readonly nome: string;
  /** Acréscimo em centavos. Negativo quando remover algo dá desconto. */
  readonly acrescimoEmCentavos: number;
  readonly disponivel: boolean;
}

/** Um grupo de escolha do produto: sabores, adicionais, tamanho. */
export interface GrupoDeEscolha {
  readonly grupoId: string;
  readonly nome: string;
  /** Quantas escolhas o grupo EXIGE. Obrigatório é `minimo >= 1`. */
  readonly minimo: number;
  /** Teto de escolhas. Nulo é sem teto. */
  readonly maximo: number | null;
  /** Se a mesma opção pode ser marcada mais de uma vez (dois bacons). */
  readonly permiteRepetir: boolean;
  readonly itens: readonly ItemDeEscolha[];
}

/** O que a pessoa marcou. */
export interface EscolhaFeita {
  readonly grupoId: string;
  readonly itemId: string;
  /** Quantas vezes. Sempre 1 quando o grupo não permite repetir. */
  readonly quantidade: number;
}

export interface PedidoDeItem {
  /** O preço da variante escolhida, lido do catálogo. */
  readonly precoBaseEmCentavos: number;
  readonly quantidade: number;
  readonly grupos: readonly GrupoDeEscolha[];
  readonly escolhas: readonly EscolhaFeita[];
}

export type MotivoDePendencia =
  | "FALTA_ESCOLHER"
  | "ESCOLHEU_DEMAIS"
  | "ITEM_INDISPONIVEL"
  | "REPETICAO_NAO_PERMITIDA"
  | "ITEM_DESCONHECIDO";

/**
 * O que impede o item de ser adicionado.
 *
 * Carrega o NOME do grupo e uma frase pronta, e não só um código: o AC-412 pede
 * que a página role até o grupo pendente e diga o que falta, e para isso ela
 * precisa do identificador (para achar o elemento) e da frase (para exibir).
 */
export interface Pendencia {
  readonly grupoId: string;
  readonly nome: string;
  readonly motivo: MotivoDePendencia;
  readonly explicacao: string;
}

export interface TotalDoItem {
  /** Preço de uma unidade, já com os acréscimos das escolhas. */
  readonly unitarioEmCentavos: number;
  readonly acrescimosEmCentavos: number;
  /** O que vai no botão: unitário × quantidade. */
  readonly totalEmCentavos: number;
  readonly pendencias: readonly Pendencia[];
  readonly podeAdicionar: boolean;
}

function plural(quantos: number, singular: string, plural_: string): string {
  return quantos === 1 ? singular : plural_;
}

/**
 * Confere um grupo contra o que foi marcado nele.
 *
 * Devolve as pendências do grupo — nunca lança. Quem chama isto é uma tela que
 * recalcula a cada clique, e exceção como fluxo normal transformaria cada
 * caixinha marcada num bloco `try`.
 */
function conferirGrupo(
  grupo: GrupoDeEscolha,
  escolhasDoGrupo: readonly EscolhaFeita[],
): Pendencia[] {
  const pendencias: Pendencia[] = [];
  const marcadas = escolhasDoGrupo.reduce(
    (soma, escolha) => soma + Math.max(0, escolha.quantidade),
    0,
  );

  if (marcadas < grupo.minimo) {
    const faltam = grupo.minimo - marcadas;
    pendencias.push({
      grupoId: grupo.grupoId,
      nome: grupo.nome,
      motivo: "FALTA_ESCOLHER",
      explicacao: `Escolha ${faltam === grupo.minimo ? "" : "mais "}${faltam} ${plural(faltam, "opção", "opções")} em ${grupo.nome}.`,
    });
  }

  if (grupo.maximo !== null && marcadas > grupo.maximo) {
    pendencias.push({
      grupoId: grupo.grupoId,
      nome: grupo.nome,
      motivo: "ESCOLHEU_DEMAIS",
      explicacao: `Em ${grupo.nome} dá para escolher no máximo ${grupo.maximo} ${plural(grupo.maximo, "opção", "opções")}.`,
    });
  }

  for (const escolha of escolhasDoGrupo) {
    const item = grupo.itens.find((i) => i.itemId === escolha.itemId);

    if (item === undefined) {
      // Opção que não é do grupo. Acontece com página aberta havia horas,
      // depois de o dono mexer no cardápio — e aconteceria também com alguém
      // montando o pedido à mão, que é o motivo de a API conferir o mesmo.
      pendencias.push({
        grupoId: grupo.grupoId,
        nome: grupo.nome,
        motivo: "ITEM_DESCONHECIDO",
        explicacao: `Uma das opções de ${grupo.nome} não existe mais.`,
      });
      continue;
    }

    if (!item.disponivel) {
      pendencias.push({
        grupoId: grupo.grupoId,
        nome: grupo.nome,
        motivo: "ITEM_INDISPONIVEL",
        explicacao: `${item.nome} acabou.`,
      });
    }

    if (!grupo.permiteRepetir && escolha.quantidade > 1) {
      pendencias.push({
        grupoId: grupo.grupoId,
        nome: grupo.nome,
        motivo: "REPETICAO_NAO_PERMITIDA",
        explicacao: `${item.nome} só pode ser escolhido uma vez.`,
      });
    }
  }

  return pendencias;
}

/**
 * Calcula o total de um item e diz o que ainda falta para poder adicioná-lo.
 *
 * A ORDEM DAS PENDÊNCIAS É A ORDEM DOS GRUPOS, e isso não é detalhe: o AC-412
 * manda rolar até o grupo pendente, e rolar até o PRIMEIRO da página é o
 * comportamento que a pessoa espera. Ordenar por gravidade faria a tela pular
 * para o fim do formulário.
 */
export function calcularItem(pedido: PedidoDeItem): TotalDoItem {
  const quantidade = Math.max(1, Math.trunc(pedido.quantidade));

  const pendencias: Pendencia[] = [];
  let acrescimos = 0;

  for (const grupo of pedido.grupos) {
    const doGrupo = pedido.escolhas.filter((e) => e.grupoId === grupo.grupoId);
    pendencias.push(...conferirGrupo(grupo, doGrupo));

    for (const escolha of doGrupo) {
      const item = grupo.itens.find((i) => i.itemId === escolha.itemId);
      if (item === undefined) continue;
      acrescimos += item.acrescimoEmCentavos * Math.max(0, escolha.quantidade);
    }
  }

  // Escolha em grupo que não é do produto não entra na conta E vira pendência:
  // ignorá-la calada deixaria o total da tela bater com o do servidor por
  // acidente, escondendo um pedido malformado até o cupom sair errado.
  for (const escolha of pedido.escolhas) {
    const conhecido = pedido.grupos.some((g) => g.grupoId === escolha.grupoId);
    if (!conhecido) {
      pendencias.push({
        grupoId: escolha.grupoId,
        nome: "escolha desconhecida",
        motivo: "ITEM_DESCONHECIDO",
        explicacao: "Uma das escolhas não pertence a este produto.",
      });
    }
  }

  // O unitário não desce de zero. Desconto por remover ingrediente é real, mas
  // um catálogo mal cadastrado poderia somar descontos até o produto pagar o
  // cliente para levá-lo. Zero é o piso; o dono vê o preço estranho e corrige.
  const unitario = Math.max(0, pedido.precoBaseEmCentavos + acrescimos);

  return {
    unitarioEmCentavos: unitario,
    acrescimosEmCentavos: acrescimos,
    totalEmCentavos: unitario * quantidade,
    pendencias,
    podeAdicionar: pendencias.length === 0,
  };
}
