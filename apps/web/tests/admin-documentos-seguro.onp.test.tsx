// @vitest-environment jsdom
/**
 * O documento do responsável continua fora da página (card #113, T-11308,
 * AC-11309): o link nasce no clique, vale poucos minutos e nunca fica no
 * HTML; sem pré-visualização embutida, sem botão de copiar o link; o arquivo
 * baixa como anexo, e só pela ponte do próprio site.
 *
 * Complementa `admin-documentos.test.tsx` (envio, lista, recusa, ponte).
 */
import type { DocumentoDaLojaNoContrato } from "@simpleclick/contracts";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DocumentosDaLoja,
  DocumentosDaLojaNaTela,
} from "../src/features/admin/DocumentosDaLoja.tsx";
import { enderecoDoArquivoNoSite } from "../src/features/admin/documentos-da-loja.ts";
import {
  botao,
  desmontar,
  esperar,
  montar,
  simularApi,
} from "./apoio-config.tsx";

const LOJA_ID = "3a3c3d4e-0000-4000-8000-000000000001";
const DOCUMENTO_ID = "7b7c7d7e-0000-4000-8000-000000000002";
const CARGA = "eyJkIjoiN2I3YzdkN2UiLCJsIjoiM2EzYyJ9";
const ASSINATURA = "A".repeat(43);
const LINK_DA_API = `/v1/admin/arquivos/${CARGA}.${ASSINATURA}`;

const CONTRATO: DocumentoDaLojaNoContrato = {
  id: DOCUMENTO_ID,
  tipo: "CONTRATO",
  nomeDoArquivo: "Contrato Pastel da Joi.pdf",
  tamanhoEmBytes: 1_258_291,
  tipoDeConteudo: "application/pdf",
  enviadoEm: "2026-09-27T12:00:00.000Z",
  enviadoPor: { id: "admin-1", nome: "Administradora geral" },
};

const baixados: { href: string; nome: string }[] = [];

beforeEach(() => {
  baixados.length = 0;
  Object.assign(URL, {
    createObjectURL: () => "blob:documento-baixado",
    revokeObjectURL: () => undefined,
  });
  // O jsdom não baixa arquivo: o dublê só anota o que o clique pediria.
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    baixados.push({ href: this.href, nome: this.download });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  desmontar();
  document.body.innerHTML = "";
});

/** Nada do que identifica um arquivo pode estar na página. */
function semLinkDeArquivo(raiz: ParentNode): void {
  const html = (raiz as HTMLElement).innerHTML ?? "";
  expect(html).not.toContain("/arquivos/");
  expect(html).not.toContain(ASSINATURA);
  expect(html).not.toContain(CARGA);
  for (const elemento of raiz.querySelectorAll("[href], [src], [data]")) {
    const alvo =
      elemento.getAttribute("href") ??
      elemento.getAttribute("src") ??
      elemento.getAttribute("data") ??
      "";
    expect(alvo, elemento.outerHTML).not.toMatch(/arquivos|\.pdf|^https?:/i);
  }
  expect(raiz.querySelectorAll("iframe, object, embed")).toHaveLength(0);
  expect(raiz.querySelectorAll("a[download]")).toHaveLength(0);
}

describe("documentos: o link nunca fica na página", () => {
  it("[CA-11] @spec:AC-11309 a lista renderizada não tem link, pré-visualização nem botão de copiar", () => {
    document.body.innerHTML = renderToStaticMarkup(
      <DocumentosDaLojaNaTela
        lojaId={LOJA_ID}
        estado={{ fase: "pronta", documentos: [CONTRATO] }}
        aoTentarDeNovo={() => undefined}
        aoEnviar={() => undefined}
      />,
    );
    semLinkDeArquivo(document.body);
    expect(document.body.textContent).toContain("Contrato Pastel da Joi.pdf");
    const rotulos = [...document.querySelectorAll("button")].map(
      (b) => b.textContent ?? "",
    );
    expect(rotulos.join("|")).toMatch(/Abrir/);
    expect(rotulos.join("|")).not.toMatch(/copiar|link/i);
  });

  it("[CA-11] @spec:AC-11309 depois do clique o arquivo baixa como anexo e o link continua fora da página", async () => {
    const chamadas = simularApi((chamada) => {
      if (chamada.url.endsWith("/link")) {
        return {
          status: 201,
          corpo: { link: LINK_DA_API, expiraEm: "2026-09-27T12:05:00.000Z" },
        };
      }
      if (chamada.url.startsWith("/api/admin/arquivos/")) {
        return { status: 200, corpo: {} };
      }
      return { status: 200, corpo: { documentos: [CONTRATO] } };
    });
    const tela = montar(<DocumentosDaLoja lojaId={LOJA_ID} />);
    await esperar();
    semLinkDeArquivo(tela);
    expect(chamadas.map((c) => c.metodo)).toEqual(["GET"]);

    act(() => {
      botao(tela, "Abrir").click();
    });
    await esperar();

    // O link foi gerado no clique, pelo próprio site, e o arquivo veio da ponte.
    expect(chamadas.slice(1).map((c) => [c.metodo, c.url])).toEqual([
      ["POST", `/api/admin/lojas/${LOJA_ID}/documentos/${DOCUMENTO_ID}/link`],
      ["GET", `/api/admin/arquivos/${CARGA}.${ASSINATURA}`],
    ]);
    expect(baixados).toEqual([
      { href: "blob:documento-baixado", nome: "Contrato Pastel da Joi.pdf" },
    ]);
    // Depois do download, a página segue sem link, sem âncora e sem iframe.
    semLinkDeArquivo(tela);
  });

  it("[CA-11] @spec:AC-11309 só vale link do próprio site: endereço de fora é recusado", () => {
    expect(enderecoDoArquivoNoSite(LINK_DA_API)).toBe(
      `/api/admin/arquivos/${CARGA}.${ASSINATURA}`,
    );
    for (const fora of [
      "https://outro.site/arquivo.pdf",
      "//outro.site/arquivos/x",
      "/v1/admin/lojas",
      "javascript:alert(1)",
    ]) {
      expect(enderecoDoArquivoNoSite(fora), fora).toBeNull();
    }
  });
});

describe("documentos: os estados com as peças comuns", () => {
  const props = {
    lojaId: LOJA_ID,
    aoTentarDeNovo: () => undefined,
    aoEnviar: () => undefined,
  };

  it("[CA-11] @spec:AC-11324 carregando, vazio, erro e loja não encontrada têm papel e texto próprios", () => {
    const desenhar = (
      estado: Parameters<typeof DocumentosDaLojaNaTela>[0]["estado"],
    ) => {
      document.body.innerHTML = renderToStaticMarkup(
        <DocumentosDaLojaNaTela {...props} estado={estado} />,
      );
      return document.body;
    };
    expect(
      desenhar({ fase: "carregando" }).querySelector('[role="status"]')
        ?.textContent,
    ).toContain("Carregando");
    expect(
      desenhar({ fase: "erro", mensagem: "Falhou" }).querySelector(
        '[role="alert"]',
      )?.textContent,
    ).toContain("Falhou");
    expect(desenhar({ fase: "pronta", documentos: [] }).textContent).toMatch(
      /Nenhum|nenhum/,
    );
    expect(desenhar({ fase: "nao-encontrada" }).textContent).toMatch(
      /não encontrada/i,
    );
  });
});
