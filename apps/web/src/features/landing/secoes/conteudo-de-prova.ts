/**
 * Texto e números das seções de prova da landing.
 *
 * Regra do card #87: nenhum número sem fonte aberta e lida. Cada dado leva
 * nome, link e data da fonte; os mesmos registros estão em
 * `docs/landing-fontes.md`. Rappi e Uber Eats ficaram de fora porque não há
 * tabela pública de comissão confirmável. Se um valor mudar, troque aqui e lá.
 */
import {
  LIMITE_SEM_MENSALIDADE,
  LOJA_VIRTUAL,
  TABELA_DO_IFOOD,
  TAXA_DE_PAGAMENTO_ONLINE,
} from "../custo-do-aplicativo.ts";

const PCT = (fracao: number) =>
  `${(fracao * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

export interface FonteDeProva {
  readonly nome: string;
  /** Como a fonte aparece ao pé do cartão e do gráfico. */
  readonly curto: string;
  readonly url: string;
  /** Data da publicação ou da consulta, já escrita como o leitor lê. */
  readonly data: string;
}

export interface NumeroDeProva {
  readonly id: string;
  readonly numero: string;
  readonly rotulo: string;
  readonly detalhe: string;
  /** Índice (a partir de 1) em `FONTES_DA_PROVA`. */
  readonly fonte: number;
}

export const FONTES_DA_PROVA: readonly FonteDeProva[] = [
  {
    nome: "iFood — Portal do Parceiro, planos para restaurantes",
    curto: "iFood, Portal do Parceiro",
    url: "https://parceiros.ifood.com.br/restaurante",
    data: "consultado em 20/10/2026",
  },
  {
    nome: "Mercado&Consumo — pesquisa Abrasel com 2.176 donos de bares e restaurantes",
    curto: "Abrasel, via Mercado&Consumo",
    url: "https://mercadoeconsumo.com.br/16/03/2025/foodservice/whatsapp-representa-26-do-faturamento-com-delivery-em-bares-e-restaurantes/",
    data: "16/03/2025",
  },
  {
    nome: "Times Brasil (CNBC) — projeção da ABComm para o e-commerce",
    curto: "Times Brasil (CNBC)",
    url: "https://timesbrasil.com.br/empresas-e-negocios/tecnologia-e-inovacao/e-commerce-no-brasil-passa-de-r-200-bilhoes-e-vira-mainstream-com-ia-whatsapp-e-mobile/",
    data: "26/02/2026",
  },
  {
    nome: "Nuvemshop — planos e preços (plano Essencial, pagamento mensal)",
    curto: "Nuvemshop, planos e preços",
    url: "https://www.nuvemshop.com.br/planos-e-precos",
    data: "consultado em 20/10/2026",
  },
];

export const NUMEROS_DE_MERCADO: readonly NumeroDeProva[] = [
  {
    id: "comissao",
    numero: "12% a 23%",
    rotulo: "de comissão por pedido no iFood",
    detalhe:
      "12% no Plano Básico, 23% no Plano Entrega. Ainda há 3,2% sobre pedidos pagos pelo app.",
    fonte: 1,
  },
  {
    id: "mensalidade",
    numero: "R$\u00a0110 a 150",
    rotulo: "de mensalidade no iFood",
    detalhe: "Cobrada quando o faturamento passa de R$\u00a01.800 no mês, conforme o plano.",
    fonte: 1,
  },
  {
    id: "whatsapp",
    numero: "26%",
    rotulo: "do faturamento do delivery vem do WhatsApp",
    detalhe:
      "É o segundo canal de venda de bares e restaurantes, atrás dos marketplaces.",
    fonte: 2,
  },
  {
    id: "celular",
    numero: "79%",
    rotulo: "das compras online acontecem no celular",
    detalhe:
      "O e-commerce brasileiro deve passar de R$\u00a0258 bilhões em 2026, segundo a ABComm.",
    fonte: 3,
  },
];

/** Fontes das taxas dos gráficos: iFood e Nuvemshop (índices em FONTES_DA_PROVA). */
export const FONTES_DAS_TAXAS: readonly number[] = [1, 4];

export const RESSALVA_DAS_TAXAS =
  "Valores das plataformas podem variar por plano, região, meio de pagamento e promoção. A conta supõe todos os pedidos pagos pela plataforma. No SimpleClick não há comissão, mas o seu banco ou a sua maquininha podem cobrar tarifa pelo recebimento.";

/**
 * Como os números da seção de mercado foram feitos, na gaveta "Fontes e
 * metodologia". As taxas citadas saem das tabelas de custo-do-aplicativo.ts.
 */
export const METODOLOGIA_DOS_DADOS: readonly string[] = [
  `Taxas das páginas oficiais: iFood Plano Básico ${PCT(TABELA_DO_IFOOD.basico.comissao)} e Plano Entrega ${PCT(TABELA_DO_IFOOD.entrega.comissao)} por pedido, mais ${PCT(TAXA_DE_PAGAMENTO_ONLINE)} sobre pedidos pagos pelo app, e mensalidade de R$\u00a0${TABELA_DO_IFOOD.basico.mensalidade} ou R$\u00a0${TABELA_DO_IFOOD.entrega.mensalidade} acima de R$\u00a0${LIMITE_SEM_MENSALIDADE.toLocaleString("pt-BR")} vendidos no mês; ${LOJA_VIRTUAL.nome}, R$\u00a0${LOJA_VIRTUAL.mensalidade} por mês e ${PCT(LOJA_VIRTUAL.processamento)} de processamento.`,
  "O simulador multiplica os pedidos do mês pelo ticket médio e aplica a tabela de cada opção, mensalidade incluída, supondo todos os pedidos pagos pela plataforma e todo o faturamento vindo do delivery.",
  RESSALVA_DAS_TAXAS,
];

export interface CanalDeVenda {
  readonly id: string;
  readonly nome: string;
  /** Parte do faturamento do delivery, em pontos percentuais. */
  readonly parte: number;
}

/**
 * De onde vem o faturamento do delivery de bares e restaurantes (pesquisa
 * Abrasel, fonte 2). As quatro partes somam 100.
 */
export const CANAIS_DO_DELIVERY = {
  fonte: 2,
  canais: [
    { id: "apps", nome: "Apps de delivery (marketplaces)", parte: 54 },
    { id: "whatsapp", nome: "WhatsApp", parte: 26 },
    { id: "proprio", nome: "App ou site próprio", parte: 12 },
    { id: "telefone", nome: "Telefone", parte: 8 },
  ] as readonly CanalDeVenda[],
} as const;

/** Compras online feitas no celular, de cada 100 (fonte 3). */
export const COMPRAS_NO_CELULAR = { parte: 79, fonte: 3 } as const;

export interface Depoimento {
  readonly fala: string;
  readonly nome: string;
  readonly negocio: string;
  readonly cidade?: string | undefined;
  /** Exemplo ilustrativo (true) ou fala de cliente real (false). */
  readonly ilustrativo: boolean;
  /** Um pedaço da fala (igual, letra por letra) que ganha o marca-texto. */
  readonly destaque?: string | undefined;
  /** O ícone do ramo, no lugar das iniciais. */
  readonly ramo?: "pastelaria" | "roupa" | "hamburgueria" | undefined;
}

/**
 * O cabeçalho das seções de baixo (secoes/TelaDaLanding.tsx): pílula, título
 * com destaque, apoio e o botão. Mesma forma do `TextoDaTela` de conteudo.ts.
 */
export const TEXTO_DOS_DEPOIMENTOS = {
  sobrancelha: "Como lojistas usam",
  titulo: [
    "Quem já é seu cliente ",
    { destaque: "pede pelo seu link", efeito: "sublinhado", cor: "ambar" },
    ".",
  ],
  apoio: [
    "Três situações para as quais o SimpleClick foi feito: ",
    { destaque: "menos papel, menos pergunta repetida e zero comissão" },
    " com quem já compra de você.",
  ],
  chamada: "Quero vender pelo meu link",
  /** O aviso discreto quando há exemplo na lista. */
  aviso: "Exemplos ilustrativos, não relatos de clientes reais. O SimpleClick está em fase beta.",
} as const;

/** Enquanto não houver clientes reais, só exemplos, e a seção diz isso. */
export const DEPOIMENTOS_DE_EXEMPLO: readonly Depoimento[] = [
  {
    fala: "Continuo no app para quem não me conhece. Quem já é cliente eu chamo para o meu link, sem comissão.",
    nome: "Lojista",
    negocio: "Hamburgueria delivery",
    ilustrativo: true,
    destaque: "eu chamo para o meu link, sem comissão",
    ramo: "hamburgueria",
  },
  {
    fala: "Eu anotava pedido em papel de pão. Agora o cliente monta o pedido sozinho e eu só confirmo.",
    nome: "Lojista",
    negocio: "Pastelaria de bairro",
    ilustrativo: true,
    destaque: "o cliente monta o pedido sozinho",
    ramo: "pastelaria",
  },
  {
    fala: "Mando o link no status do WhatsApp. Quem pede já vê tamanho, cor e preço, e eu respondo menos a mesma pergunta.",
    nome: "Lojista",
    negocio: "Loja de roupa infantil",
    ilustrativo: true,
    destaque: "eu respondo menos a mesma pergunta",
    ramo: "roupa",
  },
];

export interface PerguntaFrequente {
  readonly pergunta: string;
  readonly resposta: string;
}

export const TEXTO_DAS_PERGUNTAS = {
  sobrancelha: "Perguntas frequentes",
  titulo: ["O que ", { destaque: "quase todo mundo", efeito: "marcador" }, " pergunta"],
  apoio: ["Não achou a sua? ", { destaque: "A gente responde por e-mail" }, ", com gente de verdade do outro lado."],
  chamada: "Falar com a gente",
} as const;

export const PERGUNTAS_FREQUENTES: readonly PerguntaFrequente[] = [
  {
    pergunta: "É grátis mesmo?",
    resposta:
      "É. Sem plano pago, sem comissão e sem limite de pedidos. O produto ainda está sendo construído: quem entra agora ajuda a decidir o que vem.",
  },
  {
    pergunta: "Como o cliente faz o pedido?",
    resposta:
      "Ele abre o link da sua loja no navegador, escolhe os produtos e finaliza. Não precisa baixar aplicativo. Você acompanha tudo no painel.",
  },
  {
    pergunta: "Quem recebe o dinheiro?",
    resposta:
      "Você. O pagamento é combinado direto com o cliente, como você configurar: Pix, dinheiro ou cartão na entrega. O SimpleClick não passa o dinheiro por ele e não fica com parte.",
  },
  {
    pergunta: "Funciona com o WhatsApp?",
    resposta:
      "Funciona como canal de divulgação: você manda o link da loja no WhatsApp, no status e na bio do Instagram. Na ficha do cliente, o contato dele fica a um toque.",
  },
  {
    pergunta: "E a entrega?",
    resposta:
      "É sua. Você define como o cliente recebe e o que cobra. O SimpleClick não tem entregadores.",
  },
  {
    pergunta: "Posso continuar no iFood?",
    resposta:
      "Pode. O app traz quem ainda não te conhece; o seu link atende quem já é seu cliente, sem comissão.",
  },
  {
    pergunta: "Minha loja entra no ar na hora?",
    resposta:
      "Não. Toda loja nova passa por uma aprovação do SimpleClick antes de ficar pública. Até lá, você já pode montar o catálogo.",
  },
  {
    pergunta: "E os dados dos meus clientes?",
    resposta:
      "Os clientes são seus. O SimpleClick trata os dados conforme a LGPD, e você encontra os detalhes na Política de Privacidade.",
  },
];

export interface GarantiaDeConfianca {
  /** O número grande do cartão. */
  readonly numero: string;
  readonly titulo: string;
  readonly texto: string;
  readonly icone: "comissao" | "mensalidade" | "pedidos";
}

/**
 * "Grátis. Sem comissão. Sem mensalidade.": a seção de impacto (#preco). Cada
 * frase do título acende numa cor (limão, âmbar, prata).
 */
export const FAIXA_DE_CONFIANCA = {
  sobrancelha: "Preço",
  titulo: "Grátis. Sem comissão. Sem mensalidade.",
  frases: [
    { texto: "Grátis.", cor: "limao" },
    { texto: "Sem comissão.", cor: "ambar" },
    { texto: "Sem mensalidade.", cor: "prata" },
  ] as readonly { readonly texto: string; readonly cor: "limao" | "ambar" | "prata" }[],
  texto: "Crie a loja, receba pedidos e fique com o valor inteiro de cada venda.",
  chamada: "Criar minha loja grátis",
  garantias: [
    {
      numero: "0%",
      titulo: "O valor da venda é seu",
      texto: "Sem comissão do SimpleClick sobre pedido.",
      icone: "comissao",
    },
    {
      numero: "R$ 0",
      titulo: "Sem plano pago",
      texto: "Sem mensalidade: tudo o que existe já vem liberado.",
      icone: "mensalidade",
    },
    {
      numero: "∞",
      titulo: "Sem limite de pedidos",
      texto: "Venda quanto quiser, e os clientes ficam na sua ficha.",
      icone: "pedidos",
    },
  ] as readonly GarantiaDeConfianca[],
  /** Os detalhes em pílula, embaixo do botão. */
  selos: ["Pagamento direto com você", "Clientes na sua ficha", "Sem app para baixar"] as readonly string[],
} as const;
