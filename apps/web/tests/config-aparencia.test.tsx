// @vitest-environment jsdom
/**
 * Prova da tela de Aparência (US-904: AC-916, AC-917, AC-918).
 *
 * A prévia da vitrine é desenhada com o mesmo envelope de tema da loja, ao
 * vivo e antes de publicar; a cor ruim é consertada na letra e avisada ao dono;
 * a foto fora do padrão é recusada com orientação sem sair do navegador; e
 * salvar grava contato, apresentação e tema — só o que mudou.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";

import {
  conferirArquivo,
  FormularioAparencia,
} from "../src/features/config/FormularioAparencia.tsx";
import { lerRascunho } from "../src/lib/rascunho-da-vitrine.ts";
import {
  confirmarRecorte,
  janelaDeRecorte,
  prepararRecorte,
} from "./apoio-recorte.ts";
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

// A prévia é a loja de verdade (card #36): o formulário deixa o rascunho num
// cookie e abre as rotas reais da loja em molduras. Aqui o cookie é capturado.
let cookieDaPrevia = "";
const rascunho = () => {
  const lido = lerRascunho(cookieDaPrevia, "pastelaria");
  if (lido === null) throw new Error("a prévia ainda não deixou o rascunho");
  return lido;
};
/** Espera a pausa de 300 ms que a prévia faz antes de gravar o rascunho. */
async function esperarPrevia() {
  await act(async () => {
    await new Promise((resolver) => setTimeout(resolver, 380));
  });
}

afterEach(() => {
  desmontar();
  cookieDaPrevia = "";
  Reflect.deleteProperty(document, "cookie");
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
});
// A logo e as fotos passam pela janela de recorte (card #82).
beforeEach(() => {
  prepararRecorte();
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => "",
    set: (valor: string) => {
      if (valor.startsWith("sc_previa=")) {
        cookieDaPrevia = valor.slice("sc_previa=".length).split(";")[0] ?? "";
      }
    },
  });
  // O jsdom não mede nada: a coluna da prévia "tem" 544 px.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 544,
  });
});

const APARENCIA = {
  nome: "Pastelaria da Zica",
  boasVindas: "O pastel mais crocante do bairro.",
  sobre: null,
  logo: null,
  capa: null,
  corPrimaria: null,
};

const CONTATO = { numero: "11912345678", saudacao: null, publico: true };

const TEMA = {
  corDestaque: "#b7ff00",
  corDeFundo: "#000000",
  fundoVitrine: null,
  topoCardapio: null,
};

/** A API como o painel a vê: uma resposta por endereço. */
function respostaPadrao(chamada: ChamadaDaApi): RespostaSimulada {
  const escrevendo = chamada.metodo === "PUT";
  if (chamada.url.endsWith("/api/loja/tema")) {
    return {
      status: 200,
      corpo: escrevendo ? { ...TEMA, ...(chamada.corpo as object) } : TEMA,
    };
  }
  if (escrevendo) return { status: 204 };
  if (chamada.url.endsWith("/api/loja/contato")) {
    return { status: 200, corpo: CONTATO };
  }
  return { status: 200, corpo: APARENCIA };
}

/** Escolhe o arquivo no campo, como a pessoa faria. */
async function escolherArquivo(campo: HTMLInputElement, arquivo: File) {
  Object.defineProperty(campo, "files", {
    value: [arquivo],
    configurable: true,
  });
  act(() => {
    campo.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await esperar();
}

async function abrir() {
  const chamadas = simularApi(respostaPadrao);
  const tela = montar(<FormularioAparencia apelido="pastelaria" />);
  await esperar();
  return { chamadas, tela };
}

async function salvar(tela: HTMLElement) {
  act(() => {
    exigir<HTMLFormElement>(tela, "form").dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  await esperar();
}

describe("a prévia é a loja de verdade, com o rascunho, antes de publicar (AC-916)", () => {
  it("@spec:AC-916 nome, descrição, logo e as duas fotos digitados chegam à prévia, sem nada gravado", async () => {
    const { chamadas, tela } = await abrir();

    digitar(exigir(tela, 'input[name="nome"]'), "Pastel & Cia");
    digitar(exigir(tela, 'textarea[name="boasVindas"]'), "Feito na hora!");
    digitar(
      exigir(tela, 'input[name="logo"]'),
      "https://imagens.exemplo.test/logo.png",
    );
    digitar(
      exigir(tela, 'input[name="endereco-fundo"]'),
      "https://imagens.exemplo.test/fundo.jpg",
    );
    digitar(
      exigir(tela, 'input[name="endereco-topo"]'),
      "https://imagens.exemplo.test/topo.jpg",
    );
    digitar(
      exigir(tela, 'input[name="endereco-fundo-celular"]'),
      "https://imagens.exemplo.test/fundo-celular.jpg",
    );
    await esperarPrevia();

    expect(rascunho()).toMatchObject({
      apelido: "pastelaria",
      nome: "Pastel & Cia",
      boasVindas: "Feito na hora!",
      logo: "https://imagens.exemplo.test/logo.png",
      fundoVitrine: "https://imagens.exemplo.test/fundo.jpg",
      fundoVitrineCelular: "https://imagens.exemplo.test/fundo-celular.jpg",
      topoCardapio: "https://imagens.exemplo.test/topo.jpg",
    });
    // Prévia é prévia: nada foi enviado à API.
    expect(chamadas.every((chamada) => chamada.metodo === "GET")).toBe(true);
  });

  it("@spec:AC-916 as molduras abrem as telas REAIS da loja (vitrine e topo do cardápio) na largura do aparelho", async () => {
    const { tela } = await abrir();
    await esperarPrevia();

    const molduras = [
      ...tela.querySelectorAll<HTMLIFrameElement>("[data-previa-iframe]"),
    ];
    expect(molduras.map((moldura) => moldura.getAttribute("src"))).toEqual([
      expect.stringMatching(/^\/loja\/pastelaria\/previa\/vitrine\?v=\d+$/),
      expect.stringMatching(/^\/loja\/pastelaria\/previa\/cardapio\?v=\d+$/),
    ]);
    // No computador a moldura tem 1280 px, encolhida para a coluna de 544 px.
    expect(molduras[0]?.style.width).toBe("1280px");
    expect(molduras[0]?.style.transform).toBe(`scale(${String(544 / 1280)})`);

    clicar(botao(tela, "Celular"));
    await esperarPrevia();
    const celular = tela.querySelector<HTMLIFrameElement>(
      "[data-previa-iframe]",
    );
    // No celular a moldura tem 390 px, sem encolher (cabe na coluna).
    expect(celular?.style.width).toBe("390px");
    expect(celular?.style.transform).toBe("scale(1)");
  });

  it("@spec:AC-916 'remover' tira a foto do rascunho e a loja volta à capa padrão", async () => {
    const { tela } = await abrir();
    digitar(
      exigir(tela, 'input[name="endereco-fundo"]'),
      "https://imagens.exemplo.test/fundo.jpg",
    );
    await esperarPrevia();
    expect(rascunho().fundoVitrine).toBe(
      "https://imagens.exemplo.test/fundo.jpg",
    );

    clicar(botao(tela, "Remover e voltar à capa padrão"));
    await esperarPrevia();
    expect(rascunho().fundoVitrine).toBe("");
  });
});

describe("não há cor de destaque por loja (card #127)", () => {
  it("@spec:AC-917 a tela de Aparência não oferece seletor de cor nem fala de cor de destaque, e a prévia fica no verde SimpleClick", async () => {
    const { tela } = await abrir();
    await esperarPrevia();
    expect(tela.querySelector("[data-seletor-de-cor]")).toBeNull();
    expect(tela.querySelector('button[aria-label^="Azul"]')).toBeNull();
    expect(tela.textContent).not.toContain("Cor de destaque");
    expect(rascunho()).not.toHaveProperty("corDestaque");
  });
});

describe("salvar grava só o que mudou (AC-916)", () => {
  it("@spec:AC-916 publicar envia apresentação e tema; contato intacto não é enviado", async () => {
    const { chamadas, tela } = await abrir();

    digitar(exigir(tela, 'input[name="nome"]'), "Pastel & Cia");
    digitar(
      exigir(tela, 'input[name="endereco-fundo"]'),
      "https://imagens.exemplo.test/fundo.jpg",
    );
    await salvar(tela);

    const gravacoes = chamadas.filter((chamada) => chamada.metodo === "PUT");
    expect(gravacoes.map((chamada) => chamada.url)).toEqual([
      "/api/loja/aparencia",
      "/api/loja/tema",
    ]);
    expect(gravacoes[0]?.corpo).toEqual({
      ...APARENCIA,
      nome: "Pastel & Cia",
      // A capa antiga acompanha a foto de fundo; a cor antiga, a de destaque.
      capa: "https://imagens.exemplo.test/fundo.jpg",
      corPrimaria: "#b7ff00",
    });
    expect(gravacoes[1]?.corpo).toEqual({
      corDestaque: "#b7ff00",
      fundoVitrine: "https://imagens.exemplo.test/fundo.jpg",
      topoCardapio: null,
      fundoVitrineCelular: null,
      topoCardapioCelular: null,
      ajustesDasFotos: {},
      seloDeStatus: "AUTOMATICO",
      coresDasImagens: {},
    });
    expect(tela.textContent).toContain("Aparência publicada");
  });

  it("@spec:AC-916 mudar o WhatsApp também grava o contato, e remover a foto grava nulo", async () => {
    const { chamadas, tela } = await abrir();

    digitar(exigir(tela, 'input[name="numero"]'), "11999998888");
    await salvar(tela);

    const gravacoes = chamadas.filter((chamada) => chamada.metodo === "PUT");
    expect(gravacoes[0]?.url).toBe("/api/loja/contato");
    expect(gravacoes[0]?.corpo).toEqual({
      numero: "11999998888",
      saudacao: null,
      publico: true,
    });
    expect(gravacoes.at(-1)?.corpo).toEqual({
      corDestaque: "#b7ff00",
      fundoVitrine: null,
      topoCardapio: null,
      fundoVitrineCelular: null,
      topoCardapioCelular: null,
      ajustesDasFotos: {},
      seloDeStatus: "AUTOMATICO",
      coresDasImagens: {},
    });
  });

  it("@spec:AC-916 recusa da API no tema aparece e diz o que foi salvo", async () => {
    simularApi((chamada) =>
      chamada.metodo === "PUT" && chamada.url.endsWith("/api/loja/tema")
        ? {
            status: 400,
            corpo: {
              erro: "entrada_invalida",
              campos: [
                {
                  onde: "body",
                  caminho: "fundoVitrine",
                  mensagem:
                    "Fundo da vitrine: o endereço precisa começar por https://.",
                },
              ],
            },
          }
        : respostaPadrao(chamada),
    );
    const tela = montar(<FormularioAparencia apelido="pastelaria" />);
    await esperar();
    digitar(
      exigir(tela, 'input[name="endereco-fundo"]'),
      "http://exemplo.test/fundo.jpg",
    );
    await salvar(tela);

    expect(tela.textContent).toContain("Salvei os textos");
    expect(tela.textContent).toContain("a cor e as fotos");
    expect(
      exigir(tela, '[data-foto="fundo"] [role="alert"]').textContent,
    ).toContain("precisa começar por https://");
  });
});

describe("imagem fora do padrão é recusada com orientação (AC-918)", () => {
  it("@spec:AC-918 arquivo que não é imagem é recusado na hora, com formato, tamanho e proporção, sem envio", async () => {
    const chamadas = simularApi(respostaPadrao);
    const tela = montar(<FormularioAparencia apelido="pastelaria" />);
    await esperar();

    await escolherArquivo(
      exigir(tela, 'input[name="arquivo-logo"]'),
      new File(["%PDF-1.7"], "cardapio.pdf", { type: "application/pdf" }),
    );

    const recusa = exigir(tela, "#recusa-logo").textContent ?? "";
    expect(recusa).toContain("JPG, PNG, WebP");
    expect(recusa).toContain("anterior continua no ar");
    expect(chamadas.some((chamada) => chamada.metodo === "PUT")).toBe(false);
    // A janela de recorte nem abre para o que não é foto.
    expect(janelaDeRecorte()).toBeNull();
    // A orientação (medidas e peso) fica sempre à vista, ao lado do campo.
    expect(exigir(tela, '[data-recomendado="logo"]').textContent).toContain(
      "Recomendado: 512 × 512 px, JPG/PNG/WebP até 1 MB",
    );
  });

  it("@spec:AC-918 capa acima do tamanho é recusada antes do envio", () => {
    const grande = new File([new Uint8Array(3 * 1024 * 1024 + 1)], "capa.png", {
      type: "image/png",
    });
    const recusa = conferirArquivo("capa", grande) ?? "";
    expect(recusa).toContain("3 MB");
    expect(recusa).toContain("3:1");
    expect(
      conferirArquivo(
        "capa",
        new File([new Uint8Array(10)], "capa.png", { type: "image/png" }),
      ),
    ).toBeNull();
  });

  it("@spec:AC-918 a recusa da API (conferida pelos bytes) aparece ao lado do campo", async () => {
    const mensagem =
      "O arquivo enviado não é uma imagem aceita. A logo aceita JPEG, PNG, WebP de até 1 MB, na proporção quadrada (1:1), por exemplo 512 × 512 pixels. A imagem anterior continua no ar.";
    simularApi((chamada) =>
      chamada.url.includes("/imagem/")
        ? {
            status: 400,
            corpo: { erro: "imagem_invalida", mensagem, orientacao: {} },
          }
        : respostaPadrao(chamada),
    );
    const tela = montar(<FormularioAparencia apelido="pastelaria" />);
    await esperar();

    await escolherArquivo(
      exigir(tela, 'input[name="arquivo-logo"]'),
      new File(["não sou png"], "logo.png", { type: "image/png" }),
    );
    // A foto abre, a pessoa confirma o recorte e a API (que confere os bytes) recusa.
    await confirmarRecorte();
    await esperar();

    expect(exigir(tela, "#recusa-logo").textContent).toBe(mensagem);
  });
});

describe("o selo de status sobre as fotos (card #64)", () => {
  const FOTO = "https://imagens.exemplo.test/capa-vinho.jpg";
  const TEMA_COM_FOTO = {
    ...TEMA,
    fundoVitrine: FOTO,
    seloDeStatus: "ESCURO",
    // A foto é vinho-escura: a pílula preta se mistura com ela.
    coresDasImagens: { [FOTO]: "#2a0a0a" },
  };

  async function abrirComFoto() {
    const chamadas = simularApi((chamada) =>
      chamada.url.endsWith("/api/loja/tema") && chamada.metodo === "GET"
        ? { status: 200, corpo: TEMA_COM_FOTO }
        : respostaPadrao(chamada),
    );
    const tela = montar(<FormularioAparencia apelido="pastelaria" />);
    await esperar();
    return { chamadas, tela };
  }

  it("oferece Automático, Claro e Escuro, com o automático como padrão", async () => {
    const { tela } = await abrir();
    const opcoes = [
      ...tela.querySelectorAll<HTMLInputElement>('input[name="seloDeStatus"]'),
    ];
    expect(opcoes.map((opcao) => opcao.value)).toEqual([
      "AUTOMATICO",
      "CLARO",
      "ESCURO",
    ]);
    expect(opcoes.find((opcao) => opcao.checked)?.value).toBe("AUTOMATICO");
    expect(tela.querySelector('[data-avisos="selo-de-status"]')).toBeNull();
  });

  it("escolher a pílula vai para a loja da prévia, e salvar grava a escolha", async () => {
    const { chamadas, tela } = await abrir();
    clicar(exigir(tela, 'input[name="seloDeStatus"][value="CLARO"]'));
    await esperarPrevia();
    // A loja de verdade desenha o selo (`SeloDeStatus`); aqui chega a escolha.
    expect(rascunho().seloDeStatus).toBe("CLARO");

    await salvar(tela);
    const tema = chamadas.filter(
      (chamada) =>
        chamada.metodo === "PUT" && chamada.url.endsWith("/api/loja/tema"),
    );
    expect(tema.at(-1)?.corpo).toMatchObject({ seloDeStatus: "CLARO" });
  });

  it("no manual, avisa quando a pílula se mistura com a foto; o automático resolve", async () => {
    const { chamadas, tela } = await abrirComFoto();
    const aviso = exigir(tela, '[data-avisos="selo-de-status"]');
    expect(aviso.textContent).toContain("abaixo do mínimo de 3:1");
    expect(aviso.textContent).toContain("na página da loja");

    clicar(botao(tela, "Usar o automático"));
    expect(tela.querySelector('[data-avisos="selo-de-status"]')).toBeNull();
    await esperarPrevia();
    expect(rascunho().seloDeStatus).toBe("AUTOMATICO");

    await salvar(tela);
    const tema = chamadas.filter(
      (chamada) =>
        chamada.metodo === "PUT" && chamada.url.endsWith("/api/loja/tema"),
    );
    // A cor medida da foto em uso vai junto, para a vitrine decidir igual.
    expect(tema.at(-1)?.corpo).toMatchObject({
      seloDeStatus: "AUTOMATICO",
      coresDasImagens: { [FOTO]: "#2a0a0a" },
    });
  });
});
