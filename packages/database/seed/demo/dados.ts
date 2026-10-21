/**
 * O que a demonstração planta em cada loja: apresentação, categorias,
 * especificações, produtos, clientes e o roteiro dos pedidos.
 *
 * É DADO, não regra: quem transforma isto em linhas é `demo/index.ts`. Mexer
 * num preço ou acrescentar um produto é editar este arquivo e rodar
 * `pnpm --filter @simpleclick/database demo` de novo.
 *
 * Todo valor monetário é inteiro em centavos (P-005).
 */

import type { Ilustracao } from "./imagens.ts";

// ---------------------------------------------------------------------------
// Formas
// ---------------------------------------------------------------------------

export interface EspecificacaoDemo {
  readonly chave: string;
  readonly rotulo: string;
  readonly tipo: "TEXT" | "NUMBER" | "BOOLEAN" | "ENUM";
  readonly unidade?: string;
  readonly opcoes?: readonly string[];
  readonly filtravel?: boolean;
}

export interface CategoriaDemo {
  readonly chave: string;
  readonly nome: string;
  readonly descricao: string;
  /** Categoria que o seed original já criou: só é referenciada, nunca reescrita. */
  readonly existente?: boolean;
  readonly especificacoes: readonly EspecificacaoDemo[];
}

export interface OpcaoDemo {
  readonly chave: string;
  readonly nome: string;
  readonly acrescimo?: number;
  readonly marcada?: boolean;
  readonly indisponivel?: boolean;
}

export interface GrupoDemo {
  readonly chave: string;
  readonly nome: string;
  readonly descricao?: string;
  readonly kind: "INGREDIENT" | "ADDON" | "VARIATION";
  readonly minimo: number;
  readonly maximo: number | null;
  readonly opcoes: readonly OpcaoDemo[];
}

/** Opção de um eixo de variação: vira uma parte do nome da variante. */
export interface OpcaoDeEixoDemo {
  readonly chave: string;
  readonly nome: string;
  /** Cor da peça nas fotos daquela opção (eixo de cor). */
  readonly cor?: string;
  /** Preço próprio da opção (ex.: tamanho de 500 ml). */
  readonly preco?: number;
}

export interface EixoDemo {
  readonly chave: string;
  readonly nome: string;
  readonly opcoes: readonly OpcaoDeEixoDemo[];
}

export interface FotoDemo {
  readonly selo: string;
  readonly cor?: string;
  readonly fundo?: string;
}

export interface ProdutoDemo {
  readonly chave: string;
  readonly nome: string;
  readonly categoria: string;
  readonly resumo: string;
  readonly descricao: string;
  readonly preco: number;
  /** Preço promocional vigente: a vitrine mostra o base riscado. */
  readonly promo?: number;
  readonly custo: number;
  readonly destaque?: boolean;
  readonly preparo?: number;
  readonly rascunho?: boolean;
  readonly ilustracao: Ilustracao;
  readonly cor: string;
  readonly fundo: string;
  /** Fotos extras além da principal (até 2). Com eixo de cor, uma por cor. */
  readonly fotos?: readonly FotoDemo[];
  readonly especificacoes: Readonly<Record<string, string | number | boolean>>;
  readonly grupos?: readonly GrupoDemo[];
  /** Eixos de grade (tamanho, cor): cada combinação vira uma variante. */
  readonly eixos?: readonly EixoDemo[];
  /** Estoque da variante (loja que controla estoque). Padrão: 8. */
  readonly estoque?: (combinacao: readonly string[]) => number;
  /**
   * Publicar no feed do SimpleClick. Sem valor: destaque e promoção vão, e
   * dois de cada três dos demais também (card #50).
   */
  readonly feed?: boolean;
  /** Ganha um vídeo curto na galeria (gerado pela carga, card #50). */
  readonly video?: boolean;
}

/** Story de 24 horas da loja (card #46): foto ou vídeo vertical. */
export interface StoryDemo {
  readonly chave: string;
  readonly tipo: "IMAGEM" | "VIDEO";
  /** O produto cuja ilustração vira o story. */
  readonly produto: string;
  /** Até 200 caracteres. */
  readonly legenda: string;
  /** Há quantas horas foi postado (0 a 20): vence 24 h depois disso. */
  readonly horasAtras: number;
  /** Caminho do próprio site, ex.: "/loja/apelido/cardapio". */
  readonly link?: string;
}

/** Quem é a loja nova, que o seed original não criou (card #50). */
export interface LojaNovaDemo {
  readonly apelido: string;
  readonly nome: string;
  /** `vertical_presets.code`. */
  readonly ramo: string;
  readonly dono: { readonly nome: string; readonly email: string };
  /** Formas de receber. Padrão: entrega e retirada. */
  readonly formas?: readonly ("DELIVERY" | "PICKUP")[];
}

export interface ClienteDemo {
  readonly chave: string;
  readonly nome: string;
  readonly telefone: string;
  readonly email: string | null;
  readonly endereco: {
    readonly logradouro: string;
    readonly numero: string;
    readonly complemento: string | null;
    readonly bairro: string;
  };
  readonly observacao?: string;
}

export type StatusDemo =
  | "PENDING"
  | "ACCEPTED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "OUT_FOR_DELIVERY"
  | "COMPLETED"
  | "CANCELLED"
  | "REJECTED";

/** [produto, quantidade, índice da variante, opções extras escolhidas]. */
export type ItemDemo =
  | readonly [string, number]
  | readonly [string, number, number]
  | readonly [string, number, number, readonly string[]];

export interface PedidoDemo {
  readonly status: StatusDemo;
  /** Há quantos minutos o pedido foi feito, contando da primeira carga. */
  readonly minutosAtras: number;
  readonly cliente: string;
  readonly entrega: "DELIVERY" | "PICKUP";
  readonly pagamento: "PIX" | "CASH" | "CARD_ON_DELIVERY";
  /** [produto, quantidade, índice da variante, opções extras escolhidas]. */
  readonly itens: readonly ItemDemo[];
  readonly observacao?: string;
}

export interface LojaDemo {
  /**
   * A chave da loja — é dela que sai o id. "pastelaria" e "moda" são as do
   * seed original; as demais são lojas novas e trazem `nova`.
   */
  readonly chave: string;
  /** Só a loja que a demonstração cria (as do seed original não têm). */
  readonly nova?: LojaNovaDemo;
  /** Onde fica, para o feed ordenar por distância (Fortaleza/CE). */
  readonly coordenadas: { readonly lat: number; readonly lng: number };
  /** Cor de destaque do tema (`#rrggbb`). Padrão: a primária. */
  readonly destaque?: string;
  /** Capa própria desenhada. Sem ela, a loja mostra a capa padrão do tipo. */
  readonly capa?: boolean;
  /** Dias da semana fechados (0 = domingo). Padrão: abre todo dia. */
  readonly diasFechados?: readonly number[];
  readonly stories?: readonly StoryDemo[];
  readonly pasta: string;
  readonly ehComida: boolean;
  readonly iniciais: string;
  readonly chamada: string;
  readonly primaria: string;
  readonly secundaria: string;
  readonly boasVindas: string;
  readonly sobre: string;
  readonly whatsapp: string;
  readonly telefone: string;
  readonly email: string;
  readonly endereco: {
    readonly rua: string;
    readonly numero: string;
    readonly bairro: string;
    readonly cidade: string;
    readonly uf: string;
    readonly cep: string;
  };
  readonly entrega: Readonly<Record<string, unknown>>;
  readonly pagamento: Readonly<Record<string, unknown>>;
  readonly checkout: Readonly<Record<string, unknown>>;
  /** Faixas de horário, iguais nos 7 dias da semana. */
  readonly horarios: readonly (readonly [string, string])[];
  readonly categorias: readonly CategoriaDemo[];
  readonly produtos: readonly ProdutoDemo[];
  /** Sem lista, a carga usa clientes de Fortaleza e gera os pedidos. */
  readonly clientes?: readonly ClienteDemo[];
  readonly pedidos?: readonly PedidoDemo[];
}

// ---------------------------------------------------------------------------
// Grupos reaproveitados
// ---------------------------------------------------------------------------

const ADICIONAIS: GrupoDemo = {
  chave: "adicionais",
  nome: "Adicionais",
  descricao: "Turbine o seu pastel.",
  kind: "ADDON",
  minimo: 0,
  maximo: 4,
  opcoes: [
    { chave: "catupiry", nome: "Catupiry", acrescimo: 300 },
    { chave: "cheddar", nome: "Cheddar", acrescimo: 300 },
    { chave: "bacon", nome: "Bacon", acrescimo: 400 },
    { chave: "ovo", nome: "Ovo", acrescimo: 200 },
    { chave: "milho", nome: "Milho", acrescimo: 150 },
  ],
};

function ingredientes(...nomes: string[]): GrupoDemo {
  return {
    chave: "ingredientes",
    nome: "Ingredientes",
    descricao: "Desmarque o que você não quer.",
    kind: "INGREDIENT",
    minimo: 0,
    maximo: null,
    opcoes: nomes.map((nome) => ({
      chave: nome
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replaceAll(" ", "-"),
      nome,
      marcada: true,
    })),
  };
}

const MOLHOS: GrupoDemo = {
  chave: "molhos",
  nome: "Molhos",
  descricao: "Até 2 sachês por item.",
  kind: "ADDON",
  minimo: 0,
  maximo: 2,
  opcoes: [
    { chave: "vinagrete", nome: "Vinagrete" },
    { chave: "pimenta", nome: "Pimenta da casa" },
    { chave: "ketchup", nome: "Ketchup" },
    { chave: "maionese-verde", nome: "Maionese verde", acrescimo: 150 },
  ],
};

const P_M_G_GG = (sem?: string): readonly OpcaoDeEixoDemo[] =>
  [
    { chave: "p", nome: "P" },
    { chave: "m", nome: "M" },
    { chave: "g", nome: "G" },
    { chave: "gg", nome: "GG" },
  ].filter((opcao) => opcao.chave !== sem);

const NUMERACAO = (...numeros: number[]): readonly OpcaoDeEixoDemo[] =>
  numeros.map((n) => ({ chave: String(n), nome: String(n) }));

/** Estoque variado e previsível, com uma combinação esgotada. */
const estoqueVariado =
  (esgotada: string) =>
  (combinacao: readonly string[]): number => {
    if (combinacao.join("/") === esgotada) return 0;
    const semente = [...combinacao.join("")].reduce(
      (soma, letra) => soma + letra.charCodeAt(0),
      0,
    );
    return 3 + (semente % 14);
  };

// ---------------------------------------------------------------------------
// Pastelaria da Vila
// ---------------------------------------------------------------------------

const QUENTE = "#F4A261";
const VERMELHO = "#C0392B";
const VERDE = "#2A9D8F";
const ROXO = "#6D3B8E";
const AZUL = "#1D6FA3";
const MASSA = "#E9B95A";
const DOURADO = "#D98E2B";

export const PASTELARIA_DEMO: LojaDemo = {
  chave: "pastelaria",
  coordenadas: { lat: -3.7286, lng: -38.4936 },
  destaque: "#E63946",
  capa: true,
  stories: [
    {
      chave: "pastel-do-dia",
      tipo: "VIDEO",
      produto: "pastel-de-frango-catupiry",
      legenda: "Saindo agora: pastel de carne com massa fina 🔥",
      horasAtras: 2,
      link: "/loja/pastelaria-da-vila/cardapio",
    },
    {
      chave: "caldo-de-cana",
      tipo: "IMAGEM",
      produto: "pastel-de-calabresa",
      legenda: "Combo pastel + caldo de cana só hoje",
      horasAtras: 6,
    },
  ],
  pasta: "pastelaria-da-vila",
  ehComida: true,
  iniciais: "PV",
  chamada: "Pastel na hora, massa fina e recheio generoso",
  primaria: "#B3261E",
  secundaria: "#F6C453",
  boasVindas: "Pastel na hora, massa fina e recheio generoso.",
  sobre:
    "Desde 2009 na Vila Nova, a Pastelaria da Vila frita cada pastel na hora do pedido. Massa feita na casa, recheios preparados todo dia e caldo de cana moído na frente do cliente.",
  whatsapp: "+5585911110001",
  telefone: "+5585911110001",
  email: "contato@pastelariadavila.test",
  endereco: {
    rua: "Rua Ana Bilhar",
    numero: "1020",
    bairro: "Meireles",
    cidade: "Fortaleza",
    uf: "CE",
    cep: "60160110",
  },
  entrega: {
    nomeDaTaxa: "Taxa de entrega",
    prazoMinutos: 40,
    retiradaNoLocal: true,
    taxaPadraoCents: 600,
    gratisAcimaDeCents: 8000,
    minimoEntregaCents: 2000,
    minimoRetiradaCents: null,
  },
  pagamento: {
    pix: {
      tipo: "EMAIL",
      chave: "pix@pastelariadavila.test",
      titular: "Marina Souza",
    },
    formas: ["PIX", "CASH", "CARD_ON_DELIVERY"],
  },
  checkout: {
    pedirEmail: true,
    pedirDocumento: false,
    pedidoMinimoCents: 1500,
  },
  // 00:00 até 00:00 vale o dia inteiro: a loja de teste aceita pedido a
  // qualquer hora, para o teste à mão não depender do relógio.
  horarios: [["00:00", "00:00"]],
  categorias: [
    {
      chave: "pasteis",
      nome: "Pastéis",
      descricao: "Massa fina, fritos na hora.",
      existente: true,
      especificacoes: [
        {
          chave: "recheio",
          rotulo: "Recheio",
          tipo: "ENUM",
          opcoes: [
            "Carne",
            "Queijo",
            "Frango",
            "Palmito",
            "Pizza",
            "Calabresa",
            "Especial",
            "Vegano",
          ],
          filtravel: true,
        },
        {
          chave: "vegetariano",
          rotulo: "Vegetariano",
          tipo: "BOOLEAN",
          filtravel: true,
        },
      ],
    },
    {
      chave: "pasteis-doces",
      nome: "Pastéis Doces",
      descricao: "Para fechar com chave de ouro.",
      especificacoes: [
        {
          chave: "cobertura",
          rotulo: "Cobertura de açúcar e canela",
          tipo: "BOOLEAN",
          filtravel: true,
        },
      ],
    },
    {
      chave: "salgados",
      nome: "Salgados",
      descricao: "Coxinha, kibe e esfiha feitos aqui.",
      especificacoes: [
        {
          chave: "peso",
          rotulo: "Peso",
          tipo: "NUMBER",
          unidade: "g",
          filtravel: false,
        },
        {
          chave: "preparo",
          rotulo: "Preparo",
          tipo: "ENUM",
          opcoes: ["Frito", "Assado"],
          filtravel: true,
        },
      ],
    },
    {
      chave: "combos",
      nome: "Combos",
      descricao: "Pastel com bebida sai mais em conta.",
      especificacoes: [
        {
          chave: "serve",
          rotulo: "Serve",
          tipo: "NUMBER",
          unidade: "pessoas",
          filtravel: true,
        },
      ],
    },
    {
      chave: "bebidas",
      nome: "Bebidas",
      descricao: "Para acompanhar.",
      existente: true,
      especificacoes: [
        {
          chave: "volume",
          rotulo: "Volume",
          tipo: "NUMBER",
          unidade: "ml",
          filtravel: true,
        },
      ],
    },
    {
      chave: "sobremesas",
      nome: "Sobremesas",
      descricao: "Açaí e doces da casa.",
      especificacoes: [
        {
          chave: "sem-gluten",
          rotulo: "Sem glúten",
          tipo: "BOOLEAN",
          filtravel: true,
        },
      ],
    },
  ],
  produtos: [
    {
      chave: "pastel-de-frango-catupiry",
      nome: "Pastel de Frango com Catupiry",
      categoria: "pasteis",
      resumo: "Frango desfiado com o legítimo Catupiry.",
      descricao:
        "Frango desfiado e temperado com cebola, alho e cheiro-verde, coberto com Catupiry original. Massa fina e crocante, frita na hora.",
      preco: 1100,
      custo: 420,
      destaque: true,
      preparo: 12,
      ilustracao: "pastel",
      cor: MASSA,
      fundo: QUENTE,
      fotos: [{ selo: "Recheio caprichado", fundo: VERMELHO }],
      especificacoes: { recheio: "Frango", vegetariano: false },
      grupos: [
        ingredientes("Catupiry", "Cebola", "Cheiro-verde"),
        ADICIONAIS,
        MOLHOS,
      ],
    },
    {
      chave: "pastel-de-pizza",
      nome: "Pastel de Pizza",
      categoria: "pasteis",
      resumo: "Queijo, presunto, tomate e orégano.",
      descricao:
        "O sabor da pizza dentro do pastel: muçarela, presunto, rodelas de tomate e orégano.",
      preco: 1050,
      custo: 400,
      preparo: 12,
      ilustracao: "pastel",
      cor: MASSA,
      fundo: VERMELHO,
      especificacoes: { recheio: "Pizza", vegetariano: false },
      grupos: [
        ingredientes("Presunto", "Tomate", "Orégano"),
        ADICIONAIS,
        MOLHOS,
      ],
    },
    {
      chave: "pastel-de-calabresa",
      nome: "Pastel de Calabresa com Queijo",
      categoria: "pasteis",
      resumo: "Calabresa acebolada com muçarela.",
      descricao:
        "Calabresa moída e acebolada com muçarela derretida. Vai bem com a pimenta da casa.",
      preco: 1150,
      custo: 430,
      preparo: 12,
      ilustracao: "pastel",
      cor: MASSA,
      fundo: DOURADO,
      fotos: [{ selo: "Com pimenta da casa", fundo: VERMELHO }],
      especificacoes: { recheio: "Calabresa", vegetariano: false },
      grupos: [ingredientes("Cebola", "Muçarela"), ADICIONAIS, MOLHOS],
    },
    {
      chave: "pastel-especial-da-vila",
      nome: "Pastel Especial da Vila",
      categoria: "pasteis",
      resumo: "Carne, queijo, ovo e bacon. O gigante da casa.",
      descricao:
        "Pastel de 30 cm com carne moída, muçarela, ovo cozido, bacon crocante e azeitona. Dá para dividir — ou não.",
      preco: 1890,
      promo: 1590,
      custo: 690,
      destaque: true,
      preparo: 15,
      ilustracao: "pastel",
      cor: "#E3A03F",
      fundo: VERMELHO,
      fotos: [
        { selo: "30 cm", fundo: DOURADO },
        { selo: "Promoção da semana", fundo: VERDE },
      ],
      especificacoes: { recheio: "Especial", vegetariano: false },
      grupos: [
        ingredientes("Ovo", "Bacon", "Azeitona", "Cebola"),
        ADICIONAIS,
        MOLHOS,
      ],
    },
    {
      chave: "pastel-vegano-shimeji",
      nome: "Pastel Vegano de Shimeji",
      categoria: "pasteis",
      resumo: "Shimeji na manteiga de ervas, sem nada de origem animal.",
      descricao:
        "Shimeji salteado com alho-poró, tomate seco e ervas. Massa sem ovo e sem leite, frita em óleo separado.",
      preco: 1400,
      custo: 560,
      preparo: 14,
      ilustracao: "pastel",
      cor: "#D8B26A",
      fundo: VERDE,
      especificacoes: { recheio: "Vegano", vegetariano: true },
      grupos: [ingredientes("Alho-poró", "Tomate seco"), MOLHOS],
    },
    {
      chave: "pastel-doce",
      nome: "Pastel Doce",
      categoria: "pasteis-doces",
      resumo: "Escolha o sabor: chocolate, doce de leite e mais.",
      descricao:
        "Pastel doce polvilhado com açúcar e canela. Escolha o recheio na hora do pedido.",
      preco: 900,
      custo: 300,
      destaque: true,
      preparo: 10,
      ilustracao: "pastel-doce",
      cor: "#C98B4A",
      fundo: ROXO,
      fotos: [{ selo: "Açúcar e canela", fundo: QUENTE }],
      especificacoes: { cobertura: true },
      grupos: [
        {
          chave: "sabor",
          nome: "Sabor",
          descricao: "Escolha 1 sabor.",
          kind: "VARIATION",
          minimo: 1,
          maximo: 1,
          opcoes: [
            { chave: "chocolate", nome: "Chocolate", marcada: true },
            { chave: "doce-de-leite", nome: "Doce de leite" },
            { chave: "banana-canela", nome: "Banana com canela" },
            { chave: "romeu-julieta", nome: "Romeu e Julieta", acrescimo: 100 },
            { chave: "nutella", nome: "Creme de avelã", acrescimo: 300 },
          ],
        },
      ],
    },
    {
      chave: "coxinha-de-frango",
      nome: "Coxinha de Frango",
      categoria: "salgados",
      resumo: "Massa de batata e frango bem temperado.",
      descricao:
        "Coxinha grande, com massa de batata e recheio de frango desfiado. Empanada e frita na hora.",
      preco: 750,
      custo: 260,
      preparo: 8,
      ilustracao: "coxinha",
      cor: DOURADO,
      fundo: QUENTE,
      especificacoes: { peso: 130, preparo: "Frito" },
      grupos: [
        {
          chave: "adicionais",
          nome: "Adicionais",
          kind: "ADDON",
          minimo: 0,
          maximo: 1,
          opcoes: [{ chave: "catupiry", nome: "Com Catupiry", acrescimo: 200 }],
        },
        MOLHOS,
      ],
    },
    {
      chave: "kibe-com-queijo",
      nome: "Kibe com Queijo",
      categoria: "salgados",
      resumo: "Kibe frito recheado com muçarela.",
      descricao:
        "Carne moída com trigo para kibe, hortelã e recheio de muçarela que derrete na primeira mordida.",
      preco: 750,
      custo: 270,
      preparo: 8,
      ilustracao: "kibe",
      cor: "#9C5B2E",
      fundo: DOURADO,
      especificacoes: { peso: 120, preparo: "Frito" },
      grupos: [MOLHOS],
    },
    {
      chave: "esfiha-de-carne",
      nome: "Esfiha de Carne",
      categoria: "salgados",
      resumo: "Esfiha aberta, assada no forno.",
      descricao:
        "Esfiha aberta de carne temperada com tomate, cebola e limão. Assada, não frita.",
      preco: 650,
      custo: 220,
      preparo: 10,
      ilustracao: "esfiha",
      cor: "#E8C07A",
      fundo: VERMELHO,
      especificacoes: { peso: 110, preparo: "Assado" },
      grupos: [ingredientes("Cebola", "Tomate")],
    },
    {
      chave: "porcao-mini-salgados",
      nome: "Porção de Mini Salgados",
      categoria: "salgados",
      resumo: "20 mini salgados, até 3 sabores.",
      descricao:
        "Vinte mini salgados fritos na hora. Escolha até três sabores e a cozinha divide igual.",
      preco: 3500,
      custo: 1300,
      preparo: 20,
      ilustracao: "porcao",
      cor: DOURADO,
      fundo: VERDE,
      fotos: [{ selo: "20 unidades", fundo: QUENTE }],
      especificacoes: { peso: 600, preparo: "Frito" },
      grupos: [
        {
          chave: "sabores",
          nome: "Sabores",
          descricao: "Escolha de 1 a 3 sabores.",
          kind: "VARIATION",
          minimo: 1,
          maximo: 3,
          opcoes: [
            { chave: "coxinha", nome: "Coxinha" },
            { chave: "kibe", nome: "Kibe" },
            { chave: "bolinha-queijo", nome: "Bolinha de queijo" },
            { chave: "risole", nome: "Risole de presunto" },
            { chave: "enroladinho", nome: "Enroladinho de salsicha" },
          ],
        },
        MOLHOS,
      ],
    },
    {
      chave: "combo-vila",
      nome: "Combo Vila",
      categoria: "combos",
      resumo: "2 pastéis salgados + 1 refrigerante lata.",
      descricao:
        "Escolha dois pastéis salgados e uma bebida. Sai mais em conta do que pedir separado.",
      preco: 2790,
      custo: 1050,
      destaque: true,
      preparo: 15,
      ilustracao: "combo",
      cor: MASSA,
      fundo: VERMELHO,
      fotos: [{ selo: "Economize R$ 4", fundo: VERDE }],
      especificacoes: { serve: 1 },
      grupos: [
        {
          chave: "pasteis",
          nome: "Pastéis",
          descricao: "Escolha 2 sabores.",
          kind: "VARIATION",
          minimo: 2,
          maximo: 2,
          opcoes: [
            { chave: "carne", nome: "Carne" },
            { chave: "queijo", nome: "Queijo" },
            { chave: "frango", nome: "Frango com Catupiry" },
            { chave: "pizza", nome: "Pizza" },
            { chave: "calabresa", nome: "Calabresa" },
          ],
        },
        {
          chave: "bebida",
          nome: "Bebida",
          kind: "VARIATION",
          minimo: 1,
          maximo: 1,
          opcoes: [
            { chave: "cola", nome: "Refrigerante de cola", marcada: true },
            { chave: "guarana", nome: "Guaraná" },
            { chave: "laranja", nome: "Refrigerante de laranja" },
            { chave: "suco", nome: "Suco natural", acrescimo: 300 },
          ],
        },
      ],
    },
    {
      chave: "combo-familia",
      nome: "Combo Família",
      categoria: "combos",
      resumo: "6 pastéis + refrigerante 2 litros.",
      descricao:
        "Seis pastéis salgados à sua escolha (até 3 sabores) e um refrigerante de 2 litros.",
      preco: 7490,
      custo: 2900,
      preparo: 25,
      ilustracao: "combo",
      cor: "#E3A03F",
      fundo: DOURADO,
      especificacoes: { serve: 4 },
      grupos: [
        {
          chave: "sabores",
          nome: "Sabores",
          descricao: "Até 3 sabores, a cozinha divide igual.",
          kind: "VARIATION",
          minimo: 1,
          maximo: 3,
          opcoes: [
            { chave: "carne", nome: "Carne" },
            { chave: "queijo", nome: "Queijo" },
            { chave: "frango", nome: "Frango com Catupiry" },
            { chave: "pizza", nome: "Pizza" },
            { chave: "palmito", nome: "Palmito" },
          ],
        },
      ],
    },
    {
      chave: "caldo-de-cana",
      nome: "Caldo de Cana",
      categoria: "bebidas",
      resumo: "Moído na hora, bem gelado.",
      descricao: "Caldo de cana moído na hora. Puro ou com limão ou abacaxi.",
      preco: 800,
      custo: 250,
      destaque: true,
      preparo: 3,
      ilustracao: "copo",
      cor: "#C9D46B",
      fundo: VERDE,
      fotos: [{ selo: "Moído na hora", fundo: DOURADO }],
      especificacoes: { volume: 300 },
      eixos: [
        {
          chave: "tamanho",
          nome: "Tamanho",
          opcoes: [
            { chave: "300", nome: "300 ml", preco: 800 },
            { chave: "500", nome: "500 ml", preco: 1200 },
          ],
        },
      ],
      grupos: [
        {
          chave: "sabor",
          nome: "Sabor",
          kind: "VARIATION",
          minimo: 1,
          maximo: 1,
          opcoes: [
            { chave: "puro", nome: "Puro", marcada: true },
            { chave: "limao", nome: "Com limão" },
            { chave: "abacaxi", nome: "Com abacaxi", acrescimo: 100 },
          ],
        },
      ],
    },
    {
      chave: "suco-natural",
      nome: "Suco Natural 500 ml",
      categoria: "bebidas",
      resumo: "Fruta de verdade, sem conservante.",
      descricao:
        "Suco natural batido na hora. Peça com ou sem açúcar na observação.",
      preco: 1000,
      custo: 320,
      preparo: 5,
      ilustracao: "copo",
      cor: "#F28C28",
      fundo: QUENTE,
      fotos: [{ selo: "Maracujá", cor: "#F2C12E", fundo: DOURADO }],
      especificacoes: { volume: 500 },
      grupos: [
        {
          chave: "sabor",
          nome: "Sabor",
          kind: "VARIATION",
          minimo: 1,
          maximo: 1,
          opcoes: [
            { chave: "laranja", nome: "Laranja", marcada: true },
            { chave: "limao", nome: "Limão" },
            { chave: "maracuja", nome: "Maracujá" },
            { chave: "abacaxi-hortela", nome: "Abacaxi com hortelã" },
            {
              chave: "morango",
              nome: "Morango",
              acrescimo: 200,
              indisponivel: true,
            },
          ],
        },
      ],
    },
    {
      chave: "agua-mineral",
      nome: "Água Mineral 500 ml",
      categoria: "bebidas",
      resumo: "Com ou sem gás.",
      descricao: "Garrafa de 500 ml, gelada.",
      preco: 400,
      custo: 150,
      preparo: 1,
      ilustracao: "garrafa",
      cor: "#7EC8E3",
      fundo: AZUL,
      especificacoes: { volume: 500 },
      grupos: [
        {
          chave: "tipo",
          nome: "Tipo",
          kind: "VARIATION",
          minimo: 1,
          maximo: 1,
          opcoes: [
            { chave: "sem-gas", nome: "Sem gás", marcada: true },
            { chave: "com-gas", nome: "Com gás" },
          ],
        },
      ],
    },
    {
      chave: "acai-na-tigela",
      nome: "Açaí na Tigela 400 ml",
      categoria: "sobremesas",
      resumo: "Monte do seu jeito, até 5 acompanhamentos.",
      descricao:
        "Açaí cremoso batido com guaraná. Escolha até cinco acompanhamentos — os três primeiros não pagam nada a mais.",
      preco: 1800,
      custo: 700,
      destaque: true,
      preparo: 6,
      ilustracao: "tigela",
      cor: "#5B2A6E",
      fundo: ROXO,
      fotos: [{ selo: "Com granola e banana", fundo: VERDE }],
      especificacoes: { "sem-gluten": true },
      grupos: [
        {
          chave: "acompanhamentos",
          nome: "Acompanhamentos",
          descricao: "Até 5.",
          kind: "ADDON",
          minimo: 0,
          maximo: 5,
          opcoes: [
            { chave: "granola", nome: "Granola" },
            { chave: "banana", nome: "Banana" },
            { chave: "leite-em-po", nome: "Leite em pó" },
            { chave: "pacoca", nome: "Paçoca", acrescimo: 150 },
            {
              chave: "leite-condensado",
              nome: "Leite condensado",
              acrescimo: 200,
            },
            { chave: "morango", nome: "Morango", acrescimo: 300 },
          ],
        },
      ],
    },
    {
      chave: "brigadeiro-gourmet",
      nome: "Brigadeiro Gourmet (3 un)",
      categoria: "sobremesas",
      resumo: "Chocolate belga e granulado.",
      descricao: "Três brigadeiros feitos com chocolate belga 50% cacau.",
      preco: 1200,
      custo: 400,
      preparo: 1,
      ilustracao: "brigadeiro",
      cor: "#4A2C1A",
      fundo: "#E8A0A8",
      especificacoes: { "sem-gluten": true },
    },
    {
      chave: "pastel-de-camarao",
      nome: "Pastel de Camarão",
      categoria: "pasteis",
      resumo: "Lançamento: ainda em teste na cozinha.",
      descricao:
        "Camarão refogado com requeijão. Produto em rascunho — não aparece na vitrine até a dona publicar.",
      preco: 1890,
      custo: 900,
      rascunho: true,
      preparo: 14,
      ilustracao: "pastel",
      cor: "#F0A07A",
      fundo: AZUL,
      especificacoes: { recheio: "Especial", vegetariano: false },
    },
  ],
  clientes: [
    {
      chave: "joana",
      nome: "Joana Martins",
      telefone: "+5585987650101",
      email: "joana.martins@cliente.test",
      endereco: {
        logradouro: "Rua dos Ipês",
        numero: "88",
        complemento: "Casa 2",
        bairro: "Meireles",
      },
      observacao: "Prefere pastel bem sequinho.",
    },
    {
      chave: "paulo",
      nome: "Paulo Henrique Souza",
      telefone: "+5585987650102",
      email: null,
      endereco: {
        logradouro: "Avenida Paulista Nova",
        numero: "1500",
        complemento: "Apto 54",
        bairro: "Aldeota",
      },
    },
    {
      chave: "fernanda",
      nome: "Fernanda Lima",
      telefone: "+5585987650103",
      email: "fernanda.lima@cliente.test",
      endereco: {
        logradouro: "Rua Tamandaré",
        numero: "301",
        complemento: null,
        bairro: "Meireles",
      },
    },
    {
      chave: "ricardo",
      nome: "Ricardo Gomes",
      telefone: "+5585987650104",
      email: null,
      endereco: {
        logradouro: "Rua das Palmeiras",
        numero: "45",
        complemento: "Fundos",
        bairro: "Varjota",
      },
      observacao: "Cliente do balcão, sempre pede caldo de cana.",
    },
    {
      chave: "beatriz",
      nome: "Beatriz Oliveira",
      telefone: "+5585987650105",
      email: "bia.oliveira@cliente.test",
      endereco: {
        logradouro: "Rua Bela Cintra",
        numero: "12",
        complemento: "Bloco B, apto 21",
        bairro: "Meireles",
      },
    },
    {
      chave: "marcos",
      nome: "Marcos Vinícius Rocha",
      telefone: "+5585987650106",
      email: null,
      endereco: {
        logradouro: "Travessa do Sol",
        numero: "7",
        complemento: null,
        bairro: "Aldeota",
      },
    },
  ],
  pedidos: [
    {
      status: "PENDING",
      minutosAtras: 4,
      cliente: "joana",
      entrega: "DELIVERY",
      pagamento: "PIX",
      itens: [
        ["pastel-especial-da-vila", 1, 0, ["catupiry"]],
        ["caldo-de-cana", 2, 1],
      ],
      observacao: "Interfone quebrado, por favor ligar ao chegar.",
    },
    {
      status: "PENDING",
      minutosAtras: 9,
      cliente: "paulo",
      entrega: "PICKUP",
      pagamento: "CASH",
      itens: [["combo-vila", 2]],
    },
    {
      status: "ACCEPTED",
      minutosAtras: 18,
      cliente: "fernanda",
      entrega: "DELIVERY",
      pagamento: "CARD_ON_DELIVERY",
      itens: [
        ["pastel-de-frango-catupiry", 2],
        ["suco-natural", 1],
      ],
    },
    {
      status: "PREPARING",
      minutosAtras: 26,
      cliente: "ricardo",
      entrega: "DELIVERY",
      pagamento: "PIX",
      itens: [
        ["porcao-mini-salgados", 1],
        ["caldo-de-cana", 1, 1],
      ],
    },
    {
      status: "PREPARING",
      minutosAtras: 33,
      cliente: "beatriz",
      entrega: "PICKUP",
      pagamento: "PIX",
      itens: [
        ["pastel-vegano-shimeji", 2],
        ["agua-mineral", 2],
      ],
      observacao: "Sem pimenta, por favor.",
    },
    {
      status: "READY_FOR_PICKUP",
      minutosAtras: 41,
      cliente: "marcos",
      entrega: "PICKUP",
      pagamento: "CASH",
      itens: [
        ["pastel-de-calabresa", 1],
        ["coxinha-de-frango", 2],
      ],
    },
    {
      status: "OUT_FOR_DELIVERY",
      minutosAtras: 52,
      cliente: "joana",
      entrega: "DELIVERY",
      pagamento: "CARD_ON_DELIVERY",
      itens: [
        ["pastel-de-pizza", 2],
        ["acai-na-tigela", 1, 0, ["pacoca"]],
      ],
    },
    {
      status: "COMPLETED",
      minutosAtras: 60 * 26,
      cliente: "paulo",
      entrega: "DELIVERY",
      pagamento: "PIX",
      itens: [["combo-familia", 1]],
    },
    {
      status: "COMPLETED",
      minutosAtras: 60 * 50,
      cliente: "fernanda",
      entrega: "DELIVERY",
      pagamento: "CASH",
      itens: [
        ["pastel-de-frango-catupiry", 1],
        ["pastel-doce", 1],
        ["caldo-de-cana", 1],
      ],
    },
    {
      status: "COMPLETED",
      minutosAtras: 60 * 74,
      cliente: "ricardo",
      entrega: "PICKUP",
      pagamento: "CASH",
      itens: [
        ["esfiha-de-carne", 4],
        ["caldo-de-cana", 2, 1],
      ],
    },
    {
      status: "COMPLETED",
      minutosAtras: 60 * 125,
      cliente: "beatriz",
      entrega: "DELIVERY",
      pagamento: "PIX",
      itens: [
        ["pastel-especial-da-vila", 2],
        ["brigadeiro-gourmet", 1],
      ],
    },
    {
      status: "CANCELLED",
      minutosAtras: 60 * 30,
      cliente: "marcos",
      entrega: "DELIVERY",
      pagamento: "PIX",
      itens: [["kibe-com-queijo", 3]],
      observacao: "Cliente pediu para cancelar: endereço errado.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Moda Boa Vista
// ---------------------------------------------------------------------------

const MARINHO = "#1B3A6B";
const AREIA = "#E9DCC6";
const CINZA = "#9AA3AD";
const OLIVA = "#6B7A3A";
const VINHO = "#7A2235";
const BRANCO = "#F4F4F4";
const PRETO = "#2B2B2B";
const JEANS = "#3C5A82";
const BEGE = "#C9AE86";
const TERRACOTA = "#C1663F";

export const MODA_DEMO: LojaDemo = {
  chave: "moda",
  coordenadas: { lat: -3.7243, lng: -38.5148 },
  destaque: "#3A86FF",
  stories: [
    {
      chave: "colecao-nova",
      tipo: "IMAGEM",
      produto: "vestido-midi-floral",
      legenda: "Coleção nova chegou! Vem ver os vestidos",
      horasAtras: 4,
      link: "/loja/lojaboavista/cardapio",
    },
  ],
  pasta: "lojaboavista",
  ehComida: false,
  iniciais: "BV",
  chamada: "Roupa boa, preço honesto, entrega no bairro",
  primaria: MARINHO,
  secundaria: "#F2C14E",
  boasVindas: "Roupa boa, preço honesto, entrega no bairro.",
  sobre:
    "A Moda Boa Vista veste o Centro desde 2015 com peças básicas de qualidade, jeans que dura e acessórios para o dia a dia. Troca fácil em até 30 dias.",
  whatsapp: "+5585922220001",
  telefone: "+5585922220001",
  email: "contato@modaboavista.test",
  endereco: {
    rua: "Avenida Monsenhor Tabosa",
    numero: "980",
    bairro: "Centro",
    cidade: "Fortaleza",
    uf: "CE",
    cep: "60165010",
  },
  entrega: {
    nomeDaTaxa: "Frete",
    prazoMinutos: 2880,
    retiradaNoLocal: true,
    taxaPadraoCents: 1500,
    gratisAcimaDeCents: 29900,
    minimoEntregaCents: null,
    minimoRetiradaCents: null,
  },
  pagamento: {
    pix: {
      tipo: "EMAIL",
      chave: "pix@modaboavista.test",
      titular: "Ricardo Lima",
    },
    formas: ["PIX", "CASH", "CARD_ON_DELIVERY"],
  },
  checkout: { pedirEmail: true, pedirDocumento: false, pedidoMinimoCents: 0 },
  horarios: [["00:00", "00:00"]],
  categorias: [
    {
      chave: "camisetas",
      nome: "Camisetas",
      descricao: "Malha para o dia a dia.",
      existente: true,
      especificacoes: [
        {
          chave: "tecido",
          rotulo: "Tecido",
          tipo: "ENUM",
          opcoes: ["Algodão", "Poliéster", "Mescla", "Piquet"],
          filtravel: true,
        },
        {
          chave: "gramatura",
          rotulo: "Gramatura",
          tipo: "NUMBER",
          unidade: "g/m²",
          filtravel: true,
        },
      ],
    },
    {
      chave: "calcas",
      nome: "Calças",
      descricao: "Jeans, sarja e moletom.",
      especificacoes: [
        {
          chave: "tecido",
          rotulo: "Tecido",
          tipo: "ENUM",
          opcoes: ["Jeans", "Sarja", "Moletom", "Alfaiataria"],
          filtravel: true,
        },
        {
          chave: "modelagem",
          rotulo: "Modelagem",
          tipo: "ENUM",
          opcoes: ["Slim", "Reta", "Jogger", "Pantalona"],
          filtravel: true,
        },
        {
          chave: "elastano",
          rotulo: "Tem elastano",
          tipo: "BOOLEAN",
          filtravel: true,
        },
      ],
    },
    {
      chave: "bermudas",
      nome: "Bermudas",
      descricao: "Para os dias de calor.",
      especificacoes: [
        {
          chave: "tecido",
          rotulo: "Tecido",
          tipo: "ENUM",
          opcoes: ["Sarja", "Jeans", "Tactel"],
          filtravel: true,
        },
      ],
    },
    {
      chave: "agasalhos",
      nome: "Moletons e Jaquetas",
      descricao: "Para quando esfria.",
      especificacoes: [
        {
          chave: "tecido",
          rotulo: "Tecido",
          tipo: "ENUM",
          opcoes: ["Moletom", "Jeans", "Nylon"],
          filtravel: true,
        },
        {
          chave: "capuz",
          rotulo: "Tem capuz",
          tipo: "BOOLEAN",
          filtravel: true,
        },
      ],
    },
    {
      chave: "vestidos",
      nome: "Vestidos",
      descricao: "Leves e estampados.",
      especificacoes: [
        {
          chave: "comprimento",
          rotulo: "Comprimento",
          tipo: "ENUM",
          opcoes: ["Curto", "Midi", "Longo"],
          filtravel: true,
        },
      ],
    },
    {
      chave: "calcados",
      nome: "Calçados",
      descricao: "Do tênis à meia.",
      existente: true,
      especificacoes: [
        {
          chave: "material",
          rotulo: "Material",
          tipo: "TEXT",
          filtravel: false,
        },
      ],
    },
    {
      chave: "acessorios",
      nome: "Acessórios",
      descricao: "Boné, cinto, bolsa e óculos.",
      especificacoes: [
        { chave: "material", rotulo: "Material", tipo: "TEXT" },
        {
          chave: "ajustavel",
          rotulo: "Ajustável",
          tipo: "BOOLEAN",
          filtravel: true,
        },
      ],
    },
  ],
  produtos: [
    {
      chave: "camiseta-estampada-boa-vista",
      nome: "Camiseta Estampada Boa Vista",
      categoria: "camisetas",
      resumo: "Estampa exclusiva da loja, 100% algodão.",
      descricao:
        "Camiseta de algodão penteado com estampa em silk desenhada aqui na loja. Gola careca com ribana e costura dupla.",
      preco: 6990,
      custo: 2400,
      destaque: true,
      ilustracao: "camiseta",
      cor: BRANCO,
      fundo: MARINHO,
      especificacoes: { tecido: "Algodão", gramatura: 160 },
      eixos: [
        { chave: "tamanho", nome: "Tamanho", opcoes: P_M_G_GG() },
        {
          chave: "cor",
          nome: "Cor",
          opcoes: [
            { chave: "branca", nome: "Branca", cor: BRANCO },
            { chave: "preta", nome: "Preta", cor: PRETO },
          ],
        },
      ],
      estoque: estoqueVariado("gg/preta"),
    },
    {
      chave: "camiseta-polo-piquet",
      nome: "Camiseta Polo Piquet",
      categoria: "camisetas",
      resumo: "Polo clássica, em promoção.",
      descricao:
        "Polo em malha piquet com dois botões e punho canelado. Não amassa e seca rápido.",
      preco: 8990,
      promo: 7490,
      custo: 3100,
      destaque: true,
      ilustracao: "polo",
      cor: MARINHO,
      fundo: AREIA,
      especificacoes: { tecido: "Piquet", gramatura: 210 },
      eixos: [
        { chave: "tamanho", nome: "Tamanho", opcoes: P_M_G_GG("gg") },
        {
          chave: "cor",
          nome: "Cor",
          opcoes: [
            { chave: "marinho", nome: "Azul-marinho", cor: MARINHO },
            { chave: "verde", nome: "Verde-oliva", cor: OLIVA },
            { chave: "branca", nome: "Branca", cor: BRANCO },
          ],
        },
      ],
      estoque: estoqueVariado("p/verde"),
    },
    {
      chave: "camiseta-oversized",
      nome: "Camiseta Oversized",
      categoria: "camisetas",
      resumo: "Modelagem ampla, malha pesada.",
      descricao:
        "Camiseta de modelagem ampla e ombro caído, em malha de 220 g/m² que não deforma na lavagem.",
      preco: 7990,
      custo: 2800,
      ilustracao: "camiseta",
      cor: AREIA,
      fundo: TERRACOTA,
      fotos: [{ selo: "Detalhe da malha", fundo: OLIVA }],
      especificacoes: { tecido: "Algodão", gramatura: 220 },
      eixos: [{ chave: "tamanho", nome: "Tamanho", opcoes: P_M_G_GG("p") }],
    },
    {
      chave: "calca-jeans-slim",
      nome: "Calça Jeans Slim",
      categoria: "calcas",
      resumo: "Jeans com elastano, lavagem média.",
      descricao:
        "Calça jeans de modelagem slim com 2% de elastano, lavagem média e cinco bolsos.",
      preco: 15990,
      custo: 6200,
      destaque: true,
      ilustracao: "calca",
      cor: JEANS,
      fundo: AREIA,
      fotos: [{ selo: "Costas", fundo: CINZA }],
      especificacoes: { tecido: "Jeans", modelagem: "Slim", elastano: true },
      eixos: [
        {
          chave: "tamanho",
          nome: "Tamanho",
          opcoes: NUMERACAO(38, 40, 42, 44, 46),
        },
      ],
      estoque: estoqueVariado("46"),
    },
    {
      chave: "calca-jogger-moletom",
      nome: "Calça Jogger de Moletom",
      categoria: "calcas",
      resumo: "Conforto com punho na barra.",
      descricao:
        "Jogger em moletom flanelado, cós com elástico e cordão, bolsos laterais e punho na barra.",
      preco: 11990,
      custo: 4300,
      ilustracao: "calca",
      cor: CINZA,
      fundo: MARINHO,
      especificacoes: {
        tecido: "Moletom",
        modelagem: "Jogger",
        elastano: false,
      },
      eixos: [
        { chave: "tamanho", nome: "Tamanho", opcoes: P_M_G_GG("gg") },
        {
          chave: "cor",
          nome: "Cor",
          opcoes: [
            { chave: "cinza", nome: "Cinza mescla", cor: CINZA },
            { chave: "preta", nome: "Preta", cor: PRETO },
          ],
        },
      ],
    },
    {
      chave: "calca-alfaiataria",
      nome: "Calça de Alfaiataria Pantalona",
      categoria: "calcas",
      resumo: "Cintura alta e caimento leve.",
      descricao:
        "Pantalona de alfaiataria com cintura alta, pregas frontais e tecido com toque de linho.",
      preco: 17990,
      custo: 6900,
      ilustracao: "calca",
      cor: BEGE,
      fundo: VINHO,
      fotos: [{ selo: "Caimento", fundo: TERRACOTA }],
      especificacoes: {
        tecido: "Alfaiataria",
        modelagem: "Pantalona",
        elastano: false,
      },
      eixos: [
        {
          chave: "tamanho",
          nome: "Tamanho",
          opcoes: NUMERACAO(36, 38, 40, 42),
        },
      ],
    },
    {
      chave: "bermuda-sarja",
      nome: "Bermuda de Sarja",
      categoria: "bermudas",
      resumo: "Sarja leve com elastano.",
      descricao:
        "Bermuda chino em sarja leve, comprimento acima do joelho, com bolsos faca.",
      preco: 9990,
      custo: 3600,
      ilustracao: "bermuda",
      cor: BEGE,
      fundo: OLIVA,
      especificacoes: { tecido: "Sarja" },
      eixos: [
        {
          chave: "tamanho",
          nome: "Tamanho",
          opcoes: NUMERACAO(38, 40, 42, 44),
        },
        {
          chave: "cor",
          nome: "Cor",
          opcoes: [
            { chave: "bege", nome: "Bege", cor: BEGE },
            { chave: "marinho", nome: "Azul-marinho", cor: MARINHO },
          ],
        },
      ],
      estoque: estoqueVariado("44/marinho"),
    },
    {
      chave: "moletom-canguru",
      nome: "Moletom Canguru com Capuz",
      categoria: "agasalhos",
      resumo: "Flanelado por dentro, bolso canguru.",
      descricao:
        "Moletom fechado com capuz forrado, bolso canguru e punhos canelados. Flanelado por dentro.",
      preco: 18990,
      custo: 7200,
      destaque: true,
      ilustracao: "moletom",
      cor: CINZA,
      fundo: VINHO,
      especificacoes: { tecido: "Moletom", capuz: true },
      eixos: [
        { chave: "tamanho", nome: "Tamanho", opcoes: P_M_G_GG() },
        {
          chave: "cor",
          nome: "Cor",
          opcoes: [
            { chave: "cinza", nome: "Cinza mescla", cor: CINZA },
            { chave: "vinho", nome: "Vinho", cor: VINHO },
            { chave: "preto", nome: "Preto", cor: PRETO },
          ],
        },
      ],
      estoque: estoqueVariado("p/vinho"),
    },
    {
      chave: "jaqueta-jeans",
      nome: "Jaqueta Jeans",
      categoria: "agasalhos",
      resumo: "Clássica, lavagem escura.",
      descricao:
        "Jaqueta jeans tradicional com botões metálicos, dois bolsos frontais e lavagem escura.",
      preco: 22990,
      custo: 9100,
      ilustracao: "jaqueta",
      cor: JEANS,
      fundo: AREIA,
      fotos: [{ selo: "Botões metálicos", fundo: TERRACOTA }],
      especificacoes: { tecido: "Jeans", capuz: false },
      eixos: [{ chave: "tamanho", nome: "Tamanho", opcoes: P_M_G_GG("gg") }],
    },
    {
      chave: "vestido-midi-floral",
      nome: "Vestido Midi Floral",
      categoria: "vestidos",
      resumo: "Viscose estampada, alcinha regulável.",
      descricao:
        "Vestido midi em viscose estampada, alças reguláveis e amarração nas costas.",
      preco: 15990,
      custo: 5800,
      destaque: true,
      ilustracao: "vestido",
      cor: TERRACOTA,
      fundo: "#F1C8B4",
      fotos: [{ selo: "Estampa floral", fundo: OLIVA }],
      especificacoes: { comprimento: "Midi" },
      eixos: [{ chave: "tamanho", nome: "Tamanho", opcoes: P_M_G_GG("gg") }],
      estoque: estoqueVariado("g"),
    },
    {
      chave: "tenis-casual-lona",
      nome: "Tênis Casual de Lona",
      categoria: "calcados",
      resumo: "Lona resistente e solado de borracha.",
      descricao:
        "Tênis de cano baixo em lona, com palmilha acolchoada e solado de borracha vulcanizada.",
      preco: 14990,
      custo: 5600,
      ilustracao: "tenis",
      cor: BRANCO,
      fundo: MARINHO,
      especificacoes: { material: "Lona e borracha" },
      eixos: [
        {
          chave: "numero",
          nome: "Numeração",
          opcoes: NUMERACAO(37, 38, 39, 40, 41, 42),
        },
        {
          chave: "cor",
          nome: "Cor",
          opcoes: [
            { chave: "branco", nome: "Branco", cor: BRANCO },
            { chave: "preto", nome: "Preto", cor: PRETO },
          ],
        },
      ],
      estoque: estoqueVariado("42/branco"),
    },
    {
      chave: "bone-aba-curva",
      nome: "Boné Aba Curva",
      categoria: "acessorios",
      resumo: "Ajuste traseiro, bordado frontal.",
      descricao:
        "Boné de sarja com aba curva, bordado frontal e regulagem de fivela.",
      preco: 5990,
      custo: 1900,
      ilustracao: "bone",
      cor: PRETO,
      fundo: "#F2C14E",
      especificacoes: { material: "Sarja de algodão", ajustavel: true },
      eixos: [
        {
          chave: "cor",
          nome: "Cor",
          opcoes: [
            { chave: "preto", nome: "Preto", cor: PRETO },
            { chave: "bege", nome: "Bege", cor: BEGE },
            { chave: "verde", nome: "Verde-oliva", cor: OLIVA },
          ],
        },
      ],
    },
    {
      chave: "cinto-de-couro",
      nome: "Cinto de Couro",
      categoria: "acessorios",
      resumo: "Couro legítimo, fivela dourada.",
      descricao:
        "Cinto de couro bovino legítimo, 3,5 cm de largura e fivela dourada.",
      preco: 7990,
      custo: 2700,
      ilustracao: "cinto",
      cor: "#6B3E26",
      fundo: AREIA,
      especificacoes: { material: "Couro bovino", ajustavel: false },
      eixos: [
        { chave: "tamanho", nome: "Tamanho", opcoes: NUMERACAO(90, 100, 110) },
      ],
    },
    {
      chave: "bolsa-transversal",
      nome: "Bolsa Transversal",
      categoria: "acessorios",
      resumo: "Compacta, alça regulável.",
      descricao:
        "Bolsa transversal em material sintético com alça regulável, dois compartimentos e fecho de ímã.",
      preco: 12990,
      promo: 9990,
      custo: 4200,
      ilustracao: "bolsa",
      cor: TERRACOTA,
      fundo: "#F1C8B4",
      fotos: [{ selo: "Por dentro", fundo: VINHO }],
      especificacoes: { material: "Sintético", ajustavel: true },
    },
    {
      chave: "oculos-de-sol",
      nome: "Óculos de Sol Redondo",
      categoria: "acessorios",
      resumo: "Proteção UV400.",
      descricao:
        "Óculos de sol de armação redonda com lentes de proteção UV400 e estojo.",
      preco: 8990,
      custo: 2600,
      ilustracao: "oculos",
      cor: "#3B3B3B",
      fundo: "#7EC8E3",
      especificacoes: { material: "Acetato", ajustavel: false },
    },
  ],
  clientes: [
    {
      chave: "camila",
      nome: "Camila Andrade",
      telefone: "+5585976540201",
      email: "camila.andrade@cliente.test",
      endereco: {
        logradouro: "Rua Augusta",
        numero: "2200",
        complemento: "Apto 81",
        bairro: "Benfica",
      },
      observacao: "Veste M em camiseta e 38 em calça.",
    },
    {
      chave: "gustavo",
      nome: "Gustavo Pereira",
      telefone: "+5585976540202",
      email: null,
      endereco: {
        logradouro: "Rua da Consolação",
        numero: "455",
        complemento: null,
        bairro: "Centro",
      },
    },
    {
      chave: "larissa",
      nome: "Larissa Costa",
      telefone: "+5585976540203",
      email: "larissa.costa@cliente.test",
      endereco: {
        logradouro: "Avenida São João",
        numero: "1020",
        complemento: "Sala 3",
        bairro: "Centro",
      },
    },
    {
      chave: "thiago",
      nome: "Thiago Nunes",
      telefone: "+5585976540204",
      email: "thiago.nunes@cliente.test",
      endereco: {
        logradouro: "Rua Bela Vista",
        numero: "67",
        complemento: "Casa",
        bairro: "Fátima",
      },
    },
    {
      chave: "patricia",
      nome: "Patrícia Ramos",
      telefone: "+5585976540205",
      email: null,
      endereco: {
        logradouro: "Rua Treze de Maio",
        numero: "890",
        complemento: "Apto 12",
        bairro: "Fátima",
      },
      observacao: "Prefere retirar na loja aos sábados.",
    },
  ],
  pedidos: [
    {
      status: "PENDING",
      minutosAtras: 6,
      cliente: "camila",
      entrega: "DELIVERY",
      pagamento: "PIX",
      itens: [
        ["vestido-midi-floral", 1, 1],
        ["bolsa-transversal", 1],
      ],
    },
    {
      status: "PENDING",
      minutosAtras: 15,
      cliente: "gustavo",
      entrega: "PICKUP",
      pagamento: "CASH",
      itens: [["camiseta-estampada-boa-vista", 2, 3]],
    },
    {
      status: "ACCEPTED",
      minutosAtras: 45,
      cliente: "larissa",
      entrega: "DELIVERY",
      pagamento: "CARD_ON_DELIVERY",
      itens: [
        ["calca-jeans-slim", 1, 1],
        ["cinto-de-couro", 1, 1],
      ],
    },
    {
      status: "PREPARING",
      minutosAtras: 90,
      cliente: "thiago",
      entrega: "DELIVERY",
      pagamento: "PIX",
      itens: [["moletom-canguru", 1, 5]],
      observacao: "É presente, pode embrulhar?",
    },
    {
      status: "READY_FOR_PICKUP",
      minutosAtras: 180,
      cliente: "patricia",
      entrega: "PICKUP",
      pagamento: "PIX",
      itens: [
        ["camiseta-polo-piquet", 2, 2],
        ["bone-aba-curva", 1, 1],
      ],
    },
    {
      status: "OUT_FOR_DELIVERY",
      minutosAtras: 240,
      cliente: "camila",
      entrega: "DELIVERY",
      pagamento: "CARD_ON_DELIVERY",
      itens: [["tenis-casual-lona", 1, 2]],
    },
    {
      status: "COMPLETED",
      minutosAtras: 60 * 28,
      cliente: "gustavo",
      entrega: "DELIVERY",
      pagamento: "PIX",
      itens: [
        ["bermuda-sarja", 2, 2],
        ["camiseta-oversized", 1, 1],
      ],
    },
    {
      status: "COMPLETED",
      minutosAtras: 60 * 55,
      cliente: "larissa",
      entrega: "PICKUP",
      pagamento: "CASH",
      itens: [["calca-alfaiataria", 1, 2]],
    },
    {
      status: "COMPLETED",
      minutosAtras: 60 * 98,
      cliente: "thiago",
      entrega: "DELIVERY",
      pagamento: "PIX",
      itens: [
        ["jaqueta-jeans", 1, 1],
        ["oculos-de-sol", 1],
      ],
    },
    {
      status: "COMPLETED",
      minutosAtras: 60 * 150,
      cliente: "patricia",
      entrega: "DELIVERY",
      pagamento: "CARD_ON_DELIVERY",
      itens: [
        ["calca-jogger-moletom", 1, 3],
        ["camiseta-estampada-boa-vista", 1, 2],
      ],
    },
    {
      status: "CANCELLED",
      minutosAtras: 60 * 40,
      cliente: "camila",
      entrega: "DELIVERY",
      pagamento: "PIX",
      itens: [["moletom-canguru", 1, 2]],
      observacao: "Cliente desistiu: comprou outro tamanho.",
    },
  ],
};

export const LOJAS_DEMO: readonly LojaDemo[] = [PASTELARIA_DEMO, MODA_DEMO];
