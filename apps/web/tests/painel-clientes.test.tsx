// @vitest-environment jsdom
/**
 * Prova da lista de clientes do painel (AC-700, AC-701).
 *
 * A tela é montada como o painel a monta, com uma troca só: a rede responde
 * sem servidor, com corpos no formato do contrato — o mesmo que a API devolve
 * e que as provas contra o banco conferem. O que se prova aqui é o que o dono
 * VÊ: os quatro estados e a busca.
 */
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";

import { ListaClientes } from "../src/features/painel-clientes/ListaClientes.tsx";
import type { ClienteDaLista } from "../src/lib/clientes-do-painel.ts";
import {
  botao,
  clicar,
  desmontar,
  digitar,
  enviar,
  esperar,
  exigir,
  montar,
  simularApi,
  type ChamadaDaApi,
  type RespostaSimulada,
} from "./apoio-config.tsx";

afterEach(desmontar);

const JOAO: ClienteDaLista = {
  id: "11111111-1111-4111-8111-111111111111",
  nome: "João Açaí",
  telefone: "+5511988887777",
  email: null,
  temConta: false,
  totalDePedidos: 3,
  totalGastoCentavos: 6450,
  ultimoPedidoEm: "2026-09-20T15:00:00.000Z",
};

const ANA: ClienteDaLista = {
  id: "22222222-2222-4222-8222-222222222222",
  nome: "Ana Paula",
  telefone: "+5521966665555",
  email: "ana@exemplo.test",
  temConta: true,
  totalDePedidos: 0,
  totalGastoCentavos: 0,
  ultimoPedidoEm: null,
};

/** A API de clientes, com a busca filtrando por nome como o servidor faz. */
function apiDaLista(
  clientes: readonly ClienteDaLista[],
): (chamada: ChamadaDaApi) => RespostaSimulada {
  return (chamada) => {
    const url = new URL(chamada.url, "https://site.exemplo.test");
    const busca = url.searchParams.get("busca")?.toLowerCase() ?? "";
    const achados = clientes.filter(
      (c) =>
        busca === "" ||
        c.nome.toLowerCase().includes(busca) ||
        (c.telefone ?? "").includes(busca.replace(/\D/g, "") || "¬"),
    );
    return { status: 200, corpo: { clientes: achados } };
  };
}

describe("a lista de clientes mostra o que importa e trata os estados (AC-700)", () => {
  it("@spec:AC-700 mostra nome, telefone, pedidos, total gasto e último pedido de cada cliente", async () => {
    simularApi(apiDaLista([JOAO, ANA]));
    const tela = montar(<ListaClientes />);
    await esperar();

    // A linha inteira da tabela, achada pelo nome do cliente.
    const joao = exigir(tela, `[data-cliente="${JOAO.id}"]`).closest("tr")!;
    expect(joao.textContent).toContain("João Açaí");
    expect(joao.textContent).toContain("(11) 98888-7777");
    expect(joao.textContent).toContain("3");
    expect(joao.textContent).toContain("R$ 64,50");
    expect(joao.textContent).toContain("20/09/2026");
    expect(
      exigir(joao, `a[href="/painel/clientes/${JOAO.id}"]`).textContent,
    ).toBe("João Açaí");

    const ana = exigir(tela, `[data-cliente="${ANA.id}"]`).closest("tr")!;
    expect(ana.textContent).toContain("Nunca pediu");
    expect(ana.textContent).toContain("Tem conta");
  });

  it("@spec:AC-700 enquanto carrega, avisa que está carregando", () => {
    simularApi(() => ({ status: 200, corpo: { clientes: [] } }));
    const tela = montar(<ListaClientes />);
    expect(tela.textContent).toContain("Carregando clientes");
  });

  it("@spec:AC-700 sem clientes, diz isso e oferece cadastrar o primeiro", async () => {
    simularApi(apiDaLista([]));
    const tela = montar(<ListaClientes />);
    await esperar();
    expect(tela.textContent).toContain("Nenhum cliente ainda");
    expect(botao(tela, "Cadastrar o primeiro cliente")).toBeTruthy();
  });

  it("@spec:AC-700 na falha, mostra o erro e deixa tentar de novo", async () => {
    let tentativas = 0;
    simularApi(() => {
      tentativas += 1;
      return tentativas === 1
        ? { status: 500, corpo: { erro: "erro_interno" } }
        : { status: 200, corpo: { clientes: [JOAO] } };
    });
    const tela = montar(<ListaClientes />);
    await esperar();
    expect(tela.textContent).toContain("Não foi possível carregar os clientes");

    clicar(botao(tela, "Tentar de novo"));
    await esperar();
    expect(tela.textContent).toContain("João Açaí");
  });

  it("@spec:AC-700 a lista não tem problema grave de acessibilidade", async () => {
    simularApi(apiDaLista([JOAO, ANA]));
    const tela = montar(<ListaClientes />);
    await esperar();
    const resultado = await axe.run(tela, {
      rules: { "color-contrast": { enabled: false } },
    });
    const graves = resultado.violations.filter((violacao) =>
      ["critical", "serious"].includes(violacao.impact ?? ""),
    );
    expect(graves).toEqual([]);
  }, 60_000);
});

describe("a busca pede ao servidor e mostra só quem corresponde (AC-701)", () => {
  it("@spec:AC-701 buscar por parte do nome manda o termo e mostra só o correspondente", async () => {
    const chamadas = simularApi(apiDaLista([JOAO, ANA]));
    const tela = montar(<ListaClientes />);
    await esperar();

    digitar(exigir<HTMLInputElement>(tela, "#busca-de-clientes"), "ana");
    await enviar(exigir<HTMLFormElement>(tela, 'form[role="search"]'));

    expect(chamadas.at(-1)?.url).toBe("/api/painel/clientes?busca=ana");
    expect(tela.querySelector(`[data-cliente="${ANA.id}"]`)).not.toBeNull();
    expect(tela.querySelector(`[data-cliente="${JOAO.id}"]`)).toBeNull();
  });

  it("@spec:AC-701 o telefone vai como foi digitado — quem compara por dígitos é o servidor", async () => {
    const chamadas = simularApi(apiDaLista([JOAO, ANA]));
    const tela = montar(<ListaClientes />);
    await esperar();

    digitar(exigir<HTMLInputElement>(tela, "#busca-de-clientes"), "(11) 98888");
    await enviar(exigir<HTMLFormElement>(tela, 'form[role="search"]'));

    expect(
      new URL(chamadas.at(-1)?.url ?? "", "https://x.test").searchParams.get(
        "busca",
      ),
    ).toBe("(11) 98888");
    expect(tela.querySelector(`[data-cliente="${JOAO.id}"]`)).not.toBeNull();
  });

  it("@spec:AC-701 busca sem resultado diz que não achou, e não que não há clientes", async () => {
    simularApi(apiDaLista([JOAO]));
    const tela = montar(<ListaClientes />);
    await esperar();

    digitar(exigir<HTMLInputElement>(tela, "#busca-de-clientes"), "zzz");
    await enviar(exigir<HTMLFormElement>(tela, 'form[role="search"]'));

    expect(tela.textContent).toContain('Nenhum cliente encontrado para "zzz"');
    expect(tela.textContent).not.toContain("Nenhum cliente ainda");
  });
});
