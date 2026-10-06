import { describe, expect, it } from "vitest";

import { diagramarCupom, gerarCupom } from "./cupom-blocos.ts";
import { compilarEscPos } from "./cupom-escpos.ts";
import {
  ErroDaLeituraEscPos,
  lerEscPos,
  previaDoPapel,
} from "./cupom-escpos-leitura.ts";

/** Um cupom com acento, cedilha e reimpressão: o que o emulador recebe. */
function bytesDoCupom(via: number, tabela: "cp860" | "cp850" = "cp860") {
  const cupom = gerarCupom(
    {
      loja: "Açaíteria São João",
      codigo: "A-0042",
      feitoEm: "2026-10-06T12:00:00.000Z",
      fusoHorario: "America/Sao_Paulo",
      canal: "ONLINE",
      cliente: { nome: "Conceição", telefone: "5511912345678" },
      itens: [
        {
          nome: "Açaí com granola",
          quantidade: 1,
          totalDaLinhaEmCentavos: 2350,
        },
        { nome: "Guaraná", quantidade: 2, totalDaLinhaEmCentavos: 1200 },
      ],
      entrega: { tipo: "PICKUP" },
      taxaDeEntrega: { modo: "FREE", valorEmCentavos: 0 },
      pagamento: { forma: "PIX" },
      subtotalEmCentavos: 3550,
      totalEmCentavos: 3550,
    },
    { larguraMm: 58, via },
  );
  const linhas = diagramarCupom(cupom, { tabela });
  return { linhas, bytes: compilarEscPos(linhas, { tabela }) };
}

describe("leitura do papel (o decodificador do emulador)", () => {
  it("@spec:AC-620 devolve exatamente as linhas compiladas, com acento e cedilha, nas duas tabelas", () => {
    for (const tabela of ["cp860", "cp850"] as const) {
      const { linhas, bytes } = bytesDoCupom(1, tabela);
      const papel = lerEscPos(bytes);
      expect(papel.tabela).toBe(tabela);
      expect(papel.linhas).toEqual(linhas);
      const texto = previaDoPapel(papel.linhas);
      expect(texto).toContain("Açaí com granola");
      expect(texto).toContain("Guaraná");
    }
  });

  it("@spec:AC-621 a reimpressão chega ao papel com a marca e o número da via", () => {
    const papel = lerEscPos(bytesDoCupom(3).bytes, "cp860");
    const texto = previaDoPapel(papel.linhas);
    expect(texto).toContain("REIMPRESSÃO");
    expect(texto).toContain("3ª VIA");
  });

  it("recusa cupom sem ESC @ e sem a escolha da tabela antes do texto", () => {
    const { bytes } = bytesDoCupom(1);
    expect(() => lerEscPos(bytes.slice(2))).toThrow(ErroDaLeituraEscPos);
    const semTabela = Uint8Array.from([0x1b, 0x40, ...bytes.slice(5)]);
    expect(() => lerEscPos(semTabela)).toThrow(ErroDaLeituraEscPos);
  });

  it("recusa a tabela diferente da esperada", () => {
    const { bytes } = bytesDoCupom(1, "cp850");
    expect(() => lerEscPos(bytes, "cp860")).toThrow(/cp850/);
  });

  it("recusa byte de controle fora dos comandos previstos (ESC p abriria a gaveta)", () => {
    const { bytes } = bytesDoCupom(1);
    const comGaveta = Uint8Array.from([
      ...bytes.slice(0, 5),
      0x1b,
      0x70,
      0x00,
      ...bytes.slice(5),
    ]);
    expect(() => lerEscPos(comGaveta)).toThrow(ErroDaLeituraEscPos);
  });

  it("UTF-8 cru no lugar do byte da tabela vira lixo no papel, e nunca o texto certo", () => {
    const utf8 = new TextEncoder().encode("Açaí\n");
    const bytes = Uint8Array.from([0x1b, 0x40, 0x1b, 0x74, 3, ...utf8]);
    // "ç" em UTF-8 é 0xC3 0xA7; 0xC3 é moldura na 860 e o leitor aceita como
    // caractere, mas o texto lido denuncia o lixo.
    const papel = lerEscPos(bytes);
    const linha = papel.linhas[0];
    expect(linha?.tipo === "texto" ? linha.texto : "").not.toBe("Açaí");
  });

  it("recusa cupom que termina no meio da linha", () => {
    const { bytes } = bytesDoCupom(1);
    const cortado = Uint8Array.from([...bytes.slice(0, 5), 0x41]);
    expect(() => lerEscPos(cortado)).toThrow(/meio de uma linha/);
  });
});
