// @vitest-environment jsdom
/**
 * O indicador de localização do topo (card #105, LGPD): rótulo pela situação,
 * coordenada só com consentimento, arredondada e apagada ao sair, e a cidade
 * do endereço padrão lida no servidor entregando só cidade e UF.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clicar, desmontar, exigir, montar } from "./apoio-config.tsx";

const rota = vi.hoisted(() => ({
  caminho: "/explorar/produtos",
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => rota.caminho,
  useRouter: () => ({ replace: rota.replace, push: vi.fn() }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined }),
}));

import {
  EVENTO_CONSENTIMENTO_MUDOU,
  NOME_DO_COOKIE_DE_CONSENTIMENTO,
  serializarConsentimento,
} from "../src/features/legal/consentimento.ts";
import { secoesDosCookies } from "../src/features/legal/textos/cookies.ts";
import { secoesDaPrivacidade } from "../src/features/legal/textos/politica-de-privacidade.ts";
import {
  LocalizacaoDoTopo,
  rotuloDaLocalizacao,
} from "../src/features/usuario/LocalizacaoDoTopo.tsx";
import {
  apagarLocalDoAparelho,
  CHAVE_DA_MARCA_DE_CONTA,
  CHAVE_DO_LOCAL,
  conferirContaDoAparelho,
  guardarLocalDoAparelho,
  INICIO_DA_LOCALIZACAO,
  lerLocalDoAparelho,
  limparDadosLocaisDoCliente,
} from "../src/features/usuario/local-do-aparelho.ts";
import {
  cidadeDoEnderecoPadrao,
  lerCidadeDoTopo,
} from "../src/server/cidade-do-topo.ts";
import { NOME_DO_COOKIE_DE_ACESSO } from "../src/server/session-cookie.ts";

const DEPOIS = Date.parse("2026-11-13T12:00:00-03:00");
const ANTES = Date.parse("2026-10-19T12:00:00-03:00");
const STORIES = "sc:feed:stories-vistos";

function consentir(funcionais: boolean, em: number) {
  document.cookie = `${NOME_DO_COOKIE_DE_CONSENTIMENTO}=${serializarConsentimento(
    { desempenho: false, funcionais },
    em,
  )}; Path=/`;
}

beforeEach(() => {
  rota.caminho = "/explorar/produtos";
  rota.replace.mockReset();
  window.history.replaceState(null, "", "/explorar/produtos");
});

afterEach(() => {
  desmontar();
  document.cookie = `${NOME_DO_COOKIE_DE_CONSENTIMENTO}=; Path=/; Max-Age=0`;
  window.localStorage.clear();
  apagarLocalDoAparelho();
});

function comGeolocalizacao(): ReturnType<typeof vi.fn> {
  const pegar = vi.fn((ok: PositionCallback) =>
    ok({
      coords: { latitude: -23.55052, longitude: -46.633308 },
    } as GeolocationPosition),
  );
  vi.stubGlobal("navigator", {
    ...navigator,
    geolocation: { getCurrentPosition: pegar },
  });
  return pegar;
}

describe("o rótulo", () => {
  const sp = { cidade: "São Paulo", uf: "SP" };

  it("[CA-17] @spec:AC-10505 uma coordenada vale 'Perto de você'; sem ela, a cidade; sem nada, o convite", () => {
    expect(rotuloDaLocalizacao({ lat: -23.5, lng: -46.6 }, sp)).toBe(
      "Perto de você",
    );
    expect(rotuloDaLocalizacao(null, sp)).toBe("São Paulo, SP");
    expect(rotuloDaLocalizacao(null, null)).toBe("Definir localização");
  });

  it("[CA-17] @spec:AC-10505 é um botão cujo nome acessível inclui o valor mostrado", () => {
    const tela = montar(<LocalizacaoDoTopo cidade={sp} />);
    const botao = exigir<HTMLButtonElement>(tela, ".sc-local-topo__botao");
    expect(botao.tagName).toBe("BUTTON");
    expect(botao.getAttribute("aria-label")).toBe("Sua região: São Paulo, SP");
    // WCAG 2.5.3 (card #132): todo texto que se vê no botão — a chamada "Sua
    // região" e o rótulo — está no nome acessível, na mesma ordem.
    const chamada = exigir(tela, ".sc-local-topo__chamada").textContent ?? "";
    const valor = exigir(tela, ".sc-local-topo__rotulo").textContent ?? "";
    expect(valor).toBe("São Paulo, SP");
    const normal = (t: string) =>
      t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    expect(normal(botao.getAttribute("aria-label") ?? "")).toContain(
      normal(`${chamada} ${valor}`),
    );
  });

  it("[CA-17] @spec:AC-10505 sem cidade nem coordenada mostra 'Definir localização'", () => {
    const tela = montar(<LocalizacaoDoTopo cidade={null} />);
    expect(
      exigir(tela, ".sc-local-topo__botao").getAttribute("aria-label"),
    ).toBe("Sua região: Definir localização");
  });

  it("[CA-17] @spec:AC-10507 com coordenada autorizada o rótulo vira 'Perto de você' (a cidade não manda na ordem)", () => {
    consentir(true, DEPOIS);
    guardarLocalDoAparelho({ lat: -23.5505, lng: -46.6333 });
    const tela = montar(<LocalizacaoDoTopo cidade={sp} />);
    expect(exigir(tela, ".sc-local-topo__rotulo").textContent).toBe(
      "Perto de você",
    );
  });
});

describe("consentimento e arredondamento", () => {
  it("[CA-18] @spec:AC-10506 com funcionais aceitos depois do texto, grava arredondada (~100 m)", () => {
    consentir(true, DEPOIS);
    guardarLocalDoAparelho({ lat: -23.55052, lng: -46.633308 });
    expect(
      JSON.parse(window.localStorage.getItem(CHAVE_DO_LOCAL) ?? "null"),
    ).toEqual({
      lat: -23.551,
      lng: -46.633,
    });
  });

  it("[CA-18] @spec:AC-10506 sem consentimento nada fica no aparelho: vale só na memória da página", () => {
    guardarLocalDoAparelho({ lat: -23.55052, lng: -46.633308 });
    expect(window.localStorage.getItem(CHAVE_DO_LOCAL)).toBeNull();
    expect(lerLocalDoAparelho()).toEqual({ lat: -23.551, lng: -46.633 });
  });

  it("[CA-18] @spec:AC-10506 consentimento só de desempenho, ou funcional anterior ao texto, não vale", () => {
    consentir(false, DEPOIS);
    guardarLocalDoAparelho({ lat: -23.5, lng: -46.6 });
    expect(window.localStorage.getItem(CHAVE_DO_LOCAL)).toBeNull();

    consentir(true, ANTES);
    expect(ANTES).toBeLessThan(INICIO_DA_LOCALIZACAO);
    guardarLocalDoAparelho({ lat: -23.5, lng: -46.6 });
    expect(window.localStorage.getItem(CHAVE_DO_LOCAL)).toBeNull();
  });

  it("[CA-18] @spec:AC-10506 coordenada guardada com mais precisão é regravada arredondada ao ler", () => {
    consentir(true, DEPOIS);
    window.localStorage.setItem(
      CHAVE_DO_LOCAL,
      JSON.stringify({ lat: -23.55052123, lng: -46.633308999 }),
    );
    expect(lerLocalDoAparelho()).toEqual({ lat: -23.551, lng: -46.633 });
    expect(
      JSON.parse(window.localStorage.getItem(CHAVE_DO_LOCAL) ?? "null"),
    ).toEqual({
      lat: -23.551,
      lng: -46.633,
    });
  });

  it("[CA-18] @spec:AC-10506 o que sobrou de antes do consentimento é apagado ao ler", () => {
    window.localStorage.setItem(
      CHAVE_DO_LOCAL,
      JSON.stringify({ lat: -23.5, lng: -46.6 }),
    );
    expect(lerLocalDoAparelho()).toBeNull();
    expect(window.localStorage.getItem(CHAVE_DO_LOCAL)).toBeNull();
  });

  it("[CA-18] @spec:AC-10506 valor estragado no armazenamento é descartado", () => {
    consentir(true, DEPOIS);
    window.localStorage.setItem(
      CHAVE_DO_LOCAL,
      JSON.stringify({ lat: 999, lng: "x" }),
    );
    expect(lerLocalDoAparelho()).toBeNull();
    expect(window.localStorage.getItem(CHAVE_DO_LOCAL)).toBeNull();
  });

  it("[CA-18] @spec:AC-10506 recusar o consentimento apaga a coordenada guardada", () => {
    consentir(true, DEPOIS);
    guardarLocalDoAparelho({ lat: -23.5, lng: -46.6 });
    const tela = montar(<LocalizacaoDoTopo cidade={null} />);
    expect(exigir(tela, ".sc-local-topo__rotulo").textContent).toBe(
      "Perto de você",
    );

    consentir(false, DEPOIS);
    act(() => {
      window.dispatchEvent(new CustomEvent(EVENTO_CONSENTIMENTO_MUDOU));
    });
    expect(window.localStorage.getItem(CHAVE_DO_LOCAL)).toBeNull();
    expect(exigir(tela, ".sc-local-topo__rotulo").textContent).toBe(
      "Definir localização",
    );
    expect(lerLocalDoAparelho()).toBeNull();
  });
});

describe("sair e outras saídas", () => {
  it("[CA-18] @spec:AC-10506 limparDadosLocaisDoCliente apaga a localização, os stories vistos e a marca", () => {
    consentir(true, DEPOIS);
    guardarLocalDoAparelho({ lat: -23.5, lng: -46.6 });
    window.localStorage.setItem(STORIES, JSON.stringify(["s1"]));
    window.localStorage.setItem(CHAVE_DA_MARCA_DE_CONTA, "1");
    limparDadosLocaisDoCliente();
    expect(window.localStorage.getItem(CHAVE_DO_LOCAL)).toBeNull();
    expect(window.localStorage.getItem(STORIES)).toBeNull();
    expect(window.localStorage.getItem(CHAVE_DA_MARCA_DE_CONTA)).toBeNull();
    expect(lerLocalDoAparelho()).toBeNull();
  });

  it("[CA-18] @spec:AC-10506 logado grava a marca de que o aparelho teve conta", () => {
    conferirContaDoAparelho(true);
    expect(window.localStorage.getItem(CHAVE_DA_MARCA_DE_CONTA)).toBe("1");
  });

  it("[CA-18] @spec:AC-10506 abrir como visitante depois de a conta sair por fora (excluir, sessão vencida) limpa o aparelho", () => {
    consentir(true, DEPOIS);
    conferirContaDoAparelho(true);
    guardarLocalDoAparelho({ lat: -23.5, lng: -46.6 });
    window.localStorage.setItem(STORIES, JSON.stringify(["s1"]));

    conferirContaDoAparelho(false);
    expect(window.localStorage.getItem(CHAVE_DO_LOCAL)).toBeNull();
    expect(window.localStorage.getItem(STORIES)).toBeNull();
    expect(window.localStorage.getItem(CHAVE_DA_MARCA_DE_CONTA)).toBeNull();
  });

  it("[CA-18] @spec:AC-10506 visitante de sempre (sem a marca) não perde nada", () => {
    window.localStorage.setItem(STORIES, JSON.stringify(["s1"]));
    conferirContaDoAparelho(false);
    expect(window.localStorage.getItem(STORIES)).not.toBeNull();
  });
});

describe("pedir a localização", () => {
  it("[CA-18] @spec:AC-10506 o navegador não pede a localização ao montar", () => {
    const pegar = comGeolocalizacao();
    montar(<LocalizacaoDoTopo cidade={null} />);
    expect(pegar).not.toHaveBeenCalled();
  });

  it("[CA-18] @spec:AC-10506 só pede quando a pessoa aciona o botão, depois de ler para que serve", () => {
    const pegar = comGeolocalizacao();
    const tela = montar(<LocalizacaoDoTopo cidade={null} />);
    clicar(exigir(tela, ".sc-local-topo__botao"));
    expect(exigir(tela, ".sc-local-topo__painel").textContent).toContain(
      "cerca de 100 metros",
    );
    expect(pegar).not.toHaveBeenCalled();
    clicar(exigir(tela, ".sc-local-topo__acao--principal"));
    expect(pegar).toHaveBeenCalledTimes(1);
  });

  it("[CA-19] @spec:AC-10507 em /explorar a coordenada nova vai ao feed, arredondada", () => {
    window.history.replaceState(
      null,
      "",
      "/explorar/produtos?busca=pao&ordem=distancia",
    );
    comGeolocalizacao();
    const tela = montar(
      <LocalizacaoDoTopo cidade={{ cidade: "São Paulo", uf: "SP" }} />,
    );
    clicar(exigir(tela, ".sc-local-topo__botao"));
    clicar(exigir(tela, ".sc-local-topo__acao--principal"));
    expect(rota.replace).toHaveBeenCalledWith(
      "/explorar/produtos?busca=pao&ordem=distancia&lat=-23.551&lng=-46.633",
      { scroll: false },
    );
    expect(exigir(tela, ".sc-local-topo__rotulo").textContent).toBe(
      "Perto de você",
    );
  });

  it("[CA-19] @spec:AC-10507 fora do feed só o rótulo muda (nada de navegar)", () => {
    rota.caminho = "/conta";
    comGeolocalizacao();
    const tela = montar(<LocalizacaoDoTopo cidade={null} />);
    clicar(exigir(tela, ".sc-local-topo__botao"));
    clicar(exigir(tela, ".sc-local-topo__acao--principal"));
    expect(rota.replace).not.toHaveBeenCalled();
    expect(exigir(tela, ".sc-local-topo__rotulo").textContent).toBe(
      "Perto de você",
    );
  });

  it("[CA-19] @spec:AC-10507 remover a localização tira lat e lng do feed", () => {
    window.history.replaceState(
      null,
      "",
      "/explorar/produtos?busca=pao&lat=-23.551&lng=-46.633",
    );
    consentir(true, DEPOIS);
    guardarLocalDoAparelho({ lat: -23.551, lng: -46.633 });
    const tela = montar(<LocalizacaoDoTopo cidade={null} />);
    clicar(exigir(tela, ".sc-local-topo__botao"));
    const remover = [...tela.querySelectorAll("button")].find(
      (b) => b.textContent === "Remover localização",
    );
    clicar(remover as Element);
    expect(rota.replace).toHaveBeenCalledWith("/explorar/produtos?busca=pao", {
      scroll: false,
    });
    expect(exigir(tela, ".sc-local-topo__rotulo").textContent).toBe(
      "Definir localização",
    );
  });

  it("[CA-17] @spec:AC-10506 permissão negada: avisa e o rótulo não muda", () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      geolocation: {
        getCurrentPosition: (
          _ok: PositionCallback,
          falha: PositionErrorCallback,
        ) => falha({ code: 1 } as GeolocationPositionError),
      },
    });
    const tela = montar(<LocalizacaoDoTopo cidade={null} />);
    clicar(exigir(tela, ".sc-local-topo__botao"));
    clicar(exigir(tela, ".sc-local-topo__acao--principal"));
    expect(exigir(tela, '[role="status"]').textContent).toContain("permissão");
    expect(exigir(tela, ".sc-local-topo__rotulo").textContent).toBe(
      "Definir localização",
    );
  });
});

describe("a cidade do endereço padrão (servidor)", () => {
  const endereco = (extra: Record<string, unknown>) => ({
    id: "d1aad681-e41b-5af4-ad9a-d2dc1d87377d",
    rotulo: "Casa",
    destinatario: "Ana Ribeiro",
    logradouro: "Rua das Flores",
    numero: "10",
    complemento: "ap 2",
    bairro: "Centro",
    cidade: "São Paulo",
    estado: "SP",
    cep: "01000-000",
    pontoDeReferencia: "perto da padaria",
    padrao: false,
    ...extra,
  });

  it("[CA-20] @spec:AC-10508 entrega exatamente { cidade, uf }, sem logradouro nem destinatário", () => {
    const cidade = cidadeDoEnderecoPadrao({
      enderecos: [
        endereco({ cidade: "Campinas", estado: "SP" }),
        endereco({ padrao: true }),
      ],
    });
    expect(cidade).toEqual({ cidade: "São Paulo", uf: "SP" });
    expect(Object.keys(cidade ?? {}).sort()).toEqual(["cidade", "uf"]);
    expect(JSON.stringify(cidade)).not.toMatch(/Rua|Ana|padaria|Centro|01000/);
  });

  it("[CA-20] @spec:AC-10508 sem endereço padrão não inventa cidade (nunca pega o primeiro)", () => {
    expect(cidadeDoEnderecoPadrao({ enderecos: [endereco({})] })).toBeNull();
    expect(cidadeDoEnderecoPadrao({ enderecos: [] })).toBeNull();
  });

  it("[CA-20] @spec:AC-10508 cidade ou UF ausentes ou inválidos valem null", () => {
    expect(
      cidadeDoEnderecoPadrao({
        enderecos: [endereco({ padrao: true, cidade: null })],
      }),
    ).toBeNull();
    expect(
      cidadeDoEnderecoPadrao({
        enderecos: [endereco({ padrao: true, cidade: "  " })],
      }),
    ).toBeNull();
    expect(
      cidadeDoEnderecoPadrao({
        enderecos: [endereco({ padrao: true, estado: null })],
      }),
    ).toBeNull();
    expect(cidadeDoEnderecoPadrao("lixo")).toBeNull();
  });

  it("[CA-20] @spec:AC-10508 aceita a UF em minúsculas e apara espaços", () => {
    expect(
      cidadeDoEnderecoPadrao({
        enderecos: [
          endereco({ padrao: true, cidade: "  Recife ", estado: "pe" }),
        ],
      }),
    ).toEqual({ cidade: "Recife", uf: "PE" });
  });

  const cookie = `${NOME_DO_COOKIE_DE_ACESSO}=tok`;

  it("[CA-20] @spec:AC-10508 sem cookie de acesso não faz chamada nenhuma", async () => {
    const buscar = vi.fn();
    expect(await lerCidadeDoTopo(null, buscar)).toBeNull();
    expect(await lerCidadeDoTopo("outro=1", buscar)).toBeNull();
    expect(buscar).not.toHaveBeenCalled();
  });

  it("[CA-20] @spec:AC-10508 lê com token, sem cache e com tempo limite", async () => {
    const buscar = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        Response.json({ enderecos: [endereco({ padrao: true })] }),
    );
    const cidade = await lerCidadeDoTopo(cookie, buscar);
    expect(cidade).toEqual({ cidade: "São Paulo", uf: "SP" });
    const [url, init] = buscar.mock.calls[0] ?? [];
    expect(String(url)).toMatch(/\/v1\/conta\/enderecos$/);
    expect(init?.cache).toBe("no-store");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer tok");
  });

  it("[CA-20] @spec:AC-10508 sessão vencida, erro de rede ou resposta estranha valem null, sem redirecionar", async () => {
    const vencida = vi.fn(async () => new Response("{}", { status: 401 }));
    expect(await lerCidadeDoTopo(cookie, vencida)).toBeNull();
    const caiu = vi.fn(async () => {
      throw new Error("rede");
    });
    expect(await lerCidadeDoTopo(cookie, caiu)).toBeNull();
    const estranha = vi.fn(async () => Response.json({ x: 1 }));
    expect(await lerCidadeDoTopo(cookie, estranha)).toBeNull();
  });
});

describe("os textos legais citam a localização", () => {
  const texto = (secoes: ReturnType<typeof secoesDaPrivacidade>) =>
    JSON.stringify(secoes);

  it("[CA-21] @spec:AC-10506 a Política de Privacidade cita finalidade, arredondamento, consentimento e como apagar", () => {
    const politica = texto(secoesDaPrivacidade("privacidade@exemplo.test"));
    expect(politica).toContain("Localização aproximada");
    expect(politica).toContain("100 metros");
    expect(politica).toContain("cookies funcionais");
    expect(politica).toContain("apagá-la");
    expect(politica).toContain("sai da conta");
  });

  it("[CA-21] @spec:AC-10506 a página de Cookies cita a localização entre os funcionais", () => {
    const cookies = texto(secoesDosCookies("privacidade@exemplo.test"));
    expect(cookies).toContain("localização aproximada");
  });
});
