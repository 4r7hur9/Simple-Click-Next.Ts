/**
 * A montagem do ponta a ponta das CONFIGURAÇÕES DA LOJA (T-908).
 *
 * AS TELAS DE CONFIGURAÇÃO MEXEM NA LOJA DO PAINEL INTEIRA. Pagamento, entrega,
 * horário, contato, apresentação e impressão são da loja, e não de um produto:
 * dois cenários configurando ao mesmo tempo — os dois projetos do Playwright
 * rodam o mesmo arquivo em paralelo — leriam a configuração um do outro. Por
 * isso cada cenário roda com a loja SÓ PARA ELE (`comALojaDoPainelSoParaMim`).
 *
 * A EXCLUSIVIDADE É A MESMA TRAVA DA MONTAGEM (`fixtures/painel.ts`). Quem
 * monta a loja do painel no começo de outro arquivo espera o cenário terminar,
 * em vez de regravar pagamento e horário no meio da prova dele.
 *
 * A LOJA VOLTA COMO ESTAVA. Antes do cenário, a linha da loja, a configuração,
 * a grade da semana e as datas especiais são fotografadas; depois, qualquer
 * que seja o resultado, voltam ao que eram, e o site é avisado para esquecer a
 * vitrine — o mesmo aviso que a API dá quando o dono salva.
 */
import { randomUUID } from "node:crypto";

import { expect, type Page } from "@playwright/test";
import { Client } from "pg";

import { ENDERECO_DO_SITE } from "../playwright.config.ts";
import { APELIDO_DO_PAINEL, garantirLojaDoPainel } from "./painel.ts";
import { jaEscolheuOsCookies } from "./redesign.ts";

/** Mesma chave da montagem da loja do painel (`fixtures/painel.ts`). */
const TRAVA_DA_LOJA_DO_PAINEL = 8_142_310;

/** O que o cenário recebe enquanto tem a loja só para ele. */
export interface LojaExclusiva {
  readonly id: string;
  readonly apelido: string;
}

/** Uma tabela fotografada: as linhas da loja, como JSON. */
interface Foto {
  readonly tabela: string;
  readonly chave: "id" | "store_id";
  readonly linhas: unknown[];
}

/** As tabelas que alguma seção de configuração altera. */
const TABELAS = [
  { tabela: "stores", chave: "id" },
  { tabela: "store_settings", chave: "store_id" },
  { tabela: "store_hours", chave: "store_id" },
  { tabela: "store_hour_exceptions", chave: "store_id" },
] as const;

function conectar(): Client {
  const url = process.env["DATABASE_URL_DIRETA"];
  if (url === undefined || url === "") {
    throw new Error(
      "o ponta a ponta das configurações precisa de DATABASE_URL_DIRETA",
    );
  }
  return new Client({ connectionString: url });
}

/** As colunas graváveis de uma tabela (as geradas o banco recalcula sozinho). */
async function colunas(cliente: Client, tabela: string): Promise<string[]> {
  const { rows } = await cliente.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'app' AND table_name = $1 AND is_generated = 'NEVER'
      ORDER BY ordinal_position`,
    [tabela],
  );
  return rows.map((linha) => `"${linha.column_name}"`);
}

async function fotografar(cliente: Client, lojaId: string): Promise<Foto[]> {
  const fotos: Foto[] = [];
  for (const { tabela, chave } of TABELAS) {
    const { rows } = await cliente.query<{ linha: unknown }>(
      `SELECT to_jsonb(t) AS linha FROM app.${tabela} t WHERE t.${chave} = $1`,
      [lojaId],
    );
    fotos.push({ tabela, chave, linhas: rows.map((r) => r.linha) });
  }
  return fotos;
}

/** A linha única (loja ou configuração) volta por UPDATE, coluna a coluna. */
async function regravarLinha(
  cliente: Client,
  lojaId: string,
  { tabela, chave, linhas }: Foto,
): Promise<void> {
  const lista = await colunas(cliente, tabela);
  const semChave = lista.filter((c) => c !== `"${chave}"`).join(", ");
  for (const linha of linhas) {
    await cliente.query(
      `UPDATE app.${tabela} t SET (${semChave}) =
         (SELECT ${semChave} FROM jsonb_populate_record(NULL::app.${tabela}, $2::jsonb))
       WHERE t.${chave} = $1`,
      [lojaId, JSON.stringify(linha)],
    );
  }
}

/** A grade e as datas especiais são apagadas e regravadas como na foto. */
async function regravarLinhas(
  cliente: Client,
  lojaId: string,
  { tabela, chave, linhas }: Foto,
): Promise<void> {
  const nomes = (await colunas(cliente, tabela)).join(", ");
  await cliente.query(`DELETE FROM app.${tabela} WHERE ${chave} = $1`, [
    lojaId,
  ]);
  if (linhas.length === 0) return;
  await cliente.query(
    `INSERT INTO app.${tabela} (${nomes})
     SELECT ${nomes} FROM jsonb_populate_recordset(NULL::app.${tabela}, $1::jsonb)`,
    [JSON.stringify(linhas)],
  );
}

/**
 * Devolve cada tabela ao que a foto mostra. A loja e a configuração são uma
 * linha só, e voltam por UPDATE; a grade e as datas são apagadas e regravadas.
 */
async function restaurar(
  cliente: Client,
  lojaId: string,
  fotos: readonly Foto[],
): Promise<void> {
  await cliente.query("BEGIN");
  try {
    for (const foto of fotos) {
      if (foto.tabela === "stores" || foto.tabela === "store_settings") {
        await regravarLinha(cliente, lojaId, foto);
      } else {
        await regravarLinhas(cliente, lojaId, foto);
      }
    }
    await cliente.query("COMMIT");
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => undefined);
    throw erro;
  }
}

/**
 * Pede ao site que esqueça a vitrine da loja — o mesmo aviso que a API dá
 * quando o dono salva (dívida 93). Sem ele, a restauração direta no banco
 * ficaria invisível por até um minuto para o cenário seguinte.
 */
export async function avisarOSite(enderecoDoSite: string): Promise<void> {
  const segredo = process.env["SEGREDO_DE_REVALIDACAO"]?.trim();
  if (segredo === undefined || segredo === "") return;
  await fetch(`${enderecoDoSite}/api/revalidate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-simpleclick-revalidacao": segredo,
    },
    body: JSON.stringify({ apelido: APELIDO_DO_PAINEL }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => undefined);
}

/**
 * Roda o cenário com a loja do painel só para ele, e a devolve como estava.
 *
 * A trava é de sessão do PostgreSQL: se o processo morrer no meio, a conexão
 * cai e a trava solta sozinha.
 */
export async function comALojaDoPainelSoParaMim<T>(
  enderecoDoSite: string,
  cenario: (loja: LojaExclusiva) => Promise<T>,
): Promise<T> {
  const { id } = await garantirLojaDoPainel();
  const cliente = conectar();
  await cliente.connect();
  try {
    await cliente.query("SELECT pg_advisory_lock($1)", [
      TRAVA_DA_LOJA_DO_PAINEL,
    ]);
    const fotos = await fotografar(cliente, id);
    try {
      return await cenario({ id, apelido: APELIDO_DO_PAINEL });
    } finally {
      await restaurar(cliente, id, fotos);
      await avisarOSite(enderecoDoSite);
    }
  } finally {
    await cliente
      .query("SELECT pg_advisory_unlock($1)", [TRAVA_DA_LOJA_DO_PAINEL])
      .catch(() => undefined);
    await cliente.end();
  }
}

/** Uma chave de idempotência nova para um pedido do cenário. */
export function chaveDeIdempotencia(): string {
  return `e2e-config-${randomUUID()}`;
}

/** O dia da semana (0 = domingo) agora, no fuso da loja. */
export function diaDaSemanaNaLoja(fuso = "America/Sao_Paulo"): number {
  const nome = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    weekday: "short",
  }).format(new Date());
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(nome);
}

/**
 * O cliente põe um produto na sacola, pela página do produto, e vai ao
 * fechamento.
 *
 * TEXTOS DO REDESIGN (card #132, os mesmos que o #114 ajustou nos cenários de
 * compra): o botão da janela do produto é "Adicionar à sacola" e a confirmação
 * diz "Adicionado à sacola" (no celular, num aviso; no computador, só ao
 * leitor de tela, e a coluna da sacola mostra o item). O aviso de cookies é
 * escolhido antes, para não ficar por cima do botão. Quem chama já entrou
 * (o pedido exige conta): os cenários de configuração entram como dono.
 */
export async function irAoFechamentoCom(
  pagina: Page,
  apelido: string,
  produtoIds: readonly string[],
): Promise<void> {
  const origem = new URL(
    pagina.url() === "about:blank" ? ENDERECO_DO_SITE : pagina.url(),
  ).origin;
  await jaEscolheuOsCookies(pagina.context(), origem);
  for (const produtoId of produtoIds) {
    await pagina.goto(`/loja/${apelido}/produto/${produtoId}`);
    const janela = pagina.locator("dialog.sc-janela-produto[open]");
    await janela.getByRole("button", { name: /Adicionar à sacola/ }).click();
    await expect(
      pagina.getByText(/Adicionado à sacola/).first(),
    ).toBeAttached();
  }
  await pagina.goto(`/loja/${apelido}/checkout`);
}
