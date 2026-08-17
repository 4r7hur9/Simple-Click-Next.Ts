// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import VitrineDoDesignSystem from "../src/app/(dev)/ui/page";

/**
 * A segunda metade do AC-013: a página de demonstração mostra **todos** os
 * estados de todos os componentes base.
 *
 * A conferência é feita seção por seção, e não somando marcas na página
 * inteira: sem isso, um cartão com quatro estados e uma lista com nenhum
 * dariam o mesmo total, e o teste passaria enquanto metade da vitrine estivesse
 * faltando.
 */

let pagina: Document;

/** Devolve a seção de um componente, pelo título que a nomeia. */
function secao(nome: string): HTMLElement {
  const encontrada = pagina.querySelector<HTMLElement>(
    `section[aria-labelledby="secao-${nome}"]`,
  );
  if (encontrada === null) {
    throw new Error(`a vitrine não tem a seção "${nome}"`);
  }
  return encontrada;
}

const quantos = (dentro: HTMLElement, seletor: string): number =>
  dentro.querySelectorAll(seletor).length;

beforeAll(() => {
  document.body.innerHTML = renderToStaticMarkup(<VitrineDoDesignSystem />);
  pagina = document;
});

describe("a vitrine mostra os estados de cada componente base", () => {
  it("@spec:AC-013 o botão aparece pronto, carregando e desabilitado", () => {
    const botoes = secao("botao");

    // Carregando: bloqueado e anunciado ao mesmo tempo.
    expect(
      quantos(botoes, "button[aria-busy='true'][disabled]"),
    ).toBeGreaterThan(0);
    // Desabilitado: bloqueado sem anunciar espera nenhuma.
    expect(
      quantos(botoes, "button[disabled]:not([aria-busy])"),
    ).toBeGreaterThan(0);
    expect(quantos(botoes, "button:not([disabled])")).toBeGreaterThan(2);
  });

  it("@spec:AC-013 o campo aparece pronto, carregando, com erro e com sucesso", () => {
    const campos = secao("campo");

    expect(quantos(campos, "input[aria-invalid='true']")).toBeGreaterThan(0);
    expect(quantos(campos, ".sc-campo__erro[role='alert']")).toBeGreaterThan(0);
    expect(quantos(campos, ".sc-campo--sucesso")).toBeGreaterThan(0);
    expect(quantos(campos, ".sc-campo__dica[role='status']")).toBeGreaterThan(
      0,
    );
    // Todo campo tem rótulo ligado: é o que o leitor de tela segue.
    expect(quantos(campos, "label[for]")).toBe(quantos(campos, "input"));
  });

  const comQuatroEstados = ["cartao", "lista", "estados"] as const;

  for (const nome of comQuatroEstados) {
    it(`@spec:AC-013 a seção "${nome}" mostra carregando, vazio, erro e sucesso`, () => {
      const bloco = secao(nome);

      expect(
        quantos(bloco, ".sc-estado--carregando, .sc-esqueleto"),
      ).toBeGreaterThan(0);
      expect(quantos(bloco, ".sc-estado--vazio")).toBeGreaterThan(0);
      expect(quantos(bloco, ".sc-estado--erro[role='alert']")).toBeGreaterThan(
        0,
      );
      expect(
        quantos(bloco, ".sc-estado--sucesso[role='status']"),
      ).toBeGreaterThan(0);
    });
  }

  it("@spec:AC-013 a lista também aparece cheia, e não só nos estados de exceção", () => {
    const listas = secao("lista");

    expect(quantos(listas, "ul.sc-lista")).toBeGreaterThan(0);
    expect(quantos(listas, "li.sc-lista__item")).toBeGreaterThan(2);
  });

  it("@spec:AC-013 o aviso aparece nos quatro tons", () => {
    const avisos = secao("aviso");

    for (const tom of ["info", "sucesso", "erro", "atencao"]) {
      expect(quantos(avisos, `.sc-aviso--${tom}`), tom).toBe(1);
    }
    expect(quantos(avisos, ".sc-aviso--erro[role='alert']")).toBe(1);
  });

  it("@spec:AC-013 a caixa de diálogo aparece pronta, carregando, com erro e com sucesso", () => {
    const dialogos = secao("dialogo");

    expect(quantos(dialogos, "dialog[open]")).toBe(4);
    expect(quantos(dialogos, "dialog[aria-busy='true']")).toBe(1);
    expect(quantos(dialogos, "dialog .sc-estado--erro[role='alert']")).toBe(1);
    expect(quantos(dialogos, "dialog .sc-estado--sucesso")).toBe(1);
    // Todo diálogo tem nome acessível, inclusive nos estados de exceção.
    expect(quantos(dialogos, "dialog[aria-labelledby]")).toBe(4);
  });

  it("@spec:AC-013 a identidade da loja aparece nas duas situações: a que passa e a que precisa de conserto", () => {
    const tema = secao("tema");
    const envelopes = tema.querySelectorAll<HTMLElement>(".sc-tema-loja");

    expect(envelopes).toHaveLength(2);
    for (const envelope of envelopes) {
      expect(envelope.getAttribute("style")).toContain("--cor-primaria");
    }
    // Uma das duas cores força o conserto de contraste — é o que a página
    // precisa demonstrar, e não só a cor que já dava certo (AC-015).
    expect(quantos(tema, "[data-contraste-ajustado='sim']")).toBe(1);
  });

  it("@spec:AC-013 a vitrine cobre os seis componentes base, e não um subconjunto", () => {
    for (const nome of [
      "botao",
      "campo",
      "cartao",
      "lista",
      "aviso",
      "dialogo",
    ]) {
      expect(() => secao(nome)).not.toThrow();
    }
  });
});
