import { afterEach, describe, expect, it } from "vitest";

import {
  compilarEscPos,
  diagramarCupom,
  gerarCupom,
  type PedidoParaCupom,
} from "@simpleclick/core";

import { iniciarEmulador, type Emulador } from "./emulador.ts";
import { enviarParaImpressora, ErroDaImpressora } from "./impressora-tcp.ts";

const pedido: PedidoParaCupom = {
  loja: "Sorveteria São João",
  codigo: "A-0101",
  feitoEm: "2026-10-06T15:30:00.000Z",
  fusoHorario: "America/Sao_Paulo",
  canal: "ONLINE",
  cliente: { nome: "João Açaí", telefone: "5511912345678" },
  itens: [
    { nome: "Açaí com granola", quantidade: 1, totalDaLinhaEmCentavos: 2350 },
    { nome: "Guaraná", quantidade: 2, totalDaLinhaEmCentavos: 1200 },
  ],
  entrega: { tipo: "PICKUP" },
  taxaDeEntrega: { modo: "FREE", valorEmCentavos: 0 },
  pagamento: { forma: "PIX" },
  subtotalEmCentavos: 3550,
  totalEmCentavos: 3550,
};

let emulador: Emulador | undefined;
afterEach(async () => {
  await emulador?.fechar();
  emulador = undefined;
});

describe("emulador de impressora (TCP 9100, sem hardware)", () => {
  it("@spec:AC-620 o papel que chega pela rede tem 'Açaí com granola' e 'Guaraná' com acento, igual ao que foi compilado", async () => {
    emulador = await iniciarEmulador();
    const linhas = diagramarCupom(gerarCupom(pedido, { larguraMm: 80 }), {
      tabela: "cp860",
    });
    await enviarParaImpressora(
      { host: emulador.host, porta: emulador.porta },
      compilarEscPos(linhas, { tabela: "cp860" }),
    );
    await emulador.aguardarImpressao(1);

    const papel = emulador.recebidos[0]?.papel;
    expect(papel?.lido).toBe(true);
    if (papel?.lido !== true) return;
    expect(papel.tabela).toBe("cp860");
    expect(papel.linhas).toEqual(linhas);
    expect(papel.previa).toContain("Açaí com granola");
    expect(papel.previa).toContain("Guaraná");
    expect(papel.previa).toContain("Sorveteria São João");
  });

  it("@spec:AC-621 a reimpressão sai no papel marcada como reimpressão com o número da via", async () => {
    emulador = await iniciarEmulador();
    const linhas = diagramarCupom(
      gerarCupom(pedido, { larguraMm: 58, via: 2 }),
    );
    await enviarParaImpressora(
      { host: emulador.host, porta: emulador.porta },
      compilarEscPos(linhas, { tabela: "cp860" }),
    );
    await emulador.aguardarImpressao(1);
    const papel = emulador.recebidos[0]?.papel;
    expect(papel?.lido).toBe(true);
    if (papel?.lido !== true) return;
    expect(papel.previa).toContain("REIMPRESSÃO");
    expect(papel.previa).toContain("2ª VIA");
  });

  it("recusa (e mostra) o cupom que chega em UTF-8 cru, sem a escolha da tabela", async () => {
    emulador = await iniciarEmulador();
    await enviarParaImpressora(
      { host: emulador.host, porta: emulador.porta },
      new TextEncoder().encode("Açaí\n"),
    );
    await emulador.aguardarImpressao(1);
    const papel = emulador.recebidos[0]?.papel;
    expect(papel?.lido).toBe(false);
  });

  it("impressora fora do ar faz o envio falhar, em vez de fingir que imprimiu", async () => {
    emulador = await iniciarEmulador({ recusar: () => true });
    await expect(
      enviarParaImpressora(
        { host: emulador.host, porta: emulador.porta },
        Uint8Array.from([0x1b, 0x40]),
      ),
    ).rejects.toThrow(ErroDaImpressora);
    expect(emulador.recebidos).toHaveLength(0);

    const porta = emulador.porta;
    await emulador.fechar();
    emulador = undefined;
    await expect(
      enviarParaImpressora({ host: "127.0.0.1", porta }, Uint8Array.from([1])),
    ).rejects.toThrow(ErroDaImpressora);
  });
});
