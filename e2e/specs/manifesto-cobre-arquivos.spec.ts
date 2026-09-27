/**
 * Toda tela que existe está declarada no manifesto (AC-016).
 *
 * ESTA É A DIREÇÃO QUE IMPORTA HOJE. Uma tela que entra no produto sem linha no
 * manifesto entra sem ninguém ter decidido que ela existe: sem os quatro
 * estados, sem verificação de acessibilidade e sem critério que a cubra. O
 * inventário vira aspiração, e "todas as telas" deixa de significar nada.
 *
 * NÃO ABRE NAVEGADOR. É leitura de disco, e por isso é a verificação mais
 * barata do ponta a ponta — roda em milissegundos e pega o erro no dia em que
 * ele acontece.
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import {
  MANIFESTO_DE_ROTAS,
  rotaDoArquivo,
} from "../../apps/web/src/lib/routes.ts";

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const PASTA_DE_ROTAS = join(RAIZ, "apps/web/src/app");

/**
 * Telas que existem e NÃO entram no inventário, com o motivo de cada uma.
 *
 * A lista é curta de propósito, e cada nome aqui é uma decisão. Ela existe
 * porque nem tudo que o framework chama de rota é TELA DO PRODUTO.
 */
const FORA_DO_INVENTARIO = new Set([
  // Vitrine do design system: ferramenta de quem constrói, não do produto.
  // Ela É verificada por acessibilidade, em `vitrine-ui-a11y.test.tsx`.
  "/ui",
]);

async function arquivosDePagina(pasta: string): Promise<string[]> {
  const entradas = await readdir(pasta, { withFileTypes: true });
  const achados: string[] = [];
  for (const entrada of entradas) {
    const caminho = join(pasta, entrada.name);
    if (entrada.isDirectory()) {
      achados.push(...(await arquivosDePagina(caminho)));
    } else if (entrada.name === "page.tsx") {
      achados.push(caminho);
    }
  }
  return achados;
}

test("@spec:AC-016 toda tela do código tem linha no manifesto", async () => {
  const arquivos = await arquivosDePagina(PASTA_DE_ROTAS);

  // Sem esta asserção, um erro na varredura devolveria lista vazia e o teste
  // passaria por não ter olhado nada — que é como um teste de cobertura mente.
  expect(arquivos.length).toBeGreaterThan(3);

  const declaradas = new Set(MANIFESTO_DE_ROTAS.map((tela) => tela.rota));
  const semLinha = arquivos
    .map((arquivo) => rotaDoArquivo(arquivo))
    .filter((rota): rota is string => rota !== null)
    .filter((rota) => !declaradas.has(rota) && !FORA_DO_INVENTARIO.has(rota));

  expect(
    semLinha,
    `tela sem linha no manifesto: ${semLinha.join(", ")}. ` +
      `Acrescente a linha em .spec/design/mapa-de-telas.md e em ` +
      `apps/web/src/lib/routes.ts — uma tela nova só entra no produto junto ` +
      `da linha que a declara.`,
  ).toEqual([]);
});

test("@spec:AC-016 o manifesto aponta para arquivos que existem de verdade", async () => {
  // O caminho errado numa linha faria a verificação de cobertura passar por
  // engano: ela procuraria um arquivo que nunca existiu e não acharia nada.
  const arquivos = new Set(await arquivosDePagina(PASTA_DE_ROTAS));

  const fantasmas = MANIFESTO_DE_ROTAS.filter(
    (tela) => tela.arquivo !== undefined,
  )
    .map((tela) => join(RAIZ, tela.arquivo as string))
    .filter((caminho) => !arquivos.has(caminho));

  expect(
    fantasmas,
    `linha aponta para arquivo inexistente: ${fantasmas.join(", ")}`,
  ).toEqual([]);
});

test("@spec:AC-016 o inventário conta quantas telas faltam construir", async () => {
  // NÃO REPROVA: é trabalho planejado, e o número existe para aparecer. O dia
  // em que ele parar de cair é o dia de perguntar por quê.
  const construidas = MANIFESTO_DE_ROTAS.filter(
    (tela) => tela.arquivo !== undefined,
  );

  // 51 linhas no mapa de telas; três delas declaram duas rotas cada.
  expect(MANIFESTO_DE_ROTAS.length).toBe(54);
  expect(construidas.length).toBeGreaterThan(0);
});
