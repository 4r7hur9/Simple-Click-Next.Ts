/**
 * O pedido de exemplo que a landing mostra (AC-940).
 *
 * A MENSAGEM É GERADA PELO GERADOR DE VERDADE, e não escrita à mão. É a mesma
 * função que monta o texto de um pedido real — e é por isso que a prévia da
 * landing não pode envelhecer: no dia em que o formato da mensagem mudar, a
 * landing muda junto, sem ninguém lembrar dela.
 *
 * Roda no SERVIDOR porque a tabela de fronteiras não autoriza a camada de telas
 * a alcançar as regras. Não é burocracia: se a tela pudesse montar a mensagem,
 * ela poderia montar o total — e preço calculado na tela é o erro que a versão 1
 * deste produto cometeu (P-006).
 */
import { gerarTextoDoPedido } from "@simpleclick/core";

/** O pedido de exemplo, com nomes que qualquer lanchonete reconhece. */
const PEDIDO_DE_EXEMPLO = {
  codigo: "A-1042",
  cliente: { nome: "Ana Paula", telefone: "5511988887777" },
  itens: [
    {
      nome: "Pastel de carne",
      quantidade: 2,
      totalDaLinhaEmCentavos: 1800,
      opcoes: [{ grupo: "Ponto", opcao: "Bem passado" }],
    },
    {
      nome: "Caldo de cana",
      variacao: "500 ml",
      quantidade: 1,
      totalDaLinhaEmCentavos: 700,
    },
  ],
  entrega: {
    tipo: "DELIVERY" as const,
    endereco: {
      logradouro: "Rua das Acácias",
      numero: "88",
      bairro: "Vila Nova",
      cidade: "São Paulo",
      uf: "SP",
    },
  },
  taxaDeEntrega: {
    modo: "VALUE" as const,
    valorEmCentavos: 700,
    nome: "Entrega Vila Nova",
  },
  pagamento: {
    forma: "PIX" as const,
    chavePix: "loja@exemplo.com.br",
    tipoDaChavePix: "E-mail",
    nomeDoRecebedor: "Sua Loja",
  },
  subtotalEmCentavos: 2500,
  totalEmCentavos: 3200,
  linkDeAcompanhamento: "https://app.simpleclick.com.br/l/sua-loja/p/exemplo",
};

/** Os itens do exemplo, como a prévia da loja os mostra. */
export interface ItemDoExemplo {
  readonly nome: string;
  readonly detalhe: string | null;
  readonly preco: string;
}

/** Tudo o que a prévia da landing precisa, já pronto. */
export interface ExemploDaLanding {
  readonly itens: readonly ItemDoExemplo[];
  readonly total: string;
  /** A mensagem do WhatsApp, gerada pelo gerador de verdade. */
  readonly mensagem: string;
}

function emReais(centavos: number): string {
  const inteiro = Math.trunc(centavos / 100);
  const resto = String(centavos % 100).padStart(2, "0");
  return `R$ ${inteiro},${resto}`;
}

/**
 * Monta o exemplo.
 *
 * Chamada na renderização do servidor, e o resultado viaja como texto até a
 * tela. Nenhum cálculo atravessa a fronteira.
 */
export function exemploDaLanding(): ExemploDaLanding {
  const { texto } = gerarTextoDoPedido(PEDIDO_DE_EXEMPLO);

  return {
    itens: PEDIDO_DE_EXEMPLO.itens.map((item) => ({
      nome: item.nome,
      detalhe:
        item.opcoes?.[0] !== undefined
          ? `${item.opcoes[0].grupo}: ${item.opcoes[0].opcao}`
          : (item.variacao ?? null),
      preco: emReais(item.totalDaLinhaEmCentavos),
    })),
    total: emReais(PEDIDO_DE_EXEMPLO.totalEmCentavos),
    mensagem: texto,
  };
}
