// @vitest-environment jsdom
/**
 * O Seletor do `@simpleclick/ui`, que substitui todo `<select>` do site.
 *
 * Prova o contrato de troca direta (os mesmos `<option>`, `value`, `name` e
 * `onChange` com o valor), o teclado do padrão combobox do APG, a busca das
 * listas longas e a árvore de acessibilidade (axe).
 */
import axe from "axe-core";
import { act, useState } from "react";
import { Seletor } from "@simpleclick/ui";
import { afterEach, describe, expect, it, vi } from "vitest";

import { desmontar, exigir, montar } from "./apoio-config.tsx";
import { escolherNoSeletor, opcoesDoSeletor } from "./apoio-seletor.ts";

afterEach(desmontar);

function teclar(alvo: Element, key: string, extra: KeyboardEventInit = {}) {
  act(() => {
    alvo.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, ...extra }),
    );
  });
}

const UFS = [
  "AC",
  "AL",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "SP",
];

function Controlado({ aoMudar }: { aoMudar: (valor: string) => void }) {
  const [uf, setUf] = useState("");
  return (
    <form aria-label="Endereço">
      <label htmlFor="uf">Estado</label>
      <Seletor
        id="uf"
        name="uf"
        value={uf}
        onChange={(valor) => {
          setUf(valor);
          aoMudar(valor);
        }}
      >
        <option value="">Escolha…</option>
        {UFS.map((cada) => (
          <option key={cada} value={cada}>
            {cada}
          </option>
        ))}
      </Seletor>
    </form>
  );
}

describe("Seletor", () => {
  it("lê os <option> filhos e mostra a escolhida no botão", () => {
    const tela = montar(
      <Seletor id="s" defaultValue="b" aria-label="Letra">
        <option value="a">Alfa</option>
        <option value="b">Bravo</option>
        <optgroup label="Mais">
          <option value="c" disabled>
            Charlie {"(esgotado)"}
          </option>
        </optgroup>
      </Seletor>,
    );
    const botao = exigir<HTMLButtonElement>(tela, "#s");
    expect(botao.getAttribute("role")).toBe("combobox");
    expect(botao.value).toBe("b");
    expect(botao.textContent).toContain("Bravo");
    expect(opcoesDoSeletor(botao)).toEqual([
      { valor: "a", rotulo: "Alfa", desabilitada: false },
      { valor: "b", rotulo: "Bravo", desabilitada: false },
      { valor: "c", rotulo: "Charlie (esgotado)", desabilitada: true },
    ]);
    // Fechado, a lista não aparece para ninguém, nem fica no DOM.
    expect(exigir(tela, '[role="listbox"]').closest("[hidden]")).not.toBeNull();
    expect(tela.querySelectorAll('[role="option"]')).toHaveLength(0);
  });

  it("escolhe pelo clique, chama onChange com o valor e leva o valor no form", () => {
    const aoMudar = vi.fn();
    const tela = montar(<Controlado aoMudar={aoMudar} />);
    const botao = exigir<HTMLButtonElement>(tela, "#uf");

    escolherNoSeletor(botao, "SP");

    expect(aoMudar).toHaveBeenCalledWith("SP");
    expect(botao.value).toBe("SP");
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    const dados = new FormData(exigir<HTMLFormElement>(tela, "form"));
    expect(dados.get("uf")).toBe("SP");
  });

  it("anda pelo teclado: setas, Home/End, Enter, Esc e letra", () => {
    const aoMudar = vi.fn();
    const tela = montar(
      <Seletor id="s" aria-label="Status" onChange={aoMudar} busca={false}>
        <option value="DRAFT">Rascunho</option>
        <option value="X" disabled>
          Indisponível
        </option>
        <option value="PUBLISHED">Publicado</option>
        <option value="ARCHIVED">Arquivado</option>
      </Seletor>,
    );
    const botao = exigir<HTMLButtonElement>(tela, "#s");
    const ativa = () =>
      document.getElementById(botao.getAttribute("aria-activedescendant") ?? "")
        ?.dataset["valor"];

    teclar(botao, "ArrowDown");
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    expect(ativa()).toBe("DRAFT");

    // Pula a desabilitada.
    teclar(botao, "ArrowDown");
    expect(ativa()).toBe("PUBLISHED");
    teclar(botao, "End");
    expect(ativa()).toBe("ARCHIVED");
    teclar(botao, "Home");
    expect(ativa()).toBe("DRAFT");

    teclar(botao, "Escape");
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    expect(aoMudar).not.toHaveBeenCalled();

    // Digitar o começo pula até a opção.
    teclar(botao, "a");
    expect(ativa()).toBe("ARCHIVED");
    teclar(botao, "Enter");
    expect(aoMudar).toHaveBeenCalledWith("ARCHIVED");
    expect(botao.value).toBe("ARCHIVED");
    expect(document.activeElement).toBe(botao);
  });

  it("lista longa ganha busca que ignora acento e maiúscula", () => {
    const cidades = [
      "Belo Horizonte",
      "Brasília",
      "Goiânia",
      "São Paulo",
      "São Luís",
      "Salvador",
      "Santos",
      "Recife",
      "Natal",
      "Manaus",
      "Maceió",
      "Curitiba",
      "Cuiabá",
    ];
    const aoMudar = vi.fn();
    const tela = montar(
      <Seletor
        id="cidade"
        aria-label="Cidade"
        onChange={aoMudar}
        opcoes={cidades.map((nome) => ({ valor: nome, rotulo: nome }))}
      />,
    );
    const botao = exigir<HTMLButtonElement>(tela, "#cidade");
    act(() => botao.click());
    const busca = exigir<HTMLInputElement>(tela, ".sc-seletor__busca input");

    const atribuir = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    act(() => {
      atribuir?.call(busca, "sao");
      busca.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const visiveis = [...tela.querySelectorAll('[role="option"]')].map(
      (opcao) => opcao.textContent,
    );
    expect(visiveis).toEqual(["São Paulo", "São Luís"]);

    teclar(busca, "ArrowDown");
    teclar(busca, "Enter");
    expect(aoMudar).toHaveBeenCalledWith("São Luís");
  });

  it("fecha ao tocar fora, sem escolher nada", () => {
    const aoMudar = vi.fn();
    const tela = montar(
      <div>
        <button type="button">fora</button>
        <Seletor id="s" aria-label="Letra" onChange={aoMudar}>
          <option value="a">A</option>
          <option value="b">B</option>
        </Seletor>
      </div>,
    );
    const botao = exigir<HTMLButtonElement>(tela, "#s");
    act(() => botao.click());
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    act(() => {
      tela
        .querySelector("button")
        ?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    expect(aoMudar).not.toHaveBeenCalled();
  });

  it("desabilitado não abre, e obrigatório leva o campo de validação", () => {
    const tela = montar(
      <form>
        <Seletor id="s" aria-label="Tipo" name="tipo" disabled required>
          <option value="">Escolha…</option>
        </Seletor>
      </form>,
    );
    const botao = exigir<HTMLButtonElement>(tela, "#s");
    act(() => botao.click());
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    const campo = exigir<HTMLInputElement>(tela, 'input[name="tipo"]');
    expect(campo.required).toBe(true);
  });

  it("aberto ou fechado, passa no axe", async () => {
    const tela = montar(<Controlado aoMudar={() => undefined} />);
    const fechado = await axe.run(tela);
    expect(fechado.violations).toEqual([]);

    act(() => exigir<HTMLButtonElement>(tela, "#uf").click());
    const aberto = await axe.run(tela);
    expect(aberto.violations).toEqual([]);
  });
});
