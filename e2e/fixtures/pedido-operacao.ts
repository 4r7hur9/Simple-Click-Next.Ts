/**
 * A montagem do ponta a ponta da OPERAÇÃO DO PEDIDO (T-611).
 *
 * O PEDIDO NASCE NA VITRINE, pelo caminho do cliente: página do produto,
 * fechamento e "Fechar pedido". É esse pedido que o dono vê chegar na fila e
 * faz andar, e o cliente acompanha pelo link que o fechamento devolve.
 *
 * DUAS PESSOAS, DOIS NAVEGADORES. O dono e o cliente ficam em contextos
 * separados: o cookie de sessão do dono nunca vai junto com o pedido do
 * cliente, como na vida real.
 *
 * O PEDIDO NÃO FICA. Ele é apagado no fim do cenário, qualquer que seja o
 * resultado: fila com pedido de teste é fila em que ninguém confia.
 */
import {
  expect,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { Client } from "pg";

import { ENDERECO_DO_SITE } from "../playwright.config.ts";
import { interceptarWhatsApp } from "./intercepts.ts";
import { clienteLogado } from "./redesign-lojas.ts";
import { jaEscolheuOsCookies } from "./redesign.ts";

function conectar(): Client {
  const url = process.env["DATABASE_URL_DIRETA"];
  if (url === undefined || url === "") {
    throw new Error(
      "o ponta a ponta da operação precisa de DATABASE_URL_DIRETA",
    );
  }
  return new Client({ connectionString: url });
}

/** Um navegador novo, com a mesma tela do projeto do Playwright. */
export async function outroNavegador(
  navegador: Browser,
  info: TestInfo,
): Promise<BrowserContext> {
  return navegador.newContext({
    baseURL: ENDERECO_DO_SITE,
    viewport: info.project.use.viewport ?? null,
  });
}

/** Como o cliente quer receber o pedido. */
export type ModoDoPedido = "retirada" | "entrega";

/** O pedido que o cliente fecha: em que loja, de qual produto, por quem e como. */
export interface PedidoNaVitrine {
  readonly apelido: string;
  readonly produtoId: string;
  readonly nomeDoCliente: string;
  readonly modo: ModoDoPedido;
}

/**
 * O cliente fecha um pedido de um produto na vitrine, pagando em dinheiro, e
 * recebe o endereço do acompanhamento. Devolve o código público do link.
 *
 * O PEDIDO EXIGE CONTA desde o redesign (o "Seu nome" de convidado saiu): o
 * cliente entra com uma conta nova cujo nome é `nomeDoCliente` — é esse nome
 * que o dono vê na fila e o acompanhamento mostra. A assinatura não mudou.
 */
export async function fazerPedidoNaVitrine(
  pagina: Page,
  { apelido, produtoId, nomeDoCliente, modo }: PedidoNaVitrine,
): Promise<string> {
  await interceptarWhatsApp(pagina);
  await jaEscolheuOsCookies(pagina.context(), ENDERECO_DO_SITE);
  await clienteLogado(pagina.context(), ENDERECO_DO_SITE, nomeDoCliente);
  await pagina.goto(`/loja/${apelido}/produto/${produtoId}`);
  await pagina.getByRole("button", { name: /Adicionar à sacola/ }).click();
  await expect(pagina.getByText(/Adicionado à sacola/).first()).toBeVisible();
  await pagina.goto(`/loja/${apelido}/checkout`);
  if (modo === "retirada") {
    await pagina.getByLabel("Retirar no local").check();
  } else {
    await pagina.getByLabel("Receber em casa").check();
    await pagina.getByLabel("Rua ou avenida").fill("Rua das Flores");
    await pagina
      .getByRole("textbox", { name: "Número", exact: true })
      .fill("123");
    await pagina.getByLabel("Bairro").fill("Centro");
  }
  await pagina
    .getByRole("group", { name: "Forma de pagamento" })
    .getByLabel("Dinheiro")
    .check();
  await pagina.getByLabel(/Seu WhatsApp/).fill("11988887777");
  await pagina.getByRole("button", { name: "Confirmar pedido" }).click();

  const link = pagina.getByRole("link", { name: /Acompanhar/ }).first();
  await expect(link).toBeVisible();
  const endereco = (await link.getAttribute("href")) ?? "";
  const token = /\/pedido\/([^/?#]+)/.exec(endereco)?.[1];
  if (token === undefined) {
    throw new Error(`o fechamento não devolveu o link do pedido: ${endereco}`);
  }
  return token;
}

/** O pedido que o link alcança: identificador, número e o código das telas. */
export interface PedidoDoLink {
  readonly id: string;
  readonly numero: number;
  /** O código que toda tela mostra ("A-0004", card #135). */
  readonly codigo: string;
}

/** Procura no banco o pedido do código público do link. */
export async function pedidoDoLink(token: string): Promise<PedidoDoLink> {
  const cliente = conectar();
  await cliente.connect();
  try {
    const { rows } = await cliente.query<{
      id: string;
      number: string;
      code: string;
    }>(
      `SELECT id, number, code FROM app.orders WHERE public_token = $1`,
      [token],
    );
    const linha = rows[0];
    if (linha === undefined)
      throw new Error(`nenhum pedido com o link ${token}`);
    return { id: linha.id, numero: Number(linha.number), codigo: linha.code };
  } finally {
    await cliente.end();
  }
}

/** Um passo gravado no histórico: para onde foi, quem deu e quando. */
export interface PassoGravado {
  readonly para: string;
  readonly papel: string | null;
  readonly quem: string | null;
  readonly em: Date;
}

/** Os passos gravados no histórico do pedido, na ordem em que aconteceram. */
export async function historicoGravado(
  pedidoId: string,
): Promise<PassoGravado[]> {
  const cliente = conectar();
  await cliente.connect();
  try {
    const { rows } = await cliente.query<{
      to_status: string;
      actor_role: string | null;
      changed_by_identity_id: string | null;
      occurred_at: Date;
    }>(
      `SELECT to_status, actor_role, changed_by_identity_id, occurred_at
         FROM app.order_status_history
        WHERE order_id = $1
        ORDER BY occurred_at, created_at`,
      [pedidoId],
    );
    return rows.map((r) => ({
      para: r.to_status,
      papel: r.actor_role,
      quem: r.changed_by_identity_id,
      em: r.occurred_at,
    }));
  } finally {
    await cliente.end();
  }
}

/** Apaga os pedidos do cenário, do mais fundo para o mais raso. */
export async function apagarPedidos(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const cliente = conectar();
  await cliente.connect();
  try {
    await cliente.query(
      `DELETE FROM app.order_item_options WHERE order_item_id IN
         (SELECT id FROM app.order_items WHERE order_id = ANY($1::uuid[]))`,
      [ids],
    );
    for (const tabela of [
      "order_items",
      "order_status_history",
      "order_contacts",
    ]) {
      await cliente.query(
        `DELETE FROM app.${tabela} WHERE order_id = ANY($1::uuid[])`,
        [ids],
      );
    }
    await cliente.query(`DELETE FROM app.orders WHERE id = ANY($1::uuid[])`, [
      ids,
    ]);
  } finally {
    await cliente.end();
  }
}

declare global {
  interface Window {
    /** Quantas vezes o painel tocou o bipe de pedido novo. */
    __bipes?: number;
  }
}

/**
 * Troca o som do navegador por um contador, antes de a página carregar. O que
 * se prova é que o painel TOCA o aviso, e não que a máquina tem caixa de som.
 */
export async function contarBipes(contexto: BrowserContext): Promise<void> {
  await contexto.addInitScript(() => {
    window.__bipes = 0;
    class SomContado {
      readonly currentTime = 0;
      readonly destination = {};
      createOscillator() {
        return {
          frequency: { value: 0 },
          connect: () => undefined,
          start: () => {
            window.__bipes = (window.__bipes ?? 0) + 1;
          },
          stop: () => undefined,
          addEventListener: () => undefined,
        };
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: () => undefined,
            exponentialRampToValueAtTime: () => undefined,
          },
          connect: () => undefined,
        };
      }
      close() {
        return Promise.resolve();
      }
    }
    (window as unknown as { AudioContext: unknown }).AudioContext = SomContado;
  });
}

/** Quantos bipes a página já tocou. */
export function bipes(pagina: Page): Promise<number> {
  return pagina.evaluate(() => window.__bipes ?? 0);
}
