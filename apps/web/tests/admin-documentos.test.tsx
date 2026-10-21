// @vitest-environment jsdom
/**
 * O contrato e os documentos da loja na tela da administração (AC-203 a
 * AC-205, P-011, P-012).
 *
 * O caminho de verdade — bytes crus, conferência pelo CONTEÚDO, armazenamento
 * privado, linha em `store_contracts`, link assinado de cinco minutos e a
 * recusa a quem não é da administração — está provado contra o banco em
 * `apps/api/tests/admin-documentos.test.ts`. Aqui se prova o que só o site
 * faz: o documento aparece a partir da ficha com nome, tamanho, data e quem
 * enviou; o arquivo só sai por um link gerado NO CLIQUE e pedido ao próprio
 * site; a recusa da API chega ao campo do arquivo; e a ponte do site só
 * repassa estes caminhos, devolvendo o arquivo como anexo.
 */
import axe from "axe-core";
import type { DocumentoDaLojaNoContrato } from "@simpleclick/contracts";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  DocumentosDaLoja,
  DocumentosDaLojaNaTela,
  MENSAGEM_DE_SESSAO_DOS_DOCUMENTOS,
  type DocumentosDaLojaNaTelaProps,
} from "../src/features/admin/DocumentosDaLoja.tsx";
import {
  enderecoDoArquivoNoSite,
  recusaAntesDeEnviar,
  tamanhoNaTela,
} from "../src/features/admin/documentos-da-loja.ts";
// As abas leem o caminho para marcar a atual.
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/lojas/documentos",
}));

import { AbasDaLoja } from "../src/features/admin/AbasDaLoja.tsx";
import {
  caminhoPermitido,
  encaminharParaAdministracao,
} from "../src/server/admin-api.ts";
import {
  botao,
  desmontar,
  enviar,
  esperar,
  exigir,
  montar,
} from "./apoio-config.tsx";

const LOJA_ID = "3a3c3d4e-0000-4000-8000-000000000001";
const DOCUMENTO_ID = "7b7c7d7e-0000-4000-8000-000000000002";
const CARGA = "eyJkIjoiN2I3YzdkN2UiLCJsIjoiM2EzYyJ9";
const ASSINATURA = "A".repeat(43);

const CONTRATO: DocumentoDaLojaNoContrato = {
  id: DOCUMENTO_ID,
  tipo: "CONTRATO",
  nomeDoArquivo: "Contrato Pastel da Joi.pdf",
  tamanhoEmBytes: 1_258_291,
  tipoDeConteudo: "application/pdf",
  enviadoEm: "2026-09-27T12:00:00.000Z",
  enviadoPor: { id: "admin-1", nome: "Administradora geral" },
};

/** Uma chamada que a tela fez, com cabeçalhos e corpo como saíram. */
interface Chamada {
  readonly url: string;
  readonly metodo: string;
  readonly cabecalhos: Headers;
  readonly corpo: unknown;
}

function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Troca o `fetch` por respostas do teste, inclusive binárias. */
function simularRede(responder: (chamada: Chamada) => Response): Chamada[] {
  const chamadas: Chamada[] = [];
  vi.stubGlobal(
    "fetch",
    async (endereco: RequestInfo | URL, init?: RequestInit) => {
      const chamada: Chamada = {
        url: String(endereco),
        metodo: init?.method ?? "GET",
        cabecalhos: new Headers(init?.headers),
        corpo: init?.body,
      };
      chamadas.push(chamada);
      return responder(chamada);
    },
  );
  return chamadas;
}

/** A API que a tela consulta: a lista, e o que mais o teste pedir. */
function respostas(
  documentos: readonly DocumentoDaLojaNoContrato[],
  outras: (chamada: Chamada) => Response | undefined = () => undefined,
) {
  return (chamada: Chamada): Response => {
    const outra = outras(chamada);
    if (outra !== undefined) return outra;
    if (
      chamada.metodo === "GET" &&
      chamada.url === `/api/admin/lojas/${LOJA_ID}/documentos`
    ) {
      return json(200, { documentos });
    }
    return json(500, { erro: "inesperado" });
  };
}

/** Escolhe o arquivo no seletor, como a pessoa escolheria. */
function escolherArquivo(tela: HTMLElement, arquivo: File): void {
  const campo = exigir<HTMLInputElement>(tela, "#documento-arquivo");
  Object.defineProperty(campo, "files", {
    value: [arquivo],
    configurable: true,
  });
  act(() => {
    campo.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function formularioDoEnvio(tela: HTMLElement): HTMLFormElement {
  return exigir<HTMLFormElement>(tela, 'form[aria-label="Envio de documento"]');
}

function desenhar(
  sobrescrita: Partial<DocumentosDaLojaNaTelaProps> = {},
): Document {
  const props: DocumentosDaLojaNaTelaProps = {
    lojaId: LOJA_ID,
    estado: { fase: "pronta", documentos: [CONTRATO] },
    aoTentarDeNovo: () => undefined,
    aoEnviar: () => undefined,
    ...sobrescrita,
  };
  document.body.innerHTML = renderToStaticMarkup(
    <DocumentosDaLojaNaTela {...props} />,
  );
  return document;
}

/** Os downloads que a tela entregou: o endereço do conteúdo e o nome. */
let downloads: { href: string; nome: string }[] = [];

beforeAll(() => {
  // O jsdom não cria endereço para conteúdo baixado; o navegador cria.
  Object.defineProperty(URL, "createObjectURL", {
    value: () => "blob:documento-baixado",
    configurable: true,
    writable: true,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    value: () => undefined,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  desmontar();
  vi.restoreAllMocks();
  downloads = [];
  document.body.innerHTML = "";
});

function registrarDownloads(): void {
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push({ href: this.href, nome: this.download });
  });
}

describe("o contrato aparece na ficha (AC-203)", () => {
  it("@spec:AC-203 o contrato enviado aparece a partir da ficha com nome, tamanho, data de envio e quem enviou", async () => {
    // A ficha leva aos documentos da loja, por uma das abas…
    document.body.innerHTML = renderToStaticMarkup(
      <AbasDaLoja lojaId={LOJA_ID} />,
    );
    const entrada = [...document.querySelectorAll("a")].find((link) =>
      (link.textContent ?? "").includes("Contrato e documentos"),
    );
    expect(entrada?.getAttribute("href")).toBe(
      `/admin/lojas/${LOJA_ID}/documentos`,
    );
    document.body.innerHTML = "";

    // …e lá cada documento aparece com o que o critério pede.
    const chamadas = simularRede(respostas([CONTRATO]));
    const tela = montar(<DocumentosDaLoja lojaId={LOJA_ID} />);
    await esperar();

    const item = exigir<HTMLLIElement>(tela, "li");
    expect(item.textContent).toContain("Contrato Pastel da Joi.pdf");
    expect(item.textContent).toContain("Contrato assinado");
    expect(item.textContent).toContain(tamanhoNaTela(CONTRATO.tamanhoEmBytes));
    expect(tamanhoNaTela(CONTRATO.tamanhoEmBytes)).toBe("1,2 MB");
    expect(item.querySelector("time")?.getAttribute("datetime")).toBe(
      CONTRATO.enviadoEm,
    );
    expect(item.querySelector("time")?.textContent).toBe("27/09/2026, 09:00");
    expect(item.textContent).toContain("por Administradora geral");

    // Abrir a lista NÃO gera link nenhum: só a consulta dos metadados.
    expect(chamadas.map((chamada) => [chamada.metodo, chamada.url])).toEqual([
      ["GET", `/api/admin/lojas/${LOJA_ID}/documentos`],
    ]);
  });

  it("@spec:AC-203 o envio manda os bytes crus com o tipo e o nome, e o documento aceito entra no topo da lista", async () => {
    const anterior: DocumentoDaLojaNoContrato = {
      ...CONTRATO,
      id: "7b7c7d7e-0000-4000-8000-000000000009",
      nomeDoArquivo: "Contrato antigo.pdf",
    };
    const chamadas = simularRede(
      respostas([anterior], (chamada) =>
        chamada.metodo === "POST"
          ? json(201, { documento: CONTRATO })
          : undefined,
      ),
    );
    const tela = montar(<DocumentosDaLoja lojaId={LOJA_ID} />);
    await esperar();

    const pdf = new File(["%PDF-1.7\n%%EOF\n"], "Contrato Pastel da Joi.pdf", {
      type: "application/pdf",
    });
    escolherArquivo(tela, pdf);
    await enviar(formularioDoEnvio(tela));

    const envio = chamadas.find((chamada) => chamada.metodo === "POST");
    expect(envio?.url).toBe(
      `/api/admin/lojas/${LOJA_ID}/documentos?tipo=CONTRATO`,
    );
    expect(envio?.corpo).toBe(pdf);
    expect(envio?.cabecalhos.get("content-type")).toBe("application/pdf");
    expect(envio?.cabecalhos.get("x-nome-do-arquivo")).toBe(
      encodeURIComponent("Contrato Pastel da Joi.pdf"),
    );

    const nomes = [...tela.querySelectorAll("li strong")].map(
      (nome) => nome.textContent,
    );
    expect(nomes).toEqual([
      "Contrato Pastel da Joi.pdf",
      "Contrato antigo.pdf",
    ]);
    expect(tela.querySelector('[role="status"]')?.textContent).toContain(
      "Documento enviado",
    );
  });

  it("@spec:AC-203 o arquivo só abre por link temporário gerado no clique, pedido ao próprio site", async () => {
    registrarDownloads();
    const linkDaApi = `/v1/admin/arquivos/${CARGA}.${ASSINATURA}`;
    const chamadas = simularRede(
      respostas([CONTRATO], (chamada) => {
        if (chamada.url.endsWith(`/documentos/${DOCUMENTO_ID}/link`)) {
          return json(201, {
            link: linkDaApi,
            expiraEm: "2026-09-27T12:05:00.000Z",
          });
        }
        if (chamada.url.startsWith("/api/admin/arquivos/")) {
          return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), {
            status: 200,
            headers: { "content-type": "application/pdf" },
          });
        }
        return undefined;
      }),
    );
    const tela = montar(<DocumentosDaLoja lojaId={LOJA_ID} />);
    await esperar();

    act(() => {
      botao(tela, "Abrir").click();
    });
    await esperar();

    expect(
      chamadas.slice(1).map((chamada) => [chamada.metodo, chamada.url]),
    ).toEqual([
      ["POST", `/api/admin/lojas/${LOJA_ID}/documentos/${DOCUMENTO_ID}/link`],
      ["GET", `/api/admin/arquivos/${CARGA}.${ASSINATURA}`],
    ]);
    expect(enderecoDoArquivoNoSite(linkDaApi)).toBe(
      `/api/admin/arquivos/${CARGA}.${ASSINATURA}`,
    );
    expect(
      enderecoDoArquivoNoSite("https://outro.site/arquivo.pdf"),
    ).toBeNull();
    expect(downloads).toEqual([
      { href: "blob:documento-baixado", nome: "Contrato Pastel da Joi.pdf" },
    ]);
    expect(tela.querySelector("li [role='status']")?.textContent).toContain(
      "vence em cinco minutos",
    );
  });
});

describe("arquivo com tipo disfarçado (AC-204)", () => {
  it("@spec:AC-204 a recusa da API pelo conteúdo aparece no campo do arquivo, e nada entra na lista", async () => {
    const mensagem =
      "Tipo de arquivo não permitido: envie um PDF. O conteúdo do arquivo é conferido, não só a extensão do nome.";
    simularRede(
      respostas([], (chamada) =>
        chamada.metodo === "POST"
          ? json(415, {
              erro: "arquivo_recusado",
              motivo: "TIPO_NAO_PERMITIDO",
              mensagem,
            })
          : undefined,
      ),
    );
    const tela = montar(<DocumentosDaLoja lojaId={LOJA_ID} />);
    await esperar();

    // Uma imagem com nome e tipo declarado de PDF.
    escolherArquivo(
      tela,
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "contrato.pdf", {
        type: "application/pdf",
      }),
    );
    await enviar(formularioDoEnvio(tela));

    expect(tela.querySelector("#documento-arquivo-erro")?.textContent).toBe(
      mensagem,
    );
    expect(
      exigir<HTMLInputElement>(tela, "#documento-arquivo").getAttribute(
        "aria-invalid",
      ),
    ).toBe("true");
    expect(tela.querySelectorAll("li")).toHaveLength(0);
    expect(tela.textContent).toContain("Nenhum documento enviado ainda");
  });

  it("@spec:AC-204 arquivo vazio ou acima do limite nem sai da tela", async () => {
    const chamadas = simularRede(respostas([]));
    const tela = montar(<DocumentosDaLoja lojaId={LOJA_ID} />);
    await esperar();

    const grande = new File(["%PDF-"], "contrato-grande.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(grande, "size", { value: 10 * 1024 * 1024 + 1 });
    escolherArquivo(tela, grande);
    await enviar(formularioDoEnvio(tela));
    expect(
      tela.querySelector("#documento-arquivo-erro")?.textContent,
    ).toContain("limite de 10 MB");

    expect(
      recusaAntesDeEnviar("DOCUMENTO_DO_RESPONSAVEL", {
        name: "rg.png",
        size: 5 * 1024 * 1024 + 1,
        type: "image/png",
      }),
    ).toContain("limite de 5 MB para imagem");
    expect(
      recusaAntesDeEnviar("CONTRATO", {
        name: "vazio.pdf",
        size: 0,
        type: "application/pdf",
      }),
    ).toContain("vazio");
    expect(recusaAntesDeEnviar("CONTRATO", null)).toBe(
      "Escolha o arquivo do documento.",
    );

    expect(chamadas.filter((chamada) => chamada.metodo === "POST")).toEqual([]);
  });
});

describe("documento anexado nunca fica público (AC-205)", () => {
  it("@spec:AC-205 a ponte do site só repassa os caminhos dos documentos, e o arquivo volta como anexo, sem rodar nada na página", async () => {
    const documentos = `lojas/${LOJA_ID}/documentos`;
    expect(caminhoPermitido(documentos, "GET")).toBe(true);
    expect(caminhoPermitido(documentos, "POST")).toBe(true);
    expect(caminhoPermitido(documentos, "DELETE")).toBe(false);
    expect(caminhoPermitido(`${documentos}/${DOCUMENTO_ID}/link`, "POST")).toBe(
      true,
    );
    expect(caminhoPermitido(`${documentos}/${DOCUMENTO_ID}/link`, "GET")).toBe(
      false,
    );
    expect(caminhoPermitido(`arquivos/${CARGA}.${ASSINATURA}`, "GET")).toBe(
      true,
    );
    expect(caminhoPermitido(`arquivos/${CARGA}.${ASSINATURA}`, "POST")).toBe(
      false,
    );
    expect(caminhoPermitido("arquivos/qualquer-coisa", "GET")).toBe(false);

    // Sem o cookie da sessão, o link na mão não chega nem à API.
    const buscar = vi.fn<typeof fetch>(
      async () =>
        new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": 'attachment; filename="contrato.pdf"',
            "x-content-type-options": "nosniff",
            "content-security-policy": "default-src 'none'; sandbox",
            "set-cookie": "nao=deveria-passar",
          },
        }),
    );
    const semSessao = await encaminharParaAdministracao(
      new Request(
        `https://simpleclick.localhost/api/admin/arquivos/${CARGA}.${ASSINATURA}`,
      ),
      ["arquivos", `${CARGA}.${ASSINATURA}`],
      buscar,
    );
    expect(semSessao.status).toBe(401);
    expect(buscar).not.toHaveBeenCalled();

    // Com ela, o arquivo volta como ANEXO, sem o navegador adivinhar o tipo.
    const aberto = await encaminharParaAdministracao(
      new Request(
        `https://simpleclick.localhost/api/admin/arquivos/${CARGA}.${ASSINATURA}`,
        { headers: { cookie: "sc_access=abc.def.ghi" } },
      ),
      ["arquivos", `${CARGA}.${ASSINATURA}`],
      buscar,
    );
    expect(aberto.status).toBe(200);
    expect(String(buscar.mock.calls[0]?.[0])).toMatch(
      new RegExp(`/v1/admin/arquivos/${CARGA}\\.${ASSINATURA}$`),
    );
    expect(aberto.headers.get("content-disposition")).toContain("attachment");
    expect(aberto.headers.get("x-content-type-options")).toBe("nosniff");
    expect(aberto.headers.get("content-security-policy")).toContain("sandbox");
    expect(aberto.headers.get("cache-control")).toBe("no-store");
    expect(aberto.headers.get("set-cookie")).toBeNull();
  });

  it("@spec:AC-205 link vencido ou sessão sem acesso não entregam o arquivo e dizem o que fazer", async () => {
    registrarDownloads();
    let statusDoArquivo = 410;
    simularRede(
      respostas([CONTRATO], (chamada) => {
        if (chamada.url.endsWith("/link")) {
          return json(201, {
            link: `/v1/admin/arquivos/${CARGA}.${ASSINATURA}`,
            expiraEm: "2026-09-27T12:05:00.000Z",
          });
        }
        if (chamada.url.startsWith("/api/admin/arquivos/")) {
          return json(statusDoArquivo, { erro: "link_expirado" });
        }
        return undefined;
      }),
    );
    const tela = montar(<DocumentosDaLoja lojaId={LOJA_ID} />);
    await esperar();

    act(() => {
      botao(tela, "Abrir").click();
    });
    await esperar();
    expect(tela.querySelector("li [role='alert']")?.textContent).toContain(
      "O link venceu",
    );

    statusDoArquivo = 403;
    act(() => {
      botao(tela, "Abrir").click();
    });
    await esperar();
    expect(tela.querySelector("li [role='alert']")?.textContent).toContain(
      "Sua sessão não tem acesso a este documento",
    );
    expect(downloads).toEqual([]);
  });

  it("@spec:AC-205 o envio que chega cortado pelo teto do site não segue para a API", async () => {
    const buscar = vi.fn<typeof fetch>();
    const cortado = await encaminharParaAdministracao(
      new Request(
        `https://simpleclick.localhost/api/admin/lojas/${LOJA_ID}/documentos?tipo=CONTRATO`,
        {
          method: "POST",
          body: new Uint8Array(16),
          headers: {
            cookie: "sc_access=abc.def.ghi",
            "content-type": "application/pdf",
            "content-length": String(11 * 1024 * 1024),
          },
        },
      ),
      ["lojas", LOJA_ID, "documentos"],
      buscar,
    );
    expect(cortado.status).toBe(413);
    expect(await cortado.json()).toMatchObject({
      erro: "arquivo_recusado",
      motivo: "GRANDE_DEMAIS",
    });
    expect(buscar).not.toHaveBeenCalled();
  });
});

describe("os quatro estados da tela dos documentos (P-011)", () => {
  it("carregando, vazio, erro com nova tentativa e loja não encontrada", () => {
    expect(
      desenhar({ estado: { fase: "carregando" } }).querySelector(
        '[role="status"]',
      )?.textContent,
    ).toContain("Carregando o contrato e os documentos");

    const vazio = desenhar({ estado: { fase: "pronta", documentos: [] } });
    expect(vazio.body.textContent).toContain("Nenhum documento enviado ainda");
    expect(
      vazio.querySelector('form[aria-label="Envio de documento"]'),
    ).not.toBeNull();

    const erro = desenhar({
      estado: { fase: "erro", mensagem: MENSAGEM_DE_SESSAO_DOS_DOCUMENTOS },
    });
    expect(erro.querySelector('[role="alert"]')?.textContent).toContain(
      MENSAGEM_DE_SESSAO_DOS_DOCUMENTOS,
    );
    expect(erro.body.textContent).toContain("Tentar de novo");

    const naoEncontrada = desenhar({ estado: { fase: "nao-encontrada" } });
    expect(naoEncontrada.body.textContent).toContain("Loja não encontrada");
    expect(
      naoEncontrada.querySelector('a[href="/admin/lojas"]'),
    ).not.toBeNull();
  });

  it("@principle:P-012 a tela dos documentos não tem violação crítica nem séria de acessibilidade", async () => {
    simularRede(respostas([CONTRATO]));
    const tela = montar(<DocumentosDaLoja lojaId={LOJA_ID} />);
    await esperar();
    const resultado = await axe.run(tela, {
      rules: { region: { enabled: false } },
    });
    const graves = resultado.violations.filter(
      (violacao) =>
        violacao.impact === "critical" || violacao.impact === "serious",
    );
    expect(graves.map((violacao) => violacao.id)).toEqual([]);
    // O axe percorre a árvore inteira no jsdom e leva segundos com a máquina
    // ocupada: o prazo padrão de 5 s reprovava por tempo, não por violação.
  }, 60_000);
});
