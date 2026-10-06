// @vitest-environment jsdom
/**
 * Impressão por clique no navegador (T-606 — AC-617, AC-618).
 *
 * O que se prova aqui, sem navegador de verdade:
 *   - a página pede à API UMA via, com a sessão do dono, e a transforma numa
 *     folha do tamanho do papel configurado;
 *   - o HTML desenha exatamente as linhas que a impressora recebe — a mesma
 *     diagramação, sem segunda quebra —, e os valores terminam na última
 *     coluna em 58 e em 80 mm;
 *   - a janela de impressão do navegador abre sozinha, uma vez;
 *   - a página não carrega a casca do aplicativo.
 * O ponta a ponta (`e2e/specs/imprimir.spec.ts`) mede o mesmo num Chromium de
 * verdade: largura em milímetros, página do PDF e coluna de valores.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import axe, { type Result } from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  diagramarCupom,
  gerarCupom,
  type CupomImpresso,
  type LinhaDoCupom,
  type PedidoParaCupom,
} from "@simpleclick/core";
import { Carregando } from "@simpleclick/ui";

import { AcoesDaImpressao } from "../src/features/impressao/AcoesDaImpressao";
import { AvisoDoCupom } from "../src/features/impressao/AvisoDoCupom";
import { BotaoImprimirCupom } from "../src/features/impressao/BotaoImprimirCupom";
import {
  FolhaDoCupom,
  regraDaPagina,
} from "../src/features/impressao/FolhaDoCupom";
import { ImprimirAoAbrir } from "../src/features/impressao/ImprimirAoAbrir";
import {
  AVANCO_DA_LETRA,
  emitirCupomParaImprimir,
  folhaDoCupom,
  type FolhaDoCupom as Folha,
} from "../src/server/cupom";
import { LOJA_DA_SESSAO, quemSouEu } from "./apoio-da-loja-da-sessao";

const PEDIDO_ID = "0b6f8a4e-6c1d-4f3a-9d2e-7a5b3c1d9e0f";
const COOKIE_DO_DONO = "sc_access=token-de-acesso-do-dono";

function pedido(): PedidoParaCupom {
  return {
    loja: "Açaí & Guaraná da Vila",
    codigo: "A-1042",
    feitoEm: "2026-09-26T17:32:00.000Z",
    fusoHorario: "America/Sao_Paulo",
    canal: "ONLINE",
    cliente: { nome: "Maria Conceição", telefone: "5511988887777" },
    itens: [
      {
        nome: "Açaí com granola",
        variacao: "500 ml",
        quantidade: 2,
        totalDaLinhaEmCentavos: 4700,
        opcoes: [
          { grupo: "Adicionais", opcao: "Paçoca", acrescimoEmCentavos: 400 },
        ],
        observacao: "Sem granola na metade, é alergia",
      },
      {
        nome: "Guaraná Antarctica lata 350ml gelado",
        quantidade: 3,
        totalDaLinhaEmCentavos: 1950,
      },
    ],
    observacao: "Tocar a campainha do portão azul",
    entrega: {
      tipo: "DELIVERY",
      endereco: {
        logradouro: "Rua das Flores",
        numero: "123",
        bairro: "Centro",
        cidade: "São Paulo",
        uf: "SP",
      },
    },
    taxaDeEntrega: { modo: "VALUE", valorEmCentavos: 800 },
    pagamento: { forma: "CASH", trocoParaEmCentavos: 10000 },
    subtotalEmCentavos: 6650,
    totalEmCentavos: 7450,
  };
}

function cupomDe(larguraMm: 58 | 80, via = 1): CupomImpresso {
  return gerarCupom(pedido(), {
    larguraMm,
    via,
    conteudo: { totalEmDestaque: true },
  });
}

/**
 * Uma API de mentira que responde uma vez, e guarda o que recebeu. A pergunta
 * "quem sou eu" (de que loja é o dono, T-115) fica à parte, em `perguntas`:
 * `chamadas` são só os pedidos de via.
 */
function apiQueResponde(
  status: number,
  corpo: unknown,
  eu: unknown = quemSouEu(),
) {
  const chamadas: { url: string; init: RequestInit | undefined }[] = [];
  const perguntas: { url: string; init: RequestInit | undefined }[] = [];
  const buscar = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const resposta = (valor: unknown, codigo: number) =>
      new Response(JSON.stringify(valor), {
        status: codigo,
        headers: { "content-type": "application/json" },
      });
    if (String(url).endsWith("/v1/eu")) {
      perguntas.push({ url: String(url), init });
      return resposta(eu, 200);
    }
    chamadas.push({ url: String(url), init });
    return resposta(corpo, status);
  }) as typeof fetch;
  return { buscar, chamadas, perguntas };
}

type LinhaDeTexto = Extract<LinhaDoCupom, { tipo: "texto" }>;

function linhasDeTexto(linhas: readonly LinhaDoCupom[]): LinhaDeTexto[] {
  return linhas.filter((l): l is LinhaDeTexto => l.tipo === "texto");
}

/** O cupom montado num documento de verdade (jsdom), para ler como o navegador. */
function montarFolha(folha: Folha): HTMLElement {
  const recipiente = document.createElement("div");
  recipiente.innerHTML = renderToStaticMarkup(<FolhaDoCupom folha={folha} />);
  document.body.replaceChildren(recipiente);
  const artigo = recipiente.querySelector<HTMLElement>(".sc-cupom");
  if (artigo === null) throw new Error("a folha do cupom não foi desenhada");
  return artigo;
}

/**
 * Pasta do site, a partir da raiz do repositório — que é onde o Vitest roda.
 * No ambiente de navegador simulado, `import.meta.url` não é endereço de
 * arquivo, e por isso o caminho não parte dele.
 */
const SITE = join(process.cwd(), "apps", "web", "src");

const CSS_DO_CUPOM = readFileSync(
  join(SITE, "app", "imprimir", "[id]", "cupom.css"),
  "utf8",
);

describe("o cupom sai por um clique, sem instalar nada (AC-617)", () => {
  let imprimir: ReturnType<typeof vi.fn>;
  const impressaoOriginal = window.print;

  beforeEach(() => {
    imprimir = vi.fn();
    window.print = imprimir as unknown as typeof window.print;
  });

  afterEach(() => {
    window.print = impressaoOriginal;
    document.body.replaceChildren();
  });

  it("@spec:AC-617 a página abre a janela de impressão do próprio navegador, uma única vez", async () => {
    const recipiente = document.createElement("div");
    document.body.append(recipiente);
    const raiz = createRoot(recipiente);

    // Modo estrito monta, desmonta e monta de novo: é onde um diálogo duplo
    // apareceria, e o dono clicaria "imprimir" duas vezes.
    await act(async () => {
      raiz.render(
        <StrictMode>
          <ImprimirAoAbrir />
        </StrictMode>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(imprimir).toHaveBeenCalledTimes(1);
    act(() => raiz.unmount());
  });

  it("@spec:AC-617 o botão do pedido abre a página do cupom em outra aba, com link comum", () => {
    const html = renderToStaticMarkup(
      <BotaoImprimirCupom pedidoId={PEDIDO_ID} />,
    );
    expect(html).toContain(`href="/imprimir/${PEDIDO_ID}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain("Imprimir cupom");
  });

  it("@spec:AC-617 a página pede UMA via à API, com a sessão do dono, e devolve o cupom legível", async () => {
    const { buscar, chamadas, perguntas } = apiQueResponde(200, {
      cupom: cupomDe(80),
    });

    const resultado = await emitirCupomParaImprimir(
      PEDIDO_ID,
      `outro=1; ${COOKIE_DO_DONO}`,
      buscar,
    );

    expect(chamadas).toHaveLength(1);
    const [chamada] = chamadas;
    // A loja do endereço é a da sessão, e não uma escrita na configuração.
    expect(chamada?.url).toMatch(
      new RegExp(
        `/v1/lojas/${LOJA_DA_SESSAO.apelido}/pedidos/${PEDIDO_ID}/cupom$`,
      ),
    );
    expect(perguntas).toHaveLength(1);
    expect(new Headers(perguntas[0]?.init?.headers).get("authorization")).toBe(
      "Bearer token-de-acesso-do-dono",
    );
    expect(chamada?.init?.method).toBe("POST");
    const cabecalhos = new Headers(chamada?.init?.headers);
    expect(cabecalhos.get("authorization")).toBe(
      "Bearer token-de-acesso-do-dono",
    );
    expect(cabecalhos.get("origin")).toMatch(/^https?:\/\//);

    expect(resultado.estado).toBe("pronto");
    if (resultado.estado !== "pronto") return;
    const artigo = montarFolha(resultado.folha);
    const texto = artigo.textContent ?? "";
    expect(texto).toContain("PEDIDO A-1042");
    expect(texto).toContain("2x Açaí com granola (500 ml)");
    expect(texto).toContain("Maria Conceição");
    expect(texto).toContain("TOTAL");
  });

  it("@spec:AC-617 a página impressa tem o tamanho do papel configurado, sem margem", () => {
    for (const larguraMm of [58, 80] as const) {
      const folha = folhaDoCupom(cupomDe(larguraMm));
      const regra = regraDaPagina(folha);
      expect(regra).toBe(
        `@page { size: ${larguraMm}mm ${folha.alturaMm}mm; margin: 0; }`,
      );
      // A altura cobre todas as linhas: nada cai numa segunda página.
      const linhas = linhasDeTexto(folha.linhas);
      const minimo = linhas.length * folha.letraMm * 1.25;
      expect(folha.alturaMm).toBeGreaterThan(minimo);

      const html = renderToStaticMarkup(<FolhaDoCupom folha={folha} />);
      expect(html).toContain(regra);
      expect(html).toContain(`data-papel-mm="${larguraMm}"`);
    }
  });

  it("@spec:AC-617 sem sessão, a página não emite via; pedido de outra loja e API fora do ar viram aviso", async () => {
    const semSessao = apiQueResponde(200, { cupom: cupomDe(80) });
    expect(
      await emitirCupomParaImprimir(PEDIDO_ID, null, semSessao.buscar),
    ).toEqual({ estado: "sem-sessao" });
    expect(semSessao.chamadas).toHaveLength(0);

    const naoEncontrado = apiQueResponde(404, { erro: "nao_encontrado" });
    expect(
      await emitirCupomParaImprimir(
        PEDIDO_ID,
        COOKIE_DO_DONO,
        naoEncontrado.buscar,
      ),
    ).toEqual({ estado: "nao-encontrado" });

    const expirada = apiQueResponde(401, { erro: "nao_autenticado" });
    expect(
      await emitirCupomParaImprimir(PEDIDO_ID, COOKIE_DO_DONO, expirada.buscar),
    ).toEqual({ estado: "sem-sessao" });

    const quebrada = apiQueResponde(500, { erro: "interno" });
    expect(
      await emitirCupomParaImprimir(PEDIDO_ID, COOKIE_DO_DONO, quebrada.buscar),
    ).toEqual({ estado: "indisponivel" });

    const semRede = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect(
      await emitirCupomParaImprimir(PEDIDO_ID, COOKIE_DO_DONO, semRede),
    ).toEqual({ estado: "indisponivel" });

    // Cupom fora do contrato não vai para o papel.
    const versaoNova = apiQueResponde(200, {
      cupom: { ...cupomDe(80), versao: 2 },
    });
    expect(
      await emitirCupomParaImprimir(
        PEDIDO_ID,
        COOKIE_DO_DONO,
        versaoNova.buscar,
      ),
    ).toEqual({ estado: "indisponivel" });
  });

  it("@spec:AC-617 a página do cupom não carrega a casca do aplicativo", () => {
    // Fora de qualquer grupo com casca própria: o único layout acima dela é o
    // da raiz, que só declara idioma e fontes.
    const pasta = join(SITE, "app", "imprimir");
    expect(existsSync(join(pasta, "[id]", "page.tsx"))).toBe(true);
    expect(existsSync(join(pasta, "layout.tsx"))).toBe(false);
    expect(existsSync(join(pasta, "[id]", "layout.tsx"))).toBe(false);
    const raiz = readFileSync(join(SITE, "app", "layout.tsx"), "utf8");
    expect(raiz).not.toMatch(/<header|<nav|AvisosPendentes/);

    // A barra de ações existe na tela e some no papel.
    const html = renderToStaticMarkup(
      <AcoesDaImpressao pedidoId={PEDIDO_ID} larguraMm={80} via={2} />,
    );
    expect(html).toContain("sc-cupom-acoes");
    expect(html).toContain("Reimpressão — 2ª via");
    expect(CSS_DO_CUPOM).toMatch(
      /@media print\s*\{[\s\S]*\.sc-cupom-acoes\s*\{\s*display:\s*none;/,
    );
  });
});

describe("o cupom respeita a largura de papel escolhida (AC-618)", () => {
  afterEach(() => document.body.replaceChildren());

  it("@spec:AC-618 58 mm vira 32 colunas em 48 mm de área impressa; 80 mm vira 48 colunas em 72 mm", () => {
    const estreito = folhaDoCupom(cupomDe(58));
    const largo = folhaDoCupom(cupomDe(80));

    expect([
      estreito.larguraMm,
      estreito.colunas,
      estreito.areaImpressaMm,
    ]).toEqual([58, 32, 48]);
    expect([largo.larguraMm, largo.colunas, largo.areaImpressaMm]).toEqual([
      80, 48, 72,
    ]);
    // Com a letra calculada, as colunas enchem a área e NÃO passam dela: nada
    // é cortado na lateral.
    for (const folha of [estreito, largo]) {
      expect(folha.colunas * folha.letraMm * AVANCO_DA_LETRA).toBeCloseTo(
        folha.areaImpressaMm,
        6,
      );
    }
  });

  it("@spec:AC-618 o HTML desenha exatamente as linhas que a impressora recebe, sem quebrar de novo", () => {
    for (const larguraMm of [58, 80] as const) {
      for (const via of [1, 2]) {
        const cupom = cupomDe(larguraMm, via);
        const folha = folhaDoCupom(cupom);
        const artigo = montarFolha(folha);

        const noHtml = [
          ...artigo.querySelectorAll<HTMLElement>(".sc-cupom__linha"),
        ].map((linha) => ({
          texto: linha.textContent ?? "",
          negrito: linha.classList.contains("sc-cupom__linha--negrito"),
          tamanho: linha.classList.contains("sc-cupom__linha--duplo")
            ? "duplo"
            : "normal",
        }));
        const naImpressora = linhasDeTexto(diagramarCupom(cupom)).map(
          ({ texto, negrito, tamanho }) => ({ texto, negrito, tamanho }),
        );
        expect(noHtml).toEqual(naImpressora);
      }
    }
    // E o navegador não quebra de novo o que já veio quebrado.
    expect(CSS_DO_CUPOM).toMatch(
      /\.sc-cupom__linha\s*\{[^}]*white-space:\s*pre;/,
    );
    // Nem alarga a letra em negrito: negrito sintetizado muda o avanço, e a
    // linha de item em negrito sairia da coluna dos valores (medido no
    // Chrome pelo ponta a ponta).
    expect(CSS_DO_CUPOM).toMatch(/\.sc-cupom\s*\{[^}]*font-synthesis:\s*none;/);
  });

  it("@spec:AC-618 os valores terminam na última coluna — em 58 e em 80 mm, uma coluna à direita", () => {
    for (const larguraMm of [58, 80] as const) {
      const folha = folhaDoCupom(cupomDe(larguraMm));
      const artigo = montarFolha(folha);
      const comValor = [
        ...artigo.querySelectorAll<HTMLElement>(".sc-cupom__linha"),
      ].filter((linha) => /R\$ [\d.]+,\d{2}$/.test(linha.textContent ?? ""));
      expect(comValor.length).toBeGreaterThanOrEqual(5);
      for (const linha of comValor) {
        const cabe = linha.classList.contains("sc-cupom__linha--duplo")
          ? folha.colunas / 2
          : folha.colunas;
        expect([...(linha.textContent ?? "")].length).toBe(cabe);
      }
      for (const linha of artigo.querySelectorAll(".sc-cupom__linha")) {
        const cabe = linha.classList.contains("sc-cupom__linha--duplo")
          ? folha.colunas / 2
          : folha.colunas;
        expect([...(linha.textContent ?? "")].length).toBeLessThanOrEqual(cabe);
      }
    }
  });

  it("@spec:AC-618 a folha declara a largura do papel, a área e a letra para o CSS", () => {
    const folha = folhaDoCupom(cupomDe(58));
    const artigo = montarFolha(folha);
    expect(artigo.style.getPropertyValue("--cupom-papel")).toBe("58mm");
    expect(artigo.style.getPropertyValue("--cupom-area")).toBe("48mm");
    expect(artigo.style.getPropertyValue("--cupom-colunas")).toBe("32");
    expect(artigo.style.getPropertyValue("--cupom-letra")).toBe(
      `${folha.letraMm}mm`,
    );
    expect(CSS_DO_CUPOM).toMatch(/width:\s*var\(--cupom-area\)/);
    expect(CSS_DO_CUPOM).toMatch(/font-size:\s*var\(--cupom-letra\)/);
    // A largura mínima do site (344px) empurraria o papel de 58 mm para fora
    // da página: a folha a desliga.
    expect(CSS_DO_CUPOM).toMatch(
      /html:has\(\.sc-cupom-pagina\)\s*\{[^}]*min-width:\s*0;/,
    );
  });
});

describe("estados e acessibilidade da página do cupom", () => {
  const NIVEIS_QUE_REPROVAM = new Set(["critical", "serious"]);

  async function violacoesGraves(html: string): Promise<string[]> {
    document.documentElement.lang = "pt-BR";
    document.body.innerHTML = html;
    const resultado = await axe.run(document.body);
    const avaliadas = resultado.passes.length + resultado.violations.length;
    expect(avaliadas).toBeGreaterThan(0);
    return resultado.violations
      .filter((v: Result) => NIVEIS_QUE_REPROVAM.has(v.impact ?? ""))
      .map((v: Result) => `${v.id}: ${v.help}`);
  }

  afterEach(() => document.body.replaceChildren());

  it("@principle:P-011 espera, erro e sucesso têm cada um a sua tela, com saída", () => {
    const espera = renderToStaticMarkup(
      <Carregando rotulo="Preparando o cupom…" />,
    );
    expect(espera).toContain('role="status"');

    for (const motivo of [
      "sem-sessao",
      "escolher-loja",
      "nao-encontrado",
      "indisponivel",
    ] as const) {
      const html = renderToStaticMarkup(
        <AvisoDoCupom motivo={motivo} pedidoId={PEDIDO_ID} />,
      );
      expect(html).toContain('role="alert"');
      expect(html).toMatch(/<a [^>]*href="\/[^"]*"/);
    }
  });

  it("@principle:P-012 a página do cupom não tem violação crítica nem séria", async () => {
    const folha = folhaDoCupom(cupomDe(80, 2));
    const pagina = renderToStaticMarkup(
      <main className="sc-cupom-pagina">
        <AcoesDaImpressao pedidoId={PEDIDO_ID} larguraMm={80} via={2} />
        <FolhaDoCupom folha={folha} />
      </main>,
    );
    expect(await violacoesGraves(pagina)).toEqual([]);

    const aviso = renderToStaticMarkup(
      <main className="sc-cupom-pagina">
        <AvisoDoCupom motivo="nao-encontrado" pedidoId={PEDIDO_ID} />
      </main>,
    );
    expect(await violacoesGraves(aviso)).toEqual([]);
  });
});
