import { describe, expect, it } from "vitest";

import {
  ErroDeTextoDoPedido,
  gerarTextoDoPedido,
  LIMITE_PADRAO_DO_LINK,
  medirComprimentoNoLink,
  type ItemDoPedido,
  type PedidoParaTexto,
} from "./cupom-texto.ts";

/** Formata centavos em reais por aritmética inteira, sem decimal (P-005). */
function emReais(centavos: number): string {
  const reais = Math.floor(centavos / 100);
  const resto = centavos % 100;
  const comMilhar = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${comMilhar},${String(resto).padStart(2, "0")}`;
}

/**
 * Pedido completo de referência: vários itens, opções que somam e que tiram,
 * observação por item, observação do pedido, entrega com endereço e taxa com
 * nome próprio. É o cenário exato que AC-519 descreve.
 */
function pedidoCompleto(): PedidoParaTexto {
  return {
    codigo: "A-1042",
    cliente: { nome: "Maria Conceição", telefone: "(11) 98888-7777" },
    itens: [
      {
        nome: "Pizza Calabresa",
        variacao: "Grande",
        quantidade: 1,
        totalDaLinhaEmCentavos: 5590,
        opcoes: [
          { grupo: "Massa", opcao: "Fina" },
          {
            grupo: "Adicionais",
            opcao: "Bacon",
            quantidade: 2,
            acrescimoEmCentavos: 1000,
          },
          { grupo: "Ingredientes", opcao: "Cebola", acao: "REMOVE" },
        ],
        observacao: "Cortar em 8 pedaços",
      },
      {
        nome: "Refrigerante 2L",
        quantidade: 2,
        totalDaLinhaEmCentavos: 2380,
      },
    ],
    observacao: "Tocar a campainha do portão",
    entrega: {
      tipo: "DELIVERY",
      endereco: {
        logradouro: "Rua das Flores",
        numero: "123",
        complemento: "Apto 12",
        bairro: "Centro",
        cidade: "São Paulo",
        uf: "SP",
        cep: "01000-000",
        pontoDeReferencia: "Ao lado da praça",
        destinatario: "Maria Conceição",
      },
    },
    taxaDeEntrega: {
      modo: "VALUE",
      valorEmCentavos: 800,
      nome: "Entrega Centro",
    },
    pagamento: {
      forma: "PIX",
      chavePix: "loja@sabor.com.br",
      tipoDaChavePix: "E-mail",
      nomeDoRecebedor: "Sabor & Cia",
    },
    subtotalEmCentavos: 7970,
    descontoEmCentavos: 500,
    totalEmCentavos: 8270,
    linkDeAcompanhamento: "https://app.simpleclick.com.br/loja/sabor/p/9f3c1a7b",
  };
}

/** Item genérico numerado, para montar pedido grande sem repetir código. */
function itemDeTeste(indice: number): ItemDoPedido {
  return {
    nome: `Marmita executiva número ${String(indice)}`,
    variacao: "Porção grande",
    quantidade: (indice % 3) + 1,
    totalDaLinhaEmCentavos: 1990 + indice * 10,
    opcoes: [
      { grupo: "Acompanhamento", opcao: "Farofa da casa" },
      { grupo: "Adicionais", opcao: "Ovo frito", acrescimoEmCentavos: 300 },
    ],
    observacao: "Sem pimenta, por favor",
  };
}

/** Pedido com a quantidade de itens pedida, mantendo o resto igual. */
function pedidoCom(quantidadeDeItens: number): PedidoParaTexto {
  const itens = Array.from({ length: quantidadeDeItens }, (_, indice) =>
    itemDeTeste(indice + 1),
  );
  const subtotal = itens.reduce(
    (soma, item) => soma + item.totalDaLinhaEmCentavos,
    0,
  );
  return {
    ...pedidoCompleto(),
    itens,
    subtotalEmCentavos: subtotal,
    descontoEmCentavos: 0,
    totalEmCentavos: subtotal + 800,
  };
}

describe("texto do pedido para o WhatsApp", () => {
  it("@spec:AC-519 traz pedido, cliente, itens com opções e valor, observações, entrega, pagamento, total e link", () => {
    const gerado = gerarTextoDoPedido(pedidoCompleto());

    expect(gerado.texto).toMatchSnapshot();
    expect(gerado.encurtado).toBe(false);
    expect(gerado.itensOmitidos).toBe(0);
    expect(gerado.dentroDoLimite).toBe(true);
  });

  it("@spec:AC-519 usa as marcas de destaque e de quebra de linha que o WhatsApp entende", () => {
    const { texto } = gerarTextoDoPedido(pedidoCompleto());
    const linhas = texto.split("\n");

    // Negrito do WhatsApp é o asterisco em volta do trecho, e cada bloco
    // começa por um título assim.
    expect(linhas).toContain("*Pedido A-1042*");
    expect(linhas).toContain("*Cliente*");
    expect(linhas).toContain("*Itens*");
    expect(linhas).toContain("*Total: R$ 82,70*");
    // Um bloco por assunto, separado por linha em branco: é o que dá a
    // leitura em blocos no aplicativo.
    expect(texto).toContain("\n\n*Cliente*\n");
    // Marca de destaque nunca fica aberta: um asterisco solto viraria
    // literal na tela do dono.
    const asteriscos = texto.split("*").length - 1;
    expect(asteriscos % 2).toBe(0);
  });

  it("@spec:AC-519 mostra quantidade, opção que soma, opção que tira e o valor de cada item", () => {
    const { texto } = gerarTextoDoPedido(pedidoCompleto());

    expect(texto).toContain("1x Pizza Calabresa (Grande) — R$ 55,90");
    expect(texto).toContain("   • Adicionais: Bacon x2 (+R$ 10,00)");
    expect(texto).toContain("   • Ingredientes: sem Cebola");
    expect(texto).toContain("   Obs.: Cortar em 8 pedaços");
    expect(texto).toContain("2x Refrigerante 2L — R$ 23,80");
  });

  it("@spec:AC-519 mostra a taxa de entrega com o nome que o dono deu e o endereço da entrega", () => {
    const { texto } = gerarTextoDoPedido(pedidoCompleto());

    expect(texto).toContain("Rua das Flores, 123 - Apto 12");
    expect(texto).toContain("Centro - São Paulo/SP");
    expect(texto).toContain("Entrega Centro: R$ 8,00");
    expect(texto).toContain(
      "https://app.simpleclick.com.br/loja/sabor/p/9f3c1a7b",
    );
  });

  it("@spec:AC-519 pedido de um item só sai completo, sem resumo nem sobra de bloco", () => {
    const gerado = gerarTextoDoPedido(pedidoCom(1));

    expect(gerado.texto).toMatchSnapshot();
    expect(gerado.encurtado).toBe(false);
    expect(gerado.texto).not.toContain("mais 0");
    expect(gerado.texto).toContain("*Itens*");
  });

  it("@spec:AC-519 pedido sem entrega troca o endereço pela retirada e não cobra taxa", () => {
    const gerado = gerarTextoDoPedido({
      ...pedidoCompleto(),
      entrega: { tipo: "PICKUP" },
      taxaDeEntrega: { modo: "FREE", valorEmCentavos: 0 },
      descontoDeRetiradaEmCentavos: 300,
      totalEmCentavos: 7170,
    });

    expect(gerado.texto).toMatchSnapshot();
    expect(gerado.texto).toContain("*Retirada*");
    expect(gerado.texto).not.toContain("Rua das Flores");
    expect(gerado.texto).not.toContain("Taxa de entrega");
    expect(gerado.texto).toContain("Desconto de retirada: -R$ 3,00");
    expect(gerado.texto).toContain("*Total: R$ 71,70*");
  });

  it("@spec:AC-519 pedido de convidado sem cadastro sai completo, com nome, telefone e link", () => {
    // Convidado (AC-518) chega ao gerador exatamente como cliente com conta:
    // nome e telefone informados no fechamento. Não existe identificador de
    // cliente na entrada, então não há caminho para o texto sair diferente.
    const gerado = gerarTextoDoPedido({
      ...pedidoCompleto(),
      cliente: { nome: "João Visitante", telefone: "(21) 97777-1234" },
      pagamento: { forma: "CASH", trocoParaEmCentavos: 10000 },
    });

    expect(gerado.texto).toMatchSnapshot();
    expect(gerado.texto).toContain("João Visitante");
    expect(gerado.texto).toContain("(21) 97777-1234");
    expect(gerado.texto).toContain("Dinheiro");
    expect(gerado.texto).toContain("Troco para R$ 100,00");
    expect(gerado.texto).toContain(
      "https://app.simpleclick.com.br/loja/sabor/p/9f3c1a7b",
    );
  });

  it("@spec:AC-519 recusa pedido sem item, em vez de gerar mensagem vazia", () => {
    expect(() =>
      gerarTextoDoPedido({ ...pedidoCompleto(), itens: [] }),
    ).toThrow(ErroDeTextoDoPedido);
  });

  it("@spec:AC-519 recusa valor que não é inteiro em centavos (P-005)", () => {
    // Ponto flutuante em dinheiro é defeito, não detalhe de formatação:
    // arredondar aqui esconderia a origem do erro.
    expect(() =>
      gerarTextoDoPedido({ ...pedidoCompleto(), totalEmCentavos: 82.7 }),
    ).toThrow(ErroDeTextoDoPedido);
  });
});

describe("encurtamento controlado do texto (AC-521)", () => {
  it("@spec:AC-521 pedido de 30 itens estoura o limite do link e é encurtado até caber", () => {
    const pedido = pedidoCom(30);

    // Primeiro a prova de que o cenário é o que a história descreve: sem
    // encurtar, o texto não caberia no endereço que abre a conversa.
    const semLimite = gerarTextoDoPedido(pedido, {
      limiteDoLink: Number.MAX_SAFE_INTEGER,
    });
    expect(medirComprimentoNoLink(semLimite.texto)).toBeGreaterThan(
      LIMITE_PADRAO_DO_LINK,
    );

    const gerado = gerarTextoDoPedido(pedido);

    expect(gerado.dentroDoLimite).toBe(true);
    expect(gerado.comprimentoNoLink).toBeLessThanOrEqual(LIMITE_PADRAO_DO_LINK);
    expect(gerado.encurtado).toBe(true);
    expect(gerado.itensOmitidos).toBeGreaterThan(0);
    expect(gerado.texto).toMatchSnapshot();
  });

  it("@spec:AC-521 o essencial permanece e os itens excedentes viram um resumo com contagem e valor", () => {
    const pedido = pedidoCom(30);
    const gerado = gerarTextoDoPedido(pedido);

    // O essencial que a história exige continua inteiro.
    expect(gerado.texto).toContain("*Pedido A-1042*");
    expect(gerado.texto).toContain("Maria Conceição");
    expect(gerado.texto).toContain("(11) 98888-7777");
    expect(gerado.texto).toContain("Rua das Flores, 123 - Apto 12");
    expect(gerado.texto).toContain("*Pagamento*");
    expect(gerado.texto).toContain(
      `*Total: ${emReais(pedido.totalEmCentavos)}*`,
    );

    // Os excedentes viram uma linha só, que diz quantos são e quanto somam —
    // sem isso a lista não fecharia com o total e o dono desconfiaria da conta.
    const exibidos = 30 - gerado.itensOmitidos;
    const somaOmitida = pedido.itens
      .slice(exibidos)
      .reduce((soma, item) => soma + item.totalDaLinhaEmCentavos, 0);
    expect(gerado.texto).toContain(
      `_mais ${String(gerado.itensOmitidos)} itens (${emReais(somaOmitida)}) — a lista completa está no link do pedido_`,
    );
  });

  it("@spec:AC-521 o link de acompanhamento sobrevive ao encurtamento e é a última linha", () => {
    const gerado = gerarTextoDoPedido(pedidoCom(30));
    const linhas = gerado.texto.split("\n");

    expect(gerado.texto).toContain("*Acompanhe seu pedido*");
    expect(linhas.at(-1)).toBe(
      "https://app.simpleclick.com.br/loja/sabor/p/9f3c1a7b",
    );
  });

  it("@spec:AC-521 nada é cortado no meio de palavra ou de valor: a unidade descartada é a linha inteira", () => {
    const pedido = pedidoCom(30);
    const completo = gerarTextoDoPedido(pedido, {
      limiteDoLink: Number.MAX_SAFE_INTEGER,
    });
    const encurtado = gerarTextoDoPedido(pedido);

    const linhasCompletas = new Set(completo.texto.split("\n"));
    const linhasQueNaoVieramDoOriginal = encurtado.texto
      .split("\n")
      .filter((linha) => !linhasCompletas.has(linha));

    // A única linha que o texto encurtado inventa é a de resumo. Toda outra é
    // idêntica a uma linha do texto completo — nenhuma é um pedaço dela, que é
    // o que provaria corte no meio de palavra ou de valor.
    expect(linhasQueNaoVieramDoOriginal).toHaveLength(1);
    expect(linhasQueNaoVieramDoOriginal[0]).toMatch(/^_mais \d+ ite(m|ns) /);

    // Nenhum valor sai pela metade: todo "R$" do texto tem os centavos.
    const valores = encurtado.texto.match(/R\$ [\d.,]+/g) ?? [];
    for (const valor of valores) {
      expect(valor).toMatch(/^R\$ \d{1,3}(\.\d{3})*,\d{2}$/);
    }
  });

  it("@spec:AC-521 o primeiro degrau tira só o detalhe dos itens, mantendo todos eles listados", () => {
    const pedido = pedidoCom(6);
    const completo = gerarTextoDoPedido(pedido, {
      limiteDoLink: Number.MAX_SAFE_INTEGER,
    });
    const semDetalhe = gerarTextoDoPedido(pedido, {
      limiteDoLink: medirComprimentoNoLink(completo.texto) - 1,
    });

    expect(semDetalhe.detalhesDosItensOmitidos).toBe(true);
    expect(semDetalhe.itensOmitidos).toBe(0);
    expect(semDetalhe.dentroDoLimite).toBe(true);
    // Todos os seis continuam listados, um por linha, sem as escolhas.
    for (let numero = 1; numero <= 6; numero += 1) {
      expect(semDetalhe.texto).toContain(
        `Marmita executiva número ${String(numero)}`,
      );
    }
    expect(semDetalhe.texto).not.toContain("Farofa da casa");
  });

  it("@spec:AC-521 quando nem o essencial cabe, avisa em vez de mutilar o endereço do cliente", () => {
    const gerado = gerarTextoDoPedido({
      ...pedidoCompleto(),
      observacao: "Combinar a entrega pelo telefone. ".repeat(120),
    });

    expect(gerado.dentroDoLimite).toBe(false);
    // O endereço, o total e o link continuam inteiros: perder um caractere do
    // endereço custa uma entrega errada; uma mensagem longa custa uma rolagem.
    expect(gerado.texto).toContain("Rua das Flores, 123 - Apto 12");
    expect(gerado.texto).toContain("CEP 01000-000");
    expect(gerado.texto).toContain("*Total: R$ 82,70*");
    expect(gerado.texto.endsWith("/p/9f3c1a7b")).toBe(true);
  });

  it("@spec:AC-521 a medida é feita sobre o texto codificado, não sobre o texto cru", () => {
    // No endereço, "ã" custa 6 caracteres e um emoji custa 12. Medir o texto
    // cru daria um número otimista e o encurtamento nunca dispararia.
    expect(medirComprimentoNoLink("ã")).toBe(6);
    expect(medirComprimentoNoLink("🍕")).toBe(12);
    expect(medirComprimentoNoLink("a")).toBe(1);

    const gerado = gerarTextoDoPedido(pedidoCompleto());
    expect(gerado.comprimentoNoLink).toBe(
      encodeURIComponent(gerado.texto).length,
    );
    expect(gerado.comprimentoNoLink).toBeGreaterThan(gerado.texto.length);
  });
});

describe("acento, cedilha, emoji e quebra de linha (AC-522)", () => {
  /** Pedido carregado com os três: acento, cedilha e emoji. */
  function pedidoComCaracteresEspeciais(): PedidoParaTexto {
    return {
      ...pedidoCompleto(),
      cliente: { nome: "Ana Conceição Antônio", telefone: "(11) 91234-5678" },
      itens: [
        {
          nome: "Açaí na tigela 🍧",
          variacao: "500 ml",
          quantidade: 1,
          totalDaLinhaEmCentavos: 2350,
          opcoes: [{ grupo: "Cobertura", opcao: "Leite condensado 🍫" }],
          observacao: "Sem granola, é alergia",
        },
      ],
      observacao: "Apartamento 32 🏢\nInterfone quebrado\nLigar ao chegar 📞",
      subtotalEmCentavos: 2350,
      descontoEmCentavos: 0,
      totalEmCentavos: 3150,
    };
  }

  it("@spec:AC-522 acento, cedilha e emoji chegam íntegros e as quebras de linha são preservadas", () => {
    const { texto } = gerarTextoDoPedido(pedidoComCaracteresEspeciais());

    expect(texto).toMatchSnapshot();

    // Os três, exatamente como foram escritos.
    expect(texto).toContain("Ana Conceição Antônio");
    expect(texto).toContain("Açaí na tigela 🍧");
    expect(texto).toContain("Leite condensado 🍫");
    expect(texto).toContain("Sem granola, é alergia");

    // A observação de três linhas continua com as duas quebras no lugar.
    expect(texto).toContain(
      "*Observações*\nApartamento 32 🏢\nInterfone quebrado\nLigar ao chegar 📞",
    );

    // Nenhum caractere de substituição e nenhum par substituto partido: emoji
    // ocupa duas unidades de 16 bits, e cortar entre elas produziria o losango
    // de substituição.
    expect(texto).not.toContain(String.fromCharCode(0xfffd));
    expect([...texto].join("")).toBe(texto);
  });

  it("@spec:AC-522 o texto atravessa a codificação do link e volta idêntico", () => {
    const { texto } = gerarTextoDoPedido(pedidoComCaracteresEspeciais());

    // É esta a viagem real da mensagem: ela vai dentro de `?text=` e o
    // aplicativo a decodifica do outro lado. Se a ida e a volta não baterem,
    // o dono recebe caractere estranho no lugar do acento.
    expect(decodeURIComponent(encodeURIComponent(texto))).toBe(texto);
    expect(texto).toContain("ç");
    expect(texto).toContain("🍧");
    expect(texto).toContain("\n");
  });

  it("@spec:AC-522 acento decomposto pelo navegador é juntado antes de sair", () => {
    // O campo do navegador pode entregar "ç" como "c" mais cedilha solta
    // (NFD). Nessa forma o acento é um caractere independente, que se separa
    // da letra ao ser cortado ou copiado. O texto sai sempre em NFC.
    const decomposto = "Conceição".normalize("NFD");
    expect(decomposto).not.toBe("Conceição");

    const { texto } = gerarTextoDoPedido({
      ...pedidoCompleto(),
      cliente: { nome: decomposto, telefone: "(11) 90000-0000" },
    });

    expect(texto).toContain("Conceição");
    expect(texto).not.toContain(String.fromCharCode(0x0327));
    expect(texto.normalize("NFC")).toBe(texto);
  });

  it("@spec:AC-522 quebra de linha do Windows vira quebra simples, sem perder a quebra", () => {
    const { texto } = gerarTextoDoPedido({
      ...pedidoCompleto(),
      observacao: "Primeira linha\r\nSegunda linha\rTerceira linha",
    });

    expect(texto).toContain(
      "*Observações*\nPrimeira linha\nSegunda linha\nTerceira linha",
    );
    expect(texto).not.toContain("\r");
  });

  it("@spec:AC-522 controle invisível é removido sem levar junto o emoji vizinho", () => {
    // Caractere de controle no meio do texto corrompe a mensagem; remover por
    // unidade de 16 bits partiria o emoji ao lado. A varredura é por ponto de
    // código justamente por isso.
    const campainha = String.fromCharCode(0x07);
    const escape = String.fromCharCode(0x1b);
    const { texto } = gerarTextoDoPedido({
      ...pedidoCompleto(),
      observacao: `Entrega r${campainha}ápida ${escape}🚀 obrigado`,
    });

    expect(texto).toContain("Entrega rápida 🚀 obrigado");
    expect(texto).not.toContain(campainha);
    expect(texto).not.toContain(escape);
  });
});
