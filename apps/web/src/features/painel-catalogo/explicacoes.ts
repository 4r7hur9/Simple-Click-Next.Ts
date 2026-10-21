/**
 * Os textos do "i" dos campos do catálogo do painel (card #67).
 *
 * Ficam juntos para o inventário (docs/campos-explicados/catalogo.md) e a tela
 * dizerem a mesma coisa: quem muda um texto aqui muda lá também. Cada um tem 1
 * a 3 frases em português simples e, quando ajuda, um exemplo de loja real.
 */

export interface Explicacao {
  readonly texto: string;
  readonly exemplo?: string;
}

export const EXPLICACOES = {
  // Produto
  categoria: {
    texto:
      "A seção da vitrine onde o produto aparece. Os campos próprios da categoria (especificações) entram no fim deste formulário.",
    exemplo: "Pastéis, Pneus, Camisetas.",
  },
  precoDeVenda: {
    texto:
      "O preço normal de uma unidade, o que o cliente paga sem promoção nem atacado.",
    exemplo: "19,90.",
  },
  visibilidade: {
    texto:
      "Rascunho fica só no painel: ninguém vê na vitrine. Publicar põe o produto na vitrine da loja.",
    exemplo: "Deixe em rascunho enquanto falta a foto.",
  },
  disponivel: {
    texto:
      "Desmarcado, o produto continua na vitrine, mas aparece como esgotado e ninguém consegue pedir. Nada sai do cadastro.",
    exemplo: "Acabou o queijo hoje: desmarque e marque de novo amanhã.",
  },

  // Preço de atacado
  modalidadeDoAtacado: {
    texto:
      "Faixa única: um só desconto a partir de uma quantidade. Crescente: várias faixas, e quem leva mais paga menos por unidade.",
    exemplo: "Crescente: 10 un. com 5% e 50 un. com 10%.",
  },
  quantidadeDoAtacado: {
    texto:
      "A quantidade do mesmo produto no pedido para o desconto valer, de 2 em diante. Com essa quantidade ou mais, todas as unidades saem com desconto.",
    exemplo:
      "10: quem leva 10 pastéis ou mais paga o preço de atacado em todos.",
  },
  tipoDeDescontoDoAtacado: {
    texto:
      "Percentual (%) tira uma parte do preço. Em reais (R$) tira um valor fixo de cada unidade. O tipo é o mesmo em todas as faixas.",
    exemplo: "Sobre R$ 20,00: 10% dá R$ 18,00; R$ 2,50 dá R$ 17,50.",
  },
  descontoDoAtacado: {
    texto:
      "Quanto sai de cada unidade quando o pedido chega na quantidade. Em %, de 1 a 99. Em R$, menos que o preço de venda.",
    exemplo: "10 (%) ou 2,50 (R$).",
  },

  // Grupos de opções
  tipoDoGrupo: {
    texto:
      "Adicional: extras que o cliente soma ao item. Ingrediente: o que vai dentro do produto. Variação: muda o próprio produto e vira eixo da grade de variações.",
    exemplo:
      "Adicional: bacon. Ingrediente: recheio. Variação: tamanho P, M, G.",
  },
  minimoDoGrupo: {
    texto:
      "Quantas opções o cliente precisa marcar, no mínimo. 0 deixa o grupo opcional; 1 ou mais torna obrigatório: sem escolher, não dá para pedir.",
    exemplo: "Ponto da carne com mínimo 1.",
  },
  maximoDoGrupo: {
    texto:
      "Quantas opções o cliente pode marcar, no máximo. Vazio = sem limite.",
    exemplo: "Até 3 adicionais.",
  },
  permiteRepetir: {
    texto:
      "Deixa o cliente escolher a mesma opção mais de uma vez. Cada vez conta para o máximo e soma o acréscimo de novo.",
    exemplo: "2x bacon.",
  },
  eixoDeVariacao: {
    texto:
      "Cada opção deste grupo vira uma versão do produto, com preço, SKU e estoque próprios, cadastrados em Variações.",
    exemplo: "Tamanho: P, M e G, cada um com seu preço.",
  },
  acrescimoDaOpcao: {
    texto:
      "Quanto essa opção soma ao preço do produto. Deixe vazio se não muda o preço. Valor negativo vira desconto.",
    exemplo: "Borda recheada = 8,00.",
  },
  opcaoJaMarcada: {
    texto:
      "A opção aparece escolhida quando o cliente abre o produto. Ele pode desmarcar.",
    exemplo: "Molho da casa já marcado.",
  },
  codigoExterno: {
    texto:
      "O código desta opção em outro sistema (caixa, ERP, integração). Só serve para quem integra: pode deixar vazio.",
    exemplo: "ADIC-BACON.",
  },
  esgotarOpcao: {
    texto:
      "Esgotar deixa a opção à vista, mas o cliente não consegue escolher. Reativar devolve. Remover apaga a opção do grupo.",
    exemplo: "Acabou o catupiry: esgote até chegar mais.",
  },

  // Variações
  nomeDaVariacao: {
    texto:
      "Como esta versão aparece no painel, no estoque e no pedido. O cliente escolhe pelos campos dos eixos.",
    exemplo: "Camiseta azul M.",
  },
  sku: {
    texto:
      "SKU é o seu código de estoque para esta versão. Não pode repetir em outra variação da loja. Pode deixar vazio.",
    exemplo: "CAM-AZ-M.",
  },
  codigoDeBarras: {
    texto:
      "O número do código de barras da embalagem (EAN). Serve para achar o produto pelo leitor. Pode deixar vazio.",
    exemplo: "7891234567895.",
  },
  precoDaVariacao: {
    texto: "O preço desta versão. Ele vale no lugar do preço do produto.",
    exemplo: "Pizza G = 59,90.",
  },
  estoqueDaVariacao: {
    texto:
      "Quantas unidades você tem agora. Vazio = não controla estoque e nunca esgota sozinha. 0 = sem unidades: aparece esgotada.",
    exemplo: "12.",
  },
  alertaDeEstoque: {
    texto:
      "Quando sobrar este número de unidades ou menos, o painel marca como estoque baixo. Vazio = sem aviso.",
    exemplo: "5: com 5 ou menos, aparece o alerta.",
  },
  variacaoPadrao: {
    texto:
      "A versão que já vem escolhida quando o cliente abre o produto. Só uma fica como padrão.",
    exemplo: "Tamanho M.",
  },
  esgotarVariacao: {
    texto:
      "Esgotar deixa a versão à vista, mas ninguém consegue pedir. Reativar devolve. Remover apaga a variação.",
    exemplo: "Acabou o tamanho G.",
  },

  // Estoque
  novaQuantidade: {
    texto:
      "Quantas unidades você contou agora. O sistema calcula a diferença e guarda no histórico com o motivo.",
    exemplo: "Contou 12 na prateleira: digite 12.",
  },
  alertaDoProduto: {
    texto:
      "Quando sobrar este número de unidades ou menos, o produto aparece como estoque baixo. Vale para todas as variações dele.",
    exemplo: "5.",
  },

  // Preços nomeados
  tipoDePreco: {
    texto:
      "Promoção: preço menor, com o normal riscado. Atacado (preço fixo): preço por unidade a partir de uma quantidade; para desconto em % ou R$, use Preço de atacado. Clube e Base: preço reservado a um clube (a vitrine ainda não usa) e o preço normal.",
    exemplo: "Promoção de R$ 15,00 no pastel de R$ 19,90.",
  },
  nomeDoPreco: {
    texto: "Um nome curto para este preço, para você reconhecer na lista.",
    exemplo: "Promoção de sexta.",
  },
  quantidadeMinimaDoPreco: {
    texto:
      "O preço só vale quando o cliente leva esta quantidade ou mais. Para promoção comum, deixe 1.",
    exemplo: "Atacado a partir de 12 unidades.",
  },

  // Categorias
  categoriaVisivel: {
    texto:
      "Desmarcado, a categoria e os produtos dela ficam escondidos da vitrine, sem apagar nada.",
    exemplo: "Crie o Cardápio de Natal escondido e mostre em dezembro.",
  },

  // Especificações
  tipoDeValor: {
    texto:
      "Texto: escrita livre. Número: só algarismos. Lista de opções: escolhe de uma lista fixa. Sim ou não: tem ou não tem.",
    exemplo: "Aro (número), Cor (lista), Importado (sim ou não).",
  },
  unidadeDaEspecificacao: {
    texto: "Aparece depois do valor, no produto e no filtro da vitrine.",
    exemplo: "mm, kg, pol.",
  },
  especificacaoObrigatoria: {
    texto: "Os produtos desta categoria só salvam com este campo preenchido.",
    exemplo: "Aro obrigatório nos pneus.",
  },
  especificacaoFiltro: {
    texto:
      "O cliente pode filtrar os produtos da categoria por este campo, na vitrine.",
    exemplo: "Filtrar pneus pelo aro 14.",
  },

  // Fotos e vídeos
  textoAlternativo: {
    texto:
      "Uma frase curta do que a foto mostra. É lida para quem usa leitor de tela e aparece se a foto não carregar.",
    exemplo: "Pastel de queijo aberto, com o queijo derretendo.",
  },
  urlDaFoto: {
    texto:
      "Se a foto já está na internet, cole o link direto da imagem. Precisa começar com https://.",
    exemplo: "https://res.cloudinary.com/sua-loja/pastel.jpg",
  },
} as const satisfies Record<string, Explicacao>;
