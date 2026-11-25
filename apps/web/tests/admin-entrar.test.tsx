// @vitest-environment jsdom
/**
 * A entrada própria da administração (card #11): `/admin/entrar`.
 *
 * O fluxo de autenticação é o MESMO do `/entrar` (ponte `/api/auth/*`,
 * segundo fator pelo aplicativo, cookies, origem e limite de tentativas); só a
 * tela e o destino mudam. Quem decide se a pessoa é da administração é o
 * SERVIDOR, pelo grant ao vivo (`GET /v1/eu`), nunca o `redirecionarPara` da
 * ponte nem o cliente. Quem não é administrador vê uma mensagem neutra e
 * nunca é levado ao `/admin`.
 */
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clicar,
  desmontar,
  digitar,
  enviar,
  esperar,
  exigir,
  montar,
  simularApi,
} from "./apoio-config.tsx";
import { arquivos, ler, RAIZ_WEB } from "./apoio-painel-lojista.ts";

const navegacao = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

/** O `redirect` do Next interrompe a página; aqui ele vira um erro com o destino. */
const { Redirecionou } = vi.hoisted(() => ({
  Redirecionou: class Redirecionou extends Error {
    constructor(readonly destino: string) {
      super(`redirect(${destino})`);
    }
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: navegacao.push,
    replace: navegacao.replace,
    refresh: navegacao.refresh,
  }),
  useSearchParams: () => new URLSearchParams(),
  redirect: (destino: string) => {
    throw new Redirecionou(destino);
  },
}));

vi.mock("../src/server/actions/auth.ts", () => ({
  sairDaConta: vi.fn(),
}));

/** O que o `GET /v1/eu` responde nesta requisição (a leitura ao vivo). */
const sessao = vi.hoisted(() => ({
  leitura: { estado: "sem-sessao" } as unknown,
}));

vi.mock("../src/server/eu-do-pedido.ts", () => ({
  euDoPedidoAtual: async () => sessao.leitura,
}));

import {
  decidirEntradaDaAdministracao,
  destinoDaAdministracao,
} from "../src/server/entrada-da-administracao.ts";
import type { EuDoPedido } from "../src/server/eu-do-pedido.ts";
import { CascaDaAdministracao } from "../src/features/auth/CascaDaAdministracao.tsx";
import { EntrarNaAdministracao } from "../src/features/auth/EntrarNaAdministracao.tsx";
import { SemAcessoAAdministracao } from "../src/features/auth/SemAcessoAAdministracao.tsx";
import { VerificacaoDaAdministracao } from "../src/features/auth/VerificacaoDaAdministracao.tsx";
import PaginaDeEntrarNaAdministracao from "../src/app/(admin-entrar)/admin/entrar/page.tsx";
import PaginaDeVerificacaoDaAdministracao from "../src/app/(admin-entrar)/admin/entrar/verificacao/page.tsx";
import { metadata as metadataDaEntrada } from "../src/app/(admin-entrar)/admin/entrar/layout.tsx";
import configuracao from "../next.config.ts";

beforeEach(() => {
  sessao.leitura = { estado: "sem-sessao" };
  navegacao.push.mockReset();
  navegacao.replace.mockReset();
  navegacao.refresh.mockReset();
});
afterEach(() => {
  desmontar();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// As pessoas, como o `GET /v1/eu` as descreve
// ---------------------------------------------------------------------------

function loja(papel: "OWNER" | "STAFF") {
  return {
    apelido: "pastelaria-da-vila",
    nome: "Pastelaria da Vila",
    papel,
    situacao: "ACTIVE" as const,
  };
}

function leituraDe(extras: Record<string, unknown>): EuDoPedido {
  return {
    estado: "ok",
    token: "token-de-teste",
    eu: {
      identidade: {
        id: "5d1f0c7a-2b3e-4c5d-8e9f-0a1b2c3d4e5f",
        email: "pessoa@exemplo.test",
        nome: "Pessoa",
        papel: "CUSTOMER",
      },
      lojas: [],
      ...extras,
    },
  } as never;
}

const ADMIN = leituraDe({ adminDaPlataforma: true, papelEfetivo: "ADMIN" });
const DONO = leituraDe({
  adminDaPlataforma: false,
  lojas: [loja("OWNER")],
  lojasDaConta: [loja("OWNER")],
});
const EQUIPE = leituraDe({
  adminDaPlataforma: false,
  lojasDaConta: [loja("STAFF")],
});
const CLIENTE = leituraDe({ adminDaPlataforma: false });
const SEM_SESSAO: EuDoPedido = { estado: "sem-sessao" };
const INDISPONIVEL: EuDoPedido = { estado: "indisponivel" };

// ---------------------------------------------------------------------------
// A decisão no servidor
// ---------------------------------------------------------------------------

describe("[CA-5] destinoDaAdministracao: só caminhos do /admin, sem laço", () => {
  it.each(["/admin", "/admin/lojas", "/admin?x=1", "/admin?x=//y"])(
    "[CA-5] aceita %j",
    (valor) => {
      expect(destinoDaAdministracao(valor)).toBe(valor);
    },
  );

  it.each([
    "/administrador",
    "/painel",
    "/explorar/produtos",
    "//x",
    "/%2f/x",
    "https://golpe.example/admin",
    "/admin/../entrar",
    "/admin//entrar",
    "/admin//lojas",
    "/admin/entrar",
    "/admin/entrar/verificacao",
    "/ADMIN",
    "",
    undefined,
    null,
    ["/admin"],
  ])("[CA-5] recusa %j", (valor) => {
    expect(destinoDaAdministracao(valor)).toBeUndefined();
  });
});

describe("[CA-2] [CA-3] decidirEntradaDaAdministracao: o grant ao vivo decide", () => {
  it("[CA-2] administrador vai para /admin", () => {
    expect(decidirEntradaDaAdministracao(ADMIN, undefined)).toEqual({
      acao: "ir",
      destino: "/admin",
    });
  });

  it("[CA-2] administrador com proximo do /admin volta para ele", () => {
    expect(decidirEntradaDaAdministracao(ADMIN, "/admin/lojas")).toEqual({
      acao: "ir",
      destino: "/admin/lojas",
    });
  });

  it("[CA-5] administrador com proximo de fora do /admin vai para /admin", () => {
    for (const proximo of [
      "/painel",
      "https://golpe.example",
      "/admin/entrar",
    ]) {
      expect(decidirEntradaDaAdministracao(ADMIN, proximo)).toEqual({
        acao: "ir",
        destino: "/admin",
      });
    }
  });

  it.each([
    ["dono", DONO, "/painel"],
    ["equipe", EQUIPE, "/painel"],
    ["cliente", CLIENTE, "/explorar/produtos"],
  ] as const)(
    "[CA-3] %s logado não é levado ao /admin: vê a tela sem acesso",
    (_nome, leitura, area) => {
      for (const proximo of [undefined, "/admin", "/admin/lojas"]) {
        expect(decidirEntradaDaAdministracao(leitura, proximo)).toEqual({
          acao: "sem-acesso",
          areaDoPapel: area,
        });
      }
    },
  );

  it("[CA-1] sem sessão mostra o formulário", () => {
    expect(decidirEntradaDaAdministracao(SEM_SESSAO, "/admin")).toEqual({
      acao: "formulario",
      indisponivel: false,
    });
  });

  it("[CA-6] API fora do ar mostra o formulário com aviso, sem dizer sem acesso", () => {
    expect(decidirEntradaDaAdministracao(INDISPONIVEL, undefined)).toEqual({
      acao: "formulario",
      indisponivel: true,
    });
  });
});

// ---------------------------------------------------------------------------
// As telas
// ---------------------------------------------------------------------------

function formulario(tela: HTMLElement): HTMLFormElement {
  return exigir<HTMLFormElement>(tela, "form");
}

async function entrarCom(
  resposta: { status: number; corpo: unknown },
  destino?: string,
) {
  const chamadas = simularApi(() => resposta);
  const tela = montar(
    <EntrarNaAdministracao destino={destino} indisponivel={false} />,
  );
  digitar(exigir(tela, "#admin-entrar-email"), "admin@exemplo.test");
  digitar(exigir(tela, "#admin-entrar-senha"), "uma frase longa da admin");
  await enviar(formulario(tela));
  return { tela, chamadas };
}

describe("[CA-2] entrar pela administração usa o mesmo fluxo da ponte", () => {
  it("[CA-2] senha correta com aplicativo leva à verificação da administração, com o destino", async () => {
    const { chamadas } = await entrarCom(
      {
        status: 200,
        corpo: {
          status: "DESAFIO_DE_SEGUNDO_FATOR",
          desafioId: "desafio-1",
          canal: "TOTP",
        },
      },
      "/admin/lojas",
    );
    expect(chamadas[0]?.url).toBe("/api/auth/login");
    expect(chamadas[0]?.corpo).toEqual({
      email: "admin@exemplo.test",
      senha: "uma frase longa da admin",
    });
    expect(navegacao.push).toHaveBeenCalledWith(
      "/admin/entrar/verificacao?desafio=desafio-1&canal=TOTP&proximo=%2Fadmin%2Flojas",
    );
    expect(navegacao.replace).not.toHaveBeenCalled();
  });

  it("[CA-3] sessão criada volta à própria página (o servidor decide), nunca ao redirecionarPara da ponte", async () => {
    await entrarCom(
      {
        status: 200,
        corpo: { status: "SESSAO_CRIADA", redirecionarPara: "/admin" },
      },
      "/admin/lojas",
    );
    expect(navegacao.replace).toHaveBeenCalledTimes(1);
    expect(navegacao.replace).toHaveBeenCalledWith(
      "/admin/entrar?proximo=%2Fadmin%2Flojas",
    );
    expect(navegacao.refresh).toHaveBeenCalledTimes(1);
    expect(navegacao.push).not.toHaveBeenCalled();
  });

  it("[CA-6] senha errada mostra a mesma mensagem neutra do login comum", async () => {
    const { tela } = await entrarCom({
      status: 401,
      corpo: { erro: "credenciais_invalidas" },
    });
    expect(tela.textContent).toContain(
      "E-mail ou senha incorretos. Confira e tente de novo.",
    );
    expect(navegacao.replace).not.toHaveBeenCalled();
    expect(navegacao.push).not.toHaveBeenCalled();
  });

  it("[CA-1] não tem cadastro nem 'Quero vender'; mantém 'Esqueci minha senha'", () => {
    const tela = montar(<EntrarNaAdministracao indisponivel={false} />);
    expect(tela.textContent).not.toMatch(/Criar conta|Quero vender/);
    expect(tela.querySelector('a[href="/cadastrar"]')).toBeNull();
    expect(tela.querySelector('a[href="/vender"]')).toBeNull();
    const esqueci = exigir<HTMLAnchorElement>(
      tela,
      'a[href="/recuperar-senha"]',
    );
    expect(esqueci.textContent).toBe("Esqueci minha senha");
    expect(exigir(tela, 'label[for="admin-entrar-email"]').textContent).toMatch(
      /E-mail/,
    );
    expect(exigir(tela, 'label[for="admin-entrar-senha"]').textContent).toMatch(
      /Senha/,
    );
  });

  it("[CA-6] com a API fora do ar mostra aviso neutro e o formulário", () => {
    const tela = montar(<EntrarNaAdministracao indisponivel />);
    expect(tela.textContent).toContain(
      "Não conseguimos confirmar o seu acesso agora",
    );
    expect(tela.textContent).not.toMatch(/não tem acesso/i);
    expect(tela.querySelector("#admin-entrar-email")).not.toBeNull();
  });
});

describe("[CA-2] verificação do código na administração", () => {
  function verificar(destino?: string) {
    return montar(
      <VerificacaoDaAdministracao
        desafioId="desafio-1"
        canal="TOTP"
        destino={destino}
      />,
    );
  }

  it("[CA-2] código certo volta à entrada da administração com o destino", async () => {
    const chamadas = simularApi(() => ({
      status: 200,
      corpo: { status: "SESSAO_CRIADA", redirecionarPara: "/painel" },
    }));
    const tela = verificar("/admin/lojas");
    digitar(exigir(tela, "#segundo-fator-codigo"), "123456");
    await enviar(formulario(tela));

    expect(chamadas[0]?.url).toBe("/api/auth/segundo-fator");
    expect(chamadas[0]?.corpo).toEqual({
      desafioId: "desafio-1",
      codigo: "123456",
    });
    expect(navegacao.replace).toHaveBeenCalledWith(
      "/admin/entrar?proximo=%2Fadmin%2Flojas",
    );
    expect(navegacao.replace).not.toHaveBeenCalledWith("/painel");
    expect(navegacao.refresh).toHaveBeenCalledTimes(1);
  });

  it("[CA-2] desafio vencido: 'Voltar ao login' recomeça na entrada da administração", async () => {
    simularApi(() => ({ status: 400, corpo: { status: "DESAFIO_EXPIRADO" } }));
    const tela = verificar("/admin/lojas");
    digitar(exigir(tela, "#segundo-fator-codigo"), "123456");
    await enviar(formulario(tela));
    const voltar = [...tela.querySelectorAll("button")].find(
      (b) => b.textContent === "Voltar ao login",
    );
    expect(voltar).toBeDefined();
    clicar(voltar as HTMLButtonElement);
    expect(navegacao.replace).toHaveBeenCalledWith(
      "/admin/entrar?proximo=%2Fadmin%2Flojas",
    );
  });

  it("[CA-2] código de recuperação com orientarPara leva a reconfigurar o aplicativo", async () => {
    const chamadas = simularApi(() => ({
      status: 200,
      corpo: {
        status: "SESSAO_CRIADA",
        redirecionarPara: "/admin",
        orientarPara: "/conta/seguranca/aplicativo",
      },
    }));
    const tela = verificar();
    const alternar = [...tela.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Perdi o celular"),
    );
    clicar(alternar as HTMLButtonElement);
    await esperar();
    digitar(exigir(tela, "#codigo-de-recuperacao"), "ABCD-EFGH-IJKL");
    await enviar(formulario(tela));

    expect(chamadas[0]?.url).toBe("/api/auth/segundo-fator/recuperacao");
    expect(navegacao.replace).toHaveBeenCalledWith(
      "/conta/seguranca/aplicativo",
    );
  });

  it("[CA-5] orientarPara diferente do aplicativo não vira destino", async () => {
    simularApi(() => ({
      status: 200,
      corpo: {
        status: "SESSAO_CRIADA",
        redirecionarPara: "/admin",
        orientarPara: "https://golpe.example",
      },
    }));
    const tela = verificar();
    const alternar = [...tela.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Perdi o celular"),
    );
    clicar(alternar as HTMLButtonElement);
    await esperar();
    digitar(exigir(tela, "#codigo-de-recuperacao"), "ABCD-EFGH-IJKL");
    await enviar(formulario(tela));
    expect(navegacao.replace).toHaveBeenCalledWith("/admin/entrar");
  });
});

describe("[CA-3] tela sem acesso: neutra, com saída", () => {
  it("[CA-3] mostra a mensagem neutra, o link /entrar, a área do papel e o botão de sair", () => {
    const sair = vi.fn(async () => {});
    const html = renderToStaticMarkup(
      <SemAcessoAAdministracao areaDoPapel="/painel" sair={sair} />,
    );
    const tela = document.createElement("div");
    tela.innerHTML = html;
    expect(tela.textContent).toContain(
      "Esta conta não tem acesso à administração",
    );
    expect(tela.querySelector('[role="alert"]')).not.toBeNull();
    expect(tela.querySelector('a[href="/entrar"]')).not.toBeNull();
    const area = exigir<HTMLAnchorElement>(tela, 'a[href="/painel"]');
    expect(area.textContent).toBe("Ir para a minha área");
    expect(tela.querySelector('a[href^="/admin"]')).toBeNull();
    expect(exigir(tela, 'form button[type="submit"]').textContent).toMatch(
      /Sair e entrar com outra conta/,
    );
    expect(sair).not.toHaveBeenCalled();
  });
});

describe("[CA-7] a casca da administração", () => {
  it("[CA-7] é escura, em vidro, com um h1 ligado ao trecho e o selo da administração", () => {
    const html = renderToStaticMarkup(
      <CascaDaAdministracao
        identificadorDoTitulo="admin-entrar-titulo"
        titulo="Entrar na administração"
        descricao="Use o e-mail e a senha da sua conta de administração."
      >
        <p>conteúdo</p>
      </CascaDaAdministracao>,
    );
    const tela = document.createElement("div");
    tela.innerHTML = html;
    const principal = exigir(tela, "main");
    expect(principal.getAttribute("data-tema")).toBe("escuro");
    const cartao = exigir(tela, ".sc-vidro");
    expect(cartao.classList.contains("sc-vidro--forte")).toBe(true);
    expect(tela.querySelectorAll("h1")).toHaveLength(1);
    expect(exigir(tela, "h1").id).toBe("admin-entrar-titulo");
    expect(
      exigir(tela, '[aria-labelledby="admin-entrar-titulo"]').contains(
        exigir(tela, "h1"),
      ),
    ).toBe(true);
    expect(exigir(tela, ".sc-selo-admin").textContent).toBe(
      "Administração SimpleClick",
    );
    expect(tela.textContent).not.toContain("Uma conta só para tudo");
  });
});

// ---------------------------------------------------------------------------
// A página do servidor (a fiação da decisão)
// ---------------------------------------------------------------------------

type Pagina = (props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => Promise<React.ReactElement>;

async function noServidor(
  pagina: Pagina,
  parametros: Record<string, string | string[] | undefined> = {},
): Promise<HTMLElement> {
  const html = renderToStaticMarkup(
    await pagina({ searchParams: Promise.resolve(parametros) }),
  );
  const tela = document.createElement("div");
  tela.innerHTML = html;
  return tela;
}

async function redirecionaPara(
  pagina: Pagina,
  parametros: Record<string, string | string[] | undefined> = {},
): Promise<string> {
  try {
    await pagina({ searchParams: Promise.resolve(parametros) });
  } catch (erro) {
    if (erro instanceof Redirecionou) return erro.destino;
    throw erro;
  }
  throw new Error("a página não redirecionou");
}

describe("[CA-1] /admin/entrar é pública e sem sessão mostra o formulário", () => {
  it("[CA-1] renderiza h1, selo, e-mail, senha e 'Esqueci minha senha', sem cadastro", async () => {
    const tela = await noServidor(PaginaDeEntrarNaAdministracao);
    expect(exigir(tela, "h1").textContent).toBe("Entrar na administração");
    expect(exigir(tela, ".sc-selo-admin").textContent).toBe(
      "Administração SimpleClick",
    );
    expect(tela.querySelector("#admin-entrar-email")).not.toBeNull();
    expect(tela.querySelector("#admin-entrar-senha")).not.toBeNull();
    expect(tela.querySelector('a[href="/recuperar-senha"]')).not.toBeNull();
    expect(tela.textContent).not.toMatch(/Criar conta|Quero vender/);
    expect(exigir(tela, "main").getAttribute("data-tema")).toBe("escuro");
  });

  it("[CA-1] o layout não deixa indexar e tem título próprio", () => {
    expect(metadataDaEntrada.robots).toEqual({ index: false, follow: false });
    expect(metadataDaEntrada.title).toBe("Entrar · Administração SimpleClick");
  });

  it.each(["/admin/entrar", "/admin/entrar/:path*"])(
    "[CA-1] %s sai com anti-moldura, noindex, sem Referer e sem cache",
    async (source) => {
      const regras = (await configuracao.headers?.()) ?? [];
      const regra = regras.find((r) => r.source === source);
      expect(regra?.headers).toEqual(
        expect.arrayContaining([
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ]),
      );
    },
  );

  it("[CA-1] a regra da entrada vem depois da geral (a mais específica vence)", async () => {
    const regras = (await configuracao.headers?.()) ?? [];
    const geral = regras.findIndex((r) => r.source === "/:path*");
    const entrada = regras.findIndex((r) => r.source === "/admin/entrar");
    expect(geral).toBeGreaterThan(-1);
    expect(entrada).toBeGreaterThan(geral);
  });
});

describe("[CA-2] [CA-3] a página decide pelo grant ao vivo", () => {
  it("[CA-2] administrador já logado vai para o /admin", async () => {
    sessao.leitura = ADMIN;
    expect(await redirecionaPara(PaginaDeEntrarNaAdministracao)).toBe("/admin");
  });

  it("[CA-2] administrador volta para o proximo (ou retorno) do /admin", async () => {
    sessao.leitura = ADMIN;
    expect(
      await redirecionaPara(PaginaDeEntrarNaAdministracao, {
        proximo: "/admin/lojas",
      }),
    ).toBe("/admin/lojas");
    expect(
      await redirecionaPara(PaginaDeEntrarNaAdministracao, {
        retorno: "/admin/contas",
      }),
    ).toBe("/admin/contas");
  });

  it("[CA-5] proximo repetido, de fora ou fora do /admin cai no /admin", async () => {
    sessao.leitura = ADMIN;
    for (const proximo of [
      ["/admin/lojas", "https://golpe.example"],
      "https://golpe.example",
      "//golpe.example/admin",
      "/painel",
      "/admin/entrar",
      "/admin//entrar",
    ]) {
      expect(
        await redirecionaPara(PaginaDeEntrarNaAdministracao, { proximo }),
        JSON.stringify(proximo),
      ).toBe("/admin");
    }
  });

  it.each([
    ["dono", DONO, "/painel"],
    ["equipe", EQUIPE, "/painel"],
    ["cliente", CLIENTE, "/explorar/produtos"],
  ] as const)(
    "[CA-3] %s logado vê a tela sem acesso, sem formulário e sem link para o /admin",
    async (_nome, leitura, area) => {
      sessao.leitura = leitura;
      const tela = await noServidor(PaginaDeEntrarNaAdministracao, {
        proximo: "/admin/lojas",
      });
      expect(tela.textContent).toContain(
        "Esta conta não tem acesso à administração",
      );
      expect(tela.querySelector("#admin-entrar-email")).toBeNull();
      expect(tela.querySelector('a[href="/entrar"]')).not.toBeNull();
      expect(exigir(tela, `a[href="${area}"]`).textContent).toBe(
        "Ir para a minha área",
      );
      expect(tela.querySelector('a[href^="/admin"]')).toBeNull();
    },
  );

  it("[CA-6] API fora do ar: formulário com aviso, sem 'sem acesso' e sem redirecionar", async () => {
    sessao.leitura = INDISPONIVEL;
    const tela = await noServidor(PaginaDeEntrarNaAdministracao);
    expect(tela.querySelector("#admin-entrar-email")).not.toBeNull();
    expect(tela.textContent).toContain(
      "Não conseguimos confirmar o seu acesso agora",
    );
    expect(tela.textContent).not.toMatch(/não tem acesso/i);
  });
});

describe("[CA-2] /admin/entrar/verificacao", () => {
  it("[CA-2] sem desafio volta para a entrada da administração, com o destino", async () => {
    expect(
      await redirecionaPara(PaginaDeVerificacaoDaAdministracao, {
        proximo: "/admin/lojas",
      }),
    ).toBe("/admin/entrar?proximo=%2Fadmin%2Flojas");
    expect(
      await redirecionaPara(PaginaDeVerificacaoDaAdministracao, {
        desafio: "<script>",
      }),
    ).toBe("/admin/entrar");
  });

  it("[CA-7] com desafio mostra o código no mesmo visual da administração", async () => {
    const tela = await noServidor(PaginaDeVerificacaoDaAdministracao, {
      desafio: "desafio-1",
      canal: "TOTP",
      proximo: "/painel",
    });
    expect(exigir(tela, "main").getAttribute("data-tema")).toBe("escuro");
    expect(tela.querySelector(".sc-vidro.sc-vidro--forte")).not.toBeNull();
    expect(tela.querySelectorAll("h1")).toHaveLength(1);
    expect(tela.querySelector("#segundo-fator-codigo")).not.toBeNull();
    expect(exigir(tela, ".sc-selo-admin").textContent).toBe(
      "Administração SimpleClick",
    );
  });
});

// ---------------------------------------------------------------------------
// Varreduras: o grupo novo não vira porta dos fundos do /admin
// ---------------------------------------------------------------------------

const APP = join(RAIZ_WEB, "src/app");
const GRUPO = join(APP, "(admin-entrar)");

/** O endereço que um arquivo do App Router serve (sem os grupos). */
function rotaDe(arquivo: string): string {
  const partes = relative(APP, arquivo)
    .replaceAll("\\", "/")
    .split("/")
    .slice(0, -1)
    .filter((parte) => !/^\(.*\)$/.test(parte));
  return `/${partes.join("/")}`;
}

function semComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

describe("[CA-1] varredura do grupo (admin-entrar)", () => {
  it("[CA-1] fora do grupo (admin), só as duas páginas da entrada servem /admin*", () => {
    const foraDoGrupoProtegido = arquivos(APP, ["page.tsx"])
      .filter((arquivo) => /^\/admin(?:\/|$)/.test(rotaDe(arquivo)))
      .filter((arquivo) => !relative(APP, arquivo).startsWith("(admin)/"))
      .map((arquivo) => relative(APP, arquivo).replaceAll("\\", "/"))
      .sort();
    expect(foraDoGrupoProtegido).toEqual([
      "(admin-entrar)/admin/entrar/page.tsx",
      "(admin-entrar)/admin/entrar/verificacao/page.tsx",
    ]);
  });

  it("[CA-1] o grupo só tem a entrada: nenhum outro arquivo de rota nasce aqui sem a guarda", () => {
    const todos = arquivos(GRUPO, [""])
      .map((arquivo) => relative(GRUPO, arquivo).replaceAll("\\", "/"))
      .sort();
    expect(todos).toEqual([
      "admin/.gitkeep",
      "admin/entrar/layout.tsx",
      "admin/entrar/page.tsx",
      "admin/entrar/verificacao/page.tsx",
    ]);
    expect(readdirSync(APP).filter((nome) => nome.startsWith("(admin"))).toEqual(
      ["(admin)", "(admin-entrar)"],
    );
  });

  it("[CA-1] nada no grupo novo chama a guarda do /admin (senão a entrada faria laço)", () => {
    for (const arquivo of arquivos(GRUPO, [".tsx", ".ts"])) {
      const codigo = semComentarios(ler(arquivo));
      expect(codigo, arquivo).not.toMatch(
        /exigirAdministracaoDaPlataforma|exigirAreaDaAdministracao/,
      );
    }
  });

  it("[CA-1] nenhum link do site aponta para /admin/entrar (só a guarda e a própria entrada)", () => {
    const permitidos = new Set([
      "src/server/area-do-papel.ts",
      "src/lib/destino-seguro.ts",
      "src/lib/routes.ts",
      "src/features/auth/EntrarNaAdministracao.tsx",
      "src/features/auth/VerificacaoDaAdministracao.tsx",
      "src/app/(admin-entrar)/admin/entrar/verificacao/page.tsx",
    ]);
    const achados = arquivos(join(RAIZ_WEB, "src"), [".ts", ".tsx"])
      .filter((arquivo) =>
        semComentarios(ler(arquivo)).includes("/admin/entrar"),
      )
      .map((arquivo) => relative(RAIZ_WEB, arquivo).replaceAll("\\", "/"))
      .filter((arquivo) => !permitidos.has(arquivo));
    expect(achados).toEqual([]);
  });
});

describe("[CA-7] varredura dos componentes e da folha da entrada", () => {
  const COMPONENTES = [
    "CascaDaAdministracao.tsx",
    "EntrarNaAdministracao.tsx",
    "VerificacaoDaAdministracao.tsx",
    "SemAcessoAAdministracao.tsx",
  ].map((nome) => join(RAIZ_WEB, "src/features/auth", nome));
  const FOLHA = join(RAIZ_WEB, "src/features/auth/entrada-da-administracao.css");

  it.each(COMPONENTES)("[CA-7] %s não importa server/ nem usa console.*", (arquivo) => {
    const codigo = semComentarios(ler(arquivo));
    expect(codigo).not.toMatch(/from\s+["'][./]*\/?server\//);
    expect(codigo).not.toMatch(/\bconsole\./);
  });

  it("[CA-7] a folha e os componentes não escrevem cor: só tokens", () => {
    for (const arquivo of [...COMPONENTES, FOLHA]) {
      const codigo = semComentarios(ler(arquivo));
      expect(codigo, arquivo).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(codigo, arquivo).not.toMatch(/\b(?:rgba?|hsla?|oklch|oklab)\(/i);
    }
  });

  it("[CA-7] a folha tem foco visível e só mexe nas classes da entrada", () => {
    const folha = semComentarios(ler(FOLHA));
    expect(folha).toMatch(/:focus-visible[\s\S]*outline:[^;]*var\(--cor-foco\)/);
    const seletores = [...folha.matchAll(/(^|\})\s*([^{}@]+)\{/g)]
      .map((m) => (m[2] ?? "").trim())
      .filter((s) => s !== "" && !/^(?:from|to|\d)/.test(s));
    for (const seletor of seletores) {
      // Toda regra mira a entrada (a do `body` só vale com ela na página).
      expect(seletor, seletor).toMatch(/\.sc-entrada-admin/);
    }
  });
});
