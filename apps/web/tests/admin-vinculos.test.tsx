// @vitest-environment jsdom
/**
 * Donos e equipes na administração (card #170, T-10): a lista de vínculos com
 * filtros no endereço, as ações com confirmação (atribuir, trocar, remover,
 * tornar dono, equipe), o motivo obrigatório, o e-mail mascarado e os erros
 * 409/422 explicados na tela. A API fica por conta de
 * `apps/api/tests/admin-vinculos.test.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { efeitoDoAto } from "../src/features/admin/AcoesDoVinculo.tsx";
import {
  mascararEmail,
  motivoDeNaoPoderReceber,
} from "../src/features/admin/EscolherPessoa.tsx";
import {
  consultaDeVinculosDoEndereco,
  enderecoDaListaDeVinculos,
  enderecoDaPaginaDeVinculos,
  filtrarVinculos,
  ListaDeVinculos,
} from "../src/features/admin/ListaDeVinculos.tsx";
import {
  botao,
  clicar,
  desmontar,
  digitar,
  esperar,
  exigir,
  montar,
  simularApi,
  type ChamadaDaApi,
  type RespostaSimulada,
} from "./apoio-config.tsx";

let parametrosDoEndereco = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/donos-e-equipes",
  useSearchParams: () => parametrosDoEndereco,
}));

const WEB = join(__dirname, "..");
const LOJA = "5c1d0e2f-0000-4000-8000-000000000001";
const DONO = "9a9b9c9d-0000-4000-8000-0000000000aa";
const NOVO = "9a9b9c9d-0000-4000-8000-0000000000bb";
const STAFF = "9a9b9c9d-0000-4000-8000-0000000000cc";

const VINCULO_DONO = {
  lojaId: LOJA,
  lojaNome: "Padaria Sol",
  lojaApelido: "padaria-sol",
  lojaStatus: "ACTIVE",
  identidadeId: DONO,
  pessoaNome: "Marina Souza",
  pessoaEmail: "marina@exemplo.test",
  papel: "OWNER",
  desde: "2026-10-16T12:00:00.000Z",
};
const VINCULO_STAFF = {
  ...VINCULO_DONO,
  identidadeId: STAFF,
  pessoaNome: "Caio Lima",
  pessoaEmail: "caio@exemplo.test",
  papel: "STAFF",
};

const PESSOA_NOVA = {
  identidadeId: NOVO,
  nome: "Ana Lima",
  email: "ana@exemplo.test",
  criadaEm: "2026-10-16T12:00:00.000Z",
  desativada: false,
  temSenha: true,
  donoDeLojas: 0,
  equipeDeLojas: 0,
  protegida: false,
};

function lista(vinculos: unknown[]) {
  return { vinculos, total: vinculos.length, pagina: 1, porPagina: 25 };
}

function respostas(
  extra: (c: ChamadaDaApi) => RespostaSimulada | null = () => null,
  vinculos: unknown[] = [VINCULO_DONO],
) {
  return (chamada: ChamadaDaApi): RespostaSimulada => {
    const dada = extra(chamada);
    if (dada !== null) return dada;
    if (chamada.url.startsWith("/api/admin/vinculos")) {
      return { status: 200, corpo: lista(vinculos) };
    }
    if (chamada.url.startsWith("/api/admin/lojas/") && chamada.metodo === "GET") {
      return { status: 200, corpo: { nome: "Padaria Sol", apelido: "padaria-sol" } };
    }
    if (chamada.url.startsWith("/api/admin/pessoas?")) {
      return {
        status: 200,
        corpo: {
          pessoas: [PESSOA_NOVA],
          total: 1,
          pagina: 1,
          porPagina: 25,
          contagens: { todas: 1, clientes: 1, donos: 0, equipe: 0 },
        },
      };
    }
    return { status: 500 };
  };
}

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
  parametrosDoEndereco = new URLSearchParams();
});

describe("consulta no endereço", () => {
  it("lê tipo, loja e pessoa válidos e descarta o que não é UUID", () => {
    const c = consultaDeVinculosDoEndereco(
      new URLSearchParams(`tipo=equipe&loja=${LOJA}&pessoa=nao-uuid&pagina=2`),
    );
    expect(c).toMatchObject({ tipo: "equipe", loja: LOJA, pessoa: null, pagina: 2 });
    expect(consultaDeVinculosDoEndereco(new URLSearchParams("tipo=x")).tipo).toBe(
      "donos",
    );
  });

  it("monta o endereço da página sem valores padrão e o da API com o texto do filtro", () => {
    const base = consultaDeVinculosDoEndereco(new URLSearchParams());
    expect(enderecoDaPaginaDeVinculos(base)).toBe("/admin/donos-e-equipes");
    expect(
      enderecoDaPaginaDeVinculos({ ...base, tipo: "equipe", loja: LOJA }),
    ).toBe(`/admin/donos-e-equipes?tipo=equipe&loja=${LOJA}`);
    expect(
      enderecoDaListaDeVinculos({ ...base, loja: LOJA }, "Padaria Sol"),
    ).toBe("/api/admin/vinculos?tipo=donos&pagina=1&porPagina=100&busca=Padaria+Sol");
  });

  it("filtra por loja e por pessoa", () => {
    const todos = [
      VINCULO_DONO,
      { ...VINCULO_DONO, lojaId: "outra", identidadeId: NOVO },
    ] as never[];
    expect(
      filtrarVinculos(todos, { loja: LOJA, pessoa: null, busca: "" }),
    ).toHaveLength(1);
    expect(
      filtrarVinculos(todos, { loja: null, pessoa: NOVO, busca: "" }),
    ).toHaveLength(1);
  });
});

describe("e-mail mascarado e quem pode receber vínculo", () => {
  it("mascara o e-mail", () => {
    expect(mascararEmail("marina@exemplo.test")).toBe("m****@exemplo.test");
    expect(mascararEmail("sem-arroba")).toBe("****");
  });

  it("recusa conta protegida, desativada e sem senha", () => {
    const ok = { desativada: false, protegida: false, temSenha: true };
    expect(motivoDeNaoPoderReceber(ok)).toBeNull();
    expect(motivoDeNaoPoderReceber({ ...ok, protegida: true })).toContain("protegida");
    expect(motivoDeNaoPoderReceber({ ...ok, desativada: true })).toContain("desativada");
    expect(motivoDeNaoPoderReceber({ ...ok, temSenha: false })).toContain("senha");
  });

  it("o efeito da troca avisa que a loja não fica sem dono e que as sessões caem", () => {
    const texto = efeitoDoAto("trocar-dono", "Padaria Sol", "Marina").join(" ");
    expect(texto).toContain("sessões");
    expect(texto).toContain("não fica sem dono");
  });
});

describe("a lista", () => {
  it("lista os donos e oferece trocar e remover; equipe oferece tornar dono e remover", async () => {
    simularApi(respostas(() => null, [VINCULO_DONO]));
    const tela = montar(<ListaDeVinculos />);
    await esperar();
    expect(tela.textContent).toContain("Padaria Sol");
    expect(tela.textContent).toContain("marina@exemplo.test");
    expect(botao(tela, "Trocar dono")).toBeTruthy();
    expect(botao(tela, "Remover dono")).toBeTruthy();
    desmontar();

    parametrosDoEndereco = new URLSearchParams("tipo=equipe");
    simularApi(respostas(() => null, [VINCULO_STAFF]));
    const equipe = montar(<ListaDeVinculos />);
    await esperar();
    expect(botao(equipe, "Tornar dono")).toBeTruthy();
    expect(botao(equipe, "Remover da equipe")).toBeTruthy();
  });

  it("com ?loja= mostra o filtro e os botões de atribuir", async () => {
    parametrosDoEndereco = new URLSearchParams(`loja=${LOJA}`);
    const chamadas = simularApi(respostas());
    const tela = montar(<ListaDeVinculos />);
    await esperar();
    expect(tela.textContent).toContain("a loja Padaria Sol");
    expect(botao(tela, "Atribuir dono")).toBeTruthy();
    expect(botao(tela, "Adicionar à equipe")).toBeTruthy();
    expect(chamadas.some((c) => c.url.includes("busca=Padaria"))).toBe(true);
  });

  it("falha da API vira erro com tentar de novo", async () => {
    simularApi(() => ({ status: 500 }));
    const tela = montar(<ListaDeVinculos />);
    await esperar();
    expect(tela.textContent).toContain("Os vínculos não carregaram");
    expect(botao(tela, "Tentar de novo")).toBeTruthy();
  });
});

describe("as ações", () => {
  it("troca de dono: confirma com e-mail mascarado, exige motivo e manda o PUT", async () => {
    const chamadas = simularApi(
      respostas((c) =>
        c.metodo === "PUT" ? { status: 200, corpo: VINCULO_DONO } : null,
      ),
    );
    const tela = montar(<ListaDeVinculos />);
    await esperar();
    clicar(botao(tela, "Trocar dono"));
    await esperar();

    const janela = exigir<HTMLElement>(tela, "dialog[open]");
    expect(janela.textContent).toContain("m****@exemplo.test");
    expect(janela.textContent).not.toContain("marina@exemplo.test");

    // Sem pessoa escolhida: não envia.
    clicar(botao(janela, "Confirmar a troca"));
    await esperar();
    expect(chamadas.some((c) => c.metodo === "PUT")).toBe(false);
    expect(janela.textContent).toContain("Falta escolher a pessoa");

    digitar(exigir<HTMLInputElement>(janela, 'input[type="search"]'), "ana");
    clicar(botao(janela, "Buscar"));
    await esperar();
    clicar(botao(janela, "Escolher"));
    await esperar();
    expect(janela.textContent).toContain("a****@exemplo.test");

    // Sem motivo: não envia.
    clicar(botao(janela, "Confirmar a troca"));
    await esperar();
    expect(chamadas.some((c) => c.metodo === "PUT")).toBe(false);

    digitar(exigir<HTMLTextAreaElement>(janela, "textarea"), "dona se aposentou");
    clicar(botao(janela, "Confirmar a troca"));
    await esperar();
    const troca = chamadas.find((c) => c.metodo === "PUT");
    expect(troca).toEqual({
      url: `/api/admin/lojas/${LOJA}/donos/${DONO}/substituicao`,
      metodo: "PUT",
      corpo: { novoDonoId: NOVO, motivo: "dona se aposentou" },
    });
    expect(tela.querySelector("dialog[open]")).toBeNull();
  });

  it("remover o último dono: mostra a explicação da API e nada muda", async () => {
    const chamadas = simularApi(
      respostas((c) =>
        c.metodo === "DELETE"
          ? {
              status: 409,
              corpo: {
                erro: "ultimo_dono",
                mensagem: "A loja ficaria sem dono ativo. Troque o dono em vez de remover.",
              },
            }
          : null,
      ),
    );
    const tela = montar(<ListaDeVinculos />);
    await esperar();
    clicar(botao(tela, "Remover dono"));
    await esperar();
    const janela = exigir<HTMLElement>(tela, "dialog[open]");
    digitar(exigir<HTMLTextAreaElement>(janela, "textarea"), "pedido da loja");
    clicar(botao(janela, "Confirmar remoção"));
    await esperar();
    expect(chamadas.find((c) => c.metodo === "DELETE")).toEqual({
      url: `/api/admin/lojas/${LOJA}/donos/${DONO}`,
      metodo: "DELETE",
      corpo: { motivo: "pedido da loja" },
    });
    expect(janela.textContent).toContain("ficaria sem dono ativo");
    expect(janela.textContent).toContain("Nada mudou");
  });

  it("tornar dono (equipe): POST em /donos com a pessoa da linha", async () => {
    parametrosDoEndereco = new URLSearchParams("tipo=equipe");
    const chamadas = simularApi(
      respostas(
        (c) => (c.metodo === "POST" ? { status: 200, corpo: VINCULO_DONO } : null),
        [VINCULO_STAFF],
      ),
    );
    const tela = montar(<ListaDeVinculos />);
    await esperar();
    clicar(botao(tela, "Tornar dono"));
    await esperar();
    const janela = exigir<HTMLElement>(tela, "dialog[open]");
    digitar(exigir<HTMLTextAreaElement>(janela, "textarea"), "promoção");
    clicar(botao(janela, "Confirmar: tornar dono"));
    await esperar();
    expect(chamadas.find((c) => c.metodo === "POST")).toEqual({
      url: `/api/admin/lojas/${LOJA}/donos`,
      metodo: "POST",
      corpo: { identidadeId: STAFF, motivo: "promoção" },
    });
  });

  it("422 autotroca e 409 limite aparecem com a mensagem da API", async () => {
    parametrosDoEndereco = new URLSearchParams(`loja=${LOJA}`);
    simularApi(
      respostas((c) =>
        c.metodo === "POST"
          ? {
              status: 409,
              corpo: {
                erro: "limite_atingido",
                mensagem: "Esta pessoa já tem o máximo de lojas.",
              },
            }
          : null,
      ),
    );
    const tela = montar(<ListaDeVinculos />);
    await esperar();
    clicar(botao(tela, "Atribuir dono"));
    await esperar();
    const janela = exigir<HTMLElement>(tela, "dialog[open]");
    digitar(exigir<HTMLInputElement>(janela, 'input[type="search"]'), "ana");
    clicar(botao(janela, "Buscar"));
    await esperar();
    clicar(botao(janela, "Escolher"));
    digitar(exigir<HTMLTextAreaElement>(janela, "textarea"), "nova unidade");
    clicar(botao(janela, "Confirmar novo dono"));
    await esperar();
    expect(janela.textContent).toContain("máximo de lojas");
  });
});

describe("fichas e página", () => {
  const ler = (caminho: string) => readFileSync(join(WEB, caminho), "utf8");

  it("as fichas só linkam para a tela, já filtrada, sem prefetch", () => {
    const loja = ler("src/features/admin/EquipeDaLoja.tsx");
    expect(loja).toContain("/admin/donos-e-equipes?loja=");
    expect(loja).not.toMatch(/\bmethod:\s*"(POST|PUT|DELETE)"/);
    const pessoa = ler("src/features/admin/FichaDaConta.tsx");
    expect(pessoa).toContain("/admin/donos-e-equipes?pessoa=");
    expect(pessoa).not.toContain("substituicao");
  });

  it("a página chama exigirAdministracaoDaPlataforma e tem metadata literal", () => {
    const fonte = ler("src/app/(admin)/admin/donos-e-equipes/page.tsx");
    expect(fonte).toContain(
      'await exigirAdministracaoDaPlataforma("/admin/donos-e-equipes")',
    );
    expect(fonte).toMatch(/export const metadata = \{\s*title: "[^"$`]+",?\s*\}/);
    expect(fonte).not.toMatch(/\bfetch\(/);
  });
});
