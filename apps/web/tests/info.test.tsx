// @vitest-environment jsdom
/**
 * O "i" (Info) do `@simpleclick/ui`: abre e fecha por clique, teclado, Esc,
 * clique fora e rolagem; o balão vai para o `<body>` (ou para o `<dialog>`
 * aberto em volta) e o texto fica ligado ao controle por `aria-describedby`.
 *
 * A posição em si (flip e shift) é provada em `packages/ui/tests/info.test.tsx`,
 * na função pura; aqui só se confere que ela chega ao estilo do balão.
 */
import axe from "axe-core";
import { act } from "react";
import { Campo, Info } from "@simpleclick/ui";
import { afterEach, describe, expect, it } from "vitest";

import { clicar, desmontar, montar } from "./apoio-config.tsx";

function exigir<T>(valor: T | null | undefined, nome: string): T {
  if (valor === null || valor === undefined) throw new Error(`não achei ${nome}`);
  return valor;
}

afterEach(desmontar);

const CONTEUDO = {
  titulo: "Acréscimo",
  texto: "Valor somado ao preço quando o cliente escolhe esta opção.",
  exemplo: "borda recheada + R$ 8,00",
};

function botaoDoInfo(raiz: ParentNode = document): HTMLButtonElement {
  return exigir(
    raiz.querySelector<HTMLButtonElement>(".sc-info__botao"),
    "botão do Info",
  );
}

function balao(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="tooltip"]');
}

function teclar(alvo: EventTarget, key: string) {
  const evento = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    alvo.dispatchEvent(evento);
  });
  return evento;
}

describe("Info", () => {
  it("abre no clique, fora da árvore, com título, texto e exemplo", () => {
    const raiz = montar(<Info id="acr" rotulo="Acréscimo (R$)" conteudo={CONTEUDO} />);
    const botao = botaoDoInfo(raiz);
    expect(botao.getAttribute("aria-label")).toBe(
      "Saiba mais sobre Acréscimo (R$)",
    );
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    expect(balao()).toBeNull();

    clicar(botao);
    const caixa = exigir(balao(), "balão");
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    expect(botao.getAttribute("aria-controls")).toBe(caixa.id);
    // Portal: não fica dentro do contêiner que poderia cortá-lo.
    expect(raiz.contains(caixa)).toBe(false);
    expect(caixa.parentElement).toBe(document.body);
    expect(caixa.textContent).toContain("Acréscimo");
    expect(caixa.textContent).toContain("Ex.: borda recheada + R$ 8,00");
    // A posição calculada chegou ao estilo.
    expect(caixa.style.top).not.toBe("");
    expect(caixa.style.left).toMatch(/px$/);
    expect(caixa.dataset["lado"]).toMatch(/^(cima|baixo)$/);

    clicar(botao);
    expect(balao()).toBeNull();
  });

  it("Esc fecha sem deixar a tecla chegar ao diálogo em volta", () => {
    const raiz = montar(<Info rotulo="Peso (kg)" conteudo="Peso embalado." />);
    const botao = botaoDoInfo(raiz);
    clicar(botao);
    expect(balao()).not.toBeNull();

    let chegou = false;
    const ouvinte = () => {
      chegou = true;
    };
    document.body.addEventListener("keydown", ouvinte);
    const evento = teclar(botao, "Escape");
    document.body.removeEventListener("keydown", ouvinte);

    expect(balao()).toBeNull();
    expect(evento.defaultPrevented).toBe(true);
    expect(chegou).toBe(false);
  });

  it("Enter e Espaço abrem (é um botão de verdade)", () => {
    const raiz = montar(<Info rotulo="SKU" conteudo="Código interno." />);
    const botao = botaoDoInfo(raiz);
    expect(botao.tagName).toBe("BUTTON");
    expect(botao.type).toBe("button");
    // O navegador transforma Enter/Espaço em clique no botão.
    botao.focus();
    clicar(botao);
    expect(balao()).not.toBeNull();
  });

  it("fecha com clique fora e ao rolar a página", () => {
    const raiz = montar(
      <div>
        <Info rotulo="Prazo" conteudo="Dias até ficar pronto." />
        <p id="fora">Outra coisa</p>
      </div>,
    );
    const botao = botaoDoInfo(raiz);

    clicar(botao);
    act(() => {
      raiz
        .querySelector("#fora")!
        .dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(balao()).toBeNull();

    // Rolagem que não mexe no "i" (o navegador ajustando a página) não fecha.
    clicar(botao);
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(balao()).not.toBeNull();

    // Rolagem de verdade: o "i" andou, o balão fecha.
    botao.getBoundingClientRect = () => new DOMRect(0, -120, 24, 24);
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(balao()).toBeNull();
  });

  it("dentro de um <dialog> aberto, o balão nasce no diálogo", () => {
    const raiz = montar(
      <dialog open>
        <Info rotulo="Estoque mínimo" conteudo="Avisa quando baixar disso." />
      </dialog>,
    );
    clicar(botaoDoInfo(raiz));
    const caixa = exigir(balao(), "balão");
    expect(caixa.parentElement).toBe(raiz.querySelector("dialog"));
  });
});

describe("Campo com info", () => {
  it("liga o texto do i ao controle e passa no axe", async () => {
    const raiz = montar(
      <form>
        <Campo
          id="acrescimo"
          rotulo="Acréscimo (R$)"
          dica="Deixe vazio se não cobra a mais."
          info={CONTEUDO}
        />
      </form>,
    );
    const campo = exigir(
      raiz.querySelector<HTMLInputElement>("#acrescimo"),
      "campo",
    );
    const ids = campo.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(ids).toEqual(["acrescimo-info", "acrescimo-dica"]);
    expect(document.getElementById("acrescimo-info")?.textContent).toContain(
      "Valor somado ao preço",
    );
    // O nome do controle é só o rótulo: o botão não fica dentro do <label>.
    expect(campo.labels?.[0]?.textContent).toBe("Acréscimo (R$)");

    const resultado = await axe.run(raiz);
    expect(resultado.violations).toEqual([]);
  });
});
