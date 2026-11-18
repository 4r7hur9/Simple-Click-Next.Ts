/**
 * O vocabulário da página de um produto, e o cálculo que ela usa.
 *
 * MORA EM `lib` PELO MESMO MOTIVO DE `catalogo.ts`: é o único lugar que o
 * servidor do site e os componentes alcançam. E, desde a T-405, `lib` alcança
 * `packages/core` — o que faz deste arquivo a ponte entre a regra de preço e a
 * tela.
 *
 * POR QUE A REGRA É IMPORTADA, E NÃO REESCRITA. O AC-411 exige que o total mude
 * na hora enquanto a pessoa marca as opções, e que seja idêntico ao que o
 * servidor cobra. `calcularItem` é a MESMA função que a API chama; reescrevê-la
 * aqui atenderia a primeira metade e falharia a segunda no dia em que uma das
 * duas mudasse — e o jeito de descobrir seria um cliente reclamando.
 */
export { calcularItem } from "@simpleclick/core";
/**
 * Escreve centavos como dinheiro.
 *
 * Reexportado daqui, e não importado direto pelo componente, porque
 * `web-features` alcança `web-lib` e não `pkg-core`. É a mesma função que a API
 * usa — o valor na tela e o do cupom saem do mesmo lugar.
 */
export { emReais as escreverDinheiro } from "@simpleclick/core";
export type {
  EscolhaFeita,
  GrupoDeEscolha,
  ItemDeEscolha,
  Pendencia,
  TotalDoItem,
} from "@simpleclick/core";

import type { GrupoDeEscolha } from "@simpleclick/core";

import type { AtacadoNaVitrine } from "./atacado-na-vitrine.ts";

/** Uma imagem do produto, com o espaço dela já conhecido. */
export interface ImagemNaTela {
  readonly url: string;
  readonly texto: string | null;
  readonly largura: number | null;
  readonly altura: number | null;
}

/** Uma mídia da galeria: foto ou vídeo, na ordem do dono. */
export interface MidiaNaTela {
  readonly tipo: "imagem" | "video";
  readonly url: string;
  /** A capa (poster) do vídeo; nula em foto ou vídeo sem capa. */
  readonly capa: string | null;
  readonly texto: string | null;
  readonly largura: number | null;
  readonly altura: number | null;
  readonly duracaoSegundos: number | null;
}

/** Uma opção dentro de um grupo, como a tela a mostra. */
export interface OpcaoNaTela {
  readonly id: string;
  readonly nome: string;
  /** Já escrito: "+ R$ 3,00", "− R$ 2,00", ou nulo quando não altera o preço. */
  readonly acrescimo: string | null;
  readonly acrescimoCentavos: number;
  readonly marcadaPorPadrao: boolean;
  readonly disponivel: boolean;
}

/** Um grupo de escolha, como a tela o mostra. */
export interface GrupoNaTela {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string | null;
  readonly minimo: number;
  readonly maximo: number | null;
  readonly permiteRepetir: boolean;
  readonly eixoDeVariacao: boolean;
  /** `INGREDIENT`, `ADDON`, `VARIATION`, `FRACTION` ou `SPEC`. Opcional para quem monta à mão. */
  readonly tipo?: string | null | undefined;
  /** Derivada de `minimo >= 1`, como no banco e no contrato. */
  readonly obrigatorio: boolean;
  /** "Escolha 1", "Escolha até 3", "Opcional" — a regra em palavras. */
  readonly regra: string;
  readonly opcoes: readonly OpcaoNaTela[];
}

/** Uma variante: a unidade que de fato é vendida. */
export interface VariacaoNaTela {
  readonly id: string;
  readonly nome: string;
  readonly preco: string | null;
  readonly precoCentavos: number | null;
  /** O preço "de" desta variação, só quando é maior que o atual. */
  readonly precoAnterior?: string | null | undefined;
  readonly disponivel: boolean;
  readonly padrao: boolean;
  readonly valoresDosEixos: readonly {
    readonly grupoId: string;
    readonly opcaoId: string;
  }[];
  /** As faixas de atacado sobre o preço desta variante (card #56). */
  readonly atacado?: AtacadoNaVitrine | null | undefined;
}

/** Por que o produto não pode ser comprado agora (AC-413). */
export type MotivoNaTela = "ESGOTADO" | "FORA_DO_HORARIO" | "LOJA_FECHADA";

/** O produto inteiro, pronto para desenhar. */
export interface ProdutoNaTela {
  readonly id: string;
  readonly apelido: string;
  readonly nome: string;
  readonly chamada: string | null;
  readonly descricao: string | null;
  readonly imagens: readonly ImagemNaTela[];
  /**
   * Fotos e vídeos na ordem do dono. Ausente = a galeria usa `imagens`.
   * `imagens` continua existindo: alimenta a prévia e os dados estruturados.
   */
  readonly midias?: readonly MidiaNaTela[] | undefined;
  /** O que a loja cadastrou como especificação (T-10912); vazio = sem seção. */
  readonly especificacoes?:
    | readonly { readonly chave: string; readonly nome: string; readonly valor: string }[]
    | undefined;
  readonly preco: string | null;
  readonly precoCentavos: number | null;
  readonly precoAnterior: string | null;
  /**
   * As faixas de atacado sobre `precoCentavos` (card #56), já em preço pela
   * API: a página mostra a tabela. Nulo ou ausente = só varejo.
   */
  readonly atacado?: AtacadoNaVitrine | null | undefined;
  readonly grupos: readonly GrupoNaTela[];
  readonly variacoes: readonly VariacaoNaTela[];
  readonly disponivel: boolean;
  readonly motivoIndisponivel: MotivoNaTela | null;
  /** A frase que a página mostra no lugar do botão (AC-413). */
  readonly explicacaoDaIndisponibilidade: string | null;
  readonly aceitaObservacao: boolean;
  readonly linkDaSecao: string | null;
  readonly nomeDaSecao: string | null;
  readonly linkDoCatalogo: string;
}

/**
 * O convite a escolher, o mesmo no cartão e no detalhe (AC-10913).
 *
 * "Escolher tamanho" quando só a variação falta; "Escolher opções" nos demais
 * casos. Nunca um valor que muda sozinho.
 */
export function conviteAEscolher(
  rotuloDaVariacao: string,
  { soFaltaVariacao }: { readonly soFaltaVariacao: boolean },
): string {
  const rotulo = rotuloDaVariacao.trim().toLowerCase();
  return soFaltaVariacao && rotulo !== ""
    ? `Escolher ${rotulo}`
    : "Escolher opções";
}

/** As mídias da galeria: `midias` quando há, senão as fotos de `imagens`. */
export function midiasDaGaleria(
  produto: Pick<ProdutoNaTela, "midias" | "imagens">,
): readonly MidiaNaTela[] {
  if (produto.midias !== undefined && produto.midias.length > 0) {
    return produto.midias;
  }
  return produto.imagens.map((imagem) => ({
    tipo: "imagem" as const,
    url: imagem.url,
    capa: null,
    texto: imagem.texto,
    largura: imagem.largura,
    altura: imagem.altura,
    duracaoSegundos: null,
  }));
}

/** O identificador do elemento de um grupo, para a página rolar até ele. */
export function ancoraDoGrupo(grupoId: string): string {
  return `grupo-${grupoId}`;
}

/** O que a pessoa marcou em cada eixo de variação: grupo → opção. */
export type EscolhaDeEixo = Readonly<Record<string, string>>;

/**
 * Descobre qual variante corresponde às escolhas dos eixos.
 *
 * É O QUE LIGA "P + azul" À PEÇA QUE TEM ESTOQUE. A variante certa é a que
 * carrega EXATAMENTE aquele valor em cada eixo — e é por isso que a conferência
 * é feita eixo a eixo, e não comparando listas: uma variante pode ter valores
 * de eixos que a pessoa ainda não escolheu, e ela continua sendo candidata.
 *
 * Devolve `null` enquanto faltar eixo por escolher, ou quando a combinação não
 * existe — camiseta P só em preto, e a pessoa pediu P azul. Nulo é resposta, e
 * não erro: a tela mostra que aquela combinação não está à venda.
 */
export function resolverVariacao(
  variacoes: readonly VariacaoNaTela[],
  eixos: readonly GrupoNaTela[],
  escolha: EscolhaDeEixo,
): VariacaoNaTela | null {
  if (eixos.length === 0) return null;
  // Enquanto faltar eixo, não há variante — e não se deve "chutar" a primeira:
  // o preço mudaria sozinho quando a pessoa escolhesse o resto.
  if (eixos.some((eixo) => escolha[eixo.id] === undefined)) return null;

  return (
    variacoes.find((variacao) =>
      eixos.every((eixo) =>
        variacao.valoresDosEixos.some(
          (valor) =>
            valor.grupoId === eixo.id && valor.opcaoId === escolha[eixo.id],
        ),
      ),
    ) ?? null
  );
}

/**
 * As opções de um eixo que ainda levam a alguma variante à venda.
 *
 * SERVE PARA DESABILITAR o que não tem saída, em vez de deixar a pessoa montar
 * uma combinação e só então descobrir que ela não existe. A conferência olha as
 * OUTRAS escolhas já feitas: escolhido "azul", os tamanhos que aparecem são os
 * que existem em azul.
 */
export function opcoesComSaida(
  variacoes: readonly VariacaoNaTela[],
  eixos: readonly GrupoNaTela[],
  escolha: EscolhaDeEixo,
  eixoId: string,
): ReadonlySet<string> {
  const possiveis = new Set<string>();

  for (const variacao of variacoes) {
    if (!variacao.disponivel) continue;

    const combinaComOResto = eixos.every((eixo) => {
      if (eixo.id === eixoId) return true;
      const marcada = escolha[eixo.id];
      if (marcada === undefined) return true;
      return variacao.valoresDosEixos.some(
        (valor) => valor.grupoId === eixo.id && valor.opcaoId === marcada,
      );
    });
    if (!combinaComOResto) continue;

    for (const valor of variacao.valoresDosEixos) {
      if (valor.grupoId === eixoId) possiveis.add(valor.opcaoId);
    }
  }

  return possiveis;
}

/**
 * Traduz um grupo da TELA para o vocabulário da REGRA.
 *
 * Os dois nomes existem de propósito, e a tradução é o preço de mantê-los. A
 * tela fala de `id` e `opcoes` porque é assim que o contrato e o resto do site
 * falam; `packages/core` fala de `grupoId` e `itens` porque ele não conhece
 * tela nenhuma — é uma regra pura, e amarrá-la ao vocabulário da vitrine a
 * faria mudar de nome no dia em que o painel do dono precisasse dela.
 *
 * A alternativa seria a tela adotar os nomes do core, e aí seria o contrato que
 * pareceria errado. Uma função de dez linhas é mais barata que qualquer um dos
 * dois desalinhamentos.
 */
export function comoGrupoDaRegra(grupo: GrupoNaTela): GrupoDeEscolha {
  return {
    grupoId: grupo.id,
    nome: grupo.nome,
    minimo: grupo.minimo,
    maximo: grupo.maximo,
    permiteRepetir: grupo.permiteRepetir,
    itens: grupo.opcoes.map((opcao) => ({
      itemId: opcao.id,
      nome: opcao.nome,
      acrescimoEmCentavos: opcao.acrescimoCentavos,
      disponivel: opcao.disponivel,
    })),
  };
}
