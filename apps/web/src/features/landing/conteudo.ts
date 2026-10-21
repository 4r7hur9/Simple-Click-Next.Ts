/**
 * O texto e os dados da landing, num lugar só.
 *
 * Os números de mercado e os depoimentos de exemplo agora moram nas seções de
 * prova (secoes/, card #87); aqui ficam os links, os recursos e a comparação.
 *
 * DOIS COMPROMISSOS valem para tudo aqui:
 *
 * 1. Número de mercado só entra com FONTE CITADA e verificável — veículo, ano e
 *    endereço. Nada de "estudos mostram". Quem decide abrir uma loja vai
 *    desconfiar de número sem dono, e com razão.
 * 2. Depoimento inventado é marcado como EXEMPLO na própria página. Ainda não
 *    temos falas de clientes reais para publicar; quando tivermos, elas
 *    substituem estas e o selo sai.
 */

/** Para onde vai quem decidiu começar: o cadastro de dono (card #28). */
export const LINK_PARA_COMECAR = "/cadastrar?tipo=dono";
export const LINK_PARA_ENTRAR = "/entrar";

/**
 * OS TEXTOS DAS CENAS (cenas/Cenas.tsx). Cada cena diz UMA coisa: uma frase de
 * impacto (o título) e uma linha de apoio que mostra o benefício. Os trechos
 * entre `{ destaque }` acendem na cor da cena; no apoio, viram negrito.
 *
 * O acento é a cor da cena: verde-limão é a base da marca; âmbar é o aviso do
 * pedido chegando; brasa é a comida; aço é a autopeça. Ele pinta os destaques,
 * a luz atrás do aparelho e o indicador de cenas.
 */
export type AcentoDaCena = "limao" | "ambar" | "brasa" | "aco";

/** Como o destaque acende: cor que varre a palavra, traço desenhado ou marca-texto. */
export type EfeitoDoDestaque = "acende" | "sublinhado" | "marcador";

export type Trecho = string | { readonly destaque: string; readonly efeito?: EfeitoDoDestaque };

export interface TextoDaCena {
  /** O nome curto da cena, na etiqueta numerada. */
  readonly etiqueta: string;
  readonly acento: AcentoDaCena;
  readonly titulo: readonly Trecho[];
  readonly apoio: readonly Trecho[];
  /** Detalhes curtos com check, embaixo do apoio. */
  readonly beneficios?: readonly string[];
}

export const HEROI = {
  selo: ["Grátis", { destaque: "0% de comissão" }],
  /** Uma linha por frase; a última é a promessa. */
  linhas: ["Seu cardápio.", "Seu link.", { destaque: "Seu lucro.", efeito: "sublinhado" }],
  apoio: [
    "Monte a loja em minutos, mande o link no WhatsApp e ",
    { destaque: "fique com 100% de cada venda" },
    ".",
  ],
  garantias: ["Sem mensalidade", "Sem cartão de crédito", "Sem app para baixar"],
} as const satisfies {
  readonly selo: readonly Trecho[];
  readonly linhas: readonly Trecho[];
  readonly apoio: readonly Trecho[];
  readonly garantias: readonly string[];
};

export const TEXTOS_DAS_CENAS = {
  vitrine: {
    etiqueta: "Vitrine",
    acento: "limao",
    titulo: ["Tirou a foto, ", { destaque: "já está à venda" }, "."],
    apoio: [
      "Ponha nome e preço: o produto entra na sua vitrine, com a sua cor e ",
      { destaque: "um link pronto para o WhatsApp" },
      ".",
    ],
    beneficios: ["Com a sua cor", "Link próprio", "Preço muda na hora"],
  },
  pedido: {
    etiqueta: "Pedido",
    acento: "limao",
    titulo: ["O cliente pede em ", { destaque: "três toques", efeito: "sublinhado" }, "."],
    apoio: [
      "Escolhe, põe na sacola e confirma. ",
      { destaque: "Sem baixar aplicativo" },
      " e sem pedido perdido no meio da conversa.",
    ],
  },
  painel: {
    etiqueta: "Painel",
    acento: "ambar",
    titulo: ["Pedido novo ", { destaque: "apita" }, " no seu balcão."],
    apoio: [
      "Chega na hora no quadro de pedidos, ",
      { destaque: "com aviso sonoro" },
      ", e você leva de etapa em etapa até a entrega.",
    ],
  },
  resumo: {
    etiqueta: "Resumo",
    acento: "limao",
    titulo: ["O dia inteiro numa ", { destaque: "tela só", efeito: "marcador" }, "."],
    apoio: [
      "Vendas, ticket médio e pedidos por etapa, ",
      { destaque: "comparados com a semana passada" },
      ". Sem planilha no fim do expediente.",
    ],
    beneficios: ["Vendas do dia", "Ticket médio", "Pedidos por etapa"],
  },
  ramoComida: {
    etiqueta: "Comida",
    acento: "brasa",
    titulo: ["Do ", { destaque: "hambúrguer" }, "…"],
    apoio: [
      "Lanchonete, pizzaria, açaí ou marmita: ",
      { destaque: "o cardápio já nasce com opções" },
      ".",
    ],
    beneficios: ["Ponto da carne", "Adicionais pagos", "Combos"],
  },
  ramoPecas: {
    etiqueta: "Qualquer ramo",
    acento: "aco",
    titulo: ["…à ", { destaque: "autopeça" }, "."],
    apoio: [
      "Autopeça, moda ou mercado: catálogo com marca, referência e estoque. ",
      { destaque: "Mesma loja, mesmo painel" },
      ".",
    ],
    beneficios: ["Marca e referência", "Estoque", "Preço de atacado"],
  },
} as const satisfies Record<string, TextoDaCena>;

/** O caminho do pedido no painel (cena do painel). */
export const ETAPAS_DO_PAINEL = ["Confirmado", "Em preparo", "Saiu para entrega"] as const;

export interface Fonte {
  readonly veiculo: string;
  readonly data: string;
  readonly url: string;
}

// --- AS SEÇÕES DEPOIS DA NARRATIVA (secoes/, card #96) ---------------------------

/**
 * A cor de um destaque nas seções de baixo: verde-limão (a marca), âmbar (o
 * aviso, o dinheiro que vai embora) e prata (o branco que brilha).
 */
export type CorDoDestaque = "limao" | "ambar" | "prata";

/** Como `Trecho`, com a cor do destaque (sem cor, vale a da seção). */
export type TrechoDaTela =
  | string
  | { readonly destaque: string; readonly efeito?: EfeitoDoDestaque; readonly cor?: CorDoDestaque };

/** O cabeçalho de uma seção: pílula, título com destaque e apoio. */
export interface TextoDaTela {
  readonly sobrancelha: string;
  readonly titulo: readonly TrechoDaTela[];
  /** No apoio, o destaque vira negrito. */
  readonly apoio: readonly TrechoDaTela[];
  /** O botão da seção. */
  readonly chamada: string;
}

export const TEXTO_DA_COMPARACAO = {
  sobrancelha: "Lado a lado",
  titulo: ["Quatro jeitos de vender, ", { destaque: "na mesma régua", efeito: "sublinhado" }, "."],
  apoio: [
    "O app traz cliente novo e a loja virtual vende para o país. O SimpleClick atende ",
    { destaque: "quem já te conhece, sem comissão" },
    ".",
  ],
  chamada: "Quero meu link sem comissão",
} as const satisfies TextoDaTela;

export const TEXTO_DOS_RECURSOS = {
  sobrancelha: "O que vem junto",
  titulo: ["Tudo ", { destaque: "incluído", efeito: "marcador" }, ". Nada atrás de plano pago."],
  apoio: [
    "Não existe versão completa escondida atrás de assinatura: ",
    { destaque: "o que está aqui é o que você usa" },
    ".",
  ],
  chamada: "Criar minha loja grátis",
} as const satisfies TextoDaTela;

export interface Recurso {
  readonly icone:
    | "pedidos"
    | "metricas"
    | "catalogo"
    | "loja"
    | "equipe"
    | "lojas"
    | "manual"
    | "impressao"
    | "explorar";
  readonly titulo: string;
  readonly texto: string;
}

/** O primeiro é o carro-chefe: ocupa o bloco grande do mosaico. */
export const RECURSOS: readonly Recurso[] = [
  {
    icone: "pedidos",
    titulo: "Quadro de pedidos",
    texto: "Seis etapas, do recebido ao entregue, com aviso sonoro.",
  },
  {
    icone: "metricas",
    titulo: "Métricas do dia",
    texto: "Vendas, ticket médio e clientes, comparados com o período anterior.",
  },
  {
    icone: "catalogo",
    titulo: "Catálogo completo",
    texto: "Categorias, variações, fotos e rascunho antes de publicar.",
  },
  {
    icone: "loja",
    titulo: "Loja com a sua cara",
    texto: "Cor de destaque, capa e foto de topo que você escolhe.",
  },
  {
    icone: "equipe",
    titulo: "Equipe com permissão",
    texto: "Contas para quem trabalha com você, cada uma no seu papel.",
  },
  {
    icone: "lojas",
    titulo: "Mais de uma loja",
    texto: "Troque de loja pelo menu, com a mesma conta.",
  },
  {
    icone: "manual",
    titulo: "Pedido manual",
    texto: "Lance o pedido de quem ligou ou chegou no balcão.",
  },
  {
    icone: "impressao",
    titulo: "Cupom para a cozinha",
    texto: "Imprima o pedido direto do painel.",
  },
  {
    icone: "explorar",
    titulo: "Vitrine para clientes novos",
    texto: "Seus produtos podem aparecer no Explorar do SimpleClick.",
  },
];

/**
 * Como a célula se sai para quem vende: atende, atende em parte, não atende
 * ou sem dado público. É o ícone da célula (check, meio, x, traço); o texto
 * ao lado diz o fato.
 */
export type SeloDaComparacao = "sim" | "parcial" | "nao" | "sem-dado";

export interface CelulaDaComparacao {
  readonly texto: string;
  readonly selo: SeloDaComparacao;
}

export interface LinhaDaComparacao {
  readonly criterio: string;
  readonly simpleclick: CelulaDaComparacao;
  readonly ifood: CelulaDaComparacao;
  readonly ze: CelulaDaComparacao;
  readonly nuvemshop: CelulaDaComparacao;
}

export const EMPRESAS_DA_COMPARACAO = [
  { chave: "simpleclick", nome: "SimpleClick", tipo: "Seu link de vendas" },
  { chave: "ifood", nome: "iFood", tipo: "App de delivery" },
  { chave: "ze", nome: "Zé Delivery", tipo: "App de bebidas" },
  { chave: "nuvemshop", nome: "Nuvemshop", tipo: "Loja virtual" },
] as const;

/**
 * SÓ FATO COM FONTE, e a fonte vai ao pé da seção. Quando o valor varia, a
 * célula diz "a partir de" ou "varia por plano"; quando não há fonte pública,
 * diz "não informado". O Zé Delivery não publica tabela para parceiros: o que
 * está aqui saiu da FAQ oficial de parceiros, lida pelo trecho indexado (a
 * página não abriu na consulta), e a nota diz isso.
 */
export const COMPARACAO: readonly LinhaDaComparacao[] = [
  {
    criterio: "Taxa sobre a venda",
    simpleclick: { texto: "0%, sem comissão", selo: "sim" },
    ifood: { texto: "12% a 23% + 3,2% no pagamento online", selo: "nao" },
    ze: { texto: "Preço e margem definidos pelo Zé", selo: "nao" },
    nuvemshop: { texto: "0% com Nuvem Pago; 0,7% a 2% com outros meios", selo: "parcial" },
  },
  {
    criterio: "Mensalidade",
    simpleclick: { texto: "R$ 0, sem plano pago", selo: "sim" },
    ifood: { texto: "R$ 110 a R$ 150 acima de R$ 1.800/mês", selo: "nao" },
    ze: { texto: "Não informado", selo: "sem-dado" },
    nuvemshop: { texto: "Grátis no Começo; pagos a partir de R$ 69/mês", selo: "parcial" },
  },
  {
    criterio: "Quem fala com o cliente",
    simpleclick: { texto: "Você, direto, com nome e telefone na ficha", selo: "sim" },
    ifood: { texto: "O app intermedia (chat ou telefone anonimizado)", selo: "nao" },
    ze: { texto: "O app escolhe o parceiro mais próximo", selo: "nao" },
    nuvemshop: { texto: "A loja, com a base de clientes exportável", selo: "sim" },
  },
  {
    criterio: "Personalização da loja",
    simpleclick: { texto: "Cor de destaque, capa, foto de topo e logo", selo: "sim" },
    ifood: { texto: "Logo, capa e descrição no perfil do app", selo: "parcial" },
    ze: { texto: "Compra feita dentro do app do Zé", selo: "nao" },
    nuvemshop: { texto: "1 layout no Começo; +70 nos planos pagos", selo: "parcial" },
  },
  {
    criterio: "Endereço e identidade",
    simpleclick: { texto: "Link próprio da sua loja no SimpleClick", selo: "sim" },
    ifood: { texto: "Perfil dentro do app iFood", selo: "nao" },
    ze: { texto: "Dentro do app do Zé", selo: "nao" },
    nuvemshop: { texto: "Domínio próprio fora do plano grátis", selo: "parcial" },
  },
  {
    criterio: "Controle do cardápio e preços",
    simpleclick: { texto: "Você edita produtos e preços", selo: "sim" },
    ifood: { texto: "O lojista edita itens e preços", selo: "sim" },
    ze: { texto: "Preços feitos pela plataforma; Ambev só o Zé altera", selo: "nao" },
    nuvemshop: { texto: "O lojista edita o catálogo", selo: "sim" },
  },
];

/** A nota que acompanha as fontes da comparação (na gaveta). */
export const NOTA_DA_COMPARACAO = [
  "Valores das páginas oficiais de cada empresa, nas datas ao lado de cada fonte. Podem mudar; “varia por plano” quando a empresa tem mais de um.",
  "O Zé Delivery não publica tabela para parceiros: as linhas dele vêm da FAQ oficial de parceiros, lida pelo trecho indexado na busca (a página não abriu na consulta). Mensalidade e taxa do Zé não foram encontradas em fonte pública.",
  "O ícone de cada célula resume o fato para quem vende: atende, atende em parte, não atende ou sem dado público.",
] as const;

export const FONTES_DA_COMPARACAO: readonly Fonte[] = [
  {
    veiculo: "iFood — planos para restaurantes",
    data: "16/10/2026",
    url: "https://parceiros.ifood.com.br/restaurante",
  },
  {
    veiculo: "iFood — política de privacidade do parceiro (4.2)",
    data: "17/10/2026",
    url: "https://parceiros.ifood.com.br/restaurante/privacidade",
  },
  {
    veiculo: "iFood — perfil da loja",
    data: "17/10/2026",
    url: "https://blog-parceiros.ifood.com.br/perfil-ifood/",
  },
  {
    veiculo: "iFood — cardápio no app do parceiro",
    data: "17/10/2026",
    url: "https://blog-parceiros.ifood.com.br/cardapio-app-do-parceiro/",
  },
  {
    veiculo: "Zé Delivery — FAQ do parceiro, “Contrato Zé Delivery” (trecho indexado)",
    data: "17/10/2026",
    url: "https://faq-parceiro.ze.delivery/support/solutions/articles/60000686408",
  },
  {
    veiculo: "Zé Delivery — site oficial",
    data: "17/10/2026",
    url: "https://www.ze.delivery/",
  },
  {
    veiculo: "Nuvemshop — planos e preços",
    data: "17/10/2026",
    url: "https://www.nuvemshop.com.br/planos-e-precos",
  },
  {
    veiculo: "Nuvemshop — domínio próprio",
    data: "17/10/2026",
    url: "https://atendimento.nuvemshop.com.br/pt_BR/12321-dominio-nuvem/posso-utilizar-um-dominio-proprio-sem-o-final-lojavirtualnuvem",
  },
  {
    veiculo: "Nuvemshop — exportar lista de clientes",
    data: "17/10/2026",
    url: "https://atendimento.nuvemshop.com.br/pt_BR/clientes/como-exportar-minha-lista-de-clientes-na-nuvemshop",
  },
];
