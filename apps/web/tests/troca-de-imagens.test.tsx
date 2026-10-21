// @vitest-environment jsdom
/**
 * Card #81 — "as imagens que testei não estão sendo substituídas".
 *
 * Provas da tela de Aparência quando o dono TROCA a logo ou a foto de uma loja
 * de demonstração (imagens do seed em `/demo/...`):
 *
 * - a imagem nova aparece NA HORA (miniatura e prévia da vitrine), sem esperar
 *   o "Salvar";
 * - a tela diz o que aconteceu (enviada / recusada) e o que falta;
 * - "Salvar e publicar" leva a referência NOVA para a API, inclusive quando a
 *   loja vem do seed (o `/demo/...` era recusado e nada era salvo);
 * - falha no envio deixa a imagem anterior onde estava, com a frase que diz isso.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";

import { FormularioAparencia } from "../src/features/config/FormularioAparencia.tsx";
import { lerRascunho } from "../src/lib/rascunho-da-vitrine.ts";
import { confirmarRecorte, prepararRecorte } from "./apoio-recorte.ts";
import {
  desmontar,
  esperar,
  exigir,
  montar,
  simularApi,
  type ChamadaDaApi,
  type RespostaSimulada,
} from "./apoio-config.tsx";

const LOGO_DO_SEED = "/demo/pastelaria-da-vila/logo.webp";
const CAPA_DO_SEED = "/demo/pastelaria-da-vila/capa.webp";
const LOGO_NOVA = "http://localhost:3001/v1/midia/arquivos/l/loja/nova.png";

const APARENCIA = {
  nome: "Pastelaria da Vila",
  boasVindas: "Pastel na hora.",
  sobre: null,
  logo: LOGO_DO_SEED,
  capa: CAPA_DO_SEED,
  corPrimaria: "#B3261E",
};
const CONTATO = { numero: "11912345678", saudacao: null, publico: true };
const TEMA = {
  corDestaque: "#e63946",
  corDeFundo: "#000000",
  fundoVitrine: null,
  topoCardapio: null,
};

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0,
]);

let envioDaLogo: RespostaSimulada;
let registro: ReturnType<typeof prepararRecorte>;

function resposta(chamada: ChamadaDaApi): RespostaSimulada {
  if (chamada.url.endsWith("/api/loja/imagem/logo")) return envioDaLogo;
  const escrevendo = chamada.metodo === "PUT";
  if (chamada.url.endsWith("/api/loja/tema")) {
    return {
      status: 200,
      corpo: escrevendo ? { ...TEMA, ...(chamada.corpo as object) } : TEMA,
    };
  }
  if (escrevendo) return { status: 204 };
  if (chamada.url.endsWith("/api/loja/contato"))
    return { status: 200, corpo: CONTATO };
  return { status: 200, corpo: APARENCIA };
}

// A prévia é a loja de verdade (card #36): o rascunho vai num cookie.
let cookieDaPrevia = "";
beforeEach(() => {
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => "",
    set: (valor: string) => {
      if (valor.startsWith("sc_previa=")) {
        cookieDaPrevia = valor.slice("sc_previa=".length).split(";")[0] ?? "";
      }
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 544,
  });
  envioDaLogo = { status: 200, corpo: { url: LOGO_NOVA } };
  // O jsdom não decodifica imagem nem tem canvas; o navegador tem. A logo
  // agora passa pela janela de recorte antes do envio (card #82).
  registro = prepararRecorte();
});
afterEach(() => {
  desmontar();
  cookieDaPrevia = "";
  Reflect.deleteProperty(document, "cookie");
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
});

async function abrir() {
  const chamadas = simularApi(resposta);
  const tela = montar(<FormularioAparencia apelido="pastelaria" />);
  await esperar();
  return { chamadas, tela };
}

async function escolherLogo(tela: HTMLElement) {
  const campo = exigir<HTMLInputElement>(tela, 'input[name="arquivo-logo"]');
  Object.defineProperty(campo, "files", {
    value: [new File([PNG], "logo.png", { type: "image/png" })],
    configurable: true,
  });
  act(() => {
    campo.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await esperar();
  // A janela de recorte abre com a foto; a pessoa confirma o enquadramento.
  await confirmarRecorte();
  await esperar();
}

const logoDaMiniatura = (tela: HTMLElement) =>
  exigir(tela, "[data-logo-atual]").getAttribute("src");

describe("trocar a logo de uma loja de demonstração", () => {
  it("a logo do seed aparece na miniatura antes de qualquer troca", async () => {
    const { tela } = await abrir();
    expect(logoDaMiniatura(tela)).toBe(LOGO_DO_SEED);
  });

  it("a logo nova substitui a antiga na miniatura e na prévia, e a tela diz o que aconteceu", async () => {
    const { chamadas, tela } = await abrir();
    await escolherLogo(tela);

    const envio = chamadas.find((c) => c.url.endsWith("/api/loja/imagem/logo"));
    expect(envio?.metodo).toBe("PUT");
    // O que sobe é a logo recortada nas dimensões do espaço, em WebP (e não o
    // PNG que a pessoa escolheu).
    expect(registro.pedidos[0]?.tipo).toBe("image/webp");
    expect(registro.telas.at(-1)).toEqual({ largura: 512, altura: 512 });
    expect(logoDaMiniatura(tela)).toBe(LOGO_NOVA);
    // A prévia (a loja de verdade) recebe a logo nova no rascunho.
    await act(async () => {
      await new Promise((resolver) => setTimeout(resolver, 380));
    });
    expect(lerRascunho(cookieDaPrevia, "pastelaria")?.logo).toBe(LOGO_NOVA);
    expect(tela.textContent).toContain("Logo enviada e já publicada na loja");
    expect(tela.textContent).toContain("Salvar e publicar");
  });

  it("Salvar e publicar leva a logo NOVA e as imagens do seed para a API (antes: o /demo era recusado)", async () => {
    const { chamadas, tela } = await abrir();
    await escolherLogo(tela);

    act(() => {
      exigir<HTMLFormElement>(tela, "form").dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await esperar();

    const aparencia = chamadas.find(
      (c) => c.metodo === "PUT" && c.url.endsWith("/api/loja/aparencia"),
    );
    expect(aparencia?.corpo).toMatchObject({
      logo: LOGO_NOVA,
      capa: CAPA_DO_SEED,
    });
    const tema = chamadas.find(
      (c) => c.metodo === "PUT" && c.url.endsWith("/api/loja/tema"),
    );
    expect(tema?.corpo).toMatchObject({ fundoVitrine: CAPA_DO_SEED });
    expect(tela.textContent).toMatch(/salv|publicad/i);
  });

  it("se o envio é recusado, a logo anterior continua e a frase da API aparece", async () => {
    const mensagem =
      "O envio de arquivo não está disponível agora. A imagem anterior continua no ar.";
    envioDaLogo = {
      status: 503,
      corpo: { erro: "envio_indisponivel", mensagem },
    };
    const { tela } = await abrir();
    await escolherLogo(tela);

    expect(exigir(tela, "#recusa-logo").textContent).toBe(mensagem);
    expect(logoDaMiniatura(tela)).toBe(LOGO_DO_SEED);
    expect(tela.textContent).not.toContain("Logo enviada e já publicada");
  });

  it("falha de rede no envio vira frase clara, e não silêncio", async () => {
    const { tela } = await abrir();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await escolherLogo(tela);
    expect(exigir(tela, "#recusa-logo").textContent).toContain(
      "A imagem anterior continua no ar",
    );
    expect(logoDaMiniatura(tela)).toBe(LOGO_DO_SEED);
  });
});
