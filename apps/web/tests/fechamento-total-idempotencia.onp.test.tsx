// @vitest-environment jsdom
/**
 * Prova do total, da revalidação e do pedido sem duplicação (card #110,
 * T-11006).
 *
 * O servidor já impede o pedido repetido (`apps/api/tests/pedido-idempotente
 * .test.ts`). Aqui se prova o lado do CLIENTE: um envio só por vez, a mesma
 * chave e o mesmo corpo quando a resposta se perde, chave forte e que nunca
 * sai da memória.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";

import { criarArquivoDeTentativas } from "../src/features/checkout/chave-do-fechamento";
import type { ResultadoDoFechamento } from "../src/lib/carrinho-do-navegador";

import {
  CONFERENCIA,
  CONFERENCIA_VAZIA,
  CRIADO,
  UUID_V4,
  adiada,
  botao,
  clicar,
  clicarAsync,
  confirmar,
  desmontarTudo,
  digitar,
  esperar,
  fechamento,
  montar,
} from "./apoio-do-fechamento";

afterEach(() => {
  desmontarTudo();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Enviado = {
  chaveDeIdempotencia: string;
  subtotalVistoCentavos: number;
  totalVistoCentavos: number;
  [campo: string]: unknown;
};

function enviadoNaChamada(
  fechar: { mock: { calls: unknown[][] } },
  indice = 0,
): Enviado {
  return fechar.mock.calls[indice]?.[1] as Enviado;
}

describe("[CA-14] o total é o que o servidor validou (AC-11014)", () => {
  it("[CA-14] @spec:AC-11014 com taxa, o total aparece como estimativa fora da lista de valores", async () => {
    const { caixa } = await montar(fechamento().elemento);

    const nota = caixa.querySelector(".sc-resumo__estimativa");
    expect(nota?.textContent).toContain("estimado");
    // Fora do `dl`: cada valor continua ligado ao próprio rótulo.
    expect(nota?.closest("dl")).toBeNull();
    expect(caixa.querySelector(".sc-resumo")?.textContent).toContain("Total");

    clicar(caixa.querySelector('input[value="PICKUP"]'));
    expect(caixa.querySelector(".sc-resumo__estimativa")).toBeNull();
  });

  it("[CA-14] @spec:AC-11014 criado o pedido, a tela mostra subtotal, taxa e total que o servidor gravou", async () => {
    const { elemento, fechar } = fechamento();
    fechar.mockResolvedValueOnce({
      estado: "criado",
      pedido: {
        ...(CRIADO as Extract<ResultadoDoFechamento, { estado: "criado" }>)
          .pedido,
        subtotalCentavos: 2300,
        taxaDeEntregaCentavos: 700,
        totalCentavos: 3000,
      },
    } as never);
    const { caixa } = await montar(elemento);

    await confirmar(caixa);

    const gravado = caixa.querySelector(".sc-fechar__gravado")?.textContent;
    expect(gravado).toContain("R$ 23,00");
    expect(gravado).toContain("R$ 7,00");
    expect(gravado).toContain("R$ 30,00");
    // E nenhuma estimativa depois de criado.
    expect(caixa.querySelector(".sc-resumo__estimativa")).toBeNull();
  });
});

describe("[CA-15] mudança de preço ou estoque é avisada antes de concluir (AC-11015)", () => {
  const COM_MUDANCA = {
    estado: "conferido",
    conferencia: {
      ...CONFERENCIA,
      precisaConfirmar: true,
      mudancas: [
        {
          itemId: CONFERENCIA.itens[0]!.itemId,
          nome: "Camiseta lisa",
          tipo: "preco_subiu",
          deEmCentavos: 1200,
          paraEmCentavos: 1500,
          explicacao: "O preço subiu de R$ 12,00 para R$ 15,00.",
        },
      ],
    },
  };

  it("[CA-15] @spec:AC-11015 o aviso vem antes do formulário e o pedido só segue depois de aceitar", async () => {
    const { elemento, fechar, conferir } = fechamento();
    conferir.mockResolvedValue(COM_MUDANCA);
    const { caixa } = await montar(elemento);

    expect(caixa.textContent).toContain(
      "O preço subiu de R$ 12,00 para R$ 15,00.",
    );
    expect(caixa.querySelector("form")).toBeNull();
    expect(fechar).not.toHaveBeenCalled();

    clicar(botao(caixa, "Confirmar e continuar"));
    expect(caixa.querySelector("form")).not.toBeNull();
  });

  it("[CA-15] @spec:AC-11015 depois de um 409 com mudança nova, a confirmação é pedida de novo", async () => {
    const { elemento, fechar, conferir } = fechamento();
    const { caixa } = await montar(elemento);
    // O mundo muda enquanto a pessoa preenche: o servidor recusa (409) e a
    // nova conferência traz uma mudança que ela ainda não viu.
    conferir.mockResolvedValue(COM_MUDANCA);
    fechar.mockResolvedValueOnce({
      estado: "nao-pode",
      motivo: "Não foi possível fechar o pedido agora.",
    } as never);

    await confirmar(caixa);

    expect(caixa.querySelector("form")).toBeNull();
    expect(caixa.textContent).toContain(
      "O preço subiu de R$ 12,00 para R$ 15,00.",
    );
  });
});

describe("[CA-16] todo envio leva o subtotal e o total que o cliente viu (AC-11016)", () => {
  it("[CA-16] @spec:AC-11016 o corpo leva o subtotal e o total da última conferência", async () => {
    const { elemento, fechar } = fechamento();
    const { caixa } = await montar(elemento);

    await confirmar(caixa);

    const enviado = enviadoNaChamada(fechar);
    expect(enviado.subtotalVistoCentavos).toBe(2400);
    // Entrega: itens + taxa de R$ 5,00.
    expect(enviado.totalVistoCentavos).toBe(2900);
  });

  it("[CA-16] @spec:AC-11016 o 409 não cria pedido e leva a uma nova revisão (nova conferência)", async () => {
    const { elemento, fechar, conferir } = fechamento();
    const { caixa } = await montar(elemento);
    fechar.mockResolvedValueOnce({
      estado: "nao-pode",
      motivo: "O subtotal mudou. Revise o pedido.",
    } as never);
    const antes = conferir.mock.calls.length;

    await confirmar(caixa);

    expect(conferir.mock.calls.length).toBe(antes + 1);
    expect(caixa.querySelector('[role="alert"]')?.textContent).toBe(
      "O subtotal mudou. Revise o pedido.",
    );
    expect(caixa.textContent).not.toContain("Pedido A-0007");
  });
});

describe("[CA-17] confirmar várias vezes cria um pedido só (AC-11017)", () => {
  it("[CA-17] @spec:AC-11017 dois envios no mesmo ciclo chamam o servidor uma vez, com o botão ocupado", async () => {
    const espera = adiada<ResultadoDoFechamento>();
    const { elemento, fechar } = fechamento();
    fechar.mockReturnValueOnce(espera.promessa as never);
    const { caixa } = await montar(elemento);
    const formulario = caixa.querySelector("form");

    await act(async () => {
      // Dois toques antes de o React redesenhar: o estado `enviando` ainda é
      // falso nos dois, e só a trava síncrona segura o segundo.
      formulario?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      formulario?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(fechar).toHaveBeenCalledTimes(1);
    const enviar = caixa.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    expect(enviar?.disabled).toBe(true);
    expect(enviar?.getAttribute("aria-busy")).toBe("true");

    await act(async () => {
      espera.resolver(CRIADO);
    });
    expect(caixa.textContent).toContain("A-0007");
  });

  it("[CA-17] @spec:AC-11017 voltar e fechar ficam desabilitados enquanto o pedido está no ar", async () => {
    const espera = adiada<ResultadoDoFechamento>();
    const { elemento, fechar } = fechamento({
      aoVoltar: vi.fn(),
      aoFecharJanela: vi.fn(),
    });
    fechar.mockReturnValueOnce(espera.promessa as never);
    const { caixa } = await montar(elemento);

    await confirmar(caixa);

    expect(botao(caixa, "Voltar à sacola").disabled).toBe(true);
    expect(botao(caixa, "Fechar").disabled).toBe(true);

    await act(async () => {
      espera.resolver(CRIADO);
    });
  });

  it("[CA-17] @spec:AC-11017 a rede cai: tentar de novo repete o MESMO corpo com a MESMA chave e recupera o pedido", async () => {
    const { elemento, fechar, conferir } = fechamento();
    const { caixa } = await montar(elemento);
    fechar.mockResolvedValueOnce({
      estado: "falhou",
      motivo: "sem rede",
    } as never);

    await confirmar(caixa);

    // O formulário continua, travado como foi enviado, e oferece repetir.
    expect(caixa.querySelector("form")).not.toBeNull();
    expect(caixa.querySelector('button[type="submit"]')).toHaveProperty(
      "disabled",
      true,
    );
    expect(caixa.textContent).toContain("não vai sair um pedido repetido");

    // O servidor JÁ criou o pedido: o carrinho voltou vazio.
    conferir.mockResolvedValue({
      estado: "conferido",
      conferencia: CONFERENCIA_VAZIA,
    });
    await clicarAsync(botao(caixa, "Tentar de novo"));

    expect(fechar).toHaveBeenCalledTimes(2);
    expect(enviadoNaChamada(fechar, 1)).toEqual(enviadoNaChamada(fechar, 0));
    expect(caixa.textContent).toContain("A-0007");
  });

  it("[CA-17] @spec:AC-11017 a rede cai e o carrinho ainda tem itens: o pedido não saiu, a edição volta e a chave é nova", async () => {
    const { elemento, fechar } = fechamento();
    const { caixa } = await montar(elemento);
    fechar.mockResolvedValueOnce({
      estado: "falhou",
      motivo: "sem rede",
    } as never);
    await confirmar(caixa);
    const primeira = enviadoNaChamada(fechar).chaveDeIdempotencia;

    // O carrinho segue com itens (o `conferir` padrão): nada foi criado.
    await clicarAsync(botao(caixa, "Tentar de novo"));
    expect(fechar).toHaveBeenCalledTimes(1);
    expect(caixa.textContent).toContain("não chegou a ser criado");

    // Pode editar e confirmar de novo: nova chave, e o corpo de agora.
    digitar(
      caixa.querySelector<HTMLInputElement>("#checkout-observacao"),
      "deixar na portaria",
    );
    await confirmar(caixa);
    expect(fechar).toHaveBeenCalledTimes(2);
    const segunda = enviadoNaChamada(fechar, 1);
    expect(segunda.chaveDeIdempotencia).not.toBe(primeira);
    expect(segunda["observacao"]).toBe("deixar na portaria");
  });

  it("[CA-17] @spec:AC-11017 fechar a janela no meio do envio não perde a tentativa: ao reabrir, vem o pedido e nada é reenviado", async () => {
    const arquivo = criarArquivoDeTentativas();
    const espera = adiada<ResultadoDoFechamento>();
    const primeira = fechamento({ tentativas: arquivo });
    primeira.fechar.mockReturnValueOnce(espera.promessa as never);
    const aberta = await montar(primeira.elemento);

    await confirmar(aberta.caixa);
    // A janela fecha com a resposta ainda no ar.
    aberta.desmontar();
    expect(arquivo.ler()?.promessa).not.toBeNull();

    // A resposta chega com a janela fechada; ao reabrir, a tela a encontra.
    await act(async () => {
      espera.resolver(CRIADO);
    });
    const segunda = fechamento({ tentativas: arquivo });
    const reaberta = await montar(segunda.elemento);
    await esperar();

    expect(reaberta.caixa.textContent).toContain("A-0007");
    expect(segunda.fechar).not.toHaveBeenCalled();
    expect(arquivo.ler()).toBeNull();
  });
});

describe("[CA-18] a chave vale só para a tentativa atual (AC-11018)", () => {
  it("[CA-18] @spec:AC-11018 a chave é um UUID v4 e muda a cada fechamento novo", async () => {
    const chaves: string[] = [];
    for (let vez = 0; vez < 3; vez += 1) {
      const { elemento, fechar } = fechamento();
      const { caixa, desmontar } = await montar(elemento);
      await confirmar(caixa);
      chaves.push(enviadoNaChamada(fechar).chaveDeIdempotencia);
      desmontar();
    }

    for (const chave of chaves) expect(chave).toMatch(UUID_V4);
    expect(new Set(chaves).size).toBe(3);
  });

  it("[CA-18] @spec:AC-11018 depois de uma resposta definitiva (409), o envio seguinte usa chave nova", async () => {
    const { elemento, fechar } = fechamento();
    const { caixa } = await montar(elemento);
    fechar.mockResolvedValueOnce({
      estado: "nao-pode",
      motivo: "A loja fechou.",
    } as never);

    await confirmar(caixa);
    await confirmar(caixa);

    expect(enviadoNaChamada(fechar, 1).chaveDeIdempotencia).not.toBe(
      enviadoNaChamada(fechar, 0).chaveDeIdempotencia,
    );
  });

  it("[CA-18] @spec:AC-11018 a chave não fica em storage, endereço da página, atributo nem console", async () => {
    const registros = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
    ];
    const { elemento, fechar } = fechamento();
    const { caixa } = await montar(elemento);
    fechar.mockResolvedValueOnce({
      estado: "falhou",
      motivo: "sem rede",
    } as never);

    await confirmar(caixa);
    const chave = enviadoNaChamada(fechar).chaveDeIdempotencia;

    const guardado = JSON.stringify({
      local: { ...window.localStorage },
      sessao: { ...window.sessionStorage },
    });
    expect(guardado).not.toContain(chave);
    expect(window.location.href).not.toContain(chave);
    expect(document.cookie).not.toContain(chave);
    expect(document.documentElement.outerHTML).not.toContain(chave);
    for (const registro of registros) {
      expect(JSON.stringify(registro.mock.calls)).not.toContain(chave);
    }
  });

  it("[CA-18] @spec:AC-11018 sem gerador seguro de números não há chave, e o pedido não é enviado", async () => {
    vi.stubGlobal("crypto", undefined);
    const aleatorio = vi.spyOn(Math, "random");
    const { elemento, fechar } = fechamento();
    const { caixa } = await montar(elemento);

    await confirmar(caixa);

    expect(fechar).not.toHaveBeenCalled();
    expect(caixa.querySelector('[role="alert"]')?.textContent).toContain(
      "não consegue proteger o envio",
    );
    // E nunca cai em número fraco no lugar do seguro.
    expect(aleatorio).not.toHaveBeenCalled();
  });

  it("[CA-18] @spec:AC-11018 só com getRandomValues, a chave continua sendo um UUID v4 válido", async () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0xff);
        return bytes;
      },
    });
    const aleatorio = vi.spyOn(Math, "random");
    const { elemento, fechar } = fechamento();
    const { caixa } = await montar(elemento);

    await confirmar(caixa);

    expect(enviadoNaChamada(fechar).chaveDeIdempotencia).toMatch(UUID_V4);
    expect(aleatorio).not.toHaveBeenCalled();
  });
});

describe("[CA-19] duas abas não criam dois pedidos da mesma sacola (AC-11019)", () => {
  it("[CA-19] @spec:AC-11019 a aba que perde recebe o 409, avisa e não envia outro pedido", async () => {
    // O servidor já converteu a sacola na outra aba: o 409 chega aqui.
    const { elemento, fechar } = fechamento();
    fechar.mockResolvedValue({
      estado: "nao-pode",
      motivo: "Não foi possível fechar o pedido agora. Confira a sacola.",
    } as never);
    const { caixa } = await montar(elemento);

    await confirmar(caixa);

    expect(fechar).toHaveBeenCalledTimes(1);
    expect(caixa.querySelector('[role="alert"]')?.textContent).toContain(
      "Não foi possível fechar o pedido agora",
    );
    expect(caixa.textContent).not.toContain("A-0007");
  });
});
