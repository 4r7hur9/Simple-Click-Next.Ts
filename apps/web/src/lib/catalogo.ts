/**
 * O vocabulário do catálogo na tela.
 *
 * MORA EM `lib` POR CAUSA DA TABELA DE FRONTEIRAS. Quem MONTA estes valores é
 * `src/server/catalogo-na-tela.ts`, que pode alcançar `packages/core` e por
 * isso é quem escreve preço; quem os DESENHA é `src/features/vitrine/`, que
 * não pode alcançar o servidor. As duas camadas alcançam `web-lib`, e é por
 * isso que a forma é declarada aqui uma vez só.
 *
 * A alternativa seria cada lado declarar a sua cópia, como a apresentação da
 * loja faz — o que funciona enquanto as duas forem iguais e falha em silêncio
 * no dia em que uma ganhar um campo. Aqui um campo novo aparece nos dois lados
 * ou não compila.
 */

/** Um produto, como o cartão da vitrine o mostra. */
export interface ProdutoNaTela {
  readonly id: string;
  readonly apelido: string;
  readonly nome: string;
  readonly chamada: string | null;
  /** Já escrito como dinheiro. Nulo quando o preço depende de variação. */
  readonly preco: string | null;
  /**
   * O mesmo preço em centavos inteiros, para quem NÃO LÊ (AC-403).
   *
   * Conviver com `preco` não desfaz o P-006: a tela continua sem fazer conta —
   * ela recebe o escrito e o mostra. Este campo existe para os dados
   * estruturados, e buscador não lê "R$ 7,50": ele quer o número e a moeda em
   * campos separados, e descarta a oferta inteira quando recebe texto.
   */
  readonly precoCentavos: number | null;
  /** O preço "de", quando há promoção. */
  readonly precoAnterior: string | null;
  readonly imagem: string | null;
  readonly disponivel: boolean;
  /**
   * Por que não está comprável agora (AC-321, AC-322); ausente ou nulo quando
   * está. É o que faz o selo dizer "esgotado" ou "fora do horário".
   */
  readonly motivoIndisponivel?: MotivoDoCartao | null | undefined;
  /**
   * O atacado já escrito (card #56): "Atacado a partir de 10 un.: R$ 9,50",
   * ao lado do varejo. Nulo ou ausente = só varejo, e o cartão fica como era.
   */
  readonly atacado?: string | null | undefined;
  /** Para onde o cartão leva. */
  readonly link: string;
}

/** Os motivos que o cartão sabe escrever. */
export type MotivoDoCartao = "ESGOTADO" | "FORA_DO_HORARIO";

/** Uma seção da vitrine, na ordem que o dono definiu. */
export interface SecaoNaTela {
  readonly id: string;
  readonly apelido: string;
  readonly nome: string;
  readonly produtos: readonly ProdutoNaTela[];
  /**
   * Quantos produtos a seção tem com os filtros em vigor (card #74). Pode ser
   * maior que `produtos.length`: a tela traz a primeira página e carrega o
   * resto sob demanda. Ausente = `produtos.length`.
   */
  readonly total?: number | undefined;
  /** Como continuar a lista; nulo ou ausente quando ela já está inteira. */
  readonly mais?: MaisProdutosNaTela | null | undefined;
}

/**
 * O recorte de uma lista do catálogo: tudo que decide quais produtos entram e
 * em que ordem. Viaja até a ação de servidor que traz a página seguinte, por
 * isso é só dado simples.
 */
export interface RecorteDaLista {
  readonly categoria: string | null;
  readonly busca: string | null;
  readonly filtros: readonly string[];
  readonly atacado: boolean;
  readonly ordem: OrdemDoCatalogo;
  /** Só o que não está esgotado (card #108). Ausente vale falso. */
  readonly estoque?: boolean | undefined;
  /** Faixa de preço em CENTAVOS, inclusive. Ausente ou nulo é "sem limite". */
  readonly precoMin?: number | null | undefined;
  readonly precoMax?: number | null | undefined;
}

/** A continuação de uma lista (card #74). */
export interface MaisProdutosNaTela {
  /** O cursor da página seguinte, como a API o devolveu. */
  readonly cursor: string;
  readonly recorte: RecorteDaLista;
  /**
   * Para onde o "Ver mais" leva sem JavaScript: a categoria inteira (numa
   * seção do cardápio) ou a página seguinte da lista (`?cursor=`).
   */
  readonly link: string;
}

/** Uma página carregada pelo "Ver mais", já pronta para desenhar. */
export interface PaginaNaTela {
  readonly produtos: readonly ProdutoNaTela[];
  readonly proximoCursor: string | null;
}

/** O nome do parâmetro do cursor no endereço (o "Ver mais" sem script). */
export const PARAMETRO_DO_CURSOR = "cursor";

/** Uma aba do filtro de categoria. */
export interface AbaDeCategoria {
  readonly nome: string;
  readonly link: string;
  /** A aba escolhida agora. É ela que recebe `aria-current` na tela. */
  readonly emVigor: boolean;
  /**
   * Quantos produtos a categoria tem (com busca e filtros valendo). "Todas" não
   * leva número: um produto em duas seções seria contado duas vezes.
   */
  readonly total?: number | undefined;
}

/**
 * Como a lista é ordenada. "relevancia" é a ordem que o dono definiu, com os
 * destaques no topo — e é o padrão, que não aparece no endereço.
 */
export type OrdemDoCatalogo =
  | "relevancia"
  | "menor-preco"
  | "maior-preco"
  | "a-z"
  | "maior-desconto-atacado"
  | "lancamentos";

/** Uma opção do "Ordenar", já com o link que a aplica. */
export interface OpcaoDeOrdem {
  readonly valor: OrdemDoCatalogo;
  readonly nome: string;
  readonly link: string;
  readonly emVigor: boolean;
}

/**
 * O chip "Atacado" (card #59): liga e desliga o filtro de produtos com preço
 * de atacado, sem perder categoria, busca, ordem e especificações.
 */
export interface FiltroDeAtacadoNaTela {
  /** Quantos produtos do resultado (sem o próprio filtro) têm atacado. */
  readonly produtos: number;
  /** O menor pedido mínimo de atacado entre eles. */
  readonly menorPedidoMinimo: number | null;
  readonly ligado: boolean;
  /** O link que inverte o filtro. */
  readonly link: string;
}

/** Um filtro ligado, como chip: o rótulo e o endereço SEM ele (AC-10815). */
export interface FiltroAtivoNaTela {
  /** O que o cliente lê: "Tamanho: M". */
  readonly rotulo: string;
  /** O mesmo catálogo sem este filtro; categoria, busca, ordem e os outros ficam. */
  readonly link: string;
}

/**
 * O que o cliente lê em cada valor de filtro. O valor que vai no endereço não
 * muda — só a leitura: "true" é como o banco escreve, "Sim" é como a gente fala.
 */
export function rotuloDoValor(valor: string): string {
  if (valor === "true") return "Sim";
  if (valor === "false") return "Não";
  return valor;
}

/** O catálogo inteiro, pronto para desenhar. */
export interface CatalogoNaTela {
  readonly filtros?: readonly {
    chave: string;
    nome: string;
    valores: readonly string[];
  }[];
  /** Já filtradas: quando há categoria escolhida, vem só ela. */
  readonly secoes: readonly SecaoNaTela[];
  readonly destaques: readonly ProdutoNaTela[];
  readonly abas: readonly AbaDeCategoria[];
  /** O nome da categoria escolhida, para a tela dizer qual filtro está valendo. */
  readonly filtroEmVigor: string | null;
  /** Para onde vai quem quer ver todas as categorias, sem desfazer a busca. */
  readonly linkDeTodas: string;
  /** O que foi buscado, para o campo abrir preenchido e a mensagem repetir. */
  readonly termoBuscado: string | null;
  /** Buscou e a loja não tem — que é diferente de a loja não ter nada. */
  readonly buscaSemAcerto: boolean;
  /** Para onde vai quem quer LIMPAR A BUSCA e ver tudo de novo (AC-409). */
  readonly linkSemBusca: string;
  /** A loja não publicou produto nenhum — que é diferente de filtro sem acerto. */
  readonly lojaSemCatalogo: boolean;
  /** A categoria pedida no endereço não existe nesta loja. */
  readonly filtroSemAcerto: boolean;
  /**
   * Há filtro de especificação ligado e nenhum produto o atende (AC-10824).
   * É diferente de loja sem catálogo e de categoria que não existe: a tela
   * mantém a barra e oferece "Limpar filtros". Ausente vale falso.
   */
  readonly filtroSemAcertoNaLista?: boolean | undefined;
  /** O mesmo catálogo sem nenhum filtro: categoria, busca, ordem e atacado ficam. */
  readonly linkSemFiltros?: string | undefined;
  /** A ordem em vigor. Fora de "relevancia", as seções viram uma lista só. */
  readonly ordem: OrdemDoCatalogo;
  /** As opções do "Ordenar", cada uma com o link que mantém filtro e busca. */
  readonly ordens: readonly OpcaoDeOrdem[];
  /** O chip "Atacado" (card #59). */
  readonly atacado: FiltroDeAtacadoNaTela;
  /** O filtro de atacado está ligado e nenhum produto o atende. */
  readonly atacadoSemAcerto: boolean;
  /**
   * Os filtros de especificação ligados, um chip cada (AC-10815). Ausente
   * vale lista vazia: quem monta o catálogo à mão (TV, provas) não os usa.
   */
  readonly filtrosAtivos?: readonly FiltroAtivoNaTela[] | undefined;
  /**
   * Quantos itens a lista tem com os filtros em vigor. Na página única é o
   * total dela; nas seções, a soma das seções (um produto em duas seções conta
   * em cada uma).
   */
  readonly totalEncontrado?: number | undefined;
}

/** O nome do parâmetro no endereço. É o que a pessoa lê na barra do navegador. */
export const PARAMETRO_DA_CATEGORIA = "categoria";

/** O nome do parâmetro da busca. Mesma razão: ele fica visível e se compartilha. */
export const PARAMETRO_DA_BUSCA = "busca";

/** O nome do parâmetro da ordem. Ausente vale "relevancia". */
export const PARAMETRO_DA_ORDEM = "ordem";

/** `?atacado=1`: só produtos com preço de atacado (card #59). */
export const PARAMETRO_DO_ATACADO = "atacado";

/** Lê o filtro de atacado do endereço: `1` ou `true` liga; o resto, não. */
export function lerAtacado(valor: string | null | undefined): boolean {
  return valor === "1" || valor === "true";
}

/** As ordens, na sequência em que o "Ordenar" as oferece. */
export const ORDENS_DO_CATALOGO: readonly {
  readonly valor: OrdemDoCatalogo;
  readonly nome: string;
}[] = [
  { valor: "relevancia", nome: "Destaques primeiro" },
  { valor: "menor-preco", nome: "Menor preço" },
  { valor: "maior-preco", nome: "Maior preço" },
  { valor: "a-z", nome: "Nome, de A a Z" },
  { valor: "maior-desconto-atacado", nome: "Maior desconto no atacado" },
  { valor: "lancamentos", nome: "Lançamentos" },
];

/** As ordens que só a API nova entende (card #108). */
export const ORDENS_NOVAS: readonly OrdemDoCatalogo[] = [
  "maior-desconto-atacado",
  "lancamentos",
];

/** Os parâmetros do endereço dos filtros novos. O preço vai em REAIS. */
export const PARAMETRO_DO_ESTOQUE = "estoque";
export const PARAMETRO_DO_PRECO_DE = "preco-de";
export const PARAMETRO_DO_PRECO_ATE = "preco-ate";

/** O maior preço aceito no filtro: R$ 1.000.000,00, em centavos (igual ao contrato). */
export const TETO_DO_PRECO_EM_CENTAVOS = 100_000_000;

/** O filtro "em estoque" está ligado no endereço. */
export function lerEstoque(valor: string | null | undefined): boolean {
  return valor === "1" || valor === "true";
}

/**
 * Lê um preço escrito em REAIS ("10", "10,50", "10.50") e devolve CENTAVOS
 * inteiros. Qualquer outra coisa (vazio, negativo, "abc", "1e9", NaN) é
 * ignorada: nulo. Acima do teto, vale o teto.
 */
export function lerPrecoEmReais(valor: string | null | undefined): number | null {
  const texto = (valor ?? "").trim();
  if (!/^\d{1,9}(?:[.,]\d{1,2})?$/.test(texto)) return null;
  const reais = Number(texto.replace(",", "."));
  if (!Number.isFinite(reais)) return null;
  return Math.min(Math.round(reais * 100), TETO_DO_PRECO_EM_CENTAVOS);
}

/** Centavos como o endereço e o campo os escrevem: "10.5", ou "10" sem centavos. */
export function precoParaEndereco(centavos: number): string {
  return String(centavos / 100);
}

/** Centavos como o cliente lê: "R$ 10,50". */
export function precoParaLeitura(centavos: number): string {
  return `R$ ${(centavos / 100).toFixed(2).replace(".", ",")}`;
}

/** A API recusa mais de 20 filtros e filtro com mais de 120 caracteres. */
export const MAXIMO_DE_FILTROS = 20;
export const MAXIMO_DE_CARACTERES_DO_FILTRO = 120;

/** Os filtros do endereço, sem repetidos e dentro do que a API aceita. */
export function limitarFiltros(filtros: readonly string[]): string[] {
  return [...new Set(filtros)]
    .filter((filtro) => filtro.length <= MAXIMO_DE_CARACTERES_DO_FILTRO)
    .slice(0, MAXIMO_DE_FILTROS);
}

/** Lê a ordem do endereço. Valor desconhecido vale a padrão, sem erro. */
export function lerOrdem(valor: string | null | undefined): OrdemDoCatalogo {
  return (
    ORDENS_DO_CATALOGO.find((ordem) => ordem.valor === valor)?.valor ??
    "relevancia"
  );
}

/** O rótulo da aba que desfaz o filtro. */
export const ROTULO_DE_TODAS = "Todas";
