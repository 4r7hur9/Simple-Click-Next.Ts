// @vitest-environment jsdom
/**
 * A impressão automática na tela do dono (T-608 — AC-622, AC-623, AC-624,
 * AC-626).
 *
 * Duas telas: a configuração de impressão, onde mora a chave e o pareamento
 * do agente, e a fila de pedidos, onde o estado do agente aparece quando
 * importa. A rede é trocada por respostas escritas pelo teste; o que se prova
 * é o que a tela mostra e o que ela ENVIA.
 */
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";

import { FormularioImpressao } from "../src/features/config/FormularioImpressao.tsx";
import { EstadoDoAgente } from "../src/features/painel-pedidos/EstadoDoAgente.tsx";
import type {
  EstadoDaImpressaoAutomatica,
  LeituraDaImpressaoAutomatica,
  TrabalhoPendente,
} from "../src/lib/impressao-automatica.ts";
import {
  botao,
  clicar,
  desmontar,
  enviar,
  esperar,
  exigir,
  montar,
  simularApi,
} from "./apoio-config.tsx";

afterEach(desmontar);

const CONTEUDO = {
  pedido: true,
  itens: true,
  total: true,
  enderecoCliente: true,
  totalEmDestaque: false,
  observacoes: true,
};

/** As violações sérias que o axe encontra na tela. */
async function violacoesGraves(tela: HTMLElement): Promise<string[]> {
  const resultado = await axe.run(tela, {
    rules: { "color-contrast": { enabled: false } },
  });
  return resultado.violations
    .filter((v) => ["critical", "serious"].includes(v.impact ?? ""))
    .map((v) => v.id);
}

/** A configuração respondida pela API, com a chave como o teste quiser. */
function apiDaImpressao(automatico: boolean) {
  return simularApi((chamada) => {
    if (chamada.url.endsWith("/api/painel/impressao/pareamento")) {
      return {
        status: 201,
        corpo: { codigo: "004213", expiraEm: "2026-10-03T23:40:00.000Z" },
      };
    }
    return chamada.metodo === "PUT"
      ? { status: 204 }
      : {
          status: 200,
          corpo: { larguraMm: 58, conteudo: CONTEUDO, automatico },
        };
  });
}

function chave(tela: HTMLElement): HTMLInputElement {
  return exigir<HTMLInputElement>(tela, 'input[role="switch"]');
}

// ---------------------------------------------------------------------------
// A configuração: a chave e o pareamento
// ---------------------------------------------------------------------------

describe("a chave da impressão automática (AC-622)", () => {
  it("@spec:AC-622 vem desligada, com a impressão por clique em vigor e a explicação de que exige o agente", async () => {
    apiDaImpressao(false);
    const tela = montar(<FormularioImpressao />);
    await esperar();

    expect(chave(tela).checked).toBe(false);
    expect(chave(tela).name).toBe("automatico");
    const explicacao = exigir(tela, "#explicacao-automatico").textContent;
    expect(explicacao).toContain("instalar o agente de impressão");
    expect(chave(tela).getAttribute("aria-describedby")).toBe(
      "explicacao-automatico",
    );
    expect(exigir(tela, "[data-modo-em-vigor]").textContent).toContain(
      "impressão por clique",
    );
    expect(await violacoesGraves(tela)).toEqual([]);
  }, 60_000);

  it("@spec:AC-622 ligar é escolha: a chave ligada vai no corpo, e o modo em vigor muda só depois de salvar", async () => {
    const chamadas = apiDaImpressao(false);
    const tela = montar(<FormularioImpressao />);
    await esperar();

    clicar(chave(tela));
    expect(chave(tela).checked).toBe(true);
    expect(exigir(tela, "[data-modo-em-vigor]").textContent).toContain(
      "impressão por clique",
    );

    await enviar(exigir<HTMLFormElement>(tela, "form"));
    expect(chamadas.find((c) => c.metodo === "PUT")?.corpo).toEqual({
      larguraMm: 58,
      conteudo: CONTEUDO,
      automatico: true,
    });
  });
});

describe("desligar a chave (AC-626)", () => {
  it("@spec:AC-626 a loja com o automático ligado desliga pela chave, e a tela diz que nenhum cupom se perde", async () => {
    const chamadas = apiDaImpressao(true);
    const tela = montar(<FormularioImpressao />);
    await esperar();

    expect(chave(tela).checked).toBe(true);
    expect(exigir(tela, "[data-modo-em-vigor]").textContent).toContain(
      "impressão automática",
    );
    expect(exigir(tela, "#explicacao-automatico").textContent).toContain(
      "não perde nenhum cupom",
    );

    clicar(chave(tela));
    await enviar(exigir<HTMLFormElement>(tela, "form"));
    expect(chamadas.find((c) => c.metodo === "PUT")?.corpo).toMatchObject({
      automatico: false,
    });
  });
});

describe("o pareamento do agente (AC-623)", () => {
  it("@spec:AC-623 o dono gera o código de seis dígitos e vê até quando ele vale", async () => {
    const chamadas = apiDaImpressao(true);
    const tela = montar(<FormularioImpressao />);
    await esperar();

    expect(tela.querySelector("[data-codigo-de-pareamento]")).toBeNull();
    clicar(botao(tela, "Gerar código de pareamento"));
    await esperar();

    const pedido = chamadas.find((c) =>
      c.url.endsWith("/api/painel/impressao/pareamento"),
    );
    expect(pedido?.metodo).toBe("POST");
    const quadro = exigir(tela, "[data-codigo-de-pareamento]");
    expect(exigir(quadro, "output").textContent).toBe("004213");
    expect(quadro.textContent).toContain("Vale até");
    expect(botao(tela, "Gerar outro código")).toBeTruthy();
    expect(await violacoesGraves(tela)).toEqual([]);
  }, 60_000);

  it("@spec:AC-623 sem conseguir gerar, a tela diz o que fazer e o botão continua disponível", async () => {
    simularApi((chamada) =>
      chamada.url.endsWith("/api/painel/impressao/pareamento")
        ? { status: 503, corpo: { erro: "indisponivel" } }
        : {
            status: 200,
            corpo: { larguraMm: 80, conteudo: CONTEUDO, automatico: false },
          },
    );
    const tela = montar(<FormularioImpressao />);
    await esperar();

    clicar(botao(tela, "Gerar código de pareamento"));
    await esperar();
    expect(exigir(tela, '[role="alert"]').textContent).toContain(
      "tente de novo",
    );
    expect(botao(tela, "Gerar código de pareamento").disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// A fila de pedidos: o estado do agente
// ---------------------------------------------------------------------------

function estado(
  sobrescrita: Partial<EstadoDaImpressaoAutomatica>,
): EstadoDaImpressaoAutomatica {
  return {
    automatico: true,
    situacao: "conectada",
    ultimoContatoEm: "2026-10-03T20:00:00.000Z",
    pendentes: 0,
    ...sobrescrita,
  };
}

function pendente(
  id: string,
  codigo: string,
  sobrescrita: Partial<TrabalhoPendente> = {},
): TrabalhoPendente {
  return {
    id: `9b0a${id.padStart(4, "0")}-0000-4000-8000-000000000000`,
    pedido: { id, codigo },
    estado: "QUEUED",
    tentativas: 0,
    ultimoErro: null,
    criadoEm: "2026-10-03T20:01:00.000Z",
    ...sobrescrita,
  };
}

function leitura(
  impressao: EstadoDaImpressaoAutomatica,
  pendentes: readonly TrabalhoPendente[] = [],
): () => Promise<LeituraDaImpressaoAutomatica> {
  return async () => ({ estado: "ok", impressao, pendentes });
}

const PEDIDO_A = "0f8fad5b-d9cb-469f-a165-70867728950e";
const PEDIDO_B = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("o estado do agente na fila de pedidos (AC-624)", () => {
  it("@spec:AC-624 agente fora do ar: a fila avisa que a impressão automática está indisponível e o clique continua", async () => {
    const tela = montar(
      <EstadoDoAgente
        buscar={leitura(estado({ situacao: "desconectada", pendentes: 1 }), [
          pendente(PEDIDO_A, "A-1042"),
        ])}
      />,
    );
    await esperar();

    const aviso = exigir(tela, ".sc-aviso--atencao");
    expect(aviso.textContent).toContain("Impressão automática indisponível");
    expect(aviso.textContent).toContain("não responde desde");
    expect(aviso.textContent).toContain("botão de imprimir de cada pedido");
    expect(aviso.getAttribute("role")).toBe("status");

    const atalho = exigir<HTMLAnchorElement>(
      tela,
      `[data-pendente="${PEDIDO_A}"] a`,
    );
    expect(atalho.getAttribute("href")).toBe(`/imprimir/${PEDIDO_A}`);
    expect(atalho.textContent).toContain("A-1042");
    expect(tela.textContent).toContain("Aguardando o agente");
    expect(await violacoesGraves(tela)).toEqual([]);
  }, 60_000);

  it("@spec:AC-624 ligado sem agente pareado também avisa, e leva ao pareamento", async () => {
    const tela = montar(
      <EstadoDoAgente
        buscar={leitura(
          estado({ situacao: "sem_agente", ultimoContatoEm: null }),
        )}
      />,
    );
    await esperar();

    expect(exigir(tela, ".sc-aviso--atencao").textContent).toContain(
      "Nenhum agente de impressão está pareado",
    );
    expect(
      exigir<HTMLAnchorElement>(tela, 'a[href="/painel/config/impressao"]')
        .textContent,
    ).toContain("Parear o agente");
  });

  it("@spec:AC-624 agente conectado: só uma linha discreta, sem aviso", async () => {
    const tela = montar(
      <EstadoDoAgente buscar={leitura(estado({ situacao: "conectada" }))} />,
    );
    await esperar();

    expect(tela.querySelector(".sc-aviso")).toBeNull();
    expect(exigir(tela, "[data-impressao]").textContent).toContain(
      "agente está conectado",
    );
  });

  it("@spec:AC-624 sem conseguir conferir o agente, a tela diz que o clique continua funcionando", async () => {
    const tela = montar(
      <EstadoDoAgente buscar={async () => ({ estado: "erro" })} />,
    );
    await esperar();

    expect(tela.textContent).toContain(
      "Não foi possível conferir a impressão automática",
    );
    expect(tela.textContent).toContain("continua funcionando");
  });
});

describe("desligado, o que ficou na fila continua à vista (AC-626)", () => {
  it("@spec:AC-626 com o automático desligado e cupons pendentes, cada um aparece com o atalho para imprimir por clique", async () => {
    const tela = montar(
      <EstadoDoAgente
        buscar={leitura(
          estado({ automatico: false, situacao: "desligada", pendentes: 2 }),
          [
            pendente(PEDIDO_A, "A-1042"),
            pendente(PEDIDO_B, "A-1043", {
              estado: "DEAD",
              tentativas: 6,
              ultimoErro: "Sem papel",
            }),
          ],
        )}
      />,
    );
    await esperar();

    // Desligado não é falha: nenhum aviso de indisponível.
    expect(tela.querySelector(".sc-aviso")).toBeNull();
    expect(tela.textContent).toContain("A impressão automática está desligada");
    const itens = [...tela.querySelectorAll("[data-pendente]")];
    expect(itens.map((item) => item.getAttribute("data-pendente"))).toEqual([
      PEDIDO_A,
      PEDIDO_B,
    ]);
    expect(itens[1]?.textContent).toContain("Não saiu: imprima por clique");
    expect(itens[1]?.textContent).toContain("Sem papel");
    for (const item of itens) {
      // `<a>` comum: abrir a página do cupom emite a via, e pré-carregamento
      // não pode contar via que não saiu.
      expect(item.querySelector("a")?.getAttribute("href")).toMatch(
        /^\/imprimir\//,
      );
    }
    expect(await violacoesGraves(tela)).toEqual([]);
  }, 60_000);

  it("@spec:AC-626 desligado e sem nada pendente, a fila não mostra nada: o clique é o padrão", async () => {
    const tela = montar(
      <EstadoDoAgente
        buscar={leitura(
          estado({
            automatico: false,
            situacao: "desligada",
            ultimoContatoEm: null,
          }),
        )}
      />,
    );
    await esperar();

    expect(tela.textContent).toBe("");
  });
});
