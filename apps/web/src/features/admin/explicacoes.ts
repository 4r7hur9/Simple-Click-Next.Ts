/**
 * Os textos do "i" da administração (Campos explicados, card #71).
 *
 * Moram juntos para ficarem iguais onde o mesmo campo aparece duas vezes (o
 * CPF/CNPJ no cadastro e na ficha, por exemplo) e para o inventário em
 * `docs/campos-explicados/admin.md` ter um lugar só para conferir.
 */

import type { RecursoLimitadoDaLoja } from "@simpleclick/contracts";
import type { ConteudoDoInfo } from "@simpleclick/ui";

export const INFO_DO_DOCUMENTO: ConteudoDoInfo = {
  texto:
    "O CPF (pessoa física) ou o CNPJ (empresa) de quem responde pela loja. Os dígitos são conferidos antes de salvar.",
  exemplo: "11.222.333/0001-81.",
};

export const INFO_DO_TIPO_DE_NEGOCIO: ConteudoDoInfo = {
  texto:
    "O ramo da loja. Ele decide o vocabulário das telas (cardápio ou catálogo), se a loja controla estoque e a capa padrão. Dá para trocar depois na ficha.",
  exemplo: "Pastelaria, Mercadinho, Autopeças.",
};

export const INFO_DO_APELIDO: ConteudoDoInfo = {
  texto:
    "É o fim do link da vitrine, o que o lojista divulga. Precisa ser único: se já existir, a tela sugere um livre.",
  exemplo: "pastel-da-joi vira simpleclick.app/loja/pastel-da-joi.",
};

export const INFO_DO_NOVO_APELIDO: ConteudoDoInfo = {
  texto:
    "Troca o fim do link da vitrine. Quem abrir o link antigo é levado ao novo, então nada que o lojista já divulgou quebra.",
};

export const INFO_DO_NOVO_TIPO: ConteudoDoInfo = {
  texto:
    "Trocar o ramo muda o vocabulário das telas, a capa padrão e se a loja controla estoque. Produtos e pedidos continuam. Antes de confirmar, a tela mostra o que muda.",
  exemplo: "de Lanchonete para Pastelaria.",
};

export const INFO_DA_RECUSA: ConteudoDoInfo = {
  texto:
    "O dono lê este texto no painel, na tela de cadastro em análise. Diga o que falta para a loja ser aprovada.",
  exemplo: "envie o comprovante de endereço da loja.",
};

export const INFO_DA_DESATIVACAO: ConteudoDoInfo = {
  texto:
    "Desativar tira a vitrine e o feed do ar na hora, sem apagar nada. Ativar de novo devolve a loja como estava.",
};

export const INFO_DA_EXCLUSAO: ConteudoDoInfo = {
  texto:
    "Excluir tira a loja do ar e das listas na hora. Os dados ficam guardados por 30 dias e dá para restaurar; depois disso, a remoção é definitiva e não volta.",
};

export const INFO_DO_TIPO_DE_DOCUMENTO: ConteudoDoInfo = {
  texto:
    "Contrato assinado: o termo fechado com o SimpleClick. Documento do responsável: RG ou CNH de quem responde pela loja. Comprovante de endereço: conta de luz, água ou parecida.",
};

export const INFO_DO_MOTIVO_DA_FUNCIONALIDADE: ConteudoDoInfo = {
  texto:
    "Desligar tira a área do menu do dono e bloqueia as telas dela. Nada é apagado: religar devolve tudo como estava.",
};

export const INFO_DO_LIMITE_DE_LOJAS: ConteudoDoInfo = {
  texto:
    "Quantas lojas este dono pode ter ao mesmo tempo, contando as que esperam aprovação. Vale só para esta conta.",
  exemplo: "3 para uma rede com três unidades.",
};

export const INFO_DO_TIPO_DE_ATO: ConteudoDoInfo = {
  texto:
    "Cada mudança feita pela administração, pelo dono ou pela equipe vira um ato, com quem fez, quando e o valor de antes e de depois.",
  exemplo: "Limites da loja alterados: máximo de produtos 500 → 800.",
};

export const INFO_DOS_TOTAIS_DA_LISTA: ConteudoDoInfo = {
  texto:
    "Pedidos (total): todos os pedidos da loja desde o cadastro, menos os cancelados. Faturamento total: a soma, em reais, dos pedidos que contam como venda, também desde o cadastro.",
};

export const INFO_DO_LIMITE: Readonly<
  Record<RecursoLimitadoDaLoja, ConteudoDoInfo>
> = {
  staff: {
    texto:
      "Quantas pessoas da equipe, fora o dono, podem ter acesso ao painel desta loja. No máximo, o painel não deixa adicionar mais ninguém.",
    exemplo: "3 = o dono e mais três atendentes.",
  },
  produtos: {
    texto:
      "Quantos produtos a loja pode ter cadastrados, à venda ou não. Tamanhos e sabores de um mesmo produto não contam como produto novo.",
    exemplo: "500 produtos num mercadinho.",
  },
  categorias: {
    texto: "Quantas categorias do cardápio ou do catálogo a loja pode criar.",
    exemplo: "30 categorias, como Pastéis, Bebidas e Sobremesas.",
  },
  clientes: {
    texto:
      "Quantos clientes a loja pode ter na base, somando os que compraram, os cadastrados à mão e os importados de arquivo.",
    exemplo: "2.000 clientes.",
  },
};

/** Os números da ficha da loja (aba Resumo). */
export const INFO_DOS_NUMEROS_DA_LOJA = {
  faturamentoTotal: {
    texto:
      "Soma, em reais, dos pedidos que contam como venda desde o cadastro da loja. Cancelados ficam de fora.",
  },
  pedidos: {
    texto:
      "Todos os pedidos que a loja recebeu desde o cadastro, menos os cancelados. Pedido ainda não aceito entra aqui, mas não nas vendas.",
  },
  clientes: {
    texto:
      "Clientes na base da loja: os que compraram, os cadastrados à mão e os importados de arquivo.",
  },
} as const satisfies Record<string, ConteudoDoInfo>;

/** Os cartões do dashboard da administração (`/admin`). */
export const INFO_DO_DASHBOARD = {
  lojasAtivas: {
    texto:
      "Lojas aprovadas e no ar no último dia do período. Não conta as pendentes, recusadas, desativadas nem excluídas.",
    exemplo: "18 lojas abertas para pedido em 30/09.",
  },
  novasLojas: {
    texto:
      "Lojas criadas dentro do período, em qualquer situação, inclusive as que ainda esperam aprovação.",
  },
  pendentes: {
    texto:
      "Lojas que o dono abriu e a administração ainda não aprovou nem recusou. É a fila de agora: não depende do período.",
  },
  pedidos: {
    texto:
      "Pedidos feitos no período que contam como venda, somando todas as lojas. Cancelados e recusados ficam de fora.",
  },
  faturamento: {
    texto:
      "Soma do valor dos pedidos do período que contam como venda, em todas as lojas. É o que as lojas venderam, não o que o SimpleClick recebe.",
    exemplo: "120 pedidos de R$ 50 = R$ 6.000.",
  },
  ticketMedio: {
    texto:
      "Valor médio de cada pedido: o faturamento do período dividido pelo número de pedidos.",
    exemplo: "R$ 6.000 em 120 pedidos = R$ 50.",
  },
  conversao: {
    texto:
      "Dos carrinhos abertos no período, quantos viraram pedido, em porcentagem. Sem carrinho no período, aparece —.",
    exemplo: "200 carrinhos e 50 pedidos = 25%.",
  },
  clientes: {
    texto:
      "Contas de cliente que existiam no último dia do período. Não conta donos, equipe nem a administração.",
  },
  donos: {
    texto:
      "Pessoas donas de pelo menos uma loja e com acesso ativo. Quem é dono de duas lojas conta uma vez.",
  },
  equipe: {
    texto:
      "Pessoas da equipe das lojas (não donas) com acesso ativo ao painel. Quem trabalha em duas lojas conta uma vez.",
  },
} as const satisfies Record<string, ConteudoDoInfo>;

// ---------------------------------------------------------------------------
// Pessoas (card #170, T-9)
// ---------------------------------------------------------------------------

export const INFO_DO_EMAIL_DA_PESSOA: ConteudoDoInfo = {
  texto:
    "É o e-mail com que a pessoa entra. Ele identifica a conta e não muda depois do cadastro. Se já houver uma conta com este e-mail, a tela abre a ficha dela em vez de criar outra.",
  exemplo: "marina@exemplo.com.br.",
};

export const INFO_DO_TELEFONE_DA_PESSOA: ConteudoDoInfo = {
  texto:
    "Telefone com DDD, para a administração falar com a pessoa. Só você e a administração veem este número; ele não aparece na lista nem entra na busca.",
  exemplo: "(11) 91111-0001.",
};

export const INFO_DO_MOTIVO_DO_ATO: ConteudoDoInfo = {
  texto:
    "Diga por que está fazendo isto. O motivo fica na auditoria da plataforma, com o seu nome e a data. Não escreva senha, link nem documento da pessoa.",
  exemplo: "pediu ajuda por telefone: não recebeu o e-mail de recuperação.",
};

export const INFO_DO_LINK_DE_ACESSO: ConteudoDoInfo = {
  texto:
    "Um link que só vale uma vez e por 60 minutos. Quem abrir define a própria senha e entra. Ele aparece uma única vez, nesta tela: copie e entregue à pessoa por um meio seguro. Gerar outro link cancela o anterior e qualquer convite pendente.",
};

export const INFO_DA_DESATIVACAO_DA_PESSOA: ConteudoDoInfo = {
  texto:
    "A pessoa deixa de entrar e as sessões abertas caem na hora. Nada é apagado: os pedidos e os vínculos com lojas continuam, e reativar devolve o acesso. Se ela é a única dona de uma loja, a tela avisa antes.",
};
