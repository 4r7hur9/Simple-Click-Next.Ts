/**
 * Os textos do "i" das telas de configuração, aparência, equipe, feed,
 * stories, comentários e métricas do painel (card #68).
 *
 * UM LUGAR SÓ PARA OS TEXTOS: a tela importa a explicação pelo nome do campo,
 * e o inventário em docs/campos-explicados/painel-config.md repete o mesmo
 * texto. Cada explicação diz o que é, quando usar e o que acontece, em até
 * três frases curtas, com um exemplo do dia a dia de uma loja.
 *
 * O formato é o `ConteudoDoInfo` de `@simpleclick/ui` (`{ texto, exemplo }`).
 */
import { COR_DE_DESTAQUE_PADRAO_DA_LOJA } from "@simpleclick/ui";

export interface Explicacao {
  readonly texto: string;
  readonly exemplo?: string;
}

export const EXPLICACOES = {
  // --- Horário ------------------------------------------------------------
  fecharAgora: {
    texto:
      "Liga uma pausa: a vitrine mostra a loja fechada e ninguém consegue pedir. A grade da semana não muda. Desligue para voltar a receber pedidos.",
    exemplo: "acabou o gás ou a cozinha lotou numa sexta à noite.",
  },
  gradeDaSemana: {
    texto:
      "Os horários em que a loja recebe pedidos, no relógio da sua cidade (o fuso da loja). Cada dia pode ter até 4 faixas. Dia sem faixa fica fechado.",
    exemplo: "terça de 11:00 às 14:00 e de 18:00 às 23:00 (duas faixas).",
  },
  faixaDeHorario: {
    texto:
      "Uma faixa é um intervalo seguido aberto. O fechamento vem depois da abertura; se passar da meia-noite, cadastre a madrugada no dia seguinte.",
    exemplo: "sexta 18:00 às 23:59 e sábado 00:00 às 02:00.",
  },
  datasEspeciais: {
    texto:
      "Um dia que foge da grade: feriado, férias ou um horário diferente. Vale só naquela data e depois a grade volta sozinha.",
    exemplo: "25/12 fechada o dia todo, ou 24/12 das 10:00 às 14:00.",
  },
  motivoDaData: {
    texto:
      "Uma frase curta que o cliente lê na vitrine naquele dia. Pode ficar em branco.",
    exemplo: "Feriado de Natal.",
  },

  // --- Entrega ------------------------------------------------------------
  modosDeRecebimento: {
    texto:
      "Como o cliente recebe o pedido. Marque pelo menos um: sem nenhum, o cliente não consegue finalizar a compra.",
    exemplo: "pizzaria com motoboy marca Entrega e Retirada no local.",
  },
  taxaCentavos: {
    texto:
      "Quanto o cliente paga pela entrega, em reais. A taxa entra no total do pedido, na linha com o nome que você der em “Nome da taxa”.",
    exemplo: "8,00.",
  },
  gratisAcimaDeCentavos: {
    texto:
      "A partir deste valor de pedido a entrega sai de graça. Vazio: a taxa vale para qualquer valor.",
    exemplo: "60,00 — pedido de R$ 65,00 não paga taxa.",
  },
  minimoParaEntregaCentavos: {
    texto:
      "Menor valor de pedido aceito para entrega, sem contar a taxa. Vazio: sem mínimo.",
    exemplo: "25,00.",
  },
  minimoParaRetiradaCentavos: {
    texto:
      "Menor valor de pedido aceito para retirada no local. Vazio: sem mínimo.",
    exemplo: "10,00.",
  },
  nomeDaTaxa: {
    texto:
      "O nome da linha da taxa no resumo do pedido do cliente.",
    exemplo: "Motoboy, Frete ou Taxa de entrega.",
  },
  prazoMinutos: {
    texto:
      "Quanto tempo, em minutos, o pedido costuma levar até chegar ao cliente. Aparece na página Sobre da loja como estimativa. Vazio: a loja não mostra prazo.",
    exemplo: "40 aparece como “Chega em cerca de 40 min”.",
  },

  // --- Pagamento ----------------------------------------------------------
  formasDePagamento: {
    texto:
      "As formas que o cliente pode escolher ao finalizar o pedido, na ordem desta lista. O cliente paga direto para a loja.",
    exemplo: "Pix e Dinheiro para quem só aceita na hora da entrega.",
  },
  tipoDaChavePix: {
    texto:
      "Que tipo de chave Pix a loja cadastrou no banco. O campo da chave mostra o formato certo para o tipo escolhido.",
    exemplo: "Celular, se a chave é o número (85) 91234-5678.",
  },
  chavePix: {
    texto:
      "A chave que o cliente copia para pagar. Digite igual está no app do banco.",
    exemplo: "123.456.789-09 para chave CPF.",
  },
  titularPix: {
    texto:
      "O nome que o banco mostra para quem vai pagar. O cliente confere antes de confirmar o Pix.",
    exemplo: "Maria Souza Lanches ME.",
  },

  // --- Contato ------------------------------------------------------------
  whatsappDaLoja: {
    texto:
      "O número que recebe a mensagem de cada pedido. Pode digitar com DDD, com ou sem máscara.",
    exemplo: "(85) 91234-5678.",
  },
  saudacao: {
    texto:
      "O texto que abre a mensagem do pedido no WhatsApp. O resto (itens, total, entrega) o sistema escreve sozinho.",
    exemplo: "Olá! Segue meu pedido:",
  },

  // --- Impressão ----------------------------------------------------------
  larguraDoPapel: {
    texto:
      "A largura do rolo da sua impressora térmica. Olhe na caixa do papel ou na etiqueta da impressora. 58 mm cabe 32 letras por linha; 80 mm cabe 48.",
    exemplo: "a maioria das impressoras de balcão usa 80 mm.",
  },
  conteudoOpcional: {
    texto:
      "O que mais sai no cupom além do número, itens e total, que saem sempre.",
    exemplo: "desligue o endereço se a loja só faz retirada.",
  },
  impressaoAutomatica: {
    texto:
      "Ligada, o cupom sai sozinho quando o pedido entra, pelo agente de impressão. Desligada, você imprime cada cupom pelo botão do pedido.",
    exemplo: "ligue se tem um computador da loja sempre ligado na impressora.",
  },
  agenteDeImpressao: {
    texto:
      "Um programa instalado no computador ligado à impressora. Ele busca os pedidos novos e imprime sem ninguém clicar. Uma loja tem um agente por vez.",
  },
  codigoDePareamento: {
    texto:
      "Seis números que ligam o agente à sua loja. Valem por poucos minutos e servem uma vez; gerar outro cancela o anterior.",
    exemplo: "482913.",
  },

  // --- Aparência ----------------------------------------------------------
  corDeDestaque: {
    texto:
      "A cor de botões, títulos e selos da sua loja. O fundo é sempre preto, então escolha uma cor que se leia bem sobre ele.",
    exemplo: "o vermelho do logo da sua pizzaria.",
  },
  codigoDaCor: {
    texto:
      "A cor em código hexadecimal: # e seis letras ou números. Cole aqui o código da sua marca.",
    exemplo: `${COR_DE_DESTAQUE_PADRAO_DA_LOJA.toUpperCase()}, o verde SimpleClick.`,
  },
  fotoDeFundo: {
    texto:
      "A foto larga no alto da página da loja (capa). Sem ela, vale a capa padrão do seu tipo de negócio.",
    exemplo: "a fachada da loja ou o prato mais pedido.",
  },
  fotoDoTopo: {
    texto:
      "A foto no alto da página de produtos. Sem ela, vale a foto de fundo da vitrine.",
  },
  seloDeStatus: {
    texto:
      "A cor da pílula “Aberto/Fechado” que fica sobre a capa. Automático escolhe claro ou escuro conforme a sua foto; Claro e Escuro fixam a cor.",
    exemplo: "capa muito clara fica melhor com o selo Escuro.",
  },
  descricaoCurta: {
    texto:
      "Uma frase de boas-vindas que aparece embaixo do nome, na página da loja. Até 280 letras.",
    exemplo: "Pastel frito na hora desde 1998.",
  },
  sobreONegocio: {
    texto:
      "O texto da página Sobre: história, diferenciais, redes sociais. Até 2.000 letras.",
  },
  logo: {
    texto:
      "A foto de perfil da loja: aparece na bolinha dos stories e no topo dos posts em Explorar. Quadrada fica melhor.",
  },

  // --- Equipe -------------------------------------------------------------
  limiteDaEquipe: {
    texto:
      "Quantas pessoas da equipe o seu plano permite. O dono não conta. No limite, fale com o suporte para aumentar.",
  },
  papelDaEquipe: {
    texto:
      "Dono é quem criou a loja e mexe em tudo. Equipe atende pedidos e cuida do catálogo, sem ver configurações, aparência, feed nem a própria equipe.",
  },
  senhaInicial: {
    texto:
      "Você define a senha e passa para a pessoa. Ela entra com o e-mail e esta senha. Pelo menos 8 caracteres.",
  },

  // --- Feed ---------------------------------------------------------------
  aparecerNoFeed: {
    texto:
      "Explorar é o feed onde clientes de todo o SimpleClick descobrem lojas. Ligado, a loja e os produtos marcados aparecem lá. A vitrine funciona de qualquer jeito.",
  },
  publicarProdutosNovos: {
    texto:
      "Ligado, todo produto que você cadastrar a partir de agora já vem com “Publicar no feed” marcado. Os produtos antigos não mudam.",
  },

  // --- Stories ------------------------------------------------------------
  arquivoDoStory: {
    texto:
      "A foto ou o vídeo do story, de preferência em pé (9:16). Fica no ar por 24 horas e depois some, com o arquivo apagado.",
    exemplo: "a fornada que acabou de sair.",
  },
  legendaDoStory: {
    texto: "Um texto curto que aparece por cima do story. É opcional.",
    exemplo: "Saiu fornada nova!",
  },
  botaoVerLoja: {
    texto:
      "Mostra no story um botão que leva o cliente direto para a página da sua loja.",
  },

  // --- Comentários --------------------------------------------------------
  aprovarAutomaticamente: {
    texto:
      "Ligado, todo comentário novo aparece na hora para os clientes. Desligado, ele espera na aba Pendentes até você aprovar.",
    exemplo: "deixe desligado se quiser ler tudo antes de publicar.",
  },
  motivoDaRecusa: {
    texto:
      "Anote por que recusou. Só a loja vê; o cliente não recebe aviso.",
    exemplo: "propaganda de outra loja.",
  },

  // --- Métricas -----------------------------------------------------------
  periodo: {
    texto:
      "De que dias são os números. Hoje vai da meia-noite até agora; 7 dias inclui hoje e os 6 anteriores. Comparar põe ao lado o mesmo número de dias logo antes.",
  },
  vendas: {
    texto:
      "A soma dos pedidos aceitos no período: os concluídos e os que ainda estão em andamento. Pedido cancelado ou ainda não aceito não entra.",
  },
  pedidos: {
    texto:
      "Quantos pedidos contam como venda no período: aceitos, concluídos ou em andamento.",
  },
  ticketMedio: {
    texto:
      "Quanto cada pedido vale em média: vendas divididas pelo número de pedidos.",
    exemplo: "R$ 600,00 em 20 pedidos dá ticket médio de R$ 30,00.",
  },
  itensVendidos: {
    texto:
      "Quantas unidades de produto saíram nos pedidos vendidos. Dois pastéis no mesmo pedido contam 2.",
  },
  clientesNovos: {
    texto: "Clientes que fizeram a primeira compra na loja neste período.",
  },
  clientesRecorrentes: {
    texto: "Clientes que compraram no período e já tinham comprado antes.",
  },
  cancelamentos: {
    texto:
      "Pedidos cancelados no período. O valor deles fica fora das vendas. Aqui, número menor é melhor.",
  },
  emAberto: {
    texto:
      "Pedidos que chegaram e esperam você aceitar. Ainda não contam como venda.",
  },
} as const satisfies Record<string, Explicacao>;

export type NomeDaExplicacao = keyof typeof EXPLICACOES;
