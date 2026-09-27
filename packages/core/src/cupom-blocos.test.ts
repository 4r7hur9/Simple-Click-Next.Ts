import { describe, expect, it } from "vitest";

import {
  diagramarCupom,
  ErroDoCupom,
  gerarCupom,
  lerCupomImpresso,
  VERSAO_DO_CUPOM,
  type LinhaDoCupom,
  type PedidoParaCupom,
} from "./cupom-blocos.ts";
import { larguraNoPapel } from "./cupom-largura.ts";

/**
 * Pedido completo de referência: vários itens, opções que somam e que tiram,
 * observação por item e do pedido, entrega com endereço e troco — o cenário
 * que o AC-619 descreve, com os nomes acentuados que o AC-620 cita.
 */
function pedidoCompleto(): PedidoParaCupom {
  return {
    loja: "Açaí & Guaraná da Vila",
    codigo: "A-1042",
    // 17h32 em UTC é 14h32 em São Paulo: o cupom mostra a hora DA LOJA.
    feitoEm: "2026-09-26T17:32:00.000Z",
    fusoHorario: "America/Sao_Paulo",
    canal: "ONLINE",
    cliente: { nome: "Maria Conceição", telefone: "5511988887777" },
    itens: [
      {
        nome: "Açaí com granola",
        variacao: "500 ml",
        quantidade: 2,
        totalDaLinhaEmCentavos: 4700,
        opcoes: [
          { grupo: "Cobertura", opcao: "Leite condensado" },
          {
            grupo: "Adicionais",
            opcao: "Paçoca",
            quantidade: 2,
            acrescimoEmCentavos: 400,
          },
          { grupo: "Frutas", opcao: "Banana", acao: "REMOVE" },
        ],
        observacao: "Sem granola na metade, é alergia",
      },
      {
        nome: "Guaraná Antarctica lata 350ml gelado",
        quantidade: 3,
        totalDaLinhaEmCentavos: 1950,
      },
    ],
    observacao: "Tocar a campainha do portão azul",
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
      },
    },
    taxaDeEntrega: { modo: "VALUE", valorEmCentavos: 800 },
    pagamento: { forma: "CASH", trocoParaEmCentavos: 10000 },
    subtotalEmCentavos: 6650,
    descontoEmCentavos: 500,
    totalEmCentavos: 6950,
  };
}

/** Pedido de retirada: sem endereço e sem taxa. */
function pedidoDeRetirada(): PedidoParaCupom {
  return {
    ...pedidoCompleto(),
    canal: "MANUAL",
    observacao: null,
    entrega: { tipo: "PICKUP" },
    taxaDeEntrega: { modo: "FREE", valorEmCentavos: 0 },
    pagamento: { forma: "PIX" },
    descontoEmCentavos: 0,
    totalEmCentavos: 6650,
  };
}

type LinhaDeTexto = Extract<LinhaDoCupom, { tipo: "texto" }>;

function textos(linhas: readonly LinhaDoCupom[]): LinhaDeTexto[] {
  return linhas.filter((l): l is LinhaDeTexto => l.tipo === "texto");
}

/** O cupom como se vê no papel, com marcas para negrito e letra dupla. */
function comoPapel(linhas: readonly LinhaDoCupom[]): string {
  return linhas
    .map((l) => {
      if (l.tipo === "corte") return "✂---- corte ----";
      const marca = `${l.negrito ? "N" : " "}${l.tamanho === "duplo" ? "2" : " "}`;
      return `${marca}|${l.texto}`;
    })
    .join("\n");
}

/** Índice da primeira linha que contém o trecho — falha alto se não houver. */
function posicao(linhas: readonly LinhaDeTexto[], trecho: string): number {
  const indice = linhas.findIndex((l) => l.texto.includes(trecho));
  expect(indice, `"${trecho}" não saiu no cupom`).toBeGreaterThanOrEqual(0);
  return indice;
}

describe("o cupom traz o que a produção precisa, na ordem certa (AC-619)", () => {
  it("@spec:AC-619 loja, pedido, data e hora, canal, cliente, itens, observações, endereço, pagamento e total — nesta ordem", () => {
    const linhas = textos(
      diagramarCupom(gerarCupom(pedidoCompleto(), { larguraMm: 80 })),
    );

    const ordem = [
      posicao(linhas, "Açaí & Guaraná da Vila"),
      posicao(linhas, "PEDIDO A-1042"),
      posicao(linhas, "26/09/2026 14:32"),
      posicao(linhas, "Site"),
      posicao(linhas, "Maria Conceição"),
      posicao(linhas, "(11) 98888-7777"),
      posicao(linhas, "2x Açaí com granola (500 ml)"),
      posicao(linhas, "+ Cobertura: Leite condensado"),
      posicao(linhas, "3x Guaraná Antarctica"),
      posicao(linhas, "Tocar a campainha do portão azul"),
      posicao(linhas, "Rua das Flores, 123 - Apto 12"),
      posicao(linhas, "Dinheiro"),
      posicao(linhas, "TOTAL"),
    ];
    expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
    expect(new Set(ordem).size).toBe(ordem.length);
  });

  it("@spec:AC-619 cada item sai com quantidade, valor e as escolhas — inclusive o que tirar", () => {
    const linhas = textos(
      diagramarCupom(gerarCupom(pedidoCompleto(), { larguraMm: 80 })),
    );
    const item = linhas[posicao(linhas, "2x Açaí com granola")];
    expect(item?.texto.endsWith("R$ 47,00")).toBe(true);
    expect(item?.negrito).toBe(true);
    posicao(linhas, "+ Adicionais: Paçoca x2 (+R$ 4,00)");
    posicao(linhas, "- Frutas: sem Banana");
    const guarana = linhas[posicao(linhas, "3x Guaraná Antarctica")];
    expect(guarana?.texto.endsWith("R$ 19,50")).toBe(true);
  });

  it("@spec:AC-619 as observações saem destacadas: em negrito e entre linhas duplas", () => {
    const linhas = textos(
      diagramarCupom(gerarCupom(pedidoCompleto(), { larguraMm: 58 })),
    );
    const titulo = posicao(linhas, "OBSERVAÇÕES DO PEDIDO");
    const observacao = posicao(linhas, "Tocar a campainha");
    expect(linhas[titulo - 1]?.texto).toMatch(/^=+$/);
    expect(linhas[titulo]?.negrito).toBe(true);
    expect(linhas[observacao]?.negrito).toBe(true);

    // A observação do ITEM também é destacada, junto do item a que pertence.
    const doItem = linhas[posicao(linhas, ">> Obs.: Sem granola")];
    expect(doItem?.negrito).toBe(true);
  });

  it("@spec:AC-619 a entrega traz o endereço completo e a taxa; a forma de pagamento traz o troco", () => {
    const linhas = textos(
      diagramarCupom(gerarCupom(pedidoCompleto(), { larguraMm: 80 })),
    );
    posicao(linhas, "Centro - São Paulo/SP");
    posicao(linhas, "CEP 01000-000");
    posicao(linhas, "Ref.: Ao lado da praça");
    const taxa = linhas[posicao(linhas, "Taxa de entrega")];
    expect(taxa?.texto.endsWith("R$ 8,00")).toBe(true);
    const troco = linhas[posicao(linhas, "Troco para")];
    expect(troco?.texto.endsWith("R$ 100,00")).toBe(true);
    const desconto = linhas[posicao(linhas, "Desconto")];
    expect(desconto?.texto.endsWith("-R$ 5,00")).toBe(true);
    const total = linhas[posicao(linhas, "TOTAL")];
    expect(total?.texto.endsWith("R$ 69,50")).toBe(true);
    expect(total?.negrito).toBe(true);
  });

  it("@spec:AC-619 retirada não traz endereço nem taxa, e diz que é retirada", () => {
    const linhas = textos(
      diagramarCupom(gerarCupom(pedidoDeRetirada(), { larguraMm: 80 })),
    );
    posicao(linhas, "RETIRADA NO LOCAL");
    posicao(linhas, "Balcão");
    const papel = linhas.map((l) => l.texto).join("\n");
    expect(papel).not.toContain("Rua das Flores");
    expect(papel).not.toContain("Taxa de entrega");
    expect(papel).not.toContain("OBSERVAÇÕES DO PEDIDO");
  });

  it("@spec:AC-619 o cupom inteiro, em 58 e em 80 mm, é o de referência", () => {
    // A referência que o agente de impressão (T-609) reproduz caractere por
    // caractere. Mudou aqui, mudou o contrato: confira a versão.
    for (const larguraMm of [58, 80] as const) {
      const linhas = diagramarCupom(
        gerarCupom(pedidoCompleto(), { larguraMm }),
      );
      expect(comoPapel(linhas)).toMatchSnapshot(`papel de ${larguraMm} mm`);
    }
  });

  it("@spec:AC-619 a configuração de conteúdo tira o endereço e a observação geral, mas nunca a do item", () => {
    const linhas = textos(
      diagramarCupom(
        gerarCupom(pedidoCompleto(), {
          larguraMm: 80,
          conteudo: { enderecoCliente: false, observacoes: false },
        }),
      ),
    );
    const papel = linhas.map((l) => l.texto).join("\n");
    expect(papel).not.toContain("Rua das Flores");
    expect(papel).not.toContain("Tocar a campainha");
    expect(papel).toContain("ENTREGA");
    expect(papel).toContain(">> Obs.: Sem granola na metade, é alergia");
  });

  it("total em destaque sai em letra dupla, ainda encostado à direita", () => {
    const linhas = textos(
      diagramarCupom(
        gerarCupom(pedidoCompleto(), {
          larguraMm: 58,
          conteudo: { totalEmDestaque: true },
        }),
      ),
    );
    const total = linhas[posicao(linhas, "TOTAL")];
    expect(total?.tamanho).toBe("duplo");
    expect(total?.texto).toBe("TOTAL   R$ 69,50");
    expect(larguraNoPapel(total?.texto ?? "")).toBe(16);
  });

  it("recusa pedido sem itens, dinheiro fora de centavos e largura desconhecida", () => {
    expect(() =>
      gerarCupom({ ...pedidoCompleto(), itens: [] }, { larguraMm: 80 }),
    ).toThrow(ErroDoCupom);
    expect(() =>
      gerarCupom(
        { ...pedidoCompleto(), totalEmCentavos: 69.5 },
        { larguraMm: 80 },
      ),
    ).toThrow(/P-005/);
    expect(() =>
      gerarCupom(pedidoCompleto(), { larguraMm: 76 as never }),
    ).toThrow(ErroDoCupom);
  });
});

describe("largura do papel respeitada (AC-618)", () => {
  it("@spec:AC-618 em 58 e em 80 mm nenhuma linha passa da largura, e os valores formam uma coluna à direita", () => {
    for (const larguraMm of [58, 80] as const) {
      const cupom = gerarCupom(pedidoCompleto(), {
        larguraMm,
        conteudo: { totalEmDestaque: true },
      });
      const colunas = cupom.papel.colunas;
      const linhas = textos(diagramarCupom(cupom));

      for (const linha of linhas) {
        const limite = linha.tamanho === "duplo" ? colunas / 2 : colunas;
        expect(larguraNoPapel(linha.texto), linha.texto).toBeLessThanOrEqual(
          limite,
        );
      }

      // Toda linha que termina em valor termina NA ÚLTIMA COLUNA: é isso que
      // põe os valores em coluna, um embaixo do outro.
      const comValor = linhas.filter((l) => /R\$ [\d.]+,\d{2}$/.test(l.texto));
      expect(comValor.length).toBeGreaterThanOrEqual(6);
      for (const linha of comValor) {
        const ocupa = linha.tamanho === "duplo" ? colunas / 2 : colunas;
        expect(larguraNoPapel(linha.texto), linha.texto).toBe(ocupa);
      }
    }
  });

  it("@spec:AC-618 o mesmo pedido muda de quebra conforme o papel, sem perder conteúdo", () => {
    const estreito = textos(
      diagramarCupom(gerarCupom(pedidoCompleto(), { larguraMm: 58 })),
    );
    const largo = textos(
      diagramarCupom(gerarCupom(pedidoCompleto(), { larguraMm: 80 })),
    );
    expect(estreito.length).toBeGreaterThan(largo.length);

    const palavras = (linhas: readonly LinhaDeTexto[]) =>
      linhas
        .filter((l) => !/^[-=]+$/.test(l.texto))
        .flatMap((l) => l.texto.split(" "))
        .filter((p) => p !== "")
        .sort();
    expect(palavras(estreito)).toEqual(palavras(largo));
  });
});

describe("acento correto no cupom (AC-620)", () => {
  it("@spec:AC-620 'Açaí com granola' e 'Guaraná' atravessam a diagramação intactos", () => {
    const linhas = textos(
      diagramarCupom(gerarCupom(pedidoCompleto(), { larguraMm: 80 })),
    );
    const papel = linhas.map((l) => l.texto).join("\n");
    expect(papel).toContain("Açaí com granola");
    expect(papel).toContain("Guaraná Antarctica");
    expect(papel).toContain("Maria Conceição");
    expect(papel).not.toContain("?");
  });

  it("@spec:AC-620 texto que chegou decomposto gera exatamente o mesmo cupom", () => {
    const composto = pedidoCompleto();
    const decomposto: PedidoParaCupom = {
      ...composto,
      loja: composto.loja.normalize("NFD"),
      cliente: {
        ...composto.cliente,
        nome: composto.cliente.nome.normalize("NFD"),
      },
      itens: composto.itens.map((item) => ({
        ...item,
        nome: item.nome.normalize("NFD"),
      })),
    };
    expect(diagramarCupom(gerarCupom(decomposto, { larguraMm: 58 }))).toEqual(
      diagramarCupom(gerarCupom(composto, { larguraMm: 58 })),
    );
  });
});

describe("segunda via (AC-621)", () => {
  it("@spec:AC-621 a primeira via não fala em reimpressão", () => {
    const papel = textos(
      diagramarCupom(gerarCupom(pedidoCompleto(), { larguraMm: 80 })),
    )
      .map((l) => l.texto)
      .join("\n");
    expect(papel).not.toMatch(/REIMPRESS/);
  });

  it("@spec:AC-621 a reimpressão é marcada no topo e no pé, com o número da via", () => {
    const cupom = gerarCupom(pedidoCompleto(), { larguraMm: 58, via: 2 });
    expect(cupom.via).toBe(2);
    const linhas = textos(diagramarCupom(cupom));

    // A marca é a PRIMEIRA coisa do papel, em letra dupla: é o que se vê no
    // espeto de comandas antes de ler qualquer outra linha.
    expect(linhas[0]?.texto.trim()).toBe("REIMPRESSÃO");
    expect(linhas[0]?.tamanho).toBe("duplo");
    expect(linhas[1]?.texto.trim()).toBe("*** 2ª VIA ***");
    const pe = linhas.findLast((l) => l.texto.trim() !== "");
    expect(pe?.texto.trim()).toBe("REIMPRESSÃO - 2ª VIA");

    const terceira = textos(
      diagramarCupom(gerarCupom(pedidoCompleto(), { larguraMm: 58, via: 3 })),
    );
    expect(terceira[1]?.texto.trim()).toBe("*** 3ª VIA ***");
  });

  it("@spec:AC-621 via precisa ser inteiro a partir de 1", () => {
    for (const via of [0, -1, 1.5]) {
      expect(() =>
        gerarCupom(pedidoCompleto(), { larguraMm: 80, via }),
      ).toThrow(ErroDoCupom);
    }
  });
});

describe("contrato do cupom", () => {
  it("o cupom atravessa JSON e é lido de volta igual", () => {
    const cupom = gerarCupom(pedidoCompleto(), { larguraMm: 58, via: 2 });
    const lido = lerCupomImpresso(JSON.parse(JSON.stringify(cupom)));
    expect(lido).toEqual(cupom);
    expect(lido?.versao).toBe(VERSAO_DO_CUPOM);
  });

  it("recusa versão desconhecida, bloco desconhecido e papel inventado", () => {
    const cupom = JSON.parse(
      JSON.stringify(gerarCupom(pedidoCompleto(), { larguraMm: 80 })),
    ) as Record<string, unknown>;
    expect(lerCupomImpresso({ ...cupom, versao: 2 })).toBeNull();
    expect(
      lerCupomImpresso({ ...cupom, blocos: [{ tipo: "qr", dado: "x" }] }),
    ).toBeNull();
    expect(
      lerCupomImpresso({ ...cupom, papel: { larguraMm: 76, colunas: 40 } }),
    ).toBeNull();
    expect(lerCupomImpresso({ ...cupom, via: 0 })).toBeNull();
    expect(lerCupomImpresso(null)).toBeNull();
  });
});
