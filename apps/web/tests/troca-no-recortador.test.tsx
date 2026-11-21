// @vitest-environment jsdom
import { act, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AjusteDaFoto } from "@simpleclick/contracts";
import { EnvioDeImagem } from "../src/features/config/EnvioDeImagem.tsx";
import { desmontar, montar } from "./apoio-config.tsx";
import {
  clicarNaJanela,
  confirmarRecorte,
  esperarRecorte,
  prepararRecorte,
} from "./apoio-recorte.ts";

const foto = (nome: string) =>
  new File([new Uint8Array(100)], nome, { type: "image/jpeg" });
const contexto = {
  nome: "Loja",
  logo: "",
  boasVindas: "Olá",
  rotuloDoCatalogo: "Catálogo",
};
const anterior: AjusteDaFoto = {
  original: "https://foto.test/original-antigo",
  computador: "https://foto.test/desktop-antigo",
  celular: "https://foto.test/mobile-antigo",
  iguais: false,
  fundo: { tipo: "preto" },
  estados: {},
};
let atualizacao = vi.fn();
let rede = vi.fn();

function Tela({ tipo = "fundo" }: { tipo?: "fundo" | "topo" }) {
  const [valor, setValor] = useState(anterior.computador);
  const [celular, setCelular] = useState(anterior.celular ?? "");
  const [ajuste, setAjuste] = useState<AjusteDaFoto | undefined>(anterior);
  return (
    <EnvioDeImagem
      tipo={tipo}
      titulo="Foto"
      ajuda="Foto da loja"
      valor={valor}
      valorCelular={celular}
      ajuste={ajuste}
      contexto={contexto}
      aoMudar={(desktop, mobile, novo) => {
        atualizacao(desktop, mobile, novo);
        setValor(desktop);
        setCelular(mobile);
        setAjuste(novo ?? undefined);
      }}
    />
  );
}

async function escolher(arquivo?: File) {
  const input = document.querySelector<HTMLInputElement>(
    'dialog[open] input[type="file"]',
  )!;
  expect(input).not.toBeNull();
  Object.defineProperty(input, "files", {
    configurable: true,
    value: arquivo ? [arquivo] : [],
  });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(input.value).toBe("");
  await esperarRecorte();
}
async function abrir() {
  await act(async () => {
    document.querySelector<HTMLButtonElement>("[data-ajustar]")!.click();
  });
  await esperarRecorte();
}
const src = () =>
  document.querySelector<HTMLImageElement>("[data-foto-do-recorte]")!.src;

beforeEach(() => {
  prepararRecorte();
  let id = 0;
  URL.createObjectURL = vi.fn(() => `blob:foto-${++id}`);
  atualizacao = vi.fn();
  rede = vi.fn(async (url: string, init?: RequestInit) => {
    if (!init?.method)
      return { ok: true, blob: async () => foto("original-antigo.jpg") };
    return {
      ok: true,
      json: async () => ({
        url: `https://foto.test/novo-${url.split("/").at(-1)}`,
      }),
    };
  });
  vi.stubGlobal("fetch", rede);
});
afterEach(desmontar);

describe("trocar a origem dentro da janela", () => {
  it.each(["fundo", "topo"] as const)(
    "%s: atualiza ambas as prévias, guarda a nova origem e reabre com o ajuste novo",
    async (tipo) => {
      montar(<Tela tipo={tipo} />);
      await abrir();
      const velha = src();
      const nova = foto("nova.jpg");
      await escolher(nova);
      expect(src()).not.toBe(velha);
      const origem = src();
      await clicarNaJanela("Celular");
      expect(src()).toBe(origem);
      expect(
        document.querySelector<HTMLInputElement>(".sc-recortador__igual input")!
          .checked,
      ).toBe(true);
      const moldura = document.querySelector<HTMLElement>(
        ".sc-recortador__moldura",
      )!;
      await act(async () => {
        moldura.dispatchEvent(
          new KeyboardEvent("keydown", { key: "+", bubbles: true }),
        );
      });
      const zoom = document.querySelector<HTMLInputElement>(
        'input[type="range"]',
      )!.value;
      await confirmarRecorte();
      expect(atualizacao).toHaveBeenCalledTimes(1);
      const ajuste = atualizacao.mock.calls[0]![2] as AjusteDaFoto;
      expect(ajuste.original).toBe("https://foto.test/novo-original");
      expect(ajuste.iguais).toBe(false);
      expect(Object.keys(ajuste.estados)).toEqual(["computador", "celular"]);
      expect(
        rede.mock.calls.find(
          ([url]) => url === "/api/loja/imagem/original",
        )?.[1]?.body,
      ).toBe(nova);
      await abrir();
      expect(rede.mock.calls.at(-1)?.[0]).toContain(
        encodeURIComponent(ajuste.original),
      );
      await clicarNaJanela("Celular");
      expect(
        document.querySelector<HTMLInputElement>(".sc-recortador__igual input")!
          .checked,
      ).toBe(false);
      expect(
        document.querySelector<HTMLInputElement>('input[type="range"]')!.value,
      ).toBe(zoom);
    },
  );

  it("cancelar seletor ou arquivo inválido mantém a foto; cancelar janela não envia nada", async () => {
    montar(<Tela />);
    await abrir();
    const antiga = src();
    await escolher();
    expect(src()).toBe(antiga);
    await escolher(
      new File(["pdf"], "arquivo.pdf", { type: "application/pdf" }),
    );
    expect(src()).toBe(antiga);
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    await escolher(foto("nova.jpg"));
    await clicarNaJanela("Cancelar");
    expect(atualizacao).not.toHaveBeenCalled();
    expect(rede.mock.calls.every(([, init]) => !init?.method)).toBe(true);
    await abrir();
    expect(rede.mock.calls.at(-1)?.[0]).toContain(
      encodeURIComponent(anterior.original),
    );
  });

  it("reeditar sem trocar conserva o original guardado", async () => {
    montar(<Tela />);
    await abrir();
    await confirmarRecorte();
    expect(atualizacao.mock.calls[0]![2].original).toBe(anterior.original);
    expect(
      rede.mock.calls.some(([url]) => url === "/api/loja/imagem/original"),
    ).toBe(false);
  });

  it("arquivo que não decodifica mostra erro e permite escolher outro dentro da janela", async () => {
    montar(<Tela />);
    await abrir();
    prepararRecorte({ quebrada: true });
    await escolher(foto("quebrada.jpg"));
    expect(document.querySelector("dialog[open]")?.textContent).toContain(
      "Não consegui abrir essa foto",
    );
    expect(atualizacao).not.toHaveBeenCalled();
    prepararRecorte();
    await escolher(foto("valida.jpg"));
    await confirmarRecorte();
    expect(atualizacao).toHaveBeenCalledTimes(1);
  });

  it("aceita selecionar o mesmo arquivo novamente", async () => {
    montar(<Tela />);
    await abrir();
    const mesma = foto("mesma.jpg");
    await escolher(mesma);
    await escolher(mesma);
    await confirmarRecorte();
    expect(atualizacao).toHaveBeenCalledTimes(1);
  });

  it.each(["fundo", "fundoCelular", "original"])(
    "erro no envio de %s mantém janela aberta e dados anteriores; permite tentar de novo",
    async (destino) => {
      montar(<Tela />);
      await abrir();
      await escolher(foto("nova.jpg"));
      const responder = rede.getMockImplementation()!;
      rede.mockImplementation(async (url: string, init?: RequestInit) =>
        url.endsWith(`/${destino}`)
          ? { ok: false, json: async () => ({ mensagem: "Falha no envio" }) }
          : responder(url, init),
      );
      await confirmarRecorte();
      expect(atualizacao).not.toHaveBeenCalled();
      expect(document.querySelector("dialog[open]")?.textContent).toContain(
        "Falha no envio",
      );
      rede.mockImplementation(responder);
      await confirmarRecorte();
      expect(atualizacao).toHaveBeenCalledTimes(1);
    },
  );
});
