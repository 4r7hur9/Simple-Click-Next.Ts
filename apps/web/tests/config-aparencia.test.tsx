// @vitest-environment jsdom
/**
 * Prova da tela de apresentação (T-905: AC-916, AC-917, AC-918).
 *
 * A prévia é desenhada com o mesmo tema da vitrine, antes de publicar; a cor
 * clara demais é consertada na letra e avisada ao dono; e a imagem fora do
 * padrão é recusada com orientação sem sair do navegador.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import {
  calcularTemaDaLoja,
  PALETA_CLARA,
  relacaoDeContraste,
} from "@simpleclick/ui";

import {
  conferirArquivo,
  FormularioAparencia,
} from "../src/features/config/FormularioAparencia.tsx";
import {
  desmontar,
  digitar,
  esperar,
  exigir,
  montar,
  simularApi,
} from "./apoio-config.tsx";

afterEach(desmontar);

const PUBLICADA = {
  nome: "Pastelaria da Zica",
  boasVindas: "O pastel mais crocante do bairro.",
  sobre: null,
  logo: null,
  capa: null,
  corPrimaria: "#8a3b12",
};

/** Escolhe o arquivo no campo, como a pessoa faria. */
async function escolherArquivo(campo: HTMLInputElement, arquivo: File) {
  Object.defineProperty(campo, "files", {
    value: [arquivo],
    configurable: true,
  });
  act(() => {
    campo.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await esperar();
}

describe("a apresentação aparece na prévia antes de publicar (AC-916)", () => {
  it("@spec:AC-916 nome, boas-vindas, sobre, logo e capa digitados aparecem na prévia, sem nada publicado ainda", async () => {
    const chamadas = simularApi(() => ({ status: 200, corpo: PUBLICADA }));
    const tela = montar(<FormularioAparencia />);
    await esperar();

    digitar(exigir(tela, 'input[name="nome"]'), "Pastel & Cia");
    digitar(exigir(tela, 'textarea[name="boasVindas"]'), "Feito na hora!");
    digitar(exigir(tela, 'textarea[name="sobre"]'), "Desde 1998.");
    digitar(
      exigir(tela, 'input[name="logo"]'),
      "https://imagens.exemplo.test/logo.png",
    );
    digitar(
      exigir(tela, 'input[name="capa"]'),
      "https://imagens.exemplo.test/capa.jpg",
    );

    const previa = exigir(tela, '[data-previa="apresentacao"]');
    expect(exigir(previa, "[data-previa-nome]").textContent).toBe(
      "Pastel & Cia",
    );
    expect(exigir(previa, "[data-previa-boas-vindas]").textContent).toBe(
      "Feito na hora!",
    );
    expect(exigir(previa, "[data-previa-sobre]").textContent).toBe(
      "Desde 1998.",
    );
    expect(
      exigir<HTMLImageElement>(previa, "[data-previa-logo]").getAttribute(
        "src",
      ),
    ).toBe("https://imagens.exemplo.test/logo.png");
    expect(
      exigir<HTMLImageElement>(previa, "[data-previa-capa]").getAttribute(
        "src",
      ),
    ).toBe("https://imagens.exemplo.test/capa.jpg");
    // Prévia é prévia: nada foi enviado à API.
    expect(chamadas.every((chamada) => chamada.metodo === "GET")).toBe(true);
  });

  it("@spec:AC-916 publicar envia exatamente o que a prévia mostra", async () => {
    const chamadas = simularApi((chamada) =>
      chamada.metodo === "PUT"
        ? { status: 204 }
        : { status: 200, corpo: PUBLICADA },
    );
    const tela = montar(<FormularioAparencia />);
    await esperar();

    digitar(exigir(tela, 'input[name="nome"]'), "Pastel & Cia");
    act(() => {
      exigir<HTMLFormElement>(tela, "form").dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await esperar();

    expect(chamadas.find((chamada) => chamada.metodo === "PUT")?.corpo).toEqual(
      { ...PUBLICADA, nome: "Pastel & Cia" },
    );
  });
});

describe("cor clara não deixa texto ilegível (AC-917)", () => {
  function corDaLetraSobreAPrimaria(tela: HTMLElement) {
    const tema = exigir<HTMLElement>(tela, ".sc-tema-loja");
    return {
      primaria: tema.style.getPropertyValue("--cor-primaria"),
      letra: tema.style.getPropertyValue("--cor-em-primaria"),
    };
  }

  it("@spec:AC-917 cor principal muito clara ganha letra escura por cima, com contraste acessível, e o dono é avisado", async () => {
    simularApi(() => ({ status: 200, corpo: PUBLICADA }));
    const tela = montar(<FormularioAparencia />);
    await esperar();

    digitar(exigir(tela, 'input[name="corPrimaria"]'), "#fff59d");

    const { primaria, letra } = corDaLetraSobreAPrimaria(tela);
    // O preenchimento continua sendo a cor que o dono escolheu…
    expect(primaria).toBe("#fff59d");
    // …e a letra por cima dela passa a ser legível (WCAG AA, 4,5:1).
    expect(relacaoDeContraste(letra, primaria)).toBeGreaterThanOrEqual(4.5);
    expect(tela.textContent).toContain("Esta cor compromete a leitura");
    expect(
      tela.querySelectorAll('[data-avisos="contraste"] li').length,
    ).toBeGreaterThan(0);
  });

  it("@spec:AC-917 toda cor clara recebe letra legível por cima, e vira legível onde é texto, sem trocar o preenchimento", () => {
    const claras = [
      "#ffffff",
      "#fff59d",
      "#ffe0e0",
      "#e0ffe0",
      "#ccccff",
      "#ffff00",
      "#b7ff00",
    ];
    for (const cor of claras) {
      const tema = calcularTemaDaLoja(cor);
      // A identidade não é sequestrada: o preenchimento é a cor do dono.
      expect(tema.corPrincipal).toBe(cor);
      // A letra sobre ela alcança o mínimo do WCAG AA para texto (4,5:1)…
      expect(
        relacaoDeContraste(tema.corDoTexto, tema.corPrincipal),
      ).toBeGreaterThanOrEqual(4.5);
      // …e a cor, onde vira texto sobre o fundo da página, também.
      expect(
        relacaoDeContraste(tema.corPrincipalComoTexto, PALETA_CLARA.fundo),
      ).toBeGreaterThanOrEqual(4.5);
      expect(tema.avisos.length).toBeGreaterThan(0);
    }
  });

  it("@spec:AC-917 cor escura o bastante não gera aviso", async () => {
    simularApi(() => ({ status: 200, corpo: PUBLICADA }));
    const tela = montar(<FormularioAparencia />);
    await esperar();

    digitar(exigir(tela, 'input[name="corPrimaria"]'), "#1b3a5c");
    expect(tela.textContent).not.toContain("Esta cor compromete a leitura");
  });
});

describe("imagem fora do padrão é recusada com orientação (AC-918)", () => {
  it("@spec:AC-918 arquivo que não é imagem é recusado na hora, com formato, tamanho e proporção, sem envio", async () => {
    const chamadas = simularApi(() => ({ status: 200, corpo: PUBLICADA }));
    const tela = montar(<FormularioAparencia />);
    await esperar();

    await escolherArquivo(
      exigir(tela, 'input[name="arquivo-logo"]'),
      new File(["%PDF-1.7"], "cardapio.pdf", { type: "application/pdf" }),
    );

    const recusa = exigir(tela, "#recusa-logo").textContent ?? "";
    expect(recusa).toContain("JPEG, PNG, WebP");
    expect(recusa).toContain("1 MB");
    expect(recusa).toContain("1:1");
    expect(recusa).toContain("anterior continua no ar");
    expect(chamadas.some((chamada) => chamada.metodo === "PUT")).toBe(false);
  });

  it("@spec:AC-918 capa acima do tamanho é recusada antes do envio", () => {
    const grande = new File([new Uint8Array(3 * 1024 * 1024 + 1)], "capa.png", {
      type: "image/png",
    });
    const recusa = conferirArquivo("capa", grande) ?? "";
    expect(recusa).toContain("3 MB");
    expect(recusa).toContain("3:1");
    expect(
      conferirArquivo(
        "capa",
        new File([new Uint8Array(10)], "capa.png", { type: "image/png" }),
      ),
    ).toBeNull();
  });

  it("@spec:AC-918 a recusa da API (conferida pelos bytes) aparece ao lado do campo", async () => {
    const mensagem =
      "O arquivo enviado não é uma imagem aceita. A logo aceita JPEG, PNG, WebP de até 1 MB, na proporção quadrada (1:1), por exemplo 512 × 512 pixels. A imagem anterior continua no ar.";
    simularApi((chamada) =>
      chamada.url.includes("/imagem/")
        ? {
            status: 400,
            corpo: { erro: "imagem_invalida", mensagem, orientacao: {} },
          }
        : { status: 200, corpo: PUBLICADA },
    );
    const tela = montar(<FormularioAparencia />);
    await esperar();

    await escolherArquivo(
      exigir(tela, 'input[name="arquivo-logo"]'),
      new File(["não sou png"], "logo.png", { type: "image/png" }),
    );

    expect(exigir(tela, "#recusa-logo").textContent).toBe(mensagem);
  });
});
