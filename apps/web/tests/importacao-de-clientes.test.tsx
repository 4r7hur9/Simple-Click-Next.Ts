// @vitest-environment jsdom
/**
 * Prova do importador de clientes do painel (card #61), sobre o contrato do
 * #60. A rede responde sem servidor, com corpos no formato do contrato; o que
 * se prova é o que o dono VÊ em cada passo e o que a tela MANDA à API (o
 * arquivo cru, o mapeamento e a regra dos repetidos na consulta).
 */
import axe from "axe-core";
import {
  CAMPOS_DA_IMPORTACAO,
  type CampoDaImportacao,
} from "@simpleclick/contracts";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ImportadorDeClientes } from "../src/features/painel-clientes/importacao/ImportadorDeClientes.tsx";
import type {
  PreviaDaImportacao,
  ResultadoDaImportacao,
} from "../src/lib/importacao-de-clientes.ts";
import {
  botao,
  clicar,
  desmontar,
  esperar,
  exigir,
  montar,
  simularApi,
  type ChamadaDaApi,
  type RespostaSimulada,
} from "./apoio-config.tsx";
import { escolherNoSeletor } from "./apoio-seletor.ts";

afterEach(desmontar);

const CAMPOS: PreviaDaImportacao["campos"] = [
  { campo: "nome", rotulo: "Nome", obrigatorio: true },
  { campo: "telefone", rotulo: "Telefone / WhatsApp", obrigatorio: true },
  { campo: "email", rotulo: "E-mail", obrigatorio: false },
  { campo: "observacao", rotulo: "Observação", obrigatorio: false },
];

const ARQUIVO_LIDO: PreviaDaImportacao["arquivo"] = {
  nome: "leads.csv",
  formato: "csv",
  codificacao: "utf-8",
  separador: ";",
  linhas: 4,
};

/** A prévia de um arquivo com Nome, Celular, Fone fixo e Email. */
function previa(
  escolhido: Partial<Record<CampoDaImportacao, string | null>> = {
    nome: "Nome",
    telefone: "Celular",
    email: "Email",
  },
): PreviaDaImportacao {
  // A API devolve TODO campo no mapeamento, com a coluna ou nulo.
  const mapeamento = Object.fromEntries(
    CAMPOS_DA_IMPORTACAO.map((campo) => [campo, escolhido[campo] ?? null]),
  ) as PreviaDaImportacao["mapeamento"];
  return {
    arquivo: ARQUIVO_LIDO,
    colunas: [
      {
        nome: "Nome",
        indice: 0,
        exemplos: ["Maria", "João"],
        campoSugerido: "nome",
      },
      {
        nome: "Celular",
        indice: 1,
        exemplos: ["85988887777"],
        campoSugerido: "telefone",
      },
      {
        nome: "Fone fixo",
        indice: 2,
        exemplos: ["8532221111"],
        campoSugerido: null,
      },
      {
        nome: "Email",
        indice: 3,
        exemplos: ["maria@exemplo.test"],
        campoSugerido: "email",
      },
    ],
    mapeamento,
    campos: CAMPOS,
    primeirasLinhas: [
      { linha: 2, valores: { Nome: "Maria" }, situacao: "novo", motivo: null },
      {
        linha: 3,
        valores: { Nome: "Ana" },
        situacao: "repetido",
        motivo: "Já é cliente da loja (mesmo telefone).",
      },
      {
        linha: 4,
        valores: { Nome: "" },
        situacao: "invalido",
        motivo: "Sem nome.",
      },
    ],
    previsao: {
      total: 4,
      novos: 2,
      repetidos: 1,
      repetidosNaLoja: 1,
      repetidosNoArquivo: 0,
      invalidos: 1,
    },
    limite: { limite: 1000, uso: 10, restante: 990, excedentes: 0 },
    problemas: [{ linha: 4, campo: "nome", motivo: "está vazio." }],
    avisos: [],
  };
}

const RESULTADO: ResultadoDaImportacao = {
  arquivo: ARQUIVO_LIDO,
  repetidosComo: "completar",
  total: 4,
  criados: 2,
  atualizados: 1,
  repetidos: [
    {
      linha: 3,
      onde: "loja",
      motivo: "TELEFONE",
      clienteId: "11111111-1111-4111-8111-111111111111",
      nome: "Ana",
      linhaOriginal: null,
    },
  ],
  invalidos: [{ linha: 4, campo: "nome", motivo: "está vazio." }],
  foraDoLimite: [],
  limite: { limite: 1000, uso: 12, restante: 988, excedentes: 0 },
  relatorio: {
    nomeDoArquivo: "leads-erros.csv",
    tipo: "text/csv",
    csv: "﻿linha;situacao;motivo\r\n4;invalido;Nome está vazio.\r\n",
    linhas: [
      {
        linha: 4,
        situacao: "invalido",
        motivo: "Nome está vazio.",
        nome: null,
        telefone: "85977776666",
        email: null,
      },
    ],
  },
};

/** A API do importador: prévia e confirmação, pela rota pedida. */
function apiDoImportador(
  respostas: {
    readonly previa?: (chamada: ChamadaDaApi) => RespostaSimulada;
    readonly confirmar?: RespostaSimulada;
  } = {},
): (chamada: ChamadaDaApi) => RespostaSimulada {
  return (chamada) => {
    if (chamada.url.includes("/importacao/previa")) {
      return respostas.previa?.(chamada) ?? { status: 200, corpo: previa() };
    }
    if (chamada.url.includes("/importacao/confirmar")) {
      return respostas.confirmar ?? { status: 200, corpo: RESULTADO };
    }
    return { status: 404, corpo: { erro: "nao_encontrado" } };
  };
}

function consulta(chamada: ChamadaDaApi): URLSearchParams {
  return new URL(chamada.url, "https://site.exemplo.test").searchParams;
}

/** Escolhe o arquivo pelo seletor do sistema, como o botão faria. */
async function escolherArquivo(tela: HTMLElement, arquivo: File) {
  const entrada = exigir<HTMLInputElement>(tela, 'input[type="file"]');
  Object.defineProperty(entrada, "files", {
    configurable: true,
    value: [arquivo],
  });
  act(() => {
    entrada.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await esperar();
}

const CSV = () =>
  new File(
    ["Nome;Celular;Fone fixo;Email\nMaria;85988887777;;\n"],
    "leads.csv",
    {
      type: "text/csv",
    },
  );

function seletorDaColuna(tela: HTMLElement, coluna: string): Element {
  return exigir(tela, `tr[data-coluna="${coluna}"] .sc-seletor`);
}

describe("passo 1: enviar o arquivo", () => {
  it("mostra os limites, os formatos e o link do modelo CSV", () => {
    simularApi(apiDoImportador());
    const tela = montar(<ImportadorDeClientes />);
    expect(tela.textContent).toContain("Escolher arquivo");
    expect(tela.textContent).toContain("até 5 MB");
    expect(tela.textContent).toContain("5.000 clientes");
    const modelo = exigir<HTMLAnchorElement>(tela, "a[download]");
    expect(modelo.getAttribute("href")).toBe(
      "/modelos/modelo-importacao-clientes.csv",
    );
    expect(exigir(tela, '[aria-current="step"]').textContent).toContain(
      "Enviar arquivo",
    );
  });

  it("recusa .xls e arquivo vazio sem ir ao servidor", async () => {
    const chamadas = simularApi(apiDoImportador());
    const tela = montar(<ImportadorDeClientes />);

    await escolherArquivo(tela, new File(["x"], "antigo.xls"));
    expect(exigir(tela, '[role="alert"]').textContent).toContain(".xlsx");

    await escolherArquivo(tela, new File([], "vazio.csv"));
    expect(exigir(tela, '[role="alert"]').textContent).toContain(
      "O arquivo está vazio",
    );
    expect(chamadas).toHaveLength(0);
  });

  it("mostra a frase da API quando ela recusa o arquivo", async () => {
    simularApi(
      apiDoImportador({
        previa: () => ({
          status: 413,
          corpo: {
            erro: "linhas_demais",
            mensagem: "O arquivo tem mais de 5.000 linhas. Divida em partes.",
          },
        }),
      }),
    );
    const tela = montar(<ImportadorDeClientes />);
    await escolherArquivo(tela, CSV());
    expect(exigir(tela, '[role="alert"]').textContent).toContain(
      "mais de 5.000 linhas",
    );
    expect(exigir(tela, '[aria-current="step"]').textContent).toContain(
      "Enviar arquivo",
    );
  });

  it("arquivo sem nenhuma linha de cliente fica no passo 1 com explicação", async () => {
    const semLinhas = previa();
    simularApi(
      apiDoImportador({
        previa: () => ({
          status: 200,
          corpo: {
            ...semLinhas,
            previsao: {
              ...semLinhas.previsao,
              total: 0,
              novos: 0,
              repetidos: 0,
              repetidosNaLoja: 0,
              invalidos: 0,
            },
          },
        }),
      }),
    );
    const tela = montar(<ImportadorDeClientes />);
    await escolherArquivo(tela, CSV());
    expect(exigir(tela, '[role="alert"]').textContent).toContain(
      "Não achamos nenhum cliente",
    );
  });

  it("falha de rede vira mensagem em português", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    const tela = montar(<ImportadorDeClientes />);
    await escolherArquivo(tela, CSV());
    expect(exigir(tela, '[role="alert"]').textContent).toContain(
      "Não foi possível falar com o servidor",
    );
  });
});

describe("os quatro passos, do arquivo ao relatório", () => {
  it("manda o arquivo cru, o mapeamento escolhido e a regra dos repetidos", async () => {
    const chamadas = simularApi(apiDoImportador());
    const baixar = vi.fn();
    const tela = montar(<ImportadorDeClientes baixar={baixar} />);

    // 1. Arquivo: a prévia sem mapeamento, só com o nome do arquivo.
    await escolherArquivo(tela, CSV());
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]!.metodo).toBe("POST");
    expect(chamadas[0]!.url).toMatch(
      /^\/api\/painel\/clientes\/importacao\/previa\?/,
    );
    expect(consulta(chamadas[0]!).get("arquivo")).toBe("leads.csv");
    expect(consulta(chamadas[0]!).has("mapa.nome")).toBe(false);

    // 2. Mapeamento: uma linha por coluna, com exemplo e a sugestão escolhida.
    expect(exigir(tela, '[aria-current="step"]').textContent).toContain(
      "Mapear colunas",
    );
    const celular = exigir(tela, 'tr[data-coluna="Celular"]');
    expect(celular.textContent).toContain("85988887777");
    expect(celular.textContent).toContain("Telefone / WhatsApp");
    expect(exigir(tela, 'tr[data-coluna="Fone fixo"]').textContent).toContain(
      "Não importar",
    );

    // Trocar o telefone para "Fone fixo" tira o telefone do "Celular".
    escolherNoSeletor(seletorDaColuna(tela, "Fone fixo"), "telefone");
    expect(exigir(tela, 'tr[data-coluna="Celular"]').textContent).toContain(
      "Não importar",
    );
    expect(tela.textContent).toContain("saiu da coluna “Celular”");
    // E o e-mail sai da importação.
    escolherNoSeletor(seletorDaColuna(tela, "Email"), "");

    clicar(botao(tela, "Conferir as linhas"));
    await esperar();
    const conferencia = consulta(chamadas[1]!);
    expect(chamadas[1]!.url).toContain("/importacao/previa?");
    expect(conferencia.get("mapa.nome")).toBe("Nome");
    expect(conferencia.get("mapa.telefone")).toBe("Fone fixo");
    expect(conferencia.get("mapa.email")).toBe("");
    expect(conferencia.get("mapa.observacao")).toBe("");

    // 3. Revisão: contagem, amostra dos problemas e a escolha dos repetidos.
    expect(exigir(tela, '[aria-current="step"]').textContent).toContain(
      "Revisar",
    );
    expect(
      exigir(tela, '[data-contagem="Novos clientes"]').textContent,
    ).toContain("2");
    expect(exigir(tela, '[data-contagem="Repetidos"]').textContent).toContain(
      "1",
    );
    expect(exigir(tela, '[data-contagem="Inválidos"]').textContent).toContain(
      "1",
    );
    expect(exigir(tela, '[data-linha-com-problema="4"]').textContent).toContain(
      "Nome: está vazio.",
    );
    expect(exigir(tela, '[data-linha-com-problema="3"]').textContent).toContain(
      "Repetida",
    );
    const ignorar = exigir<HTMLInputElement>(tela, 'input[value="ignorar"]');
    expect(ignorar.checked).toBe(true);
    clicar(exigir(tela, 'input[value="completar"]'));

    clicar(botao(tela, "Importar 2 clientes"));
    await esperar();
    const confirmacao = consulta(chamadas[2]!);
    expect(chamadas[2]!.url).toContain("/importacao/confirmar?");
    expect(confirmacao.get("repetidos")).toBe("completar");
    expect(confirmacao.get("mapa.telefone")).toBe("Fone fixo");

    // 4. Resultado: números, relatório e atalho para a lista.
    expect(exigir(tela, '[aria-current="step"]').textContent).toContain(
      "Resultado",
    );
    expect(tela.textContent).toContain("2 clientes importados");
    expect(exigir(tela, '[data-contagem="Criados"]').textContent).toContain(
      "2",
    );
    expect(exigir(tela, '[data-contagem="Completados"]').textContent).toContain(
      "1",
    );
    clicar(botao(tela, "Baixar relatório de erros"));
    expect(baixar).toHaveBeenCalledWith(RESULTADO.relatorio);
    expect(
      exigir<HTMLAnchorElement>(tela, 'a[href="/painel/clientes"]').textContent,
    ).toContain("Ver lista de clientes");
  });

  it("sem coluna de telefone, não deixa seguir e diz o que falta", async () => {
    simularApi(
      apiDoImportador({
        previa: () => ({
          status: 200,
          corpo: previa({ nome: "Nome", telefone: null }),
        }),
      }),
    );
    const tela = montar(<ImportadorDeClientes />);
    await escolherArquivo(tela, CSV());
    expect(tela.textContent).toContain(
      "Escolha a coluna de Telefone / WhatsApp",
    );
    expect(botao(tela, "Conferir as linhas").disabled).toBe(true);

    escolherNoSeletor(seletorDaColuna(tela, "Celular"), "telefone");
    expect(botao(tela, "Conferir as linhas").disabled).toBe(false);
  });

  it("endereço sem rua: a revisão avisa que ele não será salvo", async () => {
    const semRua = (rua: string | null) => ({
      ...previa({
        nome: "Nome",
        telefone: "Celular",
        cidade: "Cidade",
        bairro: "Bairro",
        logradouro: rua,
      }),
      campos: [
        ...CAMPOS,
        { campo: "logradouro", rotulo: "Endereço (rua)", obrigatorio: false },
        { campo: "bairro", rotulo: "Bairro", obrigatorio: false },
        { campo: "cidade", rotulo: "Cidade", obrigatorio: false },
      ] satisfies PreviaDaImportacao["campos"],
    });
    let rua: string | null = null;
    simularApi(
      apiDoImportador({ previa: () => ({ status: 200, corpo: semRua(rua) }) }),
    );
    const tela = montar(<ImportadorDeClientes />);
    await escolherArquivo(tela, CSV());
    clicar(botao(tela, "Conferir as linhas"));
    await esperar();
    expect(tela.textContent).toContain("Sem rua, o endereço não será salvo");
    expect(tela.textContent).toContain("Bairro, Cidade não entram na ficha");

    rua = "Rua";
    clicar(botao(tela, "Voltar ao mapeamento"));
    await esperar();
    clicar(botao(tela, "Conferir as linhas"));
    await esperar();
    expect(tela.textContent).not.toContain("Sem rua");
  });

  it("erro ao confirmar fica na revisão e deixa tentar de novo", async () => {
    simularApi(apiDoImportador({ confirmar: { status: 500, corpo: {} } }));
    const tela = montar(<ImportadorDeClientes />);
    await escolherArquivo(tela, CSV());
    clicar(botao(tela, "Conferir as linhas"));
    await esperar();
    clicar(botao(tela, "Importar 2 clientes"));
    await esperar();
    expect(exigir(tela, '[role="alert"]').textContent).toContain(
      "A importação não foi concluída",
    );
    expect(botao(tela, "Importar 2 clientes").disabled).toBe(false);
  });

  it("o mapeamento não tem problema grave de acessibilidade", async () => {
    simularApi(apiDoImportador());
    const tela = montar(<ImportadorDeClientes />);
    await escolherArquivo(tela, CSV());
    const resultado = await axe.run(tela, {
      rules: { "color-contrast": { enabled: false } },
    });
    const graves = resultado.violations.filter((violacao) =>
      ["critical", "serious"].includes(violacao.impact ?? ""),
    );
    expect(graves).toEqual([]);
  }, 60_000);
});
