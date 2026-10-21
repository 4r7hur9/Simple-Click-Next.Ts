/**
 * Apoio para provar telas que usam o `Seletor` do `@simpleclick/ui`.
 *
 * O Seletor não é um `<select>`: é um botão `role="combobox"` com a lista
 * própria. O teste escolhe como a pessoa escolheria — abre a lista e clica na
 * opção —, e não trocando `value` por baixo, que o React nem enxergaria.
 */
import { act } from "react";

/** O envelope `.sc-seletor` de um botão (ou de qualquer coisa dentro dele). */
function envelopeDe(alvo: Element): HTMLElement {
  const envelope = alvo.closest<HTMLElement>(".sc-seletor");
  if (envelope === null) {
    throw new Error("O elemento não está dentro de um Seletor (.sc-seletor).");
  }
  return envelope;
}

/** O botão `role="combobox"` de um Seletor. */
export function botaoDoSeletor(alvo: Element): HTMLButtonElement {
  const botao = envelopeDe(alvo).querySelector<HTMLButtonElement>(
    'button[role="combobox"]',
  );
  if (botao === null) throw new Error("Seletor sem botão combobox.");
  return botao;
}

/** É o botão de um Seletor? Serve para os `digitar` antigos desviarem. */
export function eSeletor(alvo: Element): alvo is HTMLButtonElement {
  return (
    alvo instanceof HTMLButtonElement &&
    alvo.getAttribute("role") === "combobox" &&
    alvo.closest(".sc-seletor") !== null
  );
}

/** O botão do Seletor que envia o campo `nome` no formulário. */
export function seletorPeloNome(
  dentro: ParentNode,
  nome: string,
): HTMLButtonElement {
  const campo = dentro.querySelector(`.sc-seletor input[name="${nome}"]`);
  if (campo === null) throw new Error(`não achei o Seletor "${nome}" na tela`);
  return botaoDoSeletor(campo);
}

/**
 * As opções do Seletor, na ordem em que aparecem. A lista só existe aberta:
 * abre, lê e fecha de novo se estava fechada.
 */
export function opcoesDoSeletor(
  alvo: Element,
): { valor: string; rotulo: string; desabilitada: boolean }[] {
  const botao = botaoDoSeletor(alvo);
  const fechado = botao.getAttribute("aria-expanded") !== "true";
  if (fechado) act(() => botao.click());
  const opcoes = [
    ...envelopeDe(botao).querySelectorAll<HTMLElement>('[role="option"]'),
  ].map((opcao) => ({
    valor: opcao.dataset["valor"] ?? "",
    rotulo: opcao.textContent?.trim() ?? "",
    desabilitada: opcao.getAttribute("aria-disabled") === "true",
  }));
  if (fechado) act(() => botao.click());
  return opcoes;
}

/** Abre o Seletor e clica na opção de valor `valor`. */
export function escolherNoSeletor(alvo: Element, valor: string): void {
  const botao = botaoDoSeletor(alvo);
  if (botao.getAttribute("aria-expanded") !== "true") {
    act(() => botao.click());
  }
  const opcao = [
    ...envelopeDe(botao).querySelectorAll<HTMLElement>('[role="option"]'),
  ].find((cada) => cada.dataset["valor"] === valor);
  if (opcao === undefined) {
    throw new Error(`O Seletor #${botao.id} não tem a opção "${valor}".`);
  }
  act(() => opcao.click());
}
