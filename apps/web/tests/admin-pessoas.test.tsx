// @vitest-environment jsdom
/**
 * Pessoas na administração (card #170, T-9): a ficha com vínculos e pedidos
 * agregados, as quatro ações com confirmação (editar, desativar, reativar e
 * gerar o link único), o cadastro, e o que a tela NUNCA faz: mostrar CPF ou
 * endereço, conceder administração, guardar o link ou levá-lo para a URL.
 *
 * A API fica por conta de `apps/api/tests/admin-pessoas.test.ts`; aqui o
 * `fetch` é trocado por respostas escritas pelo teste.
 */
import type { FichaDaPessoaNoContrato } from "@simpleclick/contracts";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  atosDaPessoa,
  consequenciasDoAtoDaPessoa,
  corpoDaEdicao,
} from "../src/features/admin/AcoesDaPessoa.tsx";
import { enderecoCompletoDoAcesso } from "../src/features/admin/AcessoDeUsoUnico.tsx";
import { FichaDaConta } from "../src/features/admin/FichaDaConta.tsx";
import {
  FormularioDePessoa,
  validarPessoa,
} from "../src/features/admin/FormularioDePessoa.tsx";
import {
  botao,
  clicar,
  desmontar,
  digitar,
  enviar,
  esperar,
  exigir,
  montar,
  simularApi,
  type ChamadaDaApi,
  type RespostaSimulada,
} from "./apoio-config.tsx";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/contas",
  useSearchParams: () => new URLSearchParams(),
}));

/** A raiz do site (`apps/web`), de onde os arquivos-fonte são lidos. */
const WEB = join(__dirname, "..");

const PESSOA_ID = "9a9b9c9d-0000-4000-8000-0000000000aa";
const LOJA_ID = "5c1d0e2f-0000-4000-8000-000000000001";
const TOKEN_SECRETO = "tok-" + "z".repeat(40);
const CAMINHO_DO_LINK = `/definir-senha?token=${TOKEN_SECRETO}`;

const CLIENTE: FichaDaPessoaNoContrato = {
  identidadeId: PESSOA_ID,
  nome: "Marina Souza",
  email: "marina@exemplo.test",
  telefone: "+5511911110001",
  criadaEm: "2026-10-16T12:00:00.000Z",
  desativada: false,
  desativadaEm: null,
  temSenha: true,
  donoDeLojas: 0,
  equipeDeLojas: 0,
  protegida: false,
  vinculos: [],
  pedidos: {
    total: 4,
    ultimoEm: "2026-11-01T15:00:00.000Z",
    porLoja: [
      { lojaId: LOJA_ID, nome: "Pastel da Joi", total: 3 },
      {
        lojaId: "5c1d0e2f-0000-4000-8000-000000000002",
        nome: "Moda",
        total: 1,
      },
    ],
  },
  historico: [],
};

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  desmontar();
  document.body.innerHTML = "";
  window.localStorage.clear();
  window.sessionStorage.clear();
});

/** A API da ficha: GET devolve `ficha`; os atos respondem pelo roteiro. */
function api(
  ficha: FichaDaPessoaNoContrato,
  atos: (chamada: ChamadaDaApi) => RespostaSimulada | null = () => null,
): ChamadaDaApi[] {
  return simularApi((chamada) => {
    if (chamada.url.endsWith("/api/admin/limites")) {
      return {
        status: 200,
        corpo: {
          lojasPorDono: 3,
          staffPorLoja: 5,
          produtosPorLoja: 500,
          categoriasPorLoja: 50,
          clientesPorLoja: 5000,
        },
      };
    }
    const ato = atos(chamada);
    if (ato !== null) return ato;
    return { status: 200, corpo: ficha };
  });
}

async function abrirFicha(): Promise<HTMLElement> {
  const tela = montar(<FichaDaConta identidadeId={PESSOA_ID} />);
  await esperar();
  return tela;
}

describe("a ficha da pessoa", () => {
  it("[CA-2] cliente sem loja: abre com vínculos vazios e pedidos agregados, sem CPF nem endereço", async () => {
    const chamadas = api(CLIENTE);
    const tela = await abrirFicha();

    expect(chamadas[0]).toMatchObject({
      url: `/api/admin/pessoas/${PESSOA_ID}`,
      metodo: "GET",
    });
    expect(tela.querySelector("h1")?.textContent).toBe("Marina Souza");
    expect(tela.textContent).toContain("marina@exemplo.test");
    expect(tela.textContent).toContain("+5511911110001");
    expect(tela.textContent).toContain("Cliente");
    expect(tela.textContent).toContain("Sem vínculo com loja");
    expect(tela.textContent).toContain("Pedidos feitos");
    expect(tela.textContent).toContain("4");
    expect(tela.textContent).toContain("Pastel da Joi");
    expect(tela.textContent).toContain("3 pedidos");
    // Nem campo, nem rótulo, nem dica de documento ou endereço.
    expect(tela.textContent).not.toMatch(/\bcpf\b|cnpj|logradouro|\bcep\b/i);
    // Só quem é dono tem o limite de lojas.
    expect(tela.textContent).not.toContain("Limite de lojas");
  });

  it("[CA-2] dono: mostra o limite de lojas, os vínculos e Aprovar/Recusar na loja que espera", async () => {
    api({
      ...CLIENTE,
      donoDeLojas: 1,
      vinculos: [
        {
          lojaId: LOJA_ID,
          nome: "Doceria da Bia",
          apelido: "doceria-da-bia",
          status: "PENDING_APPROVAL",
          papel: "OWNER",
        },
      ],
    });
    const tela = await abrirFicha();
    expect(tela.textContent).toContain("Dono de 1 loja");
    expect(tela.textContent).toContain("Doceria da Bia");
    expect(tela.textContent).toContain("1 loja desta pessoa espera aprovação");
    expect(botao(tela, "Aprovar")).toBeDefined();
    expect(tela.textContent).toContain("Limite de lojas");
  });

  it("[CA-2] os links para outras fichas e lojas não fazem prefetch (D-9)", () => {
    const pastas = [
      "src/features/admin/ListaDeContas.tsx",
      "src/features/admin/FichaDaConta.tsx",
      "src/features/admin/FormularioDePessoa.tsx",
      "src/app/(admin)/admin/contas/nova/page.tsx",
    ];
    for (const caminho of pastas) {
      const fonte = readFileSync(join(WEB, caminho), "utf8");
      const aberturas = fonte.match(/<Link\b[^>]*>/g) ?? [];
      expect(aberturas.length, caminho).toBeGreaterThan(0);
      for (const abertura of aberturas) {
        expect(abertura, caminho).toContain("prefetch={false}");
      }
    }
  });

  it("[CA-2] conta protegida: sem ação nenhuma, só o aviso", async () => {
    api({ ...CLIENTE, protegida: true });
    const tela = await abrirFicha();
    expect(tela.textContent).toContain("Conta da administração da plataforma");
    expect(tela.textContent).toContain("Conta protegida");
    for (const rotulo of [
      "Editar dados",
      "Gerar link",
      "Desativar",
      "Reativar",
    ]) {
      expect(() => botao(tela, rotulo)).toThrow();
    }
  });

  it("[CA-2] nenhuma ação concede administração", async () => {
    api(CLIENTE);
    const tela = await abrirFicha();
    const botoes = [...tela.querySelectorAll("button")].map(
      (b) => b.textContent ?? "",
    );
    expect(botoes.join(" | ")).not.toMatch(/administra|conceder|promover/i);
    for (const ato of ["editar", "desativar", "reativar", "acesso"] as const) {
      expect(
        consequenciasDoAtoDaPessoa(ato, { temSenha: true }).join(" "),
      ).not.toMatch(/conced|promov/i);
    }
  });
});

describe("regras das ações", () => {
  it("[CA-3] só nome e telefone são editáveis, e nada mudou não envia", () => {
    expect(
      corpoDaEdicao(CLIENTE, {
        nome: "Marina Souza",
        telefone: "+5511911110001",
      }),
    ).toEqual({
      erro: "Nada mudou. Altere o nome ou o telefone.",
    });
    expect(
      corpoDaEdicao(CLIENTE, { nome: "Marina S.", telefone: "+5511911110001" }),
    ).toEqual({ corpo: { nome: "Marina S." } });
    expect(
      corpoDaEdicao(CLIENTE, { nome: "Marina Souza", telefone: "" }),
    ).toEqual({ corpo: { telefone: null } });
    expect(
      "erro" in
        corpoDaEdicao(CLIENTE, { nome: "Marina Souza", telefone: "123" }),
    ).toBe(true);
  });

  it("os atos de cada situação", () => {
    expect(atosDaPessoa({ desativada: false, protegida: false })).toEqual([
      "editar",
      "acesso",
      "desativar",
    ]);
    expect(atosDaPessoa({ desativada: true, protegida: false })).toEqual([
      "reativar",
    ]);
    expect(atosDaPessoa({ desativada: false, protegida: true })).toEqual([]);
  });
});

describe("editar", () => {
  it("[CA-3] confirma antes de enviar e manda só o que mudou, num PATCH", async () => {
    const chamadas = api(CLIENTE, (c) =>
      c.metodo === "PATCH"
        ? { status: 200, corpo: { ...CLIENTE, nome: "Marina S." } }
        : null,
    );
    const tela = await abrirFicha();
    clicar(botao(tela, "Editar dados"));
    const janela = exigir<HTMLDialogElement>(tela, "dialog[open]");
    expect(janela.textContent).toContain("Editar os dados de Marina Souza?");

    // Sem mudar nada, não envia.
    clicar(botao(janela, "Confirmar alteração"));
    await esperar();
    expect(chamadas.filter((c) => c.metodo === "PATCH")).toHaveLength(0);
    expect(janela.textContent).toContain("Nada mudou");

    digitar(
      exigir<HTMLInputElement>(janela, 'input[type="text"], input:not([type])'),
      "Marina S.",
    );
    clicar(botao(janela, "Confirmar alteração"));
    await esperar();
    expect(chamadas.filter((c) => c.metodo === "PATCH")).toEqual([
      {
        url: `/api/admin/pessoas/${PESSOA_ID}`,
        metodo: "PATCH",
        corpo: { nome: "Marina S." },
      },
    ]);
    expect(tela.querySelector("dialog[open]")).toBeNull();
    expect(tela.querySelector("h1")?.textContent).toBe("Marina S.");
  });
});

describe("desativar e reativar", () => {
  it("[CA-6] pede motivo, confirma e troca o botão por Reativar", async () => {
    const chamadas = api(CLIENTE, (c) =>
      c.metodo === "PUT"
        ? {
            status: 200,
            corpo: {
              ...CLIENTE,
              desativada: true,
              desativadaEm: "2026-11-21T10:00:00.000Z",
            },
          }
        : null,
    );
    const tela = await abrirFicha();
    clicar(botao(tela, "Desativar conta"));
    const janela = exigir<HTMLDialogElement>(tela, "dialog[open]");
    expect(janela.textContent).toContain("Desativar a conta de Marina Souza?");

    clicar(botao(janela, "Confirmar desativação"));
    await esperar();
    expect(chamadas.filter((c) => c.metodo === "PUT")).toHaveLength(0);
    expect(janela.textContent).toContain("Informe o motivo");

    digitar(
      exigir<HTMLTextAreaElement>(janela, "textarea"),
      "Pedido do titular",
    );
    clicar(botao(janela, "Confirmar desativação"));
    await esperar();
    expect(chamadas.filter((c) => c.metodo === "PUT")).toEqual([
      {
        url: `/api/admin/pessoas/${PESSOA_ID}/desativacao`,
        metodo: "PUT",
        corpo: { motivo: "Pedido do titular" },
      },
    ]);
    expect(tela.textContent).toContain("Conta desativada");
    expect(botao(tela, "Reativar conta")).toBeDefined();
    expect(() => botao(tela, "Desativar conta")).toThrow();
  });

  it("[CA-6] dono único: lista as lojas e só reenvia com a ciência marcada", async () => {
    let tentativas = 0;
    const chamadas = api(CLIENTE, (c) => {
      if (c.metodo !== "PUT") return null;
      tentativas += 1;
      return (c.corpo as { lojasSemDonoCiente?: boolean }).lojasSemDonoCiente
        ? { status: 200, corpo: { ...CLIENTE, desativada: true } }
        : {
            status: 409,
            corpo: {
              erro: "dono_unico",
              mensagem: "dono único",
              lojas: [
                { lojaId: LOJA_ID, nome: "Pastel da Joi", apelido: "pj" },
              ],
            },
          };
    });
    const tela = await abrirFicha();
    clicar(botao(tela, "Desativar conta"));
    const janela = exigir<HTMLDialogElement>(tela, "dialog[open]");
    digitar(
      exigir<HTMLTextAreaElement>(janela, "textarea"),
      "Encerrou o negócio",
    );
    clicar(botao(janela, "Confirmar desativação"));
    await esperar();

    expect(tentativas).toBe(1);
    expect(janela.textContent).toContain("Estas lojas ficarão sem dono");
    expect(janela.textContent).toContain("Pastel da Joi");

    // Sem a ciência, nada é reenviado.
    clicar(botao(janela, "Confirmar desativação"));
    await esperar();
    expect(tentativas).toBe(1);
    expect(janela.textContent).toContain(
      "Confirme que as lojas ficarão sem dono",
    );

    clicar(exigir<HTMLInputElement>(janela, 'input[type="checkbox"]'));
    clicar(botao(janela, "Confirmar desativação"));
    await esperar();
    expect(tentativas).toBe(2);
    expect(chamadas.filter((c) => c.metodo === "PUT")[1]?.corpo).toEqual({
      motivo: "Encerrou o negócio",
      lojasSemDonoCiente: true,
    });
  });

  it("[CA-6] reativar também pede motivo e usa PUT /reativacao", async () => {
    const chamadas = api({ ...CLIENTE, desativada: true }, (c) =>
      c.metodo === "PUT" ? { status: 200, corpo: CLIENTE } : null,
    );
    const tela = await abrirFicha();
    clicar(botao(tela, "Reativar conta"));
    const janela = exigir<HTMLDialogElement>(tela, "dialog[open]");
    digitar(exigir<HTMLTextAreaElement>(janela, "textarea"), "Foi engano");
    clicar(botao(janela, "Confirmar reativação"));
    await esperar();
    expect(chamadas.find((c) => c.metodo === "PUT")).toEqual({
      url: `/api/admin/pessoas/${PESSOA_ID}/reativacao`,
      metodo: "PUT",
      corpo: { motivo: "Foi engano" },
    });
    expect(botao(tela, "Desativar conta")).toBeDefined();
  });
});

describe("link único de acesso", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) },
    });
  });

  const GERADO: RespostaSimulada = {
    status: 201,
    corpo: {
      caminho: CAMINHO_DO_LINK,
      expiraEm: "2026-11-21T16:00:00.000Z",
      emailEnviado: false,
    },
  };

  it("[CA-6] quem já tem senha só gera o link com a confirmação explícita", async () => {
    const chamadas = api(CLIENTE, (c) => (c.metodo === "POST" ? GERADO : null));
    const tela = await abrirFicha();
    clicar(botao(tela, "Gerar link de acesso"));
    const janela = exigir<HTMLDialogElement>(tela, "dialog[open]");
    expect(janela.textContent).toContain("Esta pessoa já tem senha");

    digitar(
      exigir<HTMLTextAreaElement>(janela, "textarea"),
      "Esqueceu a senha",
    );
    clicar(botao(janela, "Gerar o link"));
    await esperar();
    expect(chamadas.filter((c) => c.metodo === "POST")).toHaveLength(0);
    expect(janela.textContent).toContain(
      "Confirme que a senha atual deixa de valer",
    );

    clicar(exigir<HTMLInputElement>(janela, 'input[type="checkbox"]'));
    clicar(botao(janela, "Gerar o link"));
    await esperar();
    expect(chamadas.filter((c) => c.metodo === "POST")).toEqual([
      {
        url: `/api/admin/pessoas/${PESSOA_ID}/acesso`,
        metodo: "POST",
        corpo: { motivo: "Esqueceu a senha" },
      },
    ]);
  });

  it("[CA-6] sem senha, não há confirmação extra; o motivo continua obrigatório", async () => {
    const chamadas = api({ ...CLIENTE, temSenha: false }, (c) =>
      c.metodo === "POST" ? GERADO : null,
    );
    const tela = await abrirFicha();
    clicar(botao(tela, "Gerar link de acesso"));
    const janela = exigir<HTMLDialogElement>(tela, "dialog[open]");
    expect(janela.textContent).not.toContain("Esta pessoa já tem senha");
    clicar(botao(janela, "Gerar o link"));
    await esperar();
    expect(chamadas.filter((c) => c.metodo === "POST")).toHaveLength(0);
    expect(janela.textContent).toContain("Informe o motivo");
  });

  it("[CA-6] o link aparece uma vez, com copiar, e não vai para a URL nem para o armazenamento", async () => {
    const chamadas = api(CLIENTE, (c) => (c.metodo === "POST" ? GERADO : null));
    const enderecoAntes = window.location.href;
    const tela = await abrirFicha();
    clicar(botao(tela, "Gerar link de acesso"));
    const janela = exigir<HTMLDialogElement>(tela, "dialog[open]");
    digitar(
      exigir<HTMLTextAreaElement>(janela, "textarea"),
      "Esqueceu a senha",
    );
    clicar(exigir<HTMLInputElement>(janela, 'input[type="checkbox"]'));
    clicar(botao(janela, "Gerar o link"));
    await esperar();

    const campo = exigir<HTMLInputElement>(
      tela,
      "dialog[open] input[readonly]",
    );
    expect(campo.value).toContain(CAMINHO_DO_LINK);
    expect(tela.textContent).toContain("Ele aparece só agora");

    clicar(botao(tela, "Copiar link"));
    await esperar();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(campo.value);
    expect(tela.textContent).toContain("Link copiado");

    // Nem o endereço da administração nem o armazenamento levam o token.
    expect(window.location.href).toBe(enderecoAntes);
    expect(window.location.href).not.toContain(TOKEN_SECRETO);
    expect(JSON.stringify({ ...window.localStorage })).not.toContain(
      TOKEN_SECRETO,
    );
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain(
      TOKEN_SECRETO,
    );

    // Fechou: o link some da tela, e a ficha é lida de novo (a trilha ganha o ato).
    const leiturasAntes = chamadas.filter((c) => c.metodo === "GET").length;
    clicar(botao(tela, "Já copiei, fechar"));
    await esperar();
    expect(tela.textContent).not.toContain(TOKEN_SECRETO);
    expect(tela.querySelector("dialog")).toBeNull();
    expect(chamadas.filter((c) => c.metodo === "GET").length).toBeGreaterThan(
      leiturasAntes,
    );
  });

  it("completa o caminho com o endereço do próprio site só para mostrar", () => {
    expect(
      enderecoCompletoDoAcesso("/definir-senha?token=a", "https://sc.test"),
    ).toBe("https://sc.test/definir-senha?token=a");
    expect(enderecoCompletoDoAcesso("/definir-senha?token=a", undefined)).toBe(
      "/definir-senha?token=a",
    );
  });

  it("[CA-6] conta desativada: a API recusa (409) e a mensagem aparece, sem link", async () => {
    api({ ...CLIENTE, temSenha: false }, (c) =>
      c.metodo === "POST"
        ? {
            status: 409,
            corpo: {
              erro: "conta_desativada",
              mensagem: "Esta conta está desativada.",
            },
          }
        : null,
    );
    const tela = await abrirFicha();
    clicar(botao(tela, "Gerar link de acesso"));
    const janela = exigir<HTMLDialogElement>(tela, "dialog[open]");
    digitar(exigir<HTMLTextAreaElement>(janela, "textarea"), "Pedido");
    clicar(botao(janela, "Gerar o link"));
    await esperar();
    expect(janela.textContent).toContain("Esta conta está desativada.");
    expect(tela.querySelector("input[readonly]")).toBeNull();
  });
});

describe("cadastro de pessoa", () => {
  it("[CA-3] valida pelo contrato: nome, e-mail e telefone", () => {
    const erros = validarPessoa({ nome: "", email: "x", telefone: "12" });
    expect("erros" in erros && erros.erros).toEqual({
      nome: "Informe o nome.",
      email: "Informe um e-mail válido.",
      telefone: "Informe o telefone com DDD, só números.",
    });
    expect(
      validarPessoa({ nome: " Ana ", email: "ANA@Exemplo.test", telefone: "" }),
    ).toEqual({ corpo: { nome: "Ana", email: "ana@exemplo.test" } });
  });

  it("[CA-3] o formulário não tem campo de papel nem de administração", () => {
    const tela = montar(<FormularioDePessoa />);
    const nomes = [...tela.querySelectorAll("input, select, textarea")].map(
      (c) => c.getAttribute("name"),
    );
    expect(nomes).toEqual(["nome", "email", "telefone"]);
  });

  it("[CA-3] cadastra, mostra o link uma vez e some ao fechar", async () => {
    const chamadas = simularApi(() => ({
      status: 201,
      corpo: {
        identidadeId: PESSOA_ID,
        acesso: {
          caminho: CAMINHO_DO_LINK,
          expiraEm: "2026-11-21T16:00:00.000Z",
          emailEnviado: false,
        },
      },
    }));
    const tela = montar(<FormularioDePessoa />);
    digitar(exigir<HTMLInputElement>(tela, "#nova-pessoa-nome"), "Ana Lima");
    digitar(
      exigir<HTMLInputElement>(tela, "#nova-pessoa-email"),
      "ana@exemplo.test",
    );
    await enviar(exigir<HTMLFormElement>(tela, "form"));

    expect(chamadas).toEqual([
      {
        url: "/api/admin/pessoas",
        metodo: "POST",
        corpo: { nome: "Ana Lima", email: "ana@exemplo.test" },
      },
    ]);
    expect(tela.textContent).toContain("Ana Lima foi cadastrada");
    expect(
      exigir<HTMLInputElement>(tela, "dialog[open] input[readonly]").value,
    ).toContain(CAMINHO_DO_LINK);
    const ficha = [...tela.querySelectorAll("a")].find((a) =>
      (a.textContent ?? "").includes("Abrir a ficha"),
    );
    expect(ficha?.getAttribute("href")).toBe(`/admin/contas/${PESSOA_ID}`);

    clicar(botao(tela, "Já copiei, fechar"));
    await esperar();
    expect(tela.textContent).not.toContain(TOKEN_SECRETO);
    expect(window.location.href).not.toContain(TOKEN_SECRETO);
  });

  it("[CA-3] e-mail em uso: não cria outra, leva à ficha existente", async () => {
    simularApi(() => ({
      status: 409,
      corpo: {
        erro: "email_em_uso",
        mensagem: "Já existe uma conta com este e-mail.",
        identidadeId: PESSOA_ID,
      },
    }));
    const tela = montar(<FormularioDePessoa />);
    digitar(exigir<HTMLInputElement>(tela, "#nova-pessoa-nome"), "Ana Lima");
    digitar(
      exigir<HTMLInputElement>(tela, "#nova-pessoa-email"),
      "ana@exemplo.test",
    );
    await enviar(exigir<HTMLFormElement>(tela, "form"));
    expect(tela.textContent).toContain("Já existe uma conta com este e-mail");
    const abrir = [...tela.querySelectorAll("a")].find((a) =>
      (a.textContent ?? "").includes("Abrir a ficha da pessoa"),
    );
    expect(abrir?.getAttribute("href")).toBe(`/admin/contas/${PESSOA_ID}`);
  });

  it("campo inválido não envia e foca o primeiro com erro", async () => {
    const chamadas = simularApi(() => ({ status: 500 }));
    const tela = montar(<FormularioDePessoa />);
    await enviar(exigir<HTMLFormElement>(tela, "form"));
    expect(chamadas).toHaveLength(0);
    expect(tela.textContent).toContain("Informe o nome.");
  });
});

describe("regras de rota das páginas novas", () => {
  const RAIZ = join(WEB, "src/app/(admin)");

  function arquivos(pasta: string): string[] {
    return readdirSync(pasta).flatMap((nome) => {
      const caminho = join(pasta, nome);
      return statSync(caminho).isDirectory()
        ? arquivos(caminho)
        : /\.tsx?$/.test(nome)
          ? [caminho]
          : [];
    });
  }

  it("[CA-2] a página de cadastro chama exigirAdministracaoDaPlataforma e tem metadata literal", () => {
    const fonte = readFileSync(
      join(RAIZ, "admin/contas/nova/page.tsx"),
      "utf8",
    );
    expect(fonte).toContain(
      'await exigirAdministracaoDaPlataforma("/admin/contas/nova")',
    );
    expect(fonte).toMatch(
      /export const metadata = \{\s*title: "[^"$`]+",?\s*\}/,
    );
    expect(fonte).toContain("FormularioDePessoa");
  });

  it("não há fetch dentro de app/(admin): quem fala com a rede são as features", () => {
    for (const arquivo of arquivos(RAIZ)) {
      expect(readFileSync(arquivo, "utf8"), arquivo).not.toMatch(/\bfetch\(/);
    }
  });
});
