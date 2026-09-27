// @vitest-environment jsdom
/**
 * Prova dos avisos de configuração pendente no painel (T-907: AC-902, AC-914).
 *
 * O aviso é DESTACADO — tom de atenção, no topo do painel, em todas as telas —
 * e cada pendência leva direto à tela que a resolve. Falha ao consultar não
 * vira aviso falso: o dono continua usando o painel.
 */
import { afterEach, describe, expect, it } from "vitest";

import { AvisosPendentes } from "../src/features/config/AvisosPendentes.tsx";
import { desmontar, esperar, montar, simularApi } from "./apoio-config.tsx";

afterEach(desmontar);

const WHATSAPP = {
  codigo: "WHATSAPP",
  titulo: "Adicione seu WhatsApp",
  descricao:
    "Sem ele, o pedido ainda é registrado no painel, mas não abre uma conversa para você.",
  href: "/painel/config/contato",
};

const PAGAMENTO = {
  codigo: "PAGAMENTO",
  titulo: "Configure uma forma de pagamento",
  descricao:
    "Sem nenhuma forma de pagamento, o checkout não tem como receber o pedido.",
  href: "/painel/config/pagamento",
};

async function painelCom(pendencias: unknown[]) {
  const chamadas = simularApi(() => ({ status: 200, corpo: { pendencias } }));
  const tela = montar(<AvisosPendentes />);
  await esperar();
  return { tela, chamadas };
}

describe("aviso destacado de configuração pendente", () => {
  it("@spec:AC-914 sem WhatsApp, o painel mostra aviso destacado, diz que o pedido continua registrado e leva à tela de contato", async () => {
    const { tela, chamadas } = await painelCom([WHATSAPP]);

    expect(chamadas[0]?.url).toBe("/api/loja/pendencias");
    const aviso = tela.querySelector(".sc-aviso--atencao");
    expect(aviso).not.toBeNull();
    expect(aviso?.textContent).toContain("Adicione seu WhatsApp");
    expect(aviso?.textContent).toContain("pedido ainda é registrado");
    const atalho = aviso?.querySelector('a[href="/painel/config/contato"]');
    expect(atalho?.textContent).toBe("Configurar");
  });

  it("@spec:AC-902 sem forma de pagamento, o painel avisa e leva à tela de pagamento", async () => {
    const { tela } = await painelCom([PAGAMENTO, WHATSAPP]);

    const itens = [...tela.querySelectorAll(".sc-aviso--atencao li")];
    expect(itens).toHaveLength(2);
    expect(itens[0]?.textContent).toContain("Configure uma forma de pagamento");
    expect(
      itens[0]?.querySelector('a[href="/painel/config/pagamento"]'),
    ).not.toBeNull();
  });

  it("@spec:AC-902 loja sem pendência não mostra aviso nenhum", async () => {
    const { tela } = await painelCom([]);
    expect(tela.querySelector(".sc-aviso")).toBeNull();
  });

  it("@spec:AC-914 falha ao consultar não vira aviso falso", async () => {
    simularApi(() => ({ status: 500, corpo: { erro: "erro_interno" } }));
    const tela = montar(<AvisosPendentes />);
    await esperar();
    expect(tela.querySelector(".sc-aviso")).toBeNull();
  });
});
