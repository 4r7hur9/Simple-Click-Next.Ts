import { describe, expect, it } from "vitest";

import {
  diagramarCupom,
  gerarCupom,
  type LinhaDoCupom,
  type PedidoParaCupom,
} from "./cupom-blocos.ts";
import {
  compilarEscPos,
  ErroDaSaidaEscPos,
  NUMERO_DA_TABELA_NO_ESCPOS,
} from "./cupom-escpos.ts";
import { lerEscPos } from "./cupom-escpos-leitura.ts";
import type { TabelaDeCaracteres } from "./cupom-largura.ts";

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** Caractere por ponto de código — sem depender de como o editor grava. */
const cp = (ponto: number) => String.fromCodePoint(ponto);

function pedido(sobrescrita: Partial<PedidoParaCupom> = {}): PedidoParaCupom {
  return {
    loja: "Sorveteria São João",
    codigo: "A-0007",
    feitoEm: "2026-09-26T21:05:00.000Z",
    fusoHorario: "America/Sao_Paulo",
    canal: "ONLINE",
    cliente: { nome: "João Açaí", telefone: "5511912345678" },
    itens: [
      {
        nome: "Açaí com granola",
        quantidade: 1,
        totalDaLinhaEmCentavos: 2350,
        opcoes: [{ grupo: "Calda", opcao: "Guaraná" }],
        observacao: "Caprichar na paçoca",
      },
      { nome: "Guaraná", quantidade: 2, totalDaLinhaEmCentavos: 1200 },
    ],
    observacao: "Portão com cadeado — ligar antes",
    entrega: {
      tipo: "DELIVERY",
      endereco: {
        logradouro: "Avenida Brasil",
        numero: "900",
        bairro: "Jardim América",
        cidade: "São José dos Campos",
        uf: "SP",
      },
    },
    taxaDeEntrega: { modo: "FREE", valorEmCentavos: 0 },
    pagamento: { forma: "PIX" },
    subtotalEmCentavos: 3550,
    totalEmCentavos: 3550,
    ...sobrescrita,
  };
}

/**
 * Lê os bytes como a impressora os leria — o papel, de volta em linhas.
 *
 * O decodificador é o de `packages/core` (T-610), o MESMO que o emulador de
 * impressora usa: ele recusa qualquer byte de controle fora dos comandos que a
 * saída promete emitir. Aqui só se confere, além disso, que o cupom começa
 * por ESC @ e ESC t.
 */
function lerPapel(
  bytes: Uint8Array,
  tabela: TabelaDeCaracteres,
): { readonly tabelaSelecionada: number; readonly linhas: LinhaDoCupom[] } {
  expect([bytes[0], bytes[1]]).toEqual([ESC, 0x40]);
  expect([bytes[2], bytes[3]]).toEqual([ESC, 0x74]);
  const { tabelaSelecionada, linhas } = lerEscPos(bytes, tabela);
  return { tabelaSelecionada, linhas };
}

/** Os bytes que a impressora recebe para desenhar este texto. */
function bytesDoTexto(bytes: Uint8Array, texto: readonly number[]): boolean {
  outer: for (let i = 0; i + texto.length <= bytes.length; i += 1) {
    for (let j = 0; j < texto.length; j += 1) {
      if (bytes[i + j] !== texto[j]) continue outer;
    }
    return true;
  }
  return false;
}

describe("acento correto no papel (AC-620)", () => {
  it("@spec:AC-620 'Açaí com granola' e 'Guaraná' saem com os bytes da tabela portuguesa, e a tabela é escolhida antes do texto", () => {
    const cupom = gerarCupom(pedido(), { larguraMm: 80 });
    const bytes = compilarEscPos(diagramarCupom(cupom, { tabela: "cp860" }), {
      tabela: "cp860",
    });

    // ESC t 3: a impressora passa a desenhar com a tabela 860 ANTES de
    // receber a primeira letra — sem isso, ela usaria a de fábrica.
    expect([...bytes.slice(0, 5)]).toEqual([ESC, 0x40, ESC, 0x74, 3]);

    // "Açaí com granola": ç = 0x87, í = 0xA1 na tabela 860.
    expect(
      bytesDoTexto(
        bytes,
        [0x41, 0x87, 0x61, 0xa1, 0x20, 0x63, 0x6f, 0x6d, 0x20].concat(
          [..."granola"].map((c) => c.charCodeAt(0)),
        ),
      ),
    ).toBe(true);
    // "Guaraná": á = 0xA0.
    expect(
      bytesDoTexto(bytes, [0x47, 0x75, 0x61, 0x72, 0x61, 0x6e, 0xa0]),
    ).toBe(true);
  });

  it("@spec:AC-620 nenhum byte de UTF-8 nem ponto de interrogação chega à impressora", () => {
    const cupom = gerarCupom(
      pedido({
        observacao: `Açaí ${cp(0x1f367)} “bem gelado” — obrigado`,
      }),
      { larguraMm: 58 },
    );
    const bytes = compilarEscPos(diagramarCupom(cupom), { tabela: "cp860" });

    // 0xC3 é o primeiro byte de "ç", "á", "í", "ã" em UTF-8: se aparecesse,
    // a impressora desenharia o "Ã" seguido de lixo no lugar de cada acento.
    // Na tabela 860, 0xC3 é um traço de moldura, que o cupom nunca usa.
    expect(bytes.includes(0xc3)).toBe(false);
    expect(bytes.includes(0x3f)).toBe(false);
    const { linhas } = lerPapel(bytes, "cp860");
    const papel = linhas
      .map((l) => (l.tipo === "texto" ? l.texto : ""))
      .join("\n");
    expect(papel).toContain('Açaí "bem gelado" - obrigado');
  });

  it("@spec:AC-620 na tabela 850 a impressora recebe ESC t 2 e o 'ã' no lugar daquela tabela", () => {
    const cupom = gerarCupom(pedido(), { larguraMm: 80 });
    const bytes = compilarEscPos(diagramarCupom(cupom, { tabela: "cp850" }), {
      tabela: "cp850",
    });
    expect(bytes[4]).toBe(NUMERO_DA_TABELA_NO_ESCPOS.cp850);
    // "São": ã = 0xC6 na 850 (e 0x84 na 860).
    expect(bytesDoTexto(bytes, [0x53, 0xc6, 0x6f])).toBe(true);
    expect(bytesDoTexto(bytes, [0x53, 0x84, 0x6f])).toBe(false);
  });

  it("@spec:AC-620 o que a impressora desenha é exatamente o que o navegador mostra — as duas saídas têm o mesmo conteúdo", () => {
    for (const larguraMm of [58, 80] as const) {
      for (const tabela of ["cp860", "cp850"] as const) {
        for (const via of [1, 2]) {
          const linhas = diagramarCupom(
            gerarCupom(pedido(), {
              larguraMm,
              via,
              conteudo: { totalEmDestaque: true },
            }),
            { tabela },
          );
          const papel = lerPapel(compilarEscPos(linhas, { tabela }), tabela);
          expect(papel.tabelaSelecionada).toBe(
            NUMERO_DA_TABELA_NO_ESCPOS[tabela],
          );
          // Linha por linha: texto, negrito, tamanho e o corte no fim.
          expect(papel.linhas).toEqual(linhas);
        }
      }
    }
  });
});

describe("saída da impressora", () => {
  it("texto do cliente com ESC não vira comando na impressora", () => {
    const malicioso = pedido({
      observacao: `sem sal${cp(0x1b)}p${cp(0x00)}${cp(0x19)}${cp(0xfa)} gaveta${cp(0x1d)}V${cp(0x00)}`,
    });
    const bytes = compilarEscPos(
      diagramarCupom(gerarCupom(malicioso, { larguraMm: 80 })),
      { tabela: "cp860" },
    );
    // `lerPapel` reprova qualquer controle fora dos comandos previstos — um
    // ESC p (abrir gaveta) ou GS V (cortar) vindo do texto seria pego aqui.
    const { linhas } = lerPapel(bytes, "cp860");
    const cortes = linhas.filter((l) => l.tipo === "corte");
    expect(cortes).toHaveLength(1);
  });

  it("o corte segue o perfil: parcial, total ou nenhum", () => {
    const linhas = diagramarCupom(gerarCupom(pedido(), { larguraMm: 58 }));
    const fim = (bytes: Uint8Array) => [...bytes.slice(-3)];
    expect(fim(compilarEscPos(linhas, { tabela: "cp860" }))).toEqual([
      GS,
      0x56,
      0x01,
    ]);
    expect(
      fim(compilarEscPos(linhas, { tabela: "cp860", corte: "total" })),
    ).toEqual([GS, 0x56, 0x00]);
    const semCorte = compilarEscPos(linhas, {
      tabela: "cp860",
      corte: "nenhum",
    });
    expect(semCorte.at(-1)).toBe(LF);
  });

  it("recusa linha diagramada para outra tabela, em vez de imprimir acento errado", () => {
    const linhas = diagramarCupom(
      gerarCupom(pedido({ loja: "Pão de mäe" }), { larguraMm: 80 }),
      { tabela: "cp850" },
    );
    expect(() => compilarEscPos(linhas, { tabela: "cp860" })).toThrow(
      ErroDaSaidaEscPos,
    );
  });
});
