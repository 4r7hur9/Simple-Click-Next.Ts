/**
 * Lojas novas da demonstração (card #50), varejo — parte B: moda praia,
 * eletrônicos, livraria, brinquedos, construção, variedades e autopeças.
 *
 * É DADO, não regra: quem transforma isto em linhas é `demo/index.ts`.
 * Todo valor monetário é inteiro em centavos (P-005).
 */

import type { LojaDemo } from "../dados.ts";
import {
  CHECKOUT_PADRAO,
  enderecoEm,
  entrega,
  estoqueVariado,
  NUMERACAO,
  pagamento,
  P_M_G_GG,
} from "./apoio.ts";

const BRANCO = "#FFFFFF";
const PRETO = "#1F1F1F";

// ---------------------------------------------------------------------------
// 16. Ateliê Mandacaru Moda — moda verão e praia
// ---------------------------------------------------------------------------

const AREIA = "#F3E3C3";
const CORAL = "#E8613C";
const VERDE_MANDACARU = "#2F6B4F";
const AZUL_MAR = "#1F7A9E";

const MODA_PRAIA: LojaDemo = {
  chave: "moda-praia",
  nova: {
    apelido: "atelie-mandacaru",
    nome: "Ateliê Mandacaru Moda",
    ramo: "APPAREL",
    dono: { nome: "Iracema Feitosa", email: "iracema@atelie-mandacaru.test" },
  },
  coordenadas: { lat: -3.743, lng: -38.525 },
  destaque: "#FF6B35",
  capa: true,
  stories: [
    {
      chave: "colecao-verao",
      tipo: "IMAGEM",
      produto: "vestido-chita-cearense",
      legenda:
        "Coleção Verão Mandacaru no ar! Vestidos de chita feitos aqui no ateliê.",
      horasAtras: 3,
      link: "/loja/atelie-mandacaru/cardapio",
    },
    {
      chave: "provador-biquini",
      tipo: "VIDEO",
      produto: "biquini-cortininha-estampado",
      legenda:
        "Biquíni cortininha em quatro estampas. Corre que o GG tá acabando!",
      horasAtras: 9,
    },
  ],
  pasta: "atelie-mandacaru",
  ehComida: false,
  iniciais: "AM",
  chamada: "Moda leve para o sol do Ceará",
  primaria: VERDE_MANDACARU,
  secundaria: CORAL,
  boasVindas: "Bem-vinda ao Ateliê! Escolha seu look de verão.",
  sobre:
    "O Ateliê Mandacaru costura moda leve para o calor de Fortaleza desde 2018, no José Bonifácio. Tecidos frescos, estampas nordestinas e peças de praia pensadas para quem vive o ano inteiro no verão.",
  whatsapp: "+5585991230016",
  telefone: "+5585991230016",
  email: "contato@atelie-mandacaru.test",
  endereco: enderecoEm({
    rua: "Rua Pedro I",
    numero: "1120",
    bairro: "José Bonifácio",
    cep: "60035100",
  }),
  entrega: entrega({ taxa: 1200, prazoMinutos: 1440, gratisAcimaDe: 24900 }),
  pagamento: pagamento("pix@atelie-mandacaru.test", "Iracema Feitosa"),
  checkout: CHECKOUT_PADRAO,
  horarios: [["00:00", "00:00"]],
  categorias: [
    {
      chave: "camisetas",
      nome: "Camisetas",
      descricao: "Malha fresca e estampas da terra.",
      especificacoes: [
        {
          chave: "tecido",
          rotulo: "Tecido",
          tipo: "ENUM",
          opcoes: ["Algodão", "Viscose", "Linho", "Mescla"],
          filtravel: true,
        },
        { chave: "estampa", rotulo: "Estampa", tipo: "TEXT" },
      ],
    },
    {
      chave: "vestidos",
      nome: "Vestidos",
      descricao: "Leves, soltinhos e coloridos.",
      especificacoes: [
        {
          chave: "comprimento",
          rotulo: "Comprimento",
          tipo: "ENUM",
          opcoes: ["Curto", "Midi", "Longo"],
          filtravel: true,
        },
        {
          chave: "tecido",
          rotulo: "Tecido",
          tipo: "ENUM",
          opcoes: ["Viscose", "Chita", "Linho", "Algodão"],
          filtravel: true,
        },
      ],
    },
    {
      chave: "bermudas",
      nome: "Bermudas e Shorts",
      descricao: "Para andar fresco na cidade e na orla.",
      especificacoes: [
        {
          chave: "tecido",
          rotulo: "Tecido",
          tipo: "ENUM",
          opcoes: ["Linho", "Tactel", "Sarja", "Jeans"],
          filtravel: true,
        },
        {
          chave: "elastico",
          rotulo: "Cós com elástico",
          tipo: "BOOLEAN",
          filtravel: true,
        },
      ],
    },
    {
      chave: "praia",
      nome: "Moda Praia",
      descricao: "Biquínis, sungas e saídas de praia.",
      especificacoes: [
        {
          chave: "protecao-uv",
          rotulo: "Proteção UV",
          tipo: "BOOLEAN",
          filtravel: true,
        },
        {
          chave: "forro",
          rotulo: "Forro",
          tipo: "ENUM",
          opcoes: ["Sem forro", "Forro simples", "Forro duplo"],
          filtravel: true,
        },
      ],
    },
    {
      chave: "acessorios",
      nome: "Acessórios",
      descricao: "Boné, bolsa, óculos e cinto.",
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
      chave: "camiseta-mandacaru",
      nome: "Camiseta Mandacaru",
      categoria: "camisetas",
      resumo: "Estampa de mandacaru em silk, algodão leve.",
      descricao:
        "Camiseta de algodão penteado com estampa de mandacaru pintada à mão e transferida em silk. Modelagem solta, ideal para o calor.",
      preco: 7490,
      custo: 3000,
      destaque: true,
      ilustracao: "camiseta",
      cor: AREIA,
      fundo: VERDE_MANDACARU,
      especificacoes: { tecido: "Algodão", estampa: "Mandacaru" },
      eixos: [
        { chave: "tamanho", nome: "Tamanho", opcoes: P_M_G_GG() },
        {
          chave: "cor",
          nome: "Cor",
          opcoes: [
            { chave: "areia", nome: "Areia", cor: AREIA },
            { chave: "verde", nome: "Verde", cor: VERDE_MANDACARU },
            { chave: "branca", nome: "Branca", cor: BRANCO },
          ],
        },
      ],
      estoque: estoqueVariado("gg/verde"),
      video: true,
    },
    {
      chave: "camiseta-linho-jangada",
      nome: "Camiseta de Linho Jangada",
      categoria: "camisetas",
      resumo: "Linho natural com bordado de jangada.",
      descricao:
        "Camiseta de linho com pequeno bordado de jangada no peito. Tecido que respira e fica mais macio a cada lavagem.",
      preco: 9990,
      promo: 8490,
      custo: 4500,
      ilustracao: "camiseta",
      cor: "#E9E2D0",
      fundo: AZUL_MAR,
      especificacoes: { tecido: "Linho", estampa: "Bordado de jangada" },
      eixos: [
        { chave: "tamanho", nome: "Tamanho", opcoes: P_M_G_GG() },
        {
          chave: "cor",
          nome: "Cor",
          opcoes: [
            { chave: "cru", nome: "Cru", cor: "#E9E2D0" },
            { chave: "azul", nome: "Azul-mar", cor: AZUL_MAR },
          ],
        },
      ],
      estoque: estoqueVariado("p/azul"),
    },
    {
      chave: "vestido-chita-cearense",
      nome: "Vestido de Chita Cearense",
      categoria: "vestidos",
      resumo: "Midi rodado em chita florida.",
      descricao:
        "Vestido midi rodado em chita estampada, com alças finas e amarração nas costas. Feito no ateliê em pequenas tiragens.",
      preco: 15990,
      custo: 7200,
      destaque: true,
      ilustracao: "vestido",
      cor: "#D7263D",
      fundo: AREIA,
      fotos: [{ selo: "Feito no ateliê", fundo: CORAL }],
      especificacoes: { comprimento: "Midi", tecido: "Chita" },
      eixos: [
        { chave: "tamanho", nome: "Tamanho", opcoes: P_M_G_GG() },
        {
          chave: "cor",
          nome: "Estampa",
          opcoes: [
            { chave: "vermelha", nome: "Chita vermelha", cor: "#D7263D" },
            { chave: "azul", nome: "Chita azul", cor: "#2B59C3" },
          ],
        },
      ],
      estoque: estoqueVariado("gg/azul"),
      video: true,
    },
    {
      chave: "vestido-longo-viscose",
      nome: "Vestido Longo de Viscose",
      categoria: "vestidos",
      resumo: "Longo fluido, perfeito para fim de tarde.",
      descricao:
        "Vestido longo em viscose fluida com fenda lateral e decote em V. Não marca e cai bem do almoço ao pôr do sol na Beira-Mar.",
      preco: 18990,
      promo: 15990,
      custo: 8500,
      ilustracao: "vestido",
      cor: "#F4A259",
      fundo: "#5B3A29",
      especificacoes: { comprimento: "Longo", tecido: "Viscose" },
      eixos: [
        { chave: "tamanho", nome: "Tamanho", opcoes: P_M_G_GG("gg") },
        {
          chave: "cor",
          nome: "Cor",
          opcoes: [
            { chave: "terracota", nome: "Terracota", cor: "#C8553D" },
            { chave: "mostarda", nome: "Mostarda", cor: "#F4A259" },
          ],
        },
      ],
      estoque: estoqueVariado("p/terracota"),
    },
    {
      chave: "bermuda-linho-orla",
      nome: "Bermuda de Linho Orla",
      categoria: "bermudas",
      resumo: "Linho com cós de elástico e cordão.",
      descricao:
        "Bermuda masculina de linho com cós de elástico, cordão e dois bolsos faca. Fresca para o dia a dia na cidade.",
      preco: 11990,
      custo: 5400,
      ilustracao: "bermuda",
      cor: "#CDBA96",
      fundo: VERDE_MANDACARU,
      especificacoes: { tecido: "Linho", elastico: true },
      eixos: [
        { chave: "tamanho", nome: "Tamanho", opcoes: P_M_G_GG() },
        {
          chave: "cor",
          nome: "Cor",
          opcoes: [
            { chave: "bege", nome: "Bege", cor: "#CDBA96" },
            { chave: "oliva", nome: "Oliva", cor: "#6B7F3A" },
          ],
        },
      ],
      estoque: estoqueVariado("gg/oliva"),
    },
    {
      chave: "short-tactel-praia",
      nome: "Short Tactel de Praia",
      categoria: "bermudas",
      resumo: "Seca rápido, vai do mar ao bar.",
      descricao:
        "Short de tactel com forro de tela, bolso traseiro com velcro e cordão. Seca em minutos depois do mergulho.",
      preco: 6990,
      custo: 2900,
      ilustracao: "bermuda",
      cor: AZUL_MAR,
      fundo: AREIA,
      especificacoes: { tecido: "Tactel", elastico: true },
      eixos: [
        { chave: "tamanho", nome: "Tamanho", opcoes: P_M_G_GG() },
        {
          chave: "cor",
          nome: "Cor",
          opcoes: [
            { chave: "azul", nome: "Azul-mar", cor: AZUL_MAR },
            { chave: "coral", nome: "Coral", cor: CORAL },
            { chave: "preto", nome: "Preto", cor: PRETO },
          ],
        },
      ],
      estoque: estoqueVariado("m/coral"),
      feed: false,
    },
    {
      chave: "biquini-cortininha-estampado",
      nome: "Biquíni Cortininha Estampado",
      categoria: "praia",
      resumo: "Cortininha com forro duplo e proteção UV.",
      descricao:
        "Biquíni cortininha com calcinha de amarrar e tecido com proteção UV 50. Forro duplo que não fica transparente.",
      preco: 12990,
      custo: 5200,
      destaque: true,
      ilustracao: "vestido",
      cor: CORAL,
      fundo: AZUL_MAR,
      fotos: [{ selo: "Proteção UV 50", fundo: AZUL_MAR }],
      especificacoes: { "protecao-uv": true, forro: "Forro duplo" },
      eixos: [
        { chave: "tamanho", nome: "Tamanho", opcoes: P_M_G_GG() },
        {
          chave: "cor",
          nome: "Estampa",
          opcoes: [
            { chave: "folhagem", nome: "Folhagem", cor: "#3A7D44" },
            { chave: "coral", nome: "Coral liso", cor: CORAL },
          ],
        },
      ],
      estoque: estoqueVariado("gg/folhagem"),
    },
    {
      chave: "saida-de-praia-croche",
      nome: "Saída de Praia de Crochê",
      categoria: "praia",
      resumo: "Crochê feito à mão por rendeiras do Ceará.",
      descricao:
        "Saída de praia em crochê de algodão feita à mão por artesãs da região. Tamanho único, veste do P ao G.",
      preco: 16990,
      custo: 9000,
      ilustracao: "vestido",
      cor: BRANCO,
      fundo: "#C9A66B",
      especificacoes: { "protecao-uv": false, forro: "Sem forro" },
    },
    {
      chave: "sunga-boxer-uv",
      nome: "Sunga Boxer UV",
      categoria: "praia",
      resumo: "Boxer de praia com proteção solar.",
      descricao:
        "Sunga boxer com tecido de proteção UV 50 e forro simples. Cordão interno para ajuste na cintura.",
      preco: 7990,
      promo: 6490,
      custo: 3300,
      ilustracao: "bermuda",
      cor: "#0B3C5D",
      fundo: "#F6D55C",
      especificacoes: { "protecao-uv": true, forro: "Forro simples" },
      eixos: [
        { chave: "tamanho", nome: "Tamanho", opcoes: P_M_G_GG() },
        {
          chave: "cor",
          nome: "Cor",
          opcoes: [
            { chave: "marinho", nome: "Marinho", cor: "#0B3C5D" },
            { chave: "verde", nome: "Verde", cor: VERDE_MANDACARU },
          ],
        },
      ],
      estoque: estoqueVariado("p/verde"),
    },
    {
      chave: "bone-de-palha",
      nome: "Boné de Palha",
      categoria: "acessorios",
      resumo: "Palha trançada com fita ajustável.",
      descricao:
        "Boné de palha natural trançada com aba curva e fita de ajuste atrás. Leve e ventilado para o sol forte.",
      preco: 5990,
      custo: 2500,
      ilustracao: "bone",
      cor: "#D9B26F",
      fundo: VERDE_MANDACARU,
      especificacoes: { material: "Palha natural", ajustavel: true },
    },
    {
      chave: "bolsa-de-palha-praia",
      nome: "Bolsa de Palha para Praia",
      categoria: "acessorios",
      resumo: "Cabe toalha, protetor e o que mais precisar.",
      descricao:
        "Bolsa de palha de carnaúba trançada à mão, com alças de couro sintético e forro de algodão. Espaçosa para um dia de praia.",
      preco: 11990,
      custo: 6000,
      ilustracao: "bolsa",
      cor: "#C9A66B",
      fundo: CORAL,
      especificacoes: { material: "Palha de carnaúba", ajustavel: false },
    },
    {
      chave: "oculos-de-sol-redondo",
      nome: "Óculos de Sol Redondo",
      categoria: "acessorios",
      resumo: "Armação redonda com proteção UV400.",
      descricao:
        "Óculos de sol de armação redonda em acetato com lentes UV400. Acompanha estojo de tecido.",
      preco: 8990,
      custo: 3600,
      ilustracao: "oculos",
      cor: PRETO,
      fundo: "#F6D55C",
      especificacoes: { material: "Acetato", ajustavel: false },
      eixos: [
        {
          chave: "cor",
          nome: "Cor",
          opcoes: [
            { chave: "preto", nome: "Preto", cor: PRETO },
            { chave: "tartaruga", nome: "Tartaruga", cor: "#7A4E2D" },
          ],
        },
      ],
      estoque: estoqueVariado("tartaruga"),
    },
    {
      chave: "cinto-de-couro-trancado",
      nome: "Cinto de Couro Trançado",
      categoria: "acessorios",
      resumo: "Couro trançado artesanal de Juazeiro.",
      descricao:
        "Cinto de couro trançado à mão com fivela de metal envelhecido. Por ser trançado, ajusta em qualquer furo.",
      preco: 7990,
      custo: 3800,
      ilustracao: "cinto",
      cor: "#7A4E2D",
      fundo: AREIA,
      especificacoes: { material: "Couro legítimo", ajustavel: true },
    },
  ],
};

// ---------------------------------------------------------------------------
// 17. Conecta Cell Acessórios — eletrônicos
// ---------------------------------------------------------------------------

const GRAFITE = "#2B2D42";
const CIANO = "#00B4D8";

const ELETRONICOS: LojaDemo = {
  chave: "eletronicos",
  nova: {
    apelido: "conecta-cell",
    nome: "Conecta Cell Acessórios",
    ramo: "ELECTRONICS",
    dono: { nome: "Francisco Holanda", email: "francisco@conecta-cell.test" },
  },
  coordenadas: { lat: -3.776, lng: -38.562 },
  destaque: "#00E5A0",
  stories: [
    {
      chave: "power-bank-chegou",
      tipo: "IMAGEM",
      produto: "power-bank-10000",
      legenda:
        "Power bank de 10.000 mAh com preço de lançamento. Bateria para o dia todo!",
      horasAtras: 2,
      link: "/loja/conecta-cell/cardapio",
    },
    {
      chave: "teste-caixa-som",
      tipo: "VIDEO",
      produto: "caixa-de-som-bluetooth",
      legenda: "Testamos a caixinha à prova d'água na piscina. Olha o grave!",
      horasAtras: 14,
    },
  ],
  pasta: "conecta-cell",
  ehComida: false,
  iniciais: "CC",
  chamada: "Acessórios para celular com entrega rápida",
  primaria: GRAFITE,
  secundaria: CIANO,
  boasVindas: "Carregador, fone e capinha: chega hoje!",
  sobre:
    "A Conecta Cell fica pertinho do terminal da Parangaba e atende Fortaleza com acessórios para celular testados na hora. Todos os produtos têm garantia de 90 dias e troca na loja.",
  whatsapp: "+5585991230017",
  telefone: "+5585991230017",
  email: "contato@conecta-cell.test",
  endereco: enderecoEm({
    rua: "Avenida João Pessoa",
    numero: "6250",
    bairro: "Parangaba",
    cep: "60425682",
  }),
  entrega: entrega({ taxa: 800, prazoMinutos: 90, gratisAcimaDe: 15000 }),
  pagamento: pagamento("+5585991230017", "Francisco Holanda"),
  checkout: CHECKOUT_PADRAO,
  horarios: [["00:00", "00:00"]],
  categorias: [
    {
      chave: "carregadores",
      nome: "Carregadores e Cabos",
      descricao: "Carga rápida e cabos reforçados.",
      especificacoes: [
        {
          chave: "conector",
          rotulo: "Conector",
          tipo: "ENUM",
          opcoes: ["USB-C", "Micro USB", "Lightning", "Universal"],
          filtravel: true,
        },
        {
          chave: "potencia",
          rotulo: "Potência",
          tipo: "NUMBER",
          unidade: "W",
          filtravel: true,
        },
      ],
    },
    {
      chave: "audio",
      nome: "Áudio",
      descricao: "Fones e caixas de som.",
      especificacoes: [
        {
          chave: "conexao",
          rotulo: "Conexão",
          tipo: "ENUM",
          opcoes: ["Bluetooth", "Com fio"],
          filtravel: true,
        },
        {
          chave: "autonomia",
          rotulo: "Autonomia",
          tipo: "NUMBER",
          unidade: "h",
          filtravel: true,
        },
        {
          chave: "agua",
          rotulo: "Resistente à água",
          tipo: "BOOLEAN",
          filtravel: true,
        },
      ],
    },
    {
      chave: "protecao",
      nome: "Capinhas e Películas",
      descricao: "Proteção para o seu aparelho.",
      especificacoes: [
        {
          chave: "material",
          rotulo: "Material",
          tipo: "ENUM",
          opcoes: ["Silicone", "TPU", "Vidro temperado", "Hidrogel"],
          filtravel: true,
        },
      ],
    },
    {
      chave: "energia",
      nome: "Power Banks",
      descricao: "Bateria extra para o dia todo.",
      especificacoes: [
        {
          chave: "capacidade",
          rotulo: "Capacidade",
          tipo: "NUMBER",
          unidade: "mAh",
          filtravel: true,
        },
        {
          chave: "portas",
          rotulo: "Número de portas",
          tipo: "NUMBER",
          filtravel: false,
        },
      ],
    },
  ],
  produtos: [
    {
      chave: "carregador-turbo-20w",
      nome: "Carregador Turbo 20 W",
      categoria: "carregadores",
      resumo: "Carga rápida com saída USB-C.",
      descricao:
        "Fonte de parede com saída USB-C de 20 W e proteção contra superaquecimento. Bivolt, funciona em 127 V e 220 V.",
      preco: 5990,
      custo: 2400,
      destaque: true,
      ilustracao: "carregador",
      cor: BRANCO,
      fundo: GRAFITE,
      especificacoes: { conector: "USB-C", potencia: 20 },
    },
    {
      chave: "carregador-veicular-duplo",
      nome: "Carregador Veicular Duplo",
      categoria: "carregadores",
      resumo: "Duas portas para o acendedor do carro.",
      descricao:
        "Carregador para o acendedor de cigarros do carro com uma porta USB-A e uma USB-C. Luz indicadora azul e corpo em alumínio.",
      preco: 3990,
      custo: 1600,
      ilustracao: "carregador",
      cor: PRETO,
      fundo: CIANO,
      especificacoes: { conector: "Universal", potencia: 30 },
    },
    {
      chave: "cabo-usb-c-reforcado",
      nome: "Cabo USB-C Reforçado",
      categoria: "carregadores",
      resumo: "Trançado em nylon, aguenta o tranco.",
      descricao:
        "Cabo com revestimento de nylon trançado e pontas reforçadas. Suporta carga rápida e transferência de dados.",
      preco: 2990,
      custo: 1000,
      ilustracao: "carregador",
      cor: "#E63946",
      fundo: "#EDF2F4",
      especificacoes: { conector: "USB-C", potencia: 60 },
      eixos: [
        {
          chave: "tipo",
          nome: "Tipo",
          opcoes: [
            { chave: "usbc-usbc", nome: "USB-C para USB-C" },
            { chave: "usba-usbc", nome: "USB-A para USB-C" },
          ],
        },
        {
          chave: "comprimento",
          nome: "Comprimento",
          opcoes: [
            { chave: "1m", nome: "1 m" },
            { chave: "2m", nome: "2 m" },
          ],
        },
      ],
      estoque: estoqueVariado("usbc-usbc/2m"),
    },
    {
      chave: "cabo-micro-usb",
      nome: "Cabo Micro USB",
      categoria: "carregadores",
      resumo: "Para aparelhos e caixinhas mais antigas.",
      descricao:
        "Cabo micro USB com 2,4 A para celulares mais antigos, caixas de som e controles. Ponta com encaixe firme.",
      preco: 1990,
      promo: 1490,
      custo: 600,
      ilustracao: "carregador",
      cor: BRANCO,
      fundo: "#8D99AE",
      especificacoes: { conector: "Micro USB", potencia: 12 },
      eixos: [
        {
          chave: "comprimento",
          nome: "Comprimento",
          opcoes: [
            { chave: "1m", nome: "1 m" },
            { chave: "2m", nome: "2 m" },
          ],
        },
      ],
      estoque: estoqueVariado("2m"),
      feed: false,
    },
    {
      chave: "fone-bluetooth-tws",
      nome: "Fone Bluetooth Sem Fio",
      categoria: "audio",
      resumo: "Estojo carregador e 20 h de bateria.",
      descricao:
        "Fone intra-auricular sem fio com estojo de carga e controle por toque. Até 5 h de uso contínuo e 20 h com o estojo.",
      preco: 12990,
      promo: 9990,
      custo: 5200,
      destaque: true,
      ilustracao: "fone",
      cor: BRANCO,
      fundo: CIANO,
      fotos: [{ selo: "20 h com o estojo", fundo: GRAFITE }],
      especificacoes: { conexao: "Bluetooth", autonomia: 20, agua: true },
      eixos: [
        {
          chave: "cor",
          nome: "Cor",
          opcoes: [
            { chave: "branco", nome: "Branco", cor: BRANCO },
            { chave: "preto", nome: "Preto", cor: PRETO },
          ],
        },
      ],
      estoque: estoqueVariado("preto"),
      video: true,
    },
    {
      chave: "fone-com-fio-p2",
      nome: "Fone com Fio P2",
      categoria: "audio",
      resumo: "Com microfone e botão de atender.",
      descricao:
        "Fone intra-auricular com fio, plugue P2 e microfone embutido. Três tamanhos de borrachinha na caixa.",
      preco: 2490,
      custo: 900,
      ilustracao: "fone",
      cor: PRETO,
      fundo: "#EDF2F4",
      especificacoes: { conexao: "Com fio", agua: false },
    },
    {
      chave: "caixa-de-som-bluetooth",
      nome: "Caixa de Som Bluetooth",
      categoria: "audio",
      resumo: "À prova d'água, 12 h de música.",
      descricao:
        "Caixa de som portátil com 10 W, grave reforçado e proteção contra respingos e mergulho rápido. Alça para pendurar na mochila.",
      preco: 18990,
      custo: 9500,
      destaque: true,
      ilustracao: "caixa-som",
      cor: GRAFITE,
      fundo: "#00E5A0",
      especificacoes: { conexao: "Bluetooth", autonomia: 12, agua: true },
      eixos: [
        {
          chave: "cor",
          nome: "Cor",
          opcoes: [
            { chave: "grafite", nome: "Grafite", cor: GRAFITE },
            { chave: "azul", nome: "Azul", cor: "#1D4ED8" },
            { chave: "vermelha", nome: "Vermelha", cor: "#E63946" },
          ],
        },
      ],
      estoque: estoqueVariado("vermelha"),
      video: true,
    },
    {
      chave: "capinha-silicone",
      nome: "Capinha de Silicone",
      categoria: "protecao",
      resumo: "Toque aveludado e borda que protege a câmera.",
      descricao:
        "Capinha de silicone com interior em microfibra e borda elevada na câmera. Escolha o modelo do seu aparelho na grade.",
      preco: 3490,
      custo: 1100,
      ilustracao: "celular",
      cor: "#F28482",
      fundo: GRAFITE,
      especificacoes: { material: "Silicone" },
      eixos: [
        {
          chave: "modelo",
          nome: "Modelo",
          opcoes: [
            { chave: "a", nome: "Modelo A" },
            { chave: "b", nome: "Modelo B" },
            { chave: "c", nome: "Modelo C" },
          ],
        },
        {
          chave: "cor",
          nome: "Cor",
          opcoes: [
            { chave: "rosa", nome: "Rosa", cor: "#F28482" },
            { chave: "preta", nome: "Preta", cor: PRETO },
          ],
        },
      ],
      estoque: estoqueVariado("c/rosa"),
    },
    {
      chave: "capinha-anti-impacto",
      nome: "Capinha Anti-impacto",
      categoria: "protecao",
      resumo: "Transparente com cantos reforçados.",
      descricao:
        "Capinha transparente em TPU com cantos de ar que absorvem quedas. Não amarela com facilidade.",
      preco: 2990,
      custo: 900,
      ilustracao: "celular",
      cor: "#CDEFF7",
      fundo: CIANO,
      especificacoes: { material: "TPU" },
      eixos: [
        {
          chave: "modelo",
          nome: "Modelo",
          opcoes: [
            { chave: "a", nome: "Modelo A" },
            { chave: "b", nome: "Modelo B" },
            { chave: "c", nome: "Modelo C" },
            { chave: "d", nome: "Modelo D" },
          ],
        },
      ],
      estoque: estoqueVariado("d"),
    },
    {
      chave: "pelicula-vidro-3d",
      nome: "Película de Vidro 3D",
      categoria: "protecao",
      resumo: "Cobre a tela inteira, aplicação grátis na loja.",
      descricao:
        "Película de vidro temperado 9H com bordas curvas que cobrem a tela toda. Aplicamos de graça na retirada.",
      preco: 2490,
      custo: 1000,
      ilustracao: "celular",
      cor: "#A8DADC",
      fundo: GRAFITE,
      especificacoes: { material: "Vidro temperado" },
      eixos: [
        {
          chave: "modelo",
          nome: "Modelo",
          opcoes: [
            { chave: "a", nome: "Modelo A" },
            { chave: "b", nome: "Modelo B" },
            { chave: "c", nome: "Modelo C" },
            { chave: "d", nome: "Modelo D" },
          ],
        },
      ],
      estoque: estoqueVariado("a"),
    },
    {
      chave: "pelicula-hidrogel",
      nome: "Película de Hidrogel",
      categoria: "protecao",
      resumo: "Flexível, ideal para tela curva.",
      descricao:
        "Película de hidrogel autorregenerativa que some com pequenos riscos. Cortada sob medida para o seu modelo.",
      preco: 3990,
      custo: 1200,
      rascunho: true,
      ilustracao: "celular",
      cor: "#BDE0FE",
      fundo: "#8D99AE",
      especificacoes: { material: "Hidrogel" },
    },
    {
      chave: "power-bank-10000",
      nome: "Power Bank 10.000 mAh",
      categoria: "energia",
      resumo: "Duas cargas completas no bolso.",
      descricao:
        "Bateria portátil de 10.000 mAh com saídas USB-A e USB-C e carga rápida de 20 W. Visor com a porcentagem restante.",
      preco: 14990,
      promo: 12990,
      custo: 7000,
      destaque: true,
      ilustracao: "bateria",
      cor: GRAFITE,
      fundo: "#00E5A0",
      especificacoes: { capacidade: 10000, portas: 2 },
      eixos: [
        {
          chave: "cor",
          nome: "Cor",
          opcoes: [
            { chave: "preto", nome: "Preto", cor: PRETO },
            { chave: "branco", nome: "Branco", cor: BRANCO },
          ],
        },
      ],
      estoque: estoqueVariado("branco"),
    },
    {
      chave: "power-bank-20000",
      nome: "Power Bank 20.000 mAh",
      categoria: "energia",
      resumo: "Para viagem e dias longos.",
      descricao:
        "Bateria portátil de 20.000 mAh com três saídas e entrada USB-C. Carrega celular e fone ao mesmo tempo.",
      preco: 21990,
      custo: 11000,
      ilustracao: "bateria",
      cor: "#1D4ED8",
      fundo: "#EDF2F4",
      especificacoes: { capacidade: 20000, portas: 3 },
    },
  ],
};

// ---------------------------------------------------------------------------
// 18. Livraria Sebo do Dragão — livros
// ---------------------------------------------------------------------------

const VINHO = "#6D2E46";
const PAPEL = "#F4EBD9";
const MOSTARDA = "#D4A017";

const EDICAO = (nova: number, usado: number) => ({
  chave: "edicao",
  nome: "Edição",
  opcoes: [
    { chave: "nova", nome: "Nova", preco: nova },
    { chave: "usado", nome: "Usado", preco: usado },
  ],
});

const LIVRARIA: LojaDemo = {
  chave: "livraria",
  nova: {
    apelido: "sebo-do-dragao",
    nome: "Livraria Sebo do Dragão",
    ramo: "BOOKSTORE",
    dono: { nome: "Raimundo Alencar", email: "raimundo@sebo-do-dragao.test" },
  },
  coordenadas: { lat: -3.7225, lng: -38.52 },
  destaque: "#C2185B",
  capa: true,
  stories: [
    {
      chave: "classicos-cearenses",
      tipo: "IMAGEM",
      produto: "iracema",
      legenda:
        "Semana dos clássicos cearenses: Iracema, Luzia-Homem e mais, novos e usados.",
      horasAtras: 6,
      link: "/loja/sebo-do-dragao/cardapio",
    },
  ],
  pasta: "sebo-do-dragao",
  ehComida: false,
  iniciais: "SD",
  chamada: "Livros novos e usados ao lado do Dragão do Mar",
  primaria: VINHO,
  secundaria: MOSTARDA,
  boasVindas: "Entre, folheie e leve uma boa história.",
  sobre:
    "O Sebo do Dragão funciona num casarão da Praia de Iracema, a poucos passos do Centro Dragão do Mar. Temos clássicos da literatura brasileira em edições novas e usadas, além de autores cearenses e literatura infantil.",
  whatsapp: "+5585991230018",
  telefone: "+5585991230018",
  email: "contato@sebo-do-dragao.test",
  endereco: enderecoEm({
    rua: "Rua Dragão do Mar",
    numero: "212",
    bairro: "Praia de Iracema",
    cep: "60060390",
  }),
  entrega: entrega({ taxa: 900, prazoMinutos: 1440, gratisAcimaDe: 12000 }),
  pagamento: pagamento("pix@sebo-do-dragao.test", "Raimundo Alencar"),
  checkout: CHECKOUT_PADRAO,
  horarios: [
    ["09:00", "12:00"],
    ["14:00", "20:00"],
  ],
  categorias: [
    {
      chave: "classicos",
      nome: "Clássicos Brasileiros",
      descricao: "Os livros que todo mundo leu (ou deveria).",
      especificacoes: [
        { chave: "autor", rotulo: "Autor", tipo: "TEXT", filtravel: true },
        { chave: "editora", rotulo: "Editora", tipo: "TEXT" },
        {
          chave: "paginas",
          rotulo: "Páginas",
          tipo: "NUMBER",
          unidade: "páginas",
        },
      ],
    },
    {
      chave: "cearenses",
      nome: "Autores Cearenses",
      descricao: "Literatura feita no Ceará.",
      especificacoes: [
        { chave: "autor", rotulo: "Autor", tipo: "TEXT", filtravel: true },
        { chave: "editora", rotulo: "Editora", tipo: "TEXT" },
        {
          chave: "paginas",
          rotulo: "Páginas",
          tipo: "NUMBER",
          unidade: "páginas",
        },
      ],
    },
    {
      chave: "infantil",
      nome: "Infantil",
      descricao: "Histórias para os pequenos leitores.",
      especificacoes: [
        {
          chave: "idioma",
          rotulo: "Idioma",
          tipo: "ENUM",
          opcoes: ["Português", "Inglês", "Bilíngue"],
          filtravel: true,
        },
        {
          chave: "ilustrado",
          rotulo: "Ilustrado",
          tipo: "BOOLEAN",
          filtravel: true,
        },
      ],
    },
    {
      chave: "kits",
      nome: "Kits e Coleções",
      descricao: "Vários livros com preço de um combo.",
      especificacoes: [
        {
          chave: "volumes",
          rotulo: "Volumes",
          tipo: "NUMBER",
          unidade: "livros",
        },
        {
          chave: "idioma",
          rotulo: "Idioma",
          tipo: "ENUM",
          opcoes: ["Português", "Inglês", "Bilíngue"],
          filtravel: true,
        },
      ],
    },
  ],
  produtos: [
    {
      chave: "iracema",
      nome: "Iracema",
      categoria: "cearenses",
      resumo: "José de Alencar e a lenda do Ceará.",
      descricao:
        "O romance indianista de José de Alencar que conta a lenda da virgem dos lábios de mel. Edição com notas e glossário de termos tupis.",
      preco: 3490,
      custo: 1600,
      destaque: true,
      ilustracao: "livro",
      cor: "#2E7D32",
      fundo: PAPEL,
      especificacoes: {
        autor: "José de Alencar",
        editora: "Editora Jangada",
        paginas: 176,
      },
      eixos: [EDICAO(3490, 1590)],
      estoque: estoqueVariado("usado"),
    },
    {
      chave: "luzia-homem",
      nome: "Luzia-Homem",
      categoria: "cearenses",
      resumo: "Domingos Olímpio e a seca de 1877.",
      descricao:
        "Romance de Domingos Olímpio ambientado em Sobral durante a grande seca. Uma das personagens femininas mais fortes da literatura brasileira.",
      preco: 3990,
      custo: 1800,
      ilustracao: "livro",
      cor: "#B5651D",
      fundo: PAPEL,
      especificacoes: {
        autor: "Domingos Olímpio",
        editora: "Editora Jangada",
        paginas: 224,
      },
      eixos: [EDICAO(3990, 1890)],
      estoque: estoqueVariado("nova"),
    },
    {
      chave: "o-guarani",
      nome: "O Guarani",
      categoria: "classicos",
      resumo: "Peri, Ceci e a aventura de Alencar.",
      descricao:
        "Clássico de José de Alencar sobre Peri e Ceci no Brasil colonial. Edição integral com prefácio e cronologia do autor.",
      preco: 4490,
      custo: 2000,
      ilustracao: "livro",
      cor: "#1B4965",
      fundo: MOSTARDA,
      especificacoes: {
        autor: "José de Alencar",
        editora: "Casa das Letras",
        paginas: 384,
      },
      eixos: [EDICAO(4490, 1990)],
      estoque: estoqueVariado("usado"),
    },
    {
      chave: "dom-casmurro",
      nome: "Dom Casmurro",
      categoria: "classicos",
      resumo: "Capitu traiu ou não traiu?",
      descricao:
        "O romance de Machado de Assis narrado por Bentinho, que até hoje divide leitores sobre Capitu. Edição de bolso com notas.",
      preco: 2990,
      promo: 2490,
      custo: 1300,
      destaque: true,
      ilustracao: "livro",
      cor: PRETO,
      fundo: "#E9C46A",
      especificacoes: {
        autor: "Machado de Assis",
        editora: "Casa das Letras",
        paginas: 256,
      },
    },
    {
      chave: "o-cortico",
      nome: "O Cortiço",
      categoria: "classicos",
      resumo: "Aluísio Azevedo e o Rio do século XIX.",
      descricao:
        "Romance naturalista de Aluísio Azevedo sobre a vida num cortiço carioca. Leitura obrigatória de vestibular.",
      preco: 3290,
      custo: 1500,
      ilustracao: "livro",
      cor: "#8D2E2E",
      fundo: PAPEL,
      especificacoes: {
        autor: "Aluísio Azevedo",
        editora: "Editora Jangada",
        paginas: 272,
      },
      eixos: [EDICAO(3290, 1490)],
      estoque: estoqueVariado("nova"),
    },
    {
      chave: "a-escrava-isaura",
      nome: "A Escrava Isaura",
      categoria: "classicos",
      resumo: "O romance abolicionista de Bernardo Guimarães.",
      descricao:
        "Romance de Bernardo Guimarães publicado em 1875, marco da literatura abolicionista. Edição com apresentação crítica.",
      preco: 3190,
      custo: 1400,
      ilustracao: "livro",
      cor: "#5E548E",
      fundo: PAPEL,
      especificacoes: {
        autor: "Bernardo Guimarães",
        editora: "Casa das Letras",
        paginas: 208,
      },
      feed: false,
    },
    {
      chave: "memorias-postumas",
      nome: "Memórias Póstumas de Brás Cubas",
      categoria: "classicos",
      resumo: "O defunto autor de Machado de Assis.",
      descricao:
        "O romance que inaugurou o realismo no Brasil, narrado por um defunto com muito humor. Edição comentada.",
      preco: 3490,
      custo: 1600,
      ilustracao: "livro",
      cor: "#264653",
      fundo: "#E9C46A",
      especificacoes: {
        autor: "Machado de Assis",
        editora: "Editora Jangada",
        paginas: 288,
      },
      eixos: [EDICAO(3490, 1690)],
      estoque: estoqueVariado("usado"),
    },
    {
      chave: "o-jangadeiro-e-a-lua",
      nome: "O Jangadeiro e a Lua",
      categoria: "infantil",
      resumo: "Conto ilustrado sobre o mar de Mucuripe.",
      descricao:
        "Um jovem jangadeiro sai para pescar e faz amizade com a lua cheia. Livro ilustrado em aquarela para crianças de 4 a 8 anos.",
      preco: 4290,
      custo: 2100,
      ilustracao: "livro",
      cor: "#1D3557",
      fundo: "#A8DADC",
      especificacoes: { idioma: "Português", ilustrado: true },
    },
    {
      chave: "a-tartaruga-de-iracema",
      nome: "A Tartaruga da Praia de Iracema",
      categoria: "infantil",
      resumo: "Edição bilíngue para aprender brincando.",
      descricao:
        "A história de uma tartaruguinha que procura o caminho de volta ao mar, em português e inglês lado a lado. Capa dura.",
      preco: 4990,
      promo: 3990,
      custo: 2300,
      ilustracao: "livro",
      cor: "#2A9D8F",
      fundo: "#FFE8D6",
      especificacoes: { idioma: "Bilíngue", ilustrado: true },
    },
    {
      chave: "kit-alencar",
      nome: "Kit José de Alencar",
      categoria: "kits",
      resumo: "Iracema, O Guarani e Ubirajara.",
      descricao:
        "A trilogia indianista de José de Alencar em três volumes de bolso. Ótimo presente para quem está começando nos clássicos.",
      preco: 8990,
      custo: 4300,
      destaque: true,
      ilustracao: "livros",
      cor: VINHO,
      fundo: PAPEL,
      fotos: [{ selo: "3 livros", fundo: MOSTARDA }],
      especificacoes: { volumes: 3, idioma: "Português" },
    },
    {
      chave: "kit-vestibular",
      nome: "Kit Leituras do Vestibular",
      categoria: "kits",
      resumo: "Cinco clássicos pedidos nas provas.",
      descricao:
        "Dom Casmurro, O Cortiço, Iracema, A Escrava Isaura e Memórias Póstumas em edições usadas bem conservadas. Ideal para estudantes.",
      preco: 9990,
      custo: 4000,
      ilustracao: "livros",
      cor: "#1B4965",
      fundo: MOSTARDA,
      especificacoes: { volumes: 5, idioma: "Português" },
    },
    {
      chave: "kit-contos-de-ninar",
      nome: "Kit Contos de Ninar",
      categoria: "kits",
      resumo: "Quatro livrinhos para a hora de dormir.",
      descricao:
        "Quatro livros curtos e ilustrados com histórias calmas para ler antes de dormir. Capa cartonada resistente.",
      preco: 6990,
      custo: 3300,
      ilustracao: "livros",
      cor: "#F4A261",
      fundo: "#3D405B",
      especificacoes: { volumes: 4, idioma: "Português" },
    },
  ],
};

// ---------------------------------------------------------------------------
// 19. Brinca Mais Brinquedos — brinquedos
// ---------------------------------------------------------------------------

const ROXO = "#7B2CBF";
const AMARELO = "#FFD60A";
const FAIXA_ETARIA = [
  "0 a 2 anos",
  "3 a 5 anos",
  "6 a 8 anos",
  "9 anos ou mais",
];

const BRINQUEDOS: LojaDemo = {
  chave: "brinquedos",
  nova: {
    apelido: "brinca-mais",
    nome: "Brinca Mais Brinquedos",
    ramo: "TOYS",
    dono: { nome: "Antônia Bezerra", email: "antonia@brinca-mais.test" },
  },
  coordenadas: { lat: -3.798, lng: -38.563 },
  destaque: "#FF006E",
  stories: [
    {
      chave: "ursos-gigantes",
      tipo: "IMAGEM",
      produto: "urso-de-pelucia",
      legenda:
        "Chegaram os ursos de pelúcia em três tamanhos. O gigante tem 80 cm!",
      horasAtras: 5,
      link: "/loja/brinca-mais/cardapio",
    },
    {
      chave: "pista-montada",
      tipo: "VIDEO",
      produto: "pista-de-carrinhos",
      legenda: "Montamos a pista aqui na loja. Olha o looping!",
      horasAtras: 11,
    },
    {
      chave: "dia-dos-jogos",
      tipo: "IMAGEM",
      produto: "jogo-trilha-do-sertao",
      legenda:
        "Sábado tem mesa de jogos de tabuleiro na loja. Traga a família!",
      horasAtras: 18,
      link: "/loja/brinca-mais/cardapio",
    },
  ],
  pasta: "brinca-mais",
  ehComida: false,
  iniciais: "BM",
  chamada: "Brinquedo bom é brinquedo brincado",
  primaria: ROXO,
  secundaria: AMARELO,
  boasVindas: "Oba! Escolha a próxima brincadeira.",
  sobre:
    "A Brinca Mais é a loja de brinquedos da Maraponga desde 2016, com pelúcias, blocos, carrinhos e jogos para toda a família. Todos os produtos têm selo de segurança e indicação de idade.",
  whatsapp: "+5585991230019",
  telefone: "+5585991230019",
  email: "contato@brinca-mais.test",
  endereco: enderecoEm({
    rua: "Avenida Godofredo Maciel",
    numero: "2400",
    bairro: "Maraponga",
    cep: "60710001",
  }),
  entrega: entrega({ taxa: 1000, prazoMinutos: 180, gratisAcimaDe: 19900 }),
  pagamento: pagamento("pix@brinca-mais.test", "Antônia Bezerra"),
  checkout: CHECKOUT_PADRAO,
  horarios: [["00:00", "00:00"]],
  categorias: [
    {
      chave: "pelucias",
      nome: "Pelúcias",
      descricao: "Macias e antialérgicas.",
      especificacoes: [
        {
          chave: "faixa-etaria",
          rotulo: "Faixa etária",
          tipo: "ENUM",
          opcoes: FAIXA_ETARIA,
          filtravel: true,
        },
        {
          chave: "lavavel",
          rotulo: "Lavável na máquina",
          tipo: "BOOLEAN",
          filtravel: true,
        },
      ],
    },
    {
      chave: "montar",
      nome: "Blocos de Montar",
      descricao: "Para construir e imaginar.",
      especificacoes: [
        {
          chave: "faixa-etaria",
          rotulo: "Faixa etária",
          tipo: "ENUM",
          opcoes: FAIXA_ETARIA,
          filtravel: true,
        },
        {
          chave: "pecas",
          rotulo: "Peças",
          tipo: "NUMBER",
          unidade: "peças",
          filtravel: true,
        },
      ],
    },
    {
      chave: "veiculos",
      nome: "Carrinhos",
      descricao: "Carrinhos, pistas e caminhões.",
      especificacoes: [
        {
          chave: "faixa-etaria",
          rotulo: "Faixa etária",
          tipo: "ENUM",
          opcoes: FAIXA_ETARIA,
          filtravel: true,
        },
        {
          chave: "pilhas",
          rotulo: "Usa pilhas",
          tipo: "BOOLEAN",
          filtravel: true,
        },
      ],
    },
    {
      chave: "esportes",
      nome: "Bolas e Ar Livre",
      descricao: "Para gastar energia lá fora.",
      especificacoes: [
        {
          chave: "faixa-etaria",
          rotulo: "Faixa etária",
          tipo: "ENUM",
          opcoes: FAIXA_ETARIA,
          filtravel: true,
        },
      ],
    },
    {
      chave: "jogos",
      nome: "Jogos de Tabuleiro",
      descricao: "Diversão para a família toda.",
      especificacoes: [
        {
          chave: "faixa-etaria",
          rotulo: "Faixa etária",
          tipo: "ENUM",
          opcoes: FAIXA_ETARIA,
          filtravel: true,
        },
        { chave: "jogadores", rotulo: "Jogadores", tipo: "TEXT" },
      ],
    },
  ],
  produtos: [
    {
      chave: "urso-de-pelucia",
      nome: "Urso de Pelúcia Chocolate",
      categoria: "pelucias",
      resumo: "Fofinho, com laço de cetim.",
      descricao:
        "Urso de pelúcia antialérgico com enchimento de fibra siliconada e laço de cetim. Olhos bordados, seguros para bebês.",
      preco: 5990,
      custo: 2700,
      destaque: true,
      ilustracao: "urso",
      cor: "#8B5E3C",
      fundo: AMARELO,
      especificacoes: { "faixa-etaria": "0 a 2 anos", lavavel: true },
      eixos: [
        {
          chave: "tamanho",
          nome: "Tamanho",
          opcoes: [
            { chave: "30", nome: "30 cm", preco: 5990 },
            { chave: "50", nome: "50 cm", preco: 9990 },
            { chave: "80", nome: "80 cm", preco: 17990 },
          ],
        },
      ],
      estoque: estoqueVariado("80"),
      video: true,
    },
    {
      chave: "coelho-de-pelucia",
      nome: "Coelha de Pelúcia Rosa",
      categoria: "pelucias",
      resumo: "Orelhas compridas e vestidinho.",
      descricao:
        "Coelha de pelúcia com orelhas longas e vestidinho de algodão removível. Pode ir para a máquina no ciclo delicado.",
      preco: 6990,
      promo: 5490,
      custo: 3000,
      ilustracao: "urso",
      cor: "#F7AEF8",
      fundo: ROXO,
      especificacoes: { "faixa-etaria": "0 a 2 anos", lavavel: true },
      eixos: [
        {
          chave: "tamanho",
          nome: "Tamanho",
          opcoes: [
            { chave: "pequeno", nome: "Pequeno" },
            { chave: "medio", nome: "Médio" },
          ],
        },
      ],
      estoque: estoqueVariado("medio"),
    },
    {
      chave: "blocos-gigantes-60",
      nome: "Blocos Gigantes 60 Peças",
      categoria: "montar",
      resumo: "Peças grandes para mãozinhas pequenas.",
      descricao:
        "Balde com 60 blocos grandes de encaixe em cores vivas. Peças sem pontas e sem risco de engolir.",
      preco: 8990,
      custo: 4000,
      destaque: true,
      ilustracao: "blocos",
      cor: "#EF476F",
      fundo: AMARELO,
      especificacoes: { "faixa-etaria": "0 a 2 anos", pecas: 60 },
    },
    {
      chave: "blocos-cidade-500",
      nome: "Blocos Cidade 500 Peças",
      categoria: "montar",
      resumo: "Monte casas, prédios e a praça.",
      descricao:
        "Kit com 500 peças pequenas, placas de base e manual com cinco projetos de cidade. Compatível com as marcas mais comuns.",
      preco: 14990,
      custo: 7000,
      ilustracao: "blocos",
      cor: "#118AB2",
      fundo: "#FFF3B0",
      fotos: [{ selo: "500 peças", fundo: ROXO }],
      especificacoes: { "faixa-etaria": "6 a 8 anos", pecas: 500 },
    },
    {
      chave: "carrinho-de-friccao",
      nome: "Carrinho de Fricção",
      categoria: "veiculos",
      resumo: "Puxa para trás e solta!",
      descricao:
        "Carrinho de plástico resistente com motor de fricção, sem pilhas. Vem em cores sortidas.",
      preco: 2490,
      custo: 1000,
      ilustracao: "carrinho",
      cor: "#E63946",
      fundo: "#A8DADC",
      especificacoes: { "faixa-etaria": "3 a 5 anos", pilhas: false },
      eixos: [
        {
          chave: "cor",
          nome: "Cor",
          opcoes: [
            { chave: "vermelho", nome: "Vermelho", cor: "#E63946" },
            { chave: "azul", nome: "Azul", cor: "#1D4ED8" },
            { chave: "amarelo", nome: "Amarelo", cor: AMARELO },
          ],
        },
      ],
      estoque: estoqueVariado("amarelo"),
      feed: false,
    },
    {
      chave: "pista-de-carrinhos",
      nome: "Pista de Carrinhos com Looping",
      categoria: "veiculos",
      resumo: "Lançador, looping e dois carrinhos.",
      descricao:
        "Pista de encaixar com lançador, looping duplo e dois carrinhos inclusos. Monta em vários formatos.",
      preco: 16990,
      promo: 13990,
      custo: 7800,
      destaque: true,
      ilustracao: "carrinho",
      cor: "#FB8500",
      fundo: ROXO,
      especificacoes: { "faixa-etaria": "6 a 8 anos", pilhas: false },
      video: true,
    },
    {
      chave: "caminhao-controle-remoto",
      nome: "Caminhão de Controle Remoto",
      categoria: "veiculos",
      resumo: "Anda para frente, trás e faz curvas.",
      descricao:
        "Caminhão de controle remoto com faróis que acendem e pneus de borracha. Usa pilhas AA, não inclusas.",
      preco: 12990,
      custo: 6200,
      ilustracao: "carrinho",
      cor: "#06D6A0",
      fundo: "#073B4C",
      especificacoes: { "faixa-etaria": "6 a 8 anos", pilhas: true },
    },
    {
      chave: "bola-de-futebol-infantil",
      nome: "Bola de Futebol Infantil",
      categoria: "esportes",
      resumo: "Tamanho 4, leve para as crianças.",
      descricao:
        "Bola de futebol tamanho 4 em material sintético costurado. Mais leve que a oficial, ideal para a garotada.",
      preco: 4990,
      custo: 2200,
      ilustracao: "bola",
      cor: BRANCO,
      fundo: "#2A9D8F",
      especificacoes: { "faixa-etaria": "6 a 8 anos" },
    },
    {
      chave: "bola-de-praia",
      nome: "Bola de Praia Colorida",
      categoria: "esportes",
      resumo: "Inflável, para a piscina e o mar.",
      descricao:
        "Bola inflável de vinil com gomos coloridos e 40 cm cheia. Acompanha bico de enchimento.",
      preco: 1490,
      custo: 500,
      ilustracao: "bola",
      cor: AMARELO,
      fundo: "#00B4D8",
      especificacoes: { "faixa-etaria": "3 a 5 anos" },
    },
    {
      chave: "jogo-trilha-do-sertao",
      nome: "Jogo Trilha do Sertão",
      categoria: "jogos",
      resumo: "Tabuleiro de percurso com cartas de desafio.",
      descricao:
        "Jogo de tabuleiro de percurso pelo sertão nordestino, com cartas de perguntas e desafios. Partidas de 30 minutos.",
      preco: 8990,
      custo: 4000,
      ilustracao: "caixa",
      cor: "#E76F51",
      fundo: "#F4E3B2",
      especificacoes: {
        "faixa-etaria": "6 a 8 anos",
        jogadores: "2 a 6 jogadores",
      },
    },
    {
      chave: "jogo-da-memoria-bichos",
      nome: "Jogo da Memória Bichos do Ceará",
      categoria: "jogos",
      resumo: "40 peças com animais da caatinga.",
      descricao:
        "Jogo da memória em madeira com 40 peças ilustradas com animais da caatinga e do litoral. Ensina enquanto diverte.",
      preco: 3990,
      custo: 1700,
      ilustracao: "blocos",
      cor: "#2A9D8F",
      fundo: "#FFF3B0",
      especificacoes: {
        "faixa-etaria": "3 a 5 anos",
        jogadores: "1 a 4 jogadores",
      },
    },
    {
      chave: "jogo-de-estrategia-reinos",
      nome: "Jogo de Estratégia Reinos",
      categoria: "jogos",
      resumo: "Conquiste territórios e negocie recursos.",
      descricao:
        "Jogo de estratégia com tabuleiro modular, cartas de recurso e peças de madeira. Para quem gosta de partidas mais longas.",
      preco: 18990,
      custo: 9200,
      ilustracao: "caixa",
      cor: "#3D405B",
      fundo: AMARELO,
      especificacoes: {
        "faixa-etaria": "9 anos ou mais",
        jogadores: "3 a 5 jogadores",
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 20. Constrular Material de Construção — construção
// ---------------------------------------------------------------------------

const LARANJA_OBRA = "#E85D04";
const CHUMBO = "#343A40";

const VOLTAGEM = [
  { chave: "127v", nome: "127 V" },
  { chave: "220v", nome: "220 V" },
];

const CONSTRUCAO: LojaDemo = {
  chave: "construcao",
  nova: {
    apelido: "constrular",
    nome: "Constrular Material de Construção",
    ramo: "HARDWARE",
    dono: { nome: "Cícero Magalhães", email: "cicero@constrular.test" },
  },
  coordenadas: { lat: -3.736, lng: -38.653 },
  destaque: "#FFB703",
  capa: true,
  diasFechados: [0],
  pasta: "constrular",
  ehComida: false,
  iniciais: "CL",
  chamada: "Tudo para sua obra, do parafuso à tinta",
  primaria: LARANJA_OBRA,
  secundaria: CHUMBO,
  boasVindas: "Obra boa começa aqui. Entregamos em Caucaia e Fortaleza.",
  sobre:
    "A Constrular abastece obras e reformas em Caucaia desde 2010, com ferramentas, material elétrico, hidráulico e tintas. Entregamos com caminhão próprio em Caucaia e na zona oeste de Fortaleza.",
  whatsapp: "+5585991230020",
  telefone: "+5585991230020",
  email: "contato@constrular.test",
  endereco: enderecoEm({
    rua: "Avenida Dom Almeida Lustosa",
    numero: "1850",
    bairro: "Centro",
    cep: "61600080",
    cidade: "Caucaia",
  }),
  entrega: entrega({ taxa: 2500, prazoMinutos: 2880, gratisAcimaDe: 50000 }),
  pagamento: pagamento("pix@constrular.test", "Cícero Magalhães"),
  checkout: CHECKOUT_PADRAO,
  horarios: [["07:00", "17:30"]],
  categorias: [
    {
      chave: "ferramentas",
      nome: "Ferramentas",
      descricao: "Manuais e elétricas.",
      especificacoes: [
        {
          chave: "tipo",
          rotulo: "Tipo",
          tipo: "ENUM",
          opcoes: ["Manual", "Elétrica"],
          filtravel: true,
        },
        {
          chave: "garantia",
          rotulo: "Garantia",
          tipo: "NUMBER",
          unidade: "meses",
        },
      ],
    },
    {
      chave: "eletrica",
      nome: "Elétrica",
      descricao: "Lâmpadas, fios e tomadas.",
      especificacoes: [
        { chave: "bivolt", rotulo: "Bivolt", tipo: "BOOLEAN", filtravel: true },
        {
          chave: "vida-util",
          rotulo: "Vida útil",
          tipo: "NUMBER",
          unidade: "h",
        },
      ],
    },
    {
      chave: "tintas",
      nome: "Tintas",
      descricao: "Para parede, madeira e metal.",
      especificacoes: [
        {
          chave: "acabamento",
          rotulo: "Acabamento",
          tipo: "ENUM",
          opcoes: ["Fosco", "Acetinado", "Semibrilho", "Brilhante"],
          filtravel: true,
        },
        {
          chave: "superficie",
          rotulo: "Superfície",
          tipo: "ENUM",
          opcoes: ["Parede", "Madeira e metal", "Piso"],
          filtravel: true,
        },
        {
          chave: "rendimento",
          rotulo: "Rendimento",
          tipo: "NUMBER",
          unidade: "m²/demão",
        },
      ],
    },
    {
      chave: "fixacao",
      nome: "Fixação",
      descricao: "Parafusos, buchas e pregos.",
      especificacoes: [
        { chave: "material", rotulo: "Material", tipo: "TEXT" },
        {
          chave: "quantidade",
          rotulo: "Quantidade",
          tipo: "NUMBER",
          unidade: "unidades",
        },
      ],
    },
    {
      chave: "hidraulica",
      nome: "Hidráulica",
      descricao: "Canos, registros e torneiras.",
      especificacoes: [
        { chave: "bitola", rotulo: "Bitola", tipo: "TEXT", filtravel: true },
      ],
    },
  ],
  produtos: [
    {
      chave: "martelo-unha-27mm",
      nome: "Martelo de Unha 27 mm",
      categoria: "ferramentas",
      resumo: "Cabo de fibra antivibração.",
      descricao:
        "Martelo de unha com cabeça de aço forjado e cabo de fibra de vidro emborrachado. Reduz o impacto no punho.",
      preco: 4990,
      custo: 2400,
      ilustracao: "martelo",
      cor: CHUMBO,
      fundo: "#FFB703",
      especificacoes: { tipo: "Manual", garantia: 12 },
    },
    {
      chave: "furadeira-de-impacto-650w",
      nome: "Furadeira de Impacto 650 W",
      categoria: "ferramentas",
      resumo: "Fura parede, madeira e metal.",
      descricao:
        "Furadeira de impacto com mandril de 13 mm, controle de velocidade e reversão. Acompanha maleta e jogo de brocas.",
      preco: 29990,
      promo: 26990,
      custo: 16000,
      destaque: true,
      ilustracao: "furadeira",
      cor: LARANJA_OBRA,
      fundo: CHUMBO,
      fotos: [{ selo: "Com maleta e brocas", fundo: LARANJA_OBRA }],
      especificacoes: { tipo: "Elétrica", garantia: 12 },
      eixos: [{ chave: "voltagem", nome: "Voltagem", opcoes: VOLTAGEM }],
      estoque: estoqueVariado("127v"),
      video: true,
    },
    {
      chave: "parafusadeira-a-bateria",
      nome: "Parafusadeira a Bateria 12 V",
      categoria: "ferramentas",
      resumo: "Leve, com duas baterias.",
      descricao:
        "Parafusadeira sem fio de 12 V com duas baterias, carregador bivolt e luz de LED. Torque ajustável em 18 posições.",
      preco: 34990,
      custo: 19500,
      ilustracao: "furadeira",
      cor: "#2A9D8F",
      fundo: "#F1FAEE",
      especificacoes: { tipo: "Elétrica", garantia: 12 },
    },
    {
      chave: "lampada-led-bulbo",
      nome: "Lâmpada LED Bulbo",
      categoria: "eletrica",
      resumo: "Luz branca, economia de até 85%.",
      descricao:
        "Lâmpada LED bulbo com rosca E27 e luz branca fria de 6.500 K. Bivolt e com 25.000 horas de vida útil.",
      preco: 990,
      custo: 400,
      ilustracao: "lampada",
      cor: "#FFF3B0",
      fundo: CHUMBO,
      especificacoes: { bivolt: true, "vida-util": 25000 },
      eixos: [
        {
          chave: "potencia",
          nome: "Potência",
          opcoes: [
            { chave: "9w", nome: "9 W", preco: 990 },
            { chave: "12w", nome: "12 W", preco: 1290 },
            { chave: "15w", nome: "15 W", preco: 1690 },
          ],
        },
      ],
      estoque: estoqueVariado("15w"),
      feed: false,
    },
    {
      chave: "extensao-3-tomadas",
      nome: "Extensão com 3 Tomadas 5 m",
      categoria: "eletrica",
      resumo: "Cabo de 5 metros, padrão novo.",
      descricao:
        "Extensão elétrica com cabo de 5 m e régua de três tomadas no padrão brasileiro. Suporta até 10 A.",
      preco: 3490,
      custo: 1600,
      ilustracao: "carregador",
      cor: BRANCO,
      fundo: LARANJA_OBRA,
      especificacoes: { bivolt: true },
    },
    {
      chave: "tinta-acrilica-premium",
      nome: "Tinta Acrílica Premium",
      categoria: "tintas",
      resumo: "Fosca, lavável, para interno e externo.",
      descricao:
        "Tinta acrílica premium de acabamento fosco, lavável e com alta cobertura. Rende até 380 m² por demão na lata de 18 L.",
      preco: 4990,
      custo: 2600,
      destaque: true,
      ilustracao: "lata-tinta",
      cor: "#F1FAEE",
      fundo: LARANJA_OBRA,
      especificacoes: {
        acabamento: "Fosco",
        superficie: "Parede",
        rendimento: 40,
      },
      eixos: [
        {
          chave: "cor",
          nome: "Cor",
          opcoes: [
            { chave: "branco-neve", nome: "Branco neve", cor: "#F8F9FA" },
            { chave: "areia", nome: "Areia", cor: "#E9D8A6" },
            { chave: "azul-ceu", nome: "Azul céu", cor: "#90E0EF" },
          ],
        },
        {
          chave: "lata",
          nome: "Lata",
          opcoes: [
            { chave: "900ml", nome: "900 ml", preco: 4990 },
            { chave: "3-6l", nome: "3,6 L", preco: 15990 },
          ],
        },
      ],
      estoque: estoqueVariado("azul-ceu/3-6l"),
      video: true,
    },
    {
      chave: "esmalte-sintetico",
      nome: "Esmalte Sintético Brilhante",
      categoria: "tintas",
      resumo: "Para portões, grades e madeira.",
      descricao:
        "Esmalte sintético de alto brilho que protege metal e madeira da maresia. Secagem ao toque em 4 horas.",
      preco: 3990,
      custo: 2100,
      ilustracao: "lata-tinta",
      cor: "#D00000",
      fundo: "#F1FAEE",
      especificacoes: {
        acabamento: "Brilhante",
        superficie: "Madeira e metal",
        rendimento: 12,
      },
      eixos: [
        {
          chave: "cor",
          nome: "Cor",
          opcoes: [
            { chave: "vermelho", nome: "Vermelho", cor: "#D00000" },
            { chave: "preto", nome: "Preto", cor: PRETO },
            { chave: "verde", nome: "Verde", cor: "#2D6A4F" },
          ],
        },
        {
          chave: "lata",
          nome: "Lata",
          opcoes: [
            { chave: "900ml", nome: "900 ml", preco: 3990 },
            { chave: "3-6l", nome: "3,6 L", preco: 12990 },
          ],
        },
      ],
      estoque: estoqueVariado("verde/900ml"),
    },
    {
      chave: "parafusos-com-bucha",
      nome: "Kit Parafusos com Bucha 6 mm",
      categoria: "fixacao",
      resumo: "50 parafusos e 50 buchas.",
      descricao:
        "Kit com 50 parafusos de aço zincado e 50 buchas de nylon de 6 mm. Para fixar prateleiras, quadros e suportes.",
      preco: 1590,
      promo: 1290,
      custo: 600,
      ilustracao: "parafuso",
      cor: "#ADB5BD",
      fundo: CHUMBO,
      especificacoes: { material: "Aço zincado e nylon", quantidade: 100 },
    },
    {
      chave: "pregos-17x27",
      nome: "Pregos 17×27 com Cabeça 1 kg",
      categoria: "fixacao",
      resumo: "Para caixaria e madeira.",
      descricao:
        "Pacote de 1 kg de pregos de aço polido com cabeça, bitola 17×27. Para formas de concreto e marcenaria.",
      preco: 1890,
      custo: 950,
      ilustracao: "parafuso",
      cor: "#6C757D",
      fundo: "#FFB703",
      especificacoes: { material: "Aço polido", quantidade: 380 },
    },
    {
      chave: "torneira-de-jardim",
      nome: "Torneira de Jardim",
      categoria: "hidraulica",
      resumo: "Metal cromado com bico para mangueira.",
      descricao:
        "Torneira de parede em metal cromado com bico para mangueira. Rosca de 1/2 polegada.",
      preco: 3290,
      custo: 1600,
      ilustracao: "frasco",
      cor: "#ADB5BD",
      fundo: "#48CAE4",
      especificacoes: { bitola: "1/2 polegada" },
    },
    {
      chave: "registro-de-gaveta",
      nome: "Registro de Gaveta",
      categoria: "hidraulica",
      resumo: "Bronze, para entrada de água.",
      descricao:
        "Registro de gaveta em bronze com acabamento bruto para instalação embutida. Soldável em cano de PVC com adaptador.",
      preco: 5490,
      custo: 2900,
      ilustracao: "parafuso",
      cor: "#B08D57",
      fundo: "#F1FAEE",
      especificacoes: { bitola: "3/4 polegada" },
    },
    {
      chave: "cano-pvc-soldavel",
      nome: "Cano PVC Soldável 6 m",
      categoria: "hidraulica",
      resumo: "Barra de 6 metros para água fria.",
      descricao:
        "Barra de cano PVC soldável de 6 m para água fria. Entregamos no caminhão sem custo extra acima do frete grátis.",
      preco: 2490,
      custo: 1300,
      ilustracao: "parafuso",
      cor: "#F1FAEE",
      fundo: "#2A9D8F",
      especificacoes: { bitola: "25 mm" },
      eixos: [
        {
          chave: "bitola",
          nome: "Bitola",
          opcoes: [
            { chave: "20mm", nome: "20 mm", preco: 1890 },
            { chave: "25mm", nome: "25 mm", preco: 2490 },
            { chave: "32mm", nome: "32 mm", preco: 3990 },
          ],
        },
      ],
      estoque: estoqueVariado("32mm"),
    },
  ],
};

// ---------------------------------------------------------------------------
// 21. Bazar Casa & Cia — variedades
// ---------------------------------------------------------------------------

const TERRACOTA = "#C8553D";
const SALVIA = "#8AA899";

const VARIEDADES: LojaDemo = {
  chave: "variedades",
  nova: {
    apelido: "bazar-casa-e-cia",
    nome: "Bazar Casa & Cia",
    ramo: "RETAIL_GENERIC",
    dono: { nome: "Marta Sampaio", email: "marta@bazar-casa-e-cia.test" },
  },
  coordenadas: { lat: -3.719, lng: -38.542 },
  destaque: "#F72585",
  pasta: "bazar-casa-e-cia",
  ehComida: false,
  iniciais: "BC",
  chamada: "Utilidades, presentes e festa num só lugar",
  primaria: TERRACOTA,
  secundaria: SALVIA,
  boasVindas: "Tem de tudo um pouco. Bora garimpar?",
  sobre:
    "O Bazar Casa & Cia é o bazar de bairro da Jacarecanga, com utilidades domésticas, artigos de cozinha, organização e presentes a preço justo. Também montamos kits de festa para aniversários.",
  whatsapp: "+5585991230021",
  telefone: "+5585991230021",
  email: "contato@bazar-casa-e-cia.test",
  endereco: enderecoEm({
    rua: "Avenida Francisco Sá",
    numero: "1430",
    bairro: "Jacarecanga",
    cep: "60010450",
  }),
  entrega: entrega({ taxa: 700, prazoMinutos: 120, gratisAcimaDe: 10000 }),
  pagamento: pagamento("+5585991230021", "Marta Sampaio"),
  checkout: CHECKOUT_PADRAO,
  horarios: [["00:00", "00:00"]],
  categorias: [
    {
      chave: "cozinha",
      nome: "Cozinha",
      descricao: "Canecas, potes e utensílios.",
      especificacoes: [
        {
          chave: "material",
          rotulo: "Material",
          tipo: "ENUM",
          opcoes: ["Cerâmica", "Vidro", "Plástico", "Inox", "Bambu"],
          filtravel: true,
        },
        {
          chave: "micro-ondas",
          rotulo: "Vai ao micro-ondas",
          tipo: "BOOLEAN",
          filtravel: true,
        },
        {
          chave: "capacidade",
          rotulo: "Capacidade",
          tipo: "NUMBER",
          unidade: "ml",
        },
      ],
    },
    {
      chave: "organizacao",
      nome: "Organização",
      descricao: "Cestos, caixas e organizadores.",
      especificacoes: [
        {
          chave: "material",
          rotulo: "Material",
          tipo: "ENUM",
          opcoes: ["Plástico", "Palha", "Tecido", "Bambu"],
          filtravel: true,
        },
      ],
    },
    {
      chave: "presentes",
      nome: "Presentes",
      descricao: "Mimos para toda ocasião.",
      especificacoes: [
        {
          chave: "embrulho",
          rotulo: "Vai embrulhado",
          tipo: "BOOLEAN",
          filtravel: true,
        },
      ],
    },
    {
      chave: "festa",
      nome: "Festa",
      descricao: "Balões, velas e descartáveis.",
      especificacoes: [
        {
          chave: "quantidade",
          rotulo: "Quantidade",
          tipo: "NUMBER",
          unidade: "unidades",
        },
        { chave: "tema", rotulo: "Tema", tipo: "TEXT" },
      ],
    },
  ],
  produtos: [
    {
      chave: "caneca-de-ceramica",
      nome: "Caneca de Cerâmica 350 ml",
      categoria: "cozinha",
      resumo: "Esmaltada, várias cores.",
      descricao:
        "Caneca de cerâmica esmaltada com 350 ml, pode ir ao micro-ondas e à lava-louças. Ótima para presentear.",
      preco: 2990,
      custo: 1200,
      destaque: true,
      ilustracao: "caneca",
      cor: TERRACOTA,
      fundo: "#F5EBE0",
      especificacoes: {
        material: "Cerâmica",
        "micro-ondas": true,
        capacidade: 350,
      },
      eixos: [
        {
          chave: "cor",
          nome: "Cor",
          opcoes: [
            { chave: "terracota", nome: "Terracota", cor: TERRACOTA },
            { chave: "salvia", nome: "Sálvia", cor: SALVIA },
            { chave: "creme", nome: "Creme", cor: "#F5EBE0" },
          ],
        },
      ],
      estoque: estoqueVariado("salvia"),
    },
    {
      chave: "jogo-de-potes-hermeticos",
      nome: "Jogo de Potes Herméticos 5 Peças",
      categoria: "cozinha",
      resumo: "Vidro com tampa de travas.",
      descricao:
        "Cinco potes de vidro com tampas de quatro travas e vedação de silicone. Vão ao micro-ondas sem a tampa.",
      preco: 8990,
      promo: 7490,
      custo: 4200,
      destaque: true,
      ilustracao: "pote",
      cor: "#CDEFF7",
      fundo: SALVIA,
      fotos: [{ selo: "5 tamanhos", fundo: TERRACOTA }],
      especificacoes: {
        material: "Vidro",
        "micro-ondas": true,
        capacidade: 1500,
      },
    },
    {
      chave: "pote-de-mantimentos",
      nome: "Pote para Mantimentos",
      categoria: "cozinha",
      resumo: "Para arroz, feijão e café.",
      descricao:
        "Pote plástico livre de BPA com tampa de rosca e etiqueta para escrever. Empilhável.",
      preco: 1490,
      custo: 600,
      ilustracao: "pote",
      cor: BRANCO,
      fundo: TERRACOTA,
      especificacoes: {
        material: "Plástico",
        "micro-ondas": false,
        capacidade: 2000,
      },
      eixos: [
        {
          chave: "capacidade",
          nome: "Capacidade",
          opcoes: [
            { chave: "1l", nome: "1 L", preco: 1490 },
            { chave: "2l", nome: "2 L", preco: 1990 },
            { chave: "3l", nome: "3 L", preco: 2490 },
          ],
        },
      ],
      estoque: estoqueVariado("3l"),
    },
    {
      chave: "garrafa-termica-1l",
      nome: "Garrafa Térmica 1 L",
      categoria: "cozinha",
      resumo: "Café quentinho por 12 horas.",
      descricao:
        "Garrafa térmica de inox com ampola de vidro e tampa de pressão. Mantém o café quente por até 12 horas.",
      preco: 6990,
      custo: 3500,
      ilustracao: "garrafa",
      cor: "#6C757D",
      fundo: "#F5EBE0",
      especificacoes: {
        material: "Inox",
        "micro-ondas": false,
        capacidade: 1000,
      },
      feed: false,
    },
    {
      chave: "cesto-organizador-palha",
      nome: "Cesto Organizador de Palha",
      categoria: "organizacao",
      resumo: "Trançado à mão, com alças.",
      descricao:
        "Cesto de palha de carnaúba trançado por artesãs do interior. Serve para revistas, brinquedos ou roupas de cama.",
      preco: 5990,
      custo: 2800,
      ilustracao: "cesta",
      cor: "#D4A373",
      fundo: SALVIA,
      especificacoes: { material: "Palha" },
      eixos: [
        {
          chave: "tamanho",
          nome: "Tamanho",
          opcoes: [
            { chave: "p", nome: "P", preco: 4590 },
            { chave: "m", nome: "M", preco: 5990 },
            { chave: "g", nome: "G", preco: 7990 },
          ],
        },
      ],
      estoque: estoqueVariado("g"),
    },
    {
      chave: "caixa-organizadora",
      nome: "Caixa Organizadora 20 L",
      categoria: "organizacao",
      resumo: "Transparente, com tampa e trava.",
      descricao:
        "Caixa plástica transparente de 20 L com tampa e travas laterais. Empilha bem em armários e embaixo da cama.",
      preco: 3490,
      custo: 1600,
      ilustracao: "caixa",
      cor: "#E9ECEF",
      fundo: TERRACOTA,
      especificacoes: { material: "Plástico" },
    },
    {
      chave: "kit-presente-caneca-e-cafe",
      nome: "Kit Presente Caneca e Café",
      categoria: "presentes",
      resumo: "Caneca, café da serra e cartão.",
      descricao:
        "Caixa de presente com caneca de cerâmica, café torrado da serra de Guaramiranga e cartão para escrever. Vai embrulhado.",
      preco: 6990,
      custo: 3400,
      ilustracao: "caneca",
      cor: "#6F4E37",
      fundo: "#FFE5D9",
      especificacoes: { embrulho: true },
    },
    {
      chave: "vela-aromatica",
      nome: "Vela Aromática no Pote",
      categoria: "presentes",
      resumo: "Cera vegetal, 30 horas de queima.",
      descricao:
        "Vela de cera de soja em pote de vidro com tampa, aroma de capim-santo. Queima limpa por até 30 horas.",
      preco: 3990,
      promo: 3290,
      custo: 1800,
      ilustracao: "pote",
      cor: "#FFE5D9",
      fundo: SALVIA,
      especificacoes: { embrulho: false },
    },
    {
      chave: "porta-retrato",
      nome: "Porta-retrato de Madeira",
      categoria: "presentes",
      resumo: "Para fotos 10×15.",
      descricao:
        "Porta-retrato de madeira de reflorestamento com vidro, para fotos 10×15.",
      preco: 2990,
      custo: 1300,
      rascunho: true,
      ilustracao: "caixa",
      cor: "#A98467",
      fundo: "#F5EBE0",
      especificacoes: { embrulho: true },
    },
    {
      chave: "baloes-coloridos",
      nome: "Balões Coloridos nº 9",
      categoria: "festa",
      resumo: "Pacote com 50 unidades.",
      descricao:
        "Pacote com 50 balões de látex nº 9 em cores sortidas ou lisas. Para arcos, painéis e decoração de mesa.",
      preco: 1490,
      custo: 600,
      ilustracao: "bola",
      cor: "#F72585",
      fundo: "#FFF3B0",
      especificacoes: { quantidade: 50, tema: "Colorido" },
      eixos: [
        {
          chave: "cor",
          nome: "Cor",
          opcoes: [
            { chave: "sortido", nome: "Sortido" },
            { chave: "rosa", nome: "Rosa", cor: "#F72585" },
            { chave: "azul", nome: "Azul", cor: "#4361EE" },
          ],
        },
      ],
      estoque: estoqueVariado("azul"),
    },
    {
      chave: "kit-festa-descartaveis",
      nome: "Kit Festa Descartáveis 20 Pessoas",
      categoria: "festa",
      resumo: "Pratos, copos, garfos e guardanapos.",
      descricao:
        "Kit com pratos, copos, garfos e guardanapos para 20 pessoas, em papel e plástico reciclável. Cores combinando.",
      preco: 3990,
      custo: 1900,
      ilustracao: "copo",
      cor: "#4CC9F0",
      fundo: "#F72585",
      especificacoes: { quantidade: 80, tema: "Liso colorido" },
    },
  ],
};

// ---------------------------------------------------------------------------
// 22. Moto Peças Fortal — autopeças (moto)
// ---------------------------------------------------------------------------

const VERMELHO_MOTO = "#C1121F";
const ASFALTO = "#212529";

const AUTOPECAS: LojaDemo = {
  chave: "autopecas",
  nova: {
    apelido: "moto-pecas-fortal",
    nome: "Moto Peças Fortal",
    ramo: "AUTO_PARTS",
    dono: {
      nome: "Wellington Pinheiro",
      email: "wellington@moto-pecas-fortal.test",
    },
  },
  coordenadas: { lat: -3.772, lng: -38.605 },
  destaque: "#FFD000",
  capa: true,
  diasFechados: [0],
  pasta: "moto-pecas-fortal",
  ehComida: false,
  iniciais: "MF",
  chamada: "Peças para sua moto, entrega no mesmo dia",
  primaria: VERMELHO_MOTO,
  secundaria: ASFALTO,
  boasVindas: "Moto parada é prejuízo. A gente resolve rápido.",
  sobre:
    "A Moto Peças Fortal atende motoboys e motociclistas do Conjunto Ceará desde 2012. Peças, óleo e acessórios para as motos mais comuns da cidade, com oficina parceira ao lado para a instalação.",
  whatsapp: "+5585991230022",
  telefone: "+5585991230022",
  email: "contato@moto-pecas-fortal.test",
  endereco: enderecoEm({
    rua: "Avenida H",
    numero: "455",
    bairro: "Conjunto Ceará",
    cep: "60530110",
  }),
  entrega: entrega({ taxa: 1000, prazoMinutos: 120, gratisAcimaDe: 20000 }),
  pagamento: pagamento("+5585991230022", "Wellington Pinheiro"),
  checkout: CHECKOUT_PADRAO,
  horarios: [
    ["07:30", "12:00"],
    ["13:00", "18:00"],
  ],
  categorias: [
    {
      chave: "oleos",
      nome: "Óleos e Fluidos",
      descricao: "Lubrificantes para motor e corrente.",
      especificacoes: [
        {
          chave: "aplicacao",
          rotulo: "Aplicação",
          tipo: "TEXT",
          filtravel: true,
        },
        {
          chave: "tipo",
          rotulo: "Tipo",
          tipo: "ENUM",
          opcoes: ["Mineral", "Semissintético", "Sintético"],
          filtravel: true,
        },
        { chave: "codigo", rotulo: "Código", tipo: "TEXT" },
      ],
    },
    {
      chave: "pneus",
      nome: "Pneus e Câmaras",
      descricao: "Dianteiros e traseiros.",
      especificacoes: [
        {
          chave: "aplicacao",
          rotulo: "Aplicação",
          tipo: "TEXT",
          filtravel: true,
        },
        {
          chave: "posicao",
          rotulo: "Posição",
          tipo: "ENUM",
          opcoes: ["Dianteiro", "Traseiro"],
          filtravel: true,
        },
        { chave: "codigo", rotulo: "Código", tipo: "TEXT" },
      ],
    },
    {
      chave: "capacetes",
      nome: "Capacetes",
      descricao: "Segurança certificada.",
      especificacoes: [
        {
          chave: "modelo",
          rotulo: "Modelo",
          tipo: "ENUM",
          opcoes: ["Fechado", "Aberto", "Escamoteável"],
          filtravel: true,
        },
        {
          chave: "viseira-fume",
          rotulo: "Viseira fumê inclusa",
          tipo: "BOOLEAN",
          filtravel: true,
        },
      ],
    },
    {
      chave: "eletrica",
      nome: "Elétrica",
      descricao: "Baterias, lâmpadas e chicotes.",
      especificacoes: [
        {
          chave: "aplicacao",
          rotulo: "Aplicação",
          tipo: "TEXT",
          filtravel: true,
        },
        {
          chave: "amperagem",
          rotulo: "Amperagem",
          tipo: "NUMBER",
          unidade: "Ah",
        },
        { chave: "codigo", rotulo: "Código", tipo: "TEXT" },
      ],
    },
    {
      chave: "pecas",
      nome: "Peças e Acessórios",
      descricao: "Transmissão, retrovisores e mais.",
      especificacoes: [
        {
          chave: "aplicacao",
          rotulo: "Aplicação",
          tipo: "TEXT",
          filtravel: true,
        },
        { chave: "codigo", rotulo: "Código", tipo: "TEXT" },
      ],
    },
  ],
  produtos: [
    {
      chave: "oleo-4t-20w50",
      nome: "Óleo de Motor 4T 20W-50",
      categoria: "oleos",
      resumo: "Mineral, para motos de baixa cilindrada.",
      descricao:
        "Óleo mineral 20W-50 para motores quatro tempos com embreagem banhada. Proteção contra o calor do trânsito parado.",
      preco: 2990,
      custo: 1700,
      destaque: true,
      ilustracao: "galao-oleo",
      cor: "#FFB703",
      fundo: ASFALTO,
      especificacoes: {
        aplicacao: "Motos 4T de 125 a 300 cc",
        tipo: "Mineral",
        codigo: "OL-2050-M",
      },
      eixos: [
        {
          chave: "volume",
          nome: "Volume",
          opcoes: [{ chave: "1l", nome: "1 L" }],
        },
      ],
      estoque: estoqueVariado("nenhuma"),
    },
    {
      chave: "oleo-4t-10w30-sintetico",
      nome: "Óleo de Motor 4T 10W-30 Sintético",
      categoria: "oleos",
      resumo: "Sintético, para quem roda muito.",
      descricao:
        "Óleo sintético 10W-30 com maior intervalo de troca, indicado para quem trabalha com entregas. Menos desgaste na partida a frio.",
      preco: 4990,
      promo: 4290,
      custo: 2800,
      ilustracao: "galao-oleo",
      cor: "#3A86FF",
      fundo: "#E9ECEF",
      especificacoes: {
        aplicacao: "Motos 4T de 150 a 600 cc",
        tipo: "Sintético",
        codigo: "OL-1030-S",
      },
      eixos: [
        {
          chave: "volume",
          nome: "Volume",
          opcoes: [{ chave: "1l", nome: "1 L" }],
        },
      ],
      estoque: estoqueVariado("1l"),
    },
    {
      chave: "lubrificante-de-corrente",
      nome: "Lubrificante de Corrente Spray",
      categoria: "oleos",
      resumo: "Não respinga, resiste à chuva.",
      descricao:
        "Spray de 300 ml que penetra nos elos e forma uma película que não espirra na roda. Aplique a cada 500 km.",
      preco: 3490,
      custo: 1700,
      ilustracao: "frasco",
      cor: VERMELHO_MOTO,
      fundo: "#FFD000",
      especificacoes: {
        aplicacao: "Correntes com e sem retentor",
        tipo: "Sintético",
        codigo: "LC-300",
      },
      feed: false,
    },
    {
      chave: "pneu-traseiro-cidade",
      nome: "Pneu Traseiro Uso Urbano",
      categoria: "pneus",
      resumo: "Desenho para asfalto e chuva.",
      descricao:
        "Pneu traseiro com desenho urbano que escoa água e dura mais no asfalto quente. Escolha a medida da sua moto.",
      preco: 18990,
      custo: 11000,
      destaque: true,
      ilustracao: "pneu",
      cor: ASFALTO,
      fundo: "#FFD000",
      fotos: [
        { selo: "Montagem grátis na oficina parceira", fundo: VERMELHO_MOTO },
      ],
      especificacoes: {
        aplicacao: "Motos urbanas 125 a 160 cc",
        posicao: "Traseiro",
        codigo: "PN-T-URB",
      },
      eixos: [
        {
          chave: "medida",
          nome: "Medida",
          opcoes: [
            { chave: "90-90-18", nome: "90/90-18", preco: 18990 },
            { chave: "100-80-18", nome: "100/80-18", preco: 21990 },
            { chave: "110-90-17", nome: "110/90-17", preco: 24990 },
          ],
        },
      ],
      estoque: estoqueVariado("110-90-17"),
    },
    {
      chave: "pneu-dianteiro-cidade",
      nome: "Pneu Dianteiro Uso Urbano",
      categoria: "pneus",
      resumo: "Aderência nas curvas e na frenagem.",
      descricao:
        "Pneu dianteiro com sulcos laterais para frenagem segura no molhado. Para aro 17 e 18.",
      preco: 15990,
      custo: 9200,
      ilustracao: "pneu",
      cor: ASFALTO,
      fundo: "#E9ECEF",
      especificacoes: {
        aplicacao: "Motos urbanas 125 a 160 cc",
        posicao: "Dianteiro",
        codigo: "PN-D-URB",
      },
      eixos: [
        {
          chave: "medida",
          nome: "Medida",
          opcoes: [
            { chave: "2-75-18", nome: "2.75-18", preco: 15990 },
            { chave: "80-100-18", nome: "80/100-18", preco: 17490 },
          ],
        },
      ],
      estoque: estoqueVariado("80-100-18"),
    },
    {
      chave: "capacete-fechado",
      nome: "Capacete Fechado",
      categoria: "capacetes",
      resumo: "Certificado, com viseira fumê de brinde.",
      descricao:
        "Capacete fechado com casco de ABS, forro removível e lavável e certificação do Inmetro. Leva viseira cristal e uma fumê extra.",
      preco: 22990,
      promo: 19990,
      custo: 12500,
      destaque: true,
      ilustracao: "capacete",
      cor: PRETO,
      fundo: VERMELHO_MOTO,
      especificacoes: { modelo: "Fechado", "viseira-fume": true },
      eixos: [
        { chave: "tamanho", nome: "Tamanho", opcoes: NUMERACAO(56, 58, 60) },
        {
          chave: "cor",
          nome: "Cor",
          opcoes: [
            { chave: "preto", nome: "Preto fosco", cor: PRETO },
            { chave: "branco", nome: "Branco", cor: BRANCO },
            { chave: "vermelho", nome: "Vermelho", cor: VERMELHO_MOTO },
          ],
        },
      ],
      estoque: estoqueVariado("60/vermelho"),
    },
    {
      chave: "capacete-aberto",
      nome: "Capacete Aberto",
      categoria: "capacetes",
      resumo: "Leve e ventilado para o calor.",
      descricao:
        "Capacete aberto com viseira longa e forro antialérgico. Certificado pelo Inmetro e mais fresco para o dia a dia.",
      preco: 14990,
      custo: 8000,
      ilustracao: "capacete",
      cor: BRANCO,
      fundo: ASFALTO,
      especificacoes: { modelo: "Aberto", "viseira-fume": false },
      eixos: [
        { chave: "tamanho", nome: "Tamanho", opcoes: NUMERACAO(56, 58, 60) },
        {
          chave: "cor",
          nome: "Cor",
          opcoes: [
            { chave: "branco", nome: "Branco", cor: BRANCO },
            { chave: "preto", nome: "Preto", cor: PRETO },
          ],
        },
      ],
      estoque: estoqueVariado("56/preto"),
    },
    {
      chave: "bateria-5ah",
      nome: "Bateria Selada 12 V 5 Ah",
      categoria: "eletrica",
      resumo: "Selada, não precisa de água.",
      descricao:
        "Bateria selada de 12 V e 5 Ah, livre de manutenção. Sai carregada e pronta para instalar.",
      preco: 17990,
      custo: 10500,
      ilustracao: "bateria",
      cor: ASFALTO,
      fundo: "#FFD000",
      especificacoes: {
        aplicacao: "Motos 125 a 160 cc com partida elétrica",
        amperagem: 5,
        codigo: "BT-12-5",
      },
    },
    {
      chave: "lampada-farol-led",
      nome: "Lâmpada de Farol LED",
      categoria: "eletrica",
      resumo: "Luz branca mais forte que a halógena.",
      descricao:
        "Lâmpada LED para farol com encaixe H4, luz branca de 6.000 K e cooler embutido. Instalação plug and play.",
      preco: 5990,
      custo: 2600,
      ilustracao: "lampada",
      cor: "#F8F9FA",
      fundo: ASFALTO,
      especificacoes: {
        aplicacao: "Faróis com encaixe H4",
        codigo: "LP-H4-LED",
      },
    },
    {
      chave: "kit-relacao",
      nome: "Kit Relação",
      categoria: "pecas",
      resumo: "Coroa, pinhão e corrente com retentor.",
      descricao:
        "Kit de transmissão com coroa, pinhão e corrente reforçada com retentor. Dura até o dobro de uma corrente comum.",
      preco: 16990,
      custo: 9800,
      ilustracao: "parafuso",
      cor: "#ADB5BD",
      fundo: VERMELHO_MOTO,
      especificacoes: { aplicacao: "Motos 150 a 160 cc", codigo: "KR-150-RET" },
    },
    {
      chave: "par-de-retrovisores",
      nome: "Par de Retrovisores",
      categoria: "pecas",
      resumo: "Rosca universal 10 mm.",
      descricao:
        "Par de retrovisores com haste preta e rosca de 10 mm, que serve na maioria das motos urbanas. Lente plana sem distorção.",
      preco: 4990,
      custo: 2200,
      ilustracao: "oculos",
      cor: PRETO,
      fundo: "#E9ECEF",
      especificacoes: {
        aplicacao: "Motos com rosca de 10 mm",
        codigo: "RT-10-UNI",
      },
    },
    {
      chave: "manete-de-freio",
      nome: "Manete de Freio",
      categoria: "pecas",
      resumo: "Alumínio, reposição direta.",
      descricao:
        "Manete de freio dianteiro em alumínio fundido, encaixe original.",
      preco: 2490,
      custo: 1100,
      ilustracao: "parafuso",
      cor: "#ADB5BD",
      fundo: ASFALTO,
      especificacoes: {
        aplicacao: "Motos urbanas 125 a 160 cc",
        codigo: "MN-FR-D",
      },
    },
  ],
};

export const LOJAS_DE_VAREJO_B: readonly LojaDemo[] = [
  MODA_PRAIA,
  ELETRONICOS,
  LIVRARIA,
  BRINQUEDOS,
  CONSTRUCAO,
  VARIEDADES,
  AUTOPECAS,
];
