// @vitest-environment jsdom
/**
 * O modal "Minha conta" (card #151): abre de qualquer tela pelo topo, na aba
 * certa, com link profundo, foco de volta, Esc e abas por teclado; lê os dados
 * ao abrir e não guarda nada depois de fechar.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({
  busca: new URLSearchParams(),
  caminho: "/conta/pedidos",
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: nav.refresh, push: vi.fn() }),
  usePathname: () => nav.caminho,
  useSearchParams: () => nav.busca,
}));

import { ModalDaConta } from "../src/features/conta/ModalDaConta.tsx";
import { desmontar, esperar, exigir, montar, simularApi } from "./apoio-config.tsx";

const EMAIL = "ana@cliente.test";

const DADOS = {
  id: "c1",
  nome: "Ana Ribeiro",
  email: EMAIL,
  telefone: null,
  cpf: null,
  aceitaOfertas: false,
  criadaEm: "2026-01-10T12:00:00.000Z",
  temSenha: true,
  aplicativoAutenticador: false,
};

const SESSOES = {
  sessoes: [
    {
      id: "s1",
      tipo: "navegador",
      iniciadaEm: "2026-11-01T10:00:00.000Z",
      ultimoAcessoEm: "2026-11-02T10:00:00.000Z",
      atual: true,
    },
  ],
};

const ACEITES = { pendentes: [], historico: [] };

const acoes = {
  sairDaConta: vi.fn(),
  encerrarTodasAsSessoes: vi.fn(),
  sairDepoisDeExcluirAConta: vi.fn(),
};

type Resposta = { status: number; corpo?: unknown };

function api(trocas: Record<string, Resposta> = {}) {
  return simularApi(({ url }) => {
    const caminho = url.replace("/api/conta/", "");
    const troca = trocas[caminho];
    if (troca !== undefined) return troca;
    if (caminho === "dados") return { status: 200, corpo: DADOS };
    if (caminho === "sessoes") return { status: 200, corpo: SESSOES };
    if (caminho === "aceites") return { status: 200, corpo: ACEITES };
    if (caminho === "enderecos") return { status: 200, corpo: { enderecos: [] } };
    return { status: 404, corpo: {} };
  });
}

/** A página do cliente: o avatar do topo, o menu (escondido) e o modal. */
function Cena({ email = EMAIL }: { email?: string }) {
  return (
    <>
      <button type="button" data-menu-da-conta="" id="avatar">
        Avatar
      </button>
      <div hidden>
        <a href="/conta/dados" data-abre-conta="dados" id="item-do-menu">
          Minha conta
        </a>
      </div>
      <a href="/conta/dados" data-abre-conta="dados" id="perfil">
        Perfil
      </a>
      <ModalDaConta email={email} acoes={acoes} />
    </>
  );
}

function irPara(consulta: string) {
  nav.busca = new URLSearchParams(consulta);
  window.history.replaceState(null, "", `/conta/pedidos${consulta === "" ? "" : `?${consulta}`}`);
}

const janela = () => document.querySelector<HTMLDialogElement>("dialog.sc-conta-modal");
const aberta = () => janela()?.hasAttribute("open") === true;
const abaSelecionada = () =>
  document.querySelector('[role="tab"][aria-selected="true"]')?.textContent;

function clicarComoPessoa(alvo: Element, opcoes: MouseEventInit = {}) {
  const evento = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...opcoes });
  act(() => {
    alvo.dispatchEvent(evento);
  });
  return evento;
}

function esc() {
  const evento = new Event("cancel", { cancelable: true });
  act(() => {
    janela()?.dispatchEvent(evento);
  });
  return evento;
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  nav.refresh.mockReset();
  irPara("");
});

afterEach(() => {
  desmontar();
  vi.unstubAllGlobals();
});

describe("abre pelo topo, de qualquer tela", () => {
  it("[CA-6] o link com data-abre-conta abre o modal na aba Dados, sem navegar", async () => {
    const chamadas = api();
    montar(<Cena />);
    expect(aberta()).toBe(false);

    const evento = clicarComoPessoa(exigir(document.body, "#perfil"));
    await esperar();

    expect(evento.defaultPrevented).toBe(true);
    expect(aberta()).toBe(true);
    expect(janela()?.getAttribute("aria-labelledby")).toBeTruthy();
    expect(janela()?.querySelector("h2")?.textContent).toBe("Minha conta");
    expect(abaSelecionada()).toBe("Dados");
    expect(window.location.search).toBe("?conta=dados");
    expect(chamadas.map((c) => c.url)).toContain("/api/conta/dados");
    expect(janela()?.textContent).toContain("Meus dados");
    expect(janela()?.textContent).toContain("Privacidade: seus aceites e cookies");
    expect(janela()?.textContent).toContain("Baixar meus dados");
  });

  it("[CA-6] clique com Ctrl, Meta, Shift ou botão do meio fica com o navegador", async () => {
    api();
    montar(<Cena />);
    for (const opcoes of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
      const evento = clicarComoPessoa(exigir(document.body, "#perfil"), opcoes);
      expect(evento.defaultPrevented).toBe(false);
    }
    await esperar();
    expect(aberta()).toBe(false);
  });

  it("[CA-6] o valor de data-abre-conta fora da lista não abre nada", () => {
    api();
    montar(<Cena />);
    const intruso = document.createElement("a");
    intruso.setAttribute("data-abre-conta", "painel");
    document.body.append(intruso);
    const evento = clicarComoPessoa(intruso);
    intruso.remove();
    expect(evento.defaultPrevented).toBe(false);
    expect(aberta()).toBe(false);
  });
});

describe("link profundo: ?conta=<aba>", () => {
  it.each([
    ["dados", "Dados"],
    ["enderecos", "Endereços"],
    ["seguranca", "Segurança"],
  ])("[CA-8] ?conta=%s abre o modal na aba %s", async (conta, rotulo) => {
    api();
    irPara(`conta=${conta}`);
    montar(<Cena />);
    await esperar();
    expect(aberta()).toBe(true);
    expect(abaSelecionada()).toBe(rotulo);
  });

  it.each(["excluida", "<script>", "", "DADOS", "dados,seguranca"])(
    "[CA-8] ?conta=%s não abre o modal",
    async (conta) => {
      api();
      irPara(`conta=${encodeURIComponent(conta)}`);
      montar(<Cena />);
      await esperar();
      expect(aberta()).toBe(false);
    },
  );
});

describe("as três abas", () => {
  it("[CA-5] Dados: formulário com os dados lidos; Endereços e Segurança só carregam ao abrir", async () => {
    const chamadas = api();
    irPara("conta=dados");
    montar(<Cena />);
    await esperar();
    expect(exigir<HTMLInputElement>(document.body, "#dados-nome").value).toBe("Ana Ribeiro");
    const urls = () => chamadas.map((c) => c.url);
    expect(urls()).toContain("/api/conta/aceites");
    expect(urls()).not.toContain("/api/conta/sessoes");
    expect(urls()).not.toContain("/api/conta/enderecos");

    const abas = [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
    expect(abas.map((a) => a.textContent)).toEqual(["Dados", "Endereços", "Segurança"]);
    act(() => abas[1]?.click());
    await esperar();
    expect(urls()).toContain("/api/conta/enderecos");
    expect(janela()?.textContent).toContain("Meus endereços");
    expect(window.location.search).toBe("?conta=enderecos");

    act(() => abas[2]?.click());
    await esperar();
    expect(urls()).toContain("/api/conta/sessoes");
    for (const texto of [
      "Trocar senha",
      "Verificação em duas etapas",
      "Aparelhos conectados",
      "Sair deste dispositivo",
      "Encerrar todas as sessões",
      "Excluir minha conta",
    ]) {
      expect(janela()?.textContent, texto).toContain(texto);
    }
    expect(janela()?.querySelector('a[href="/conta/seguranca/aplicativo"]')).not.toBeNull();
    expect(janela()?.querySelectorAll('[data-sessao]')).toHaveLength(1);
  });

  it("[CA-5] ?estado=erro mostra o aviso da ação que falhou na aba Segurança", async () => {
    api();
    irPara("conta=seguranca&estado=erro");
    montar(<Cena />);
    await esperar();
    expect(janela()?.textContent).toContain("Não foi possível encerrar a sessão.");
  });

  it("[CA-5] com o aplicativo ativo a aba Segurança oferece desativar, não configurar", async () => {
    api({ dados: { status: 200, corpo: { ...DADOS, aplicativoAutenticador: true } } });
    irPara("conta=seguranca");
    montar(<Cena />);
    await esperar();
    expect(janela()?.textContent).toContain("Desativar aplicativo autenticador");
    expect(janela()?.querySelector('a[href="/conta/seguranca/aplicativo"]')).toBeNull();
  });

  it("[CA-5] carregando, erro com 'Tentar de novo' e sessão vencida", async () => {
    api({ dados: { status: 500, corpo: {} } });
    irPara("conta=dados");
    montar(<Cena />);
    expect(janela()?.querySelector('[role="status"], .sc-esqueleto')).not.toBeNull();
    await esperar();
    expect(janela()?.textContent).toContain("Não deu para carregar agora");
    const tentar = [...(janela()?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent === "Tentar de novo",
    );
    expect(tentar).toBeDefined();
    desmontar();

    api({ dados: { status: 401, corpo: {} } });
    montar(<Cena />);
    await esperar();
    expect(janela()?.textContent).toContain("Sua sessão acabou");
    expect(janela()?.querySelector('a[href^="/entrar?proximo="]')?.getAttribute("href")).toBe(
      "/entrar?proximo=%2Fconta%2Fpedidos%3Fconta%3Ddados",
    );
    expect(janela()?.querySelector("#dados-nome")).toBeNull();
  });

  it("[CA-5] leitura de outra conta (a pessoa trocou de conta em outra aba) é descartada", async () => {
    api();
    irPara("conta=dados");
    montar(<Cena email="outra@pessoa.test" />);
    await esperar();
    expect(janela()?.querySelector("#dados-nome")).toBeNull();
    expect(janela()?.textContent).toContain("Sua sessão acabou");
  });

  it("[CA-5] salvar os dados atualiza o topo (refresh) e as respostas só vêm de /api/conta", async () => {
    const chamadas = api({ dados: { status: 200, corpo: DADOS } });
    irPara("conta=dados");
    montar(<Cena />);
    await esperar();
    const formulario = exigir<HTMLFormElement>(janela() as HTMLElement, 'form[aria-label="Meus dados"]');
    await act(async () => {
      formulario.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await esperar();
    expect(nav.refresh).toHaveBeenCalledTimes(1);
    expect(chamadas.every((c) => c.url.startsWith("/api/conta/"))).toBe(true);
  });
});

describe("acessibilidade e fechamento", () => {
  it("[CA-9] Esc fecha, tira ?conta do endereço e devolve o foco ao avatar do topo", async () => {
    api();
    montar(<Cena />);
    clicarComoPessoa(exigir(document.body, "#item-do-menu"));
    await esperar();
    expect(aberta()).toBe(true);

    const evento = esc();
    await esperar();
    expect(evento.defaultPrevented).toBe(true);
    expect(aberta()).toBe(false);
    // O item do menu fica escondido ao fechar o menu: o foco vai ao avatar.
    expect(document.activeElement?.id).toBe("avatar");
  });

  it("[CA-9] o botão Fechar fecha; num link profundo o endereço perde conta e estado", async () => {
    api();
    irPara("conta=seguranca&estado=erro");
    montar(<Cena />);
    await esperar();
    const fechar = exigir<HTMLButtonElement>(janela() as HTMLElement, ".sc-gaveta-modal__fechar");
    expect(fechar.textContent).toContain("Fechar");
    act(() => fechar.click());
    await esperar();
    expect(aberta()).toBe(false);
    expect(window.location.search).toBe("");
    expect(document.activeElement?.id).toBe("avatar");
  });

  it("[CA-9] o foco volta ao 'Perfil' da barra quando foi ele que abriu", async () => {
    api();
    montar(<Cena />);
    const perfil = exigir<HTMLAnchorElement>(document.body, "#perfil");
    perfil.focus();
    clicarComoPessoa(perfil);
    await esperar();
    esc();
    await esperar();
    expect(document.activeElement).toBe(perfil);
  });

  it("[CA-9] as abas seguem o padrão WAI-ARIA: setas, Home e End trocam a aba e a URL", async () => {
    api();
    irPara("conta=dados");
    montar(<Cena />);
    await esperar();
    const lista = exigir(document.body, '[role="tablist"]');
    expect(lista.getAttribute("aria-label")).toBe("Configurações da conta");
    const tecla = (key: string) =>
      act(() => {
        lista.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      });
    tecla("ArrowRight");
    expect(abaSelecionada()).toBe("Endereços");
    expect(window.location.search).toBe("?conta=enderecos");
    tecla("End");
    expect(abaSelecionada()).toBe("Segurança");
    tecla("ArrowRight");
    expect(abaSelecionada()).toBe("Dados");
    tecla("ArrowLeft");
    expect(abaSelecionada()).toBe("Segurança");
    tecla("Home");
    expect(abaSelecionada()).toBe("Dados");
    // Só a aba atual entra na ordem do Tab.
    const tabindex = [...document.querySelectorAll('[role="tab"]')].map((a) => a.getAttribute("tabindex"));
    expect(tabindex).toEqual(["0", "-1", "-1"]);
  });

  it("[CA-9] fechar e abrir de novo lê tudo outra vez: nada fica guardado", async () => {
    const chamadas = api();
    montar(<Cena />);
    const abrirE = async () => {
      clicarComoPessoa(exigir(document.body, "#perfil"));
      await esperar();
    };
    await abrirE();
    esc();
    await esperar();
    expect(janela()?.querySelector("#dados-nome")).toBeNull();
    await abrirE();
    expect(chamadas.filter((c) => c.url === "/api/conta/dados")).toHaveLength(2);
  });

  it("[CA-9] o modal é um dialog nomeado e a página de fundo não rola (CSS)", async () => {
    api();
    irPara("conta=dados");
    montar(<Cena />);
    await esperar();
    const caixa = janela() as HTMLDialogElement;
    expect(caixa.tagName).toBe("DIALOG");
    expect(document.getElementById(caixa.getAttribute("aria-labelledby") ?? "")?.textContent).toBe("Minha conta");
    const css = readFileSync(join(process.cwd(), "packages", "ui", "styles", "conta.css"), "utf8");
    expect(css).toMatch(/html:has\(\.sc-conta-modal\[open\]\)\s*\{\s*overflow:\s*hidden/);
    expect(css).toContain(".sc-gaveta-modal.sc-conta-modal");
  });
});

describe("por cima do /admin (card #169)", () => {
  function noAdmin(consulta: string) {
    nav.busca = new URLSearchParams(consulta);
    window.history.replaceState(null, "", `/admin${consulta === "" ? "" : `?${consulta}`}`);
  }

  it("[CA-19] ?conta=dados em /admin abre o modal na aba Dados sobre a tela atual", async () => {
    api();
    noAdmin("conta=dados");
    montar(<Cena />);
    await esperar();
    expect(aberta()).toBe(true);
    expect(abaSelecionada()).toBe("Dados");
    expect(window.location.pathname).toBe("/admin");
  });

  it("[CA-19] 'Minha conta' do admin (data-abre-conta) abre o modal sem sair do /admin", async () => {
    api();
    noAdmin("");
    montar(<Cena />);
    clicarComoPessoa(exigir(document.body, "#item-do-menu"));
    await esperar();
    expect(aberta()).toBe(true);
    expect(window.location.pathname).toBe("/admin");
    expect(window.location.search).toBe("?conta=dados");
  });

  it("[CA-19] aba fora da lista fechada é ignorada em /admin", async () => {
    api();
    noAdmin("conta=painel");
    montar(<Cena />);
    await esperar();
    expect(aberta()).toBe(false);
  });

  it("[CA-19] o layout do admin monta o modal pela sessão, depois da guarda", () => {
    const layout = readFileSync(
      join(process.cwd(), "apps", "web", "src", "app", "(admin)", "admin", "layout.tsx"),
      "utf8",
    );
    expect(layout).toContain("<ModalDaContaDaSessao");
    expect(layout.indexOf("exigirAdministracaoDaPlataforma")).toBeLessThan(
      layout.indexOf("<ModalDaContaDaSessao"),
    );
  });
});

describe("o servidor não leva dado da conta para toda página", () => {
  it("[CA-5] sessao.tsx só passa o e-mail e as ações: não importa as leituras da conta", () => {
    const fonte = readFileSync(
      join(process.cwd(), "apps", "web", "src", "app", "_usuario", "sessao.tsx"),
      "utf8",
    );
    expect(fonte).not.toMatch(/conta-do-cliente|buscarDadosDaConta|buscarSessoesAbertas|buscarAceites/);
    expect(fonte).toContain("<ModalDaConta");
  });
});
