// @vitest-environment jsdom
/**
 * Prova do "Sobre a loja", do lado da tela (AC-421, AC-422, AC-423).
 *
 * O Sobre é uma JANELA (`dialog`) sobre a página da loja. A janela é desenhada
 * por `renderToStaticMarkup`, que é exatamente o HTML que o servidor entrega
 * antes de qualquer script: o que aparece aqui aparece para quem desligou o
 * JavaScript e para o buscador. Na rota `/sobre` ela já vem aberta (`open`).
 *
 * O QUE ESTA PROVA NÃO ALCANÇA: o foco preso, o Esc e o clique no fundo são do
 * `dialog` nativo aberto com `showModal()`, e só um navegador de verdade os
 * exercita; a garantia de que a API só manda o WhatsApp público mora em
 * `apps/api/tests/vitrine-sem-dado-sensivel.test.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  SobreDaLoja,
  type DadosSobreDaLoja,
  type SobreDaLojaProps,
} from "../src/features/loja/SobreDaLoja.tsx";
import {
  diaDaSemanaNoFuso,
  dividirHistoria,
  enderecoNoMapa,
  telefoneLegivel,
  textoDaFaixa,
  textoDoPrazo,
} from "../src/features/loja/sobre/formatos.ts";

const LOJA: DadosSobreDaLoja = {
  apelido: "sabor-e-cia",
  nome: "Sabor & Cia",
  ramo: "FOOD_SNACK",
  boasVindas: "Comida caseira todo dia",
  sobre:
    "Uma história feita de receitas de família. Desde 1998 no mesmo endereço.",
  logo: "https://exemplo.test/logo.png",
  capa: "https://exemplo.test/capa.jpg",
  cores: null,
  enderecoParaRetirada: {
    logradouro: "Rua das Flores",
    numero: "10",
    complemento: null,
    bairro: "Centro",
    cidade: "Santos",
    uf: "SP",
  },
  whatsappPublico: "5511999998888",
  formasDeEntrega: ["DELIVERY", "PICKUP"],
  fusoHorario: "America/Sao_Paulo",
};

const SEMANA = [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
  dia,
  // Domingo fechado; nos outros, almoço e jantar.
  faixas:
    dia === 0
      ? []
      : [
          { abre: "11:00", fecha: "15:00" },
          { abre: "18:00", fecha: "00:00" },
        ],
}));

/** Quarta-feira, 14/10/2026, 15h em São Paulo. */
const QUARTA = new Date("2026-10-14T18:00:00Z");

const BASE: SobreDaLojaProps = {
  loja: LOJA,
  abertura: { aberta: true, proximaAbertura: null, motivo: "ABERTA" },
  horario: { modo: "SCHEDULE", semana: SEMANA },
  recebimento: {
    formasDePagamento: ["PIX", "CASH", "CARD_ON_DELIVERY"],
    entrega: {
      aceitaEntrega: true,
      aceitaRetirada: true,
      taxaCentavos: 600,
      nomeDaTaxa: "Taxa de entrega",
      gratisAcimaDeCentavos: 8000,
      minimoParaEntregaCentavos: 2000,
      minimoParaRetiradaCentavos: null,
      prazoMinutos: 40,
    },
  },
  rotuloDoCatalogo: "Cardápio",
  aberta: true,
  agora: QUARTA,
};

/** O HTML do servidor, já convertido em árvore para as perguntas da prova. */
function desenhar(sobrescrita: Partial<SobreDaLojaProps> = {}): {
  html: string;
  doc: Document;
} {
  const html = renderToStaticMarkup(<SobreDaLoja {...BASE} {...sobrescrita} />);
  const doc = new DOMParser().parseFromString(html, "text/html");
  return { html, doc };
}

function textoDe(doc: Document): string {
  return (doc.body.textContent ?? "").replace(/\s+/g, " ");
}

describe("o Sobre é uma janela sobre a loja (AC-421)", () => {
  it("@spec:AC-421 é um dialog com nome acessível, aberto no servidor só na rota /sobre", () => {
    const aberta = desenhar().doc.querySelector("dialog");
    expect(aberta?.hasAttribute("open")).toBe(true);
    const titulo = aberta?.getAttribute("aria-labelledby") ?? "";
    expect(aberta?.ownerDocument.getElementById(titulo)?.textContent).toBe(
      "Sabor & Cia",
    );

    const fechada = desenhar({ aberta: false }).doc.querySelector("dialog");
    expect(fechada?.hasAttribute("open")).toBe(false);
  });

  it("@spec:AC-421 o fechar é um link de volta para a loja, com nome para o leitor de tela", () => {
    const { doc } = desenhar();
    const fechar = doc.querySelector(".sc-sobre-janela__fechar");

    expect(fechar?.tagName).toBe("A");
    expect(fechar?.getAttribute("href")).toBe("/loja/sabor-e-cia");
    expect(fechar?.textContent).toBe("Fechar");
  });

  it("@spec:AC-421 mostra a história, a logo, a capa e o caminho para o cardápio", () => {
    const { doc } = desenhar();

    expect(textoDe(doc)).toContain("Uma história feita de receitas de família.");
    expect(textoDe(doc)).toContain("Desde 1998 no mesmo endereço.");
    const imagens = [...doc.querySelectorAll("img")].map((imagem) =>
      imagem.getAttribute("src"),
    );
    expect(imagens).toContain("https://exemplo.test/logo.png");
    expect(imagens).toContain("https://exemplo.test/capa.jpg");
    const cardapio = [...doc.querySelectorAll("a")].filter(
      (link) => link.getAttribute("href") === "/loja/sabor-e-cia/cardapio",
    );
    expect(cardapio[0]?.textContent).toContain("Ver o cardápio");
  });

  it("@spec:AC-421 sem capa, usa a capa padrão do ramo; sem logo, as iniciais", () => {
    const { doc } = desenhar({ loja: { ...LOJA, capa: null, logo: null } });

    expect(doc.querySelectorAll("img")).toHaveLength(0);
    const padrao = doc.querySelector<HTMLElement>(".sc-sobre__padrao");
    expect(padrao?.getAttribute("style")).toContain("/capas-padrao/");
    expect(doc.querySelector(".sc-loja__iniciais")?.textContent).toBe("SC");
  });

  it("@spec:AC-421 sem texto Sobre, diz isso numa linha, sem cartão vazio", () => {
    const { doc } = desenhar({ loja: { ...LOJA, sobre: null } });

    expect(doc.querySelector("#sobre-historia")).toBeNull();
    expect(textoDe(doc)).toContain("Esta loja ainda não contou a história");
  });
});

describe("horários: a semana inteira, com hoje destacado", () => {
  it("lista os 7 dias de segunda a domingo e marca hoje no fuso da loja", () => {
    const { doc } = desenhar();
    const linhas = [...doc.querySelectorAll(".sc-sobre__semana tr")];

    expect(linhas.map((linha) => linha.querySelector("th")?.firstChild?.textContent)).toEqual([
      "Segunda",
      "Terça",
      "Quarta",
      "Quinta",
      "Sexta",
      "Sábado",
      "Domingo",
    ]);
    const hoje = doc.querySelector('[aria-current="date"]');
    expect(hoje?.textContent).toContain("Quarta");
    expect(hoje?.textContent).toContain("Hoje");
    expect(hoje?.textContent).toContain("11h – 15h · 18h – 24h");
    expect(linhas[6]?.textContent).toContain("Fechado");
  });

  it("mostra a situação de agora, e quando volta a abrir se está fechada", () => {
    const { doc } = desenhar({
      abertura: {
        aberta: false,
        proximaAbertura: "abre hoje às 18h",
        motivo: "FORA_DO_HORARIO",
      },
    });

    expect(textoDe(doc)).toContain("Fechada agora");
    expect(textoDe(doc)).toContain("Abre hoje às 18h");
  });

  it("loja sem grade publicada não desenha tabela vazia", () => {
    const { doc } = desenhar({ horario: null });

    expect(doc.querySelector(".sc-sobre__semana")).toBeNull();
    expect(textoDe(doc)).toContain("ainda não publicou o horário");
  });

  it("loja 24 horas mostra os 7 dias como 24 horas", () => {
    const { doc } = desenhar({
      horario: { modo: "ALWAYS_OPEN", semana: [] },
    });

    const valores = [...doc.querySelectorAll(".sc-sobre__semana td")].map(
      (celula) => celula.textContent,
    );
    expect(valores).toEqual(Array(7).fill("24 horas"));
  });
});

describe("como receber e pagamento vêm do fechamento, sem a chave PIX", () => {
  it("mostra taxa, prazo, mínimo, frete grátis e a retirada", () => {
    const texto = textoDe(desenhar().doc);

    expect(texto).toContain("Taxa de entrega: R$ 6,00");
    expect(texto).toContain("Chega em cerca de 40 min");
    expect(texto).toContain("Pedido mínimo de R$ 20,00");
    expect(texto).toContain("Frete grátis a partir de R$ 80,00");
    expect(texto).toContain("Retirada no local");
    expect(texto).toContain("Sem taxa, em Centro, Santos");
  });

  it("lista as formas de pagamento pelo nome", () => {
    const pilulas = [
      ...desenhar().doc.querySelectorAll(".sc-sobre__pilula"),
    ].map((pilula) => pilula.textContent);

    expect(pilulas).toEqual(["Pix", "Dinheiro", "Cartão na entrega"]);
  });

  it("sem o fechamento, usa as formas da vitrine e esconde o pagamento", () => {
    const { doc } = desenhar({ recebimento: null });

    expect(doc.querySelector("#sobre-pagamento")).toBeNull();
    expect(textoDe(doc)).toContain("A loja leva até você.");
    expect(textoDe(doc)).toContain("Retirada no local");
  });

  it("loja sem entrega nem retirada não desenha o cartão", () => {
    const { doc } = desenhar({
      loja: { ...LOJA, formasDeEntrega: [] },
      recebimento: null,
    });

    expect(doc.querySelector("#sobre-receber")).toBeNull();
  });
});

describe("a janela publica só o contato autorizado (AC-422)", () => {
  it("@spec:AC-422 mostra o endereço com atalho para o mapa e o WhatsApp público", () => {
    const { html, doc } = desenhar();

    const endereco = doc.querySelector("address")?.textContent ?? "";
    expect(endereco).toContain("Rua das Flores, 10");
    expect(endereco).toContain("Santos / SP");
    expect(html).toContain(
      "https://www.google.com/maps/search/?api=1&amp;query=Rua%20das%20Flores%2C%2010%2C%20Centro%2C%20Santos%20-%20SP",
    );
    expect(html).toContain('href="https://wa.me/5511999998888"');
    expect(textoDe(doc)).toContain("(11) 99999-8888");
  });

  it("@spec:AC-422 sem WhatsApp público, não há cartão de contato", () => {
    const { html, doc } = desenhar({
      loja: { ...LOJA, whatsappPublico: null },
    });

    expect(html).not.toContain("wa.me");
    expect(doc.querySelector("#sobre-contato")).toBeNull();
  });

  it("@spec:AC-422 sem endereço, não há cartão 'Onde estamos'", () => {
    const { doc } = desenhar({
      loja: { ...LOJA, enderecoParaRetirada: null },
    });

    expect(doc.querySelector("#sobre-endereco")).toBeNull();
  });

  it("@spec:AC-422 o número publicado vira link só com dígitos", () => {
    const { html } = desenhar({
      loja: { ...LOJA, whatsappPublico: "+55 (11) 99999-8888" },
    });

    expect(html).toContain('href="https://wa.me/5511999998888"');
  });
});

describe("a janela continua útil sem JavaScript (AC-423)", () => {
  it("@spec:AC-423 o HTML do servidor já traz o conteúdo inteiro, sem script nem botão", () => {
    const { html, doc } = desenhar();

    expect(html).not.toContain("<script");
    expect(doc.querySelectorAll("button")).toHaveLength(0);
    expect(textoDe(doc)).toContain("Nossa história");
    expect(textoDe(doc)).toContain("Horários");
    expect(textoDe(doc)).toContain("Como receber");
    expect(textoDe(doc)).toContain("Formas de pagamento");
    expect(textoDe(doc)).toContain("Onde estamos");
    expect(textoDe(doc)).toContain("Fale com a gente");
  });

  it("@spec:AC-423 só a casca da janela roda no navegador; o conteúdo e as páginas são do servidor", () => {
    const raiz = process.cwd();
    const doServidor = [
      "apps/web/src/features/loja/SobreDaLoja.tsx",
      "apps/web/src/app/(loja)/loja/[slug]/TelaDaLoja.tsx",
      "apps/web/src/features/loja/sobre/SecoesDoSobre.tsx",
      "apps/web/src/app/(loja)/loja/[slug]/page.tsx",
      "apps/web/src/app/(loja)/loja/[slug]/sobre/page.tsx",
    ];

    for (const arquivo of doServidor) {
      const fonte = readFileSync(join(raiz, arquivo), "utf8");
      expect(fonte, arquivo).not.toMatch(/^\s*["']use client["']/m);
    }
  });

  it("@spec:AC-904 a chave PIX nunca chega à página, nem pela janela", () => {
    const raiz = process.cwd();
    const tela = readFileSync(
      join(raiz, "apps/web/src/app/(loja)/loja/[slug]/TelaDaLoja.tsx"),
      "utf8",
    );
    // A tela repassa só formas de pagamento e entrega; `pix` não sai dali.
    expect(tela).not.toMatch(/fechamento\.fechamento\.pix|\.\.\.fechamento/);
  });
});

describe("as contas pequenas do Sobre", () => {
  it("o dia de hoje é o do fuso da loja, e não o do servidor", () => {
    // Domingo, 22h em São Paulo, já é segunda em UTC.
    const domingoANoite = new Date("2026-10-19T01:00:00Z");
    expect(domingoANoite.getUTCDay()).toBe(1);
    expect(diaDaSemanaNoFuso(domingoANoite, "America/Sao_Paulo")).toBe(0);
    expect(diaDaSemanaNoFuso(domingoANoite, "Fuso/Invalido")).toBe(1);
  });

  it("faixa que vira a meia-noite vai até as 24h; 0h a 0h é o dia inteiro", () => {
    expect(textoDaFaixa({ abre: "18:30", fecha: "23:00" })).toBe("18h30 – 23h");
    expect(textoDaFaixa({ abre: "18:00", fecha: "02:00" })).toBe("18h – 24h");
    expect(textoDaFaixa({ abre: "00:00", fecha: "00:00" })).toBe("24 horas");
  });

  it("o prazo sai em minutos, horas ou dias", () => {
    expect(textoDoPrazo(40)).toBe("40 min");
    expect(textoDoPrazo(90)).toBe("1h30");
    expect(textoDoPrazo(2880)).toBe("2 dias");
  });

  it("o telefone sai no formato brasileiro, e o estrangeiro como veio", () => {
    expect(telefoneLegivel("+5511911110001")).toBe("(11) 91111-0001");
    expect(telefoneLegivel("1133334444")).toBe("(11) 3333-4444");
    expect(telefoneLegivel("+1 555 0100")).toBe("+1 555 0100");
  });

  it("sem rua nem cidade, não há o que procurar no mapa", () => {
    expect(
      enderecoNoMapa({
        logradouro: null,
        numero: null,
        complemento: null,
        bairro: "Centro",
        cidade: null,
        uf: null,
      }),
    ).toBeNull();
  });

  it("a história separa a abertura do corpo", () => {
    expect(dividirHistoria("Primeira frase. Segunda frase.")).toEqual({
      abertura: "Primeira frase.",
      corpo: ["Segunda frase."],
    });
    expect(dividirHistoria("Um.\n\nDois.\n\nTrês.")).toEqual({
      abertura: "Um.",
      corpo: ["Dois.", "Três."],
    });
    expect(dividirHistoria("Só uma frase.")).toEqual({
      abertura: "Só uma frase.",
      corpo: [],
    });
  });
});
