/**
 * Escolhe uma opção do `Seletor` do `@simpleclick/ui`.
 *
 * O Seletor não é um `<select>`: é um botão `role="combobox"` com a lista
 * própria. A pessoa abre a lista e clica na opção; o cenário faz o mesmo.
 */
import { expect, type Locator, type Page } from "@playwright/test";

export async function escolherNoSeletor(
  page: Page,
  gatilho: Locator,
  rotulo: string,
): Promise<void> {
  await gatilho.click();
  await expect(gatilho).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("option", { name: rotulo, exact: true }).click();
  await expect(gatilho).toContainText(rotulo);
}
