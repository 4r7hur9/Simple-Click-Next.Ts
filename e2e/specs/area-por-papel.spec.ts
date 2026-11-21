/**
 * Cada papel na própria área (card #170, T-6, D-10; CA-17).
 *
 * Quem abre uma área que não é a sua é levado pelo SERVIDOR para a área do
 * próprio papel, sem 404 e sem HTML da área pedida. Aqui se prova, no site de
 * verdade e com contas de verdade (administrador, dono, equipe e cliente):
 *
 * - `/explorar` abre para o visitante, para quem tem token vencido e até com a
 *   API fora do ar; só o administrador CONFIRMADO pela API é desviado;
 * - `/admin` e `/painel` mandam cada papel para a área dele, e o visitante para
 *   `/entrar` levando só o caminho;
 * - cookie `sc_loja` de loja alheia, com uma só loja na conta, abre o painel
 *   da própria loja com aviso;
 * - nenhum caso segue mais de 5 redirecionamentos, e nenhum repete endereço
 *   (sem laço).
 *
 * Roda só no e2e isolado (`node e2e/run-isolado.mjs`): as fixtures recusam
 * banco que não seja simpleclick_test ou sc_e2e_*.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import {
  conectarEmBancoDeTeste,
  garantirAdministrador,
  tokenDoAdministrador,
} from "../fixtures/admin.ts";
import {
  APELIDO_DO_PAINEL,
  garantirDonoDaLoja,
  garantirLojaDoPainel,
  tokenDoDono,
} from "../fixtures/painel.ts";
import { jaEscolheuOsCookies } from "../fixtures/redesign.ts";
import {
  criarClienteDeTeste,
  tokenDoCliente,
} from "../fixtures/redesign-lojas.ts";
import { ENDERECO_DA_API, ENDERECO_DO_SITE } from "../playwright.config.ts";

const MENU = "Administração da plataforma";
const REDIRECIONAMENTOS = [301, 302, 303, 307, 308];
/** O teto de saltos de qualquer caminho: acima disso é laço. */
const MAXIMO_DE_SALTOS = 5;

// ---------------------------------------------------------------------------
// As pessoas: contas de verdade, com o token que a API confere
// ---------------------------------------------------------------------------

type Papel =
  | "visitante"
  | "token invalido"
  | "cliente"
  | "dono"
  | "equipe"
  | "admin"
  | "ADMIN no token sem grant";

/** Um dono (OWNER) de uma só loja: a loja do painel, com e-mail próprio. */
async function tokenDeUmDono(): Promise<string> {
  const loja = await garantirLojaDoPainel();
  const banco = await conectarEmBancoDeTeste();
  try {
    const id = await garantirDonoDaLoja(
      banco,
      loja.id,
      `dono-${randomUUID().slice(0, 8)}@e2e-area.test`,
    );
    return tokenDoDono(id);
  } finally {
    await banco.end();
  }
}

/** Uma identidade de equipe (STAFF) vinculada à loja do painel. */
async function tokenDeUmaEquipe(): Promise<string> {
  const loja = await garantirLojaDoPainel();
  const banco = await conectarEmBancoDeTeste();
  try {
    const email = `equipe-${randomUUID().slice(0, 8)}@e2e-area.test`;
    const identidade = await banco.query<{ id: string }>(
      `INSERT INTO app.identities (email_norm, display_name, email_verified_at)
       VALUES ($1, 'Equipe do ponta a ponta', now()) RETURNING id`,
      [email],
    );
    const id = identidade.rows[0]?.id;
    if (id === undefined) throw new Error("sem identidade da equipe");
    await banco.query(
      `INSERT INTO app.store_members (store_id, identity_id, role, invite_accepted_at)
       VALUES ($1, $2, 'STAFF', now())`,
      [loja.id, id],
    );
    return tokenDoDono(id);
  } finally {
    await banco.end();
  }
}

/** O token de cada papel; `visitante` não tem. */
async function tokenDe(papel: Papel): Promise<string | undefined> {
  switch (papel) {
    case "visitante":
      return undefined;
    case "token invalido":
      return "token.invalido.assinatura";
    case "cliente":
      return tokenDoCliente(
        (await criarClienteDeTeste("Cliente")).identidadeId,
      );
    case "dono":
      return tokenDeUmDono();
    case "equipe":
      return tokenDeUmaEquipe();
    case "admin":
      return tokenDoAdministrador(await garantirAdministrador());
    case "ADMIN no token sem grant": {
      const pessoa = await criarClienteDeTeste("Admin sem grant");
      return tokenDoAdministrador(pessoa.identidadeId, "ADMIN");
    }
  }
}

async function entrarComo(
  contexto: BrowserContext,
  papel: Papel,
  site: string = ENDERECO_DO_SITE,
): Promise<void> {
  const token = await tokenDe(papel);
  if (token === undefined) return;
  await contexto.addCookies([
    {
      name: "sc_access",
      value: token,
      url: site,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

// ---------------------------------------------------------------------------
// Seguir os redirecionamentos na mão, contando saltos e procurando laço
// ---------------------------------------------------------------------------

interface Trajeto {
  /** Cada endereço visitado, do pedido ao último (caminho e consulta). */
  readonly enderecos: readonly string[];
  readonly status: number;
  readonly corpo: string;
}

async function seguir(
  contexto: BrowserContext,
  caminho: string,
  site: string = ENDERECO_DO_SITE,
): Promise<Trajeto> {
  let atual = new URL(caminho, site);
  const enderecos = [`${atual.pathname}${atual.search}`];
  for (let salto = 0; salto <= MAXIMO_DE_SALTOS; salto += 1) {
    const resposta = await contexto.request.get(atual.toString(), {
      maxRedirects: 0,
    });
    if (!REDIRECIONAMENTOS.includes(resposta.status())) {
      return {
        enderecos,
        status: resposta.status(),
        corpo: await resposta.text(),
      };
    }
    atual = new URL(resposta.headers()["location"] ?? "", atual);
    const endereco = `${atual.pathname}${atual.search}`;
    expect(
      enderecos,
      `laço: ${enderecos.join(" → ")} → ${endereco}`,
    ).not.toContain(endereco);
    enderecos.push(endereco);
  }
  throw new Error(
    `mais de ${MAXIMO_DE_SALTOS} redirecionamentos: ${enderecos.join(" → ")}`,
  );
}

/** O último endereço do trajeto. */
function fim(trajeto: Trajeto): string {
  return trajeto.enderecos[trajeto.enderecos.length - 1] ?? "";
}

const ENTRAR = (caminho: string) =>
  `/entrar?proximo=${encodeURIComponent(caminho)}`;

// ---------------------------------------------------------------------------
// /admin e /painel: cada papel vai para a área dele
// ---------------------------------------------------------------------------

test.describe("[CA-17] /admin e /painel levam cada papel para a área dele", () => {
  const ADMIN: ReadonlyArray<readonly [Papel, string]> = [
    ["visitante", ENTRAR("/admin")],
    ["token invalido", ENTRAR("/admin")],
    ["cliente", "/explorar/produtos"],
    ["dono", "/painel"],
    ["equipe", "/painel"],
    ["ADMIN no token sem grant", "/explorar/produtos"],
  ];

  for (const [papel, destino] of ADMIN) {
    test(`[CA-17] /admin: ${papel} termina em ${destino}, sem HTML da administração`, async ({
      context,
    }) => {
      await entrarComo(context, papel);
      const trajeto = await seguir(context, "/admin");
      expect(trajeto.enderecos.length - 1).toBeLessThanOrEqual(
        MAXIMO_DE_SALTOS,
      );
      expect(fim(trajeto)).toBe(destino);
      expect(trajeto.status).toBe(200);
      expect(trajeto.corpo).not.toContain(MENU);
      expect(trajeto.corpo).not.toContain("Navegação da administração");
      // Nunca 404 por falta de permissão: nenhum salto passou por uma tela 404.
      expect(trajeto.status).not.toBe(404);
    });
  }

  test("[CA-17] /admin: o administrador confirmado fica, com o menu", async ({
    context,
  }) => {
    await entrarComo(context, "admin");
    const trajeto = await seguir(context, "/admin");
    expect(trajeto.enderecos).toEqual(["/admin"]);
    expect(trajeto.status).toBe(200);
    expect(trajeto.corpo).toContain(MENU);
  });

  const PAINEL: ReadonlyArray<readonly [Papel, string]> = [
    ["visitante", ENTRAR("/painel")],
    ["token invalido", ENTRAR("/painel")],
    ["cliente", "/explorar/produtos"],
    // Administrador sem loja: a área dele é a administração.
    ["admin", "/admin"],
    ["dono", "/painel"],
    ["equipe", "/painel"],
  ];

  for (const [papel, destino] of PAINEL) {
    test(`[CA-17] /painel: ${papel} termina em ${destino}`, async ({
      context,
    }) => {
      await entrarComo(context, papel);
      const trajeto = await seguir(context, "/painel");
      expect(trajeto.enderecos.length - 1).toBeLessThanOrEqual(
        MAXIMO_DE_SALTOS,
      );
      expect(fim(trajeto)).toBe(destino);
      expect(trajeto.status).toBe(200);
    });
  }

  test("[CA-17] o visitante leva só o caminho em proximo, nunca consulta", async ({
    context,
  }) => {
    for (const caminho of [
      "/admin?x=1&proximo=https://golpe.example",
      "/painel?aba=1",
    ]) {
      const resposta = await context.request.get(
        `${ENDERECO_DO_SITE}${caminho}`,
        {
          maxRedirects: 0,
        },
      );
      expect(REDIRECIONAMENTOS).toContain(resposta.status());
      const destino = new URL(
        resposta.headers()["location"] ?? "",
        ENDERECO_DO_SITE,
      );
      expect(destino.pathname).toBe("/entrar");
      expect([...destino.searchParams.keys()]).toEqual(["proximo"]);
      expect(destino.searchParams.get("proximo")).toMatch(/^\/(admin|painel)$/);
    }
  });
});

// ---------------------------------------------------------------------------
// /explorar e /conta: abertas; só o administrador confirmado sai
// ---------------------------------------------------------------------------

test.describe("[CA-17] /explorar abre para quem não é administrador confirmado", () => {
  const ABERTAS = [
    "/explorar",
    "/explorar/produtos",
    "/explorar/lojas",
  ] as const;

  for (const papel of [
    "visitante",
    "token invalido",
    "cliente",
    "dono",
    "equipe",
  ] as const) {
    test(`[CA-17] ${papel}: /explorar abre sem nenhum redirecionamento`, async ({
      context,
    }) => {
      await entrarComo(context, papel);
      for (const caminho of ABERTAS) {
        const trajeto = await seguir(context, caminho);
        expect(trajeto.enderecos, `${papel} em ${caminho}`).toEqual([caminho]);
        expect(trajeto.status).toBe(200);
      }
    });
  }

  for (const papel of ["cliente", "dono", "equipe"] as const) {
    test(`[CA-17] ${papel}: Meus pedidos e Favoritos abrem; Dados abre o modal sobre Pedidos`, async ({
      context,
    }) => {
      await entrarComo(context, papel);
      for (const caminho of ["/conta/pedidos", "/conta/favoritos"]) {
        const trajeto = await seguir(context, caminho);
        expect(trajeto.enderecos, `${papel} em ${caminho}`).toEqual([caminho]);
        expect(trajeto.status).toBe(200);
      }
      const dados = await seguir(context, "/conta/dados");
      expect(fim(dados)).toBe("/conta/pedidos?conta=dados");
      expect(dados.status).toBe(200);
    });
  }

  test("[CA-17] só o administrador confirmado é desviado: cada área de cliente leva a /admin", async ({
    context,
  }) => {
    await entrarComo(context, "admin");
    for (const caminho of [
      "/explorar",
      "/explorar/produtos",
      "/explorar/lojas",
      "/conta",
      "/conta/pedidos",
      "/conta/pedidos/00000000-0000-4000-8000-000000000001",
      "/conta/favoritos",
    ]) {
      const trajeto = await seguir(context, caminho);
      expect(trajeto.enderecos.length - 1, caminho).toBeLessThanOrEqual(
        MAXIMO_DE_SALTOS,
      );
      expect(fim(trajeto), caminho).toBe("/admin");
      expect(trajeto.status).toBe(200);
      expect(trajeto.corpo).toContain(MENU);
    }
  });

  test("[CA-17] o modal Minha conta do administrador abre sobre /admin, na aba pedida", async ({
    context,
  }) => {
    await entrarComo(context, "admin");
    for (const aba of ["dados", "enderecos", "seguranca"]) {
      const trajeto = await seguir(context, `/conta/${aba}`);
      expect(fim(trajeto)).toBe(`/admin?conta=${aba}`);
      expect(trajeto.status).toBe(200);
    }
    const comEstado = await seguir(context, "/conta/seguranca?estado=erro");
    expect(fim(comEstado)).toBe("/admin?conta=seguranca&estado=erro");
    // Aba e estado de fora da lista não viajam.
    const lixo = await seguir(
      context,
      "/conta/pedidos?conta=%3Cscript%3E&estado=x",
    );
    expect(fim(lixo)).toBe("/admin");
  });

  test("[CA-17] o administrador que só TEM o token de ADMIN, sem grant na API, não é desviado", async ({
    context,
  }) => {
    await entrarComo(context, "ADMIN no token sem grant");
    const trajeto = await seguir(context, "/explorar/produtos");
    expect(trajeto.enderecos).toEqual(["/explorar/produtos"]);
    expect(trajeto.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Com a API fora do ar: /explorar abre, /painel e /admin fecham
// ---------------------------------------------------------------------------

test.describe("[CA-17] com a API fora do ar", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  /**
   * Uma segunda cópia do site (o MESMO build), apontando para uma API que não
   * existe. Uma porta por projeto do Playwright: os dois rodam ao mesmo tempo.
   */
  let site: ChildProcess | undefined;
  let enderecoSemApi = "";

  test.beforeAll(async () => {
    const raiz = fileURLToPath(new URL("../..", import.meta.url));
    const servidor = resolve(
      raiz,
      "apps/web/.next/standalone/apps/web/server.js",
    );
    if (!existsSync(servidor)) {
      throw new Error(
        `o build do site não está em ${servidor}: rode pelo run-isolado`,
      );
    }
    const porta = test.info().project.name === "celular" ? 3103 : 3102;
    enderecoSemApi = `http://localhost:${porta}`;
    site = spawn(
      process.execPath,
      ["--require", resolve(raiz, "e2e/fixtures/api-fora-do-ar.cjs"), servidor],
      {
        cwd: raiz,
        env: {
          ...process.env,
          NODE_ENV: "production",
          HOSTNAME: "localhost",
          PORT: String(porta),
          // O endereço da API entra no build do site; por isso a "queda" é feita
          // no `fetch` (fixtures/api-fora-do-ar.cjs), que recusa toda chamada a
          // este endereço, como a rede recusaria.
          NEXT_PUBLIC_API_URL: ENDERECO_DA_API,
          E2E_API_FORA_DO_AR: ENDERECO_DA_API,
          URL_DO_SITE: enderecoSemApi,
          NEXT_PUBLIC_DEV_STORE_SLUG: APELIDO_DO_PAINEL,
          NEXT_PUBLIC_SESSION_COOKIE_DOMAIN: "localhost",
        },
        stdio: "ignore",
      },
    );
    const limite = Date.now() + 90_000;
    for (;;) {
      try {
        await fetch(enderecoSemApi, { redirect: "manual" });
        break;
      } catch {
        if (Date.now() > limite) throw new Error("o site sem API não subiu");
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  });

  test.afterAll(() => {
    site?.kill("SIGTERM");
  });

  test("[CA-17] /explorar abre para o visitante", async ({ context }) => {
    for (const caminho of [
      "/explorar",
      "/explorar/produtos",
      "/explorar/lojas",
    ]) {
      const trajeto = await seguir(context, caminho, enderecoSemApi);
      expect(trajeto.enderecos).toEqual([caminho]);
      expect(trajeto.status).toBe(200);
    }
  });

  test("[CA-17] /explorar abre mesmo com o cookie de um administrador: sem a API não há confirmação, não há desvio", async ({
    context,
  }) => {
    await entrarComo(context, "admin", enderecoSemApi);
    for (const caminho of [
      "/explorar",
      "/explorar/produtos",
      "/conta/pedidos",
    ]) {
      const trajeto = await seguir(context, caminho, enderecoSemApi);
      expect(trajeto.enderecos, caminho).toEqual([caminho]);
      expect(trajeto.status).toBe(200);
    }
  });

  test("[CA-17] /admin fecha com erro (nunca 404 nem HTML da administração) e /painel cai na escolha da loja", async ({
    context,
  }) => {
    await entrarComo(context, "admin", enderecoSemApi);
    const admin = await context.request.get(`${enderecoSemApi}/admin`, {
      maxRedirects: 0,
    });
    expect(admin.status()).toBeGreaterThanOrEqual(500);
    const corpo = await admin.text();
    expect(corpo).not.toContain(MENU);
    expect(corpo).not.toContain("Navegação da administração");

    const painel = await seguir(context, "/painel", enderecoSemApi);
    expect(fim(painel)).toBe("/escolher-loja");
    expect(painel.status).toBe(200);
    expect(painel.corpo).toContain("Não foi possível carregar suas lojas");
  });
});

// ---------------------------------------------------------------------------
// sc_loja de loja alheia, com uma só loja na conta
// ---------------------------------------------------------------------------

test.describe("[CA-17] cookie sc_loja de loja alheia", () => {
  async function abrirNoNavegador(
    context: BrowserContext,
    page: Page,
    valorDoCookie: string,
  ): Promise<{ readonly saltos: number }> {
    await jaEscolheuOsCookies(context, ENDERECO_DO_SITE);
    await entrarComo(context, "dono");
    await context.addCookies([
      {
        name: "sc_loja",
        value: valorDoCookie,
        url: ENDERECO_DO_SITE,
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);
    let saltos = 0;
    page.on("response", (resposta) => {
      if (
        resposta.request().isNavigationRequest() &&
        REDIRECIONAMENTOS.includes(resposta.status())
      ) {
        saltos += 1;
      }
    });
    await page.goto("/painel");
    return { saltos };
  }

  for (const [caso, valor] of [
    ["de outra pessoa", "loja-de-outra-pessoa"],
    ["que não existe", "loja-que-nao-existe-mais"],
  ] as const) {
    test(`[CA-17] loja ${caso}, com uma só loja na conta: abre o painel da própria loja com aviso`, async ({
      context,
      page,
    }) => {
      const { saltos } = await abrirNoNavegador(context, page, valor);
      await expect(page).toHaveURL(/\/painel\?loja=trocada$/);
      await expect(page.getByText("Abrimos a sua loja")).toBeVisible();
      expect(saltos).toBeLessThanOrEqual(MAXIMO_DE_SALTOS);

      // A escolha foi regravada com a loja da própria conta.
      const cookie = (await context.cookies()).find(
        (c) => c.name === "sc_loja",
      );
      expect(cookie?.value).toBe(APELIDO_DO_PAINEL);
      expect(cookie?.httpOnly).toBe(true);

      // Sem laço e sem aviso de novo: o painel simplesmente abre.
      await page.goto("/painel");
      await expect(page).toHaveURL(/\/painel$/);
      await expect(page.getByText("Abrimos a sua loja")).toHaveCount(0);
    });
  }

  test("[CA-17] o aviso só aparece com o valor exato e nunca reflete o que veio no endereço", async ({
    context,
    page,
  }) => {
    await jaEscolheuOsCookies(context, ENDERECO_DO_SITE);
    await entrarComo(context, "dono");
    await page.goto("/painel?loja=%3Cb%3Eoutra%3C%2Fb%3E");
    await expect(page).toHaveURL(/\/painel\?loja=/);
    await expect(page.getByText("Abrimos a sua loja")).toHaveCount(0);
    await expect(page.locator("b", { hasText: "outra" })).toHaveCount(0);
  });
});
