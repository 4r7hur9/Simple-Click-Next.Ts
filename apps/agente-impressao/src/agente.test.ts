/**
 * O agente contra o emulador de impressora (T-609/T-610): a API é falsa, mas
 * fala HTTP pelo cliente de verdade (cabeçalhos, esquema do contrato), e a
 * impressora é o emulador TCP no próprio processo.
 */
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  diagramarCupom,
  gerarCupom,
  type CupomImpresso,
  type PedidoParaCupom,
} from "@simpleclick/core";
import type { TrabalhoDeImpressaoNoContrato } from "@simpleclick/contracts";

import {
  executarAgente,
  processarTrabalho,
  rodarUmaVez,
  type DependenciasDoAgente,
} from "./agente.ts";
import { criarCliente } from "./cliente.ts";
import { abrirDiario } from "./diario.ts";
import { iniciarEmulador, type Emulador } from "./emulador.ts";
import { enviarParaImpressora } from "./impressora-tcp.ts";
import { parear } from "./parear.ts";

const API = "https://api.loja.test";
const CREDENCIAL = `sca_${"x".repeat(43)}`;

const pedido: PedidoParaCupom = {
  loja: "Sorveteria São João",
  codigo: "A-0207",
  feitoEm: "2026-10-06T15:30:00.000Z",
  fusoHorario: "America/Sao_Paulo",
  canal: "ONLINE",
  cliente: { nome: "Conceição", telefone: "5511912345678" },
  itens: [
    { nome: "Açaí com granola", quantidade: 1, totalDaLinhaEmCentavos: 2350 },
    { nome: "Guaraná", quantidade: 2, totalDaLinhaEmCentavos: 1200 },
  ],
  entrega: { tipo: "PICKUP" },
  taxaDeEntrega: { modo: "FREE", valorEmCentavos: 0 },
  pagamento: { forma: "PIX" },
  subtotalEmCentavos: 3550,
  totalEmCentavos: 3550,
};

function trabalho(cupom: CupomImpresso): TrabalhoDeImpressaoNoContrato {
  return {
    id: randomUUID(),
    pedido: { id: randomUUID(), codigo: pedido.codigo },
    tentativa: 1,
    prazoAte: new Date(Date.now() + 60_000).toISOString(),
    cupom: JSON.parse(
      JSON.stringify(cupom),
    ) as TrabalhoDeImpressaoNoContrato["cupom"],
  };
}

interface Chamada {
  readonly metodo: string;
  readonly caminho: string;
  readonly cabecalhos: Record<string, string>;
  readonly corpo: unknown;
}

/**
 * A API falsa: entrega o que está em `fila` a cada consulta (como o reenvio
 * depois do prazo de posse) e tira da fila o que foi confirmado.
 */
function apiFalsa() {
  const fila: TrabalhoDeImpressaoNoContrato[] = [];
  const chamadas: Chamada[] = [];
  let perderConfirmacoes = 0;
  const buscar: typeof fetch = async (entrada, init) => {
    const url = new URL(String(entrada));
    const metodo = init?.method ?? "GET";
    const cabecalhos = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>),
    );
    const corpo =
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as unknown)
        : null;
    chamadas.push({ metodo, caminho: url.pathname, cabecalhos, corpo });
    const json = (status: number, valor: unknown) =>
      new Response(JSON.stringify(valor), {
        status,
        headers: { "content-type": "application/json" },
      });

    if (url.pathname === "/v1/impressao/agente/pareamento") {
      return json(201, {
        credencial: CREDENCIAL,
        agente: { id: randomUUID(), nome: "Caixa" },
        loja: { apelido: "sorveteria", nome: "Sorveteria São João" },
      });
    }
    if (cabecalhos.authorization !== `Bearer ${CREDENCIAL}`) {
      return json(401, { erro: "nao_autenticado" });
    }
    if (url.pathname === "/v1/impressao/agente/trabalhos") {
      return json(200, { trabalhos: [...fila] });
    }
    const [, id, acao] =
      /^\/v1\/impressao\/agente\/trabalhos\/([^/]+)\/(confirmacao|falha)$/.exec(
        url.pathname,
      ) ?? [];
    if (id !== undefined && acao === "confirmacao") {
      if (perderConfirmacoes > 0) {
        perderConfirmacoes -= 1;
        throw new TypeError("fetch failed: a rede caiu");
      }
      const i = fila.findIndex((t) => t.id === id);
      if (i >= 0) fila.splice(i, 1);
      return json(200, { id, estado: "PRINTED" });
    }
    if (id !== undefined && acao === "falha") {
      return json(200, {
        id,
        estado: "FAILED",
        proximaTentativaEm: new Date(Date.now() + 5_000).toISOString(),
      });
    }
    return json(404, { erro: "nao_encontrado" });
  };
  return {
    fila,
    chamadas,
    buscar,
    perderProximasConfirmacoes(n: number) {
      perderConfirmacoes = n;
    },
  };
}

let emulador: Emulador;
let pasta: string;
let impressoraLigada: boolean;

beforeEach(async () => {
  impressoraLigada = true;
  emulador = await iniciarEmulador({ recusar: () => !impressoraLigada });
  pasta = await mkdtemp(join(tmpdir(), "agente-impressao-"));
});

afterEach(async () => {
  await emulador.fechar();
  await rm(pasta, { recursive: true, force: true });
});

async function dependencias(
  api: ReturnType<typeof apiFalsa>,
): Promise<DependenciasDoAgente> {
  return {
    cliente: criarCliente({
      api: API,
      credencial: CREDENCIAL,
      buscar: api.buscar,
    }),
    diario: await abrirDiario(join(pasta, "diario.txt")),
    perfil: { tabela: "cp860" },
    imprimir: (bytes) =>
      enviarParaImpressora(
        { host: emulador.host, porta: emulador.porta },
        bytes,
      ),
  };
}

function papel(indice: number) {
  const recebido = emulador.recebidos[indice]?.papel;
  if (recebido?.lido !== true) {
    throw new Error(`o cupom ${String(indice)} não foi lido pelo emulador`);
  }
  return recebido;
}

describe("agente de impressão contra o emulador", () => {
  it("@spec:AC-620 o cupom com 'Açaí com granola' e 'Guaraná' sai com acento no papel, igual ao da impressão por clique", async () => {
    const api = apiFalsa();
    const cupom = gerarCupom(pedido, { larguraMm: 80 });
    api.fila.push(trabalho(cupom));

    expect(await rodarUmaVez(await dependencias(api))).toEqual(["impresso"]);

    const impresso = papel(0);
    expect(impresso.tabela).toBe("cp860");
    // As MESMAS linhas que o navegador desenha (T-606): uma implementação só.
    expect(impresso.linhas).toEqual(diagramarCupom(cupom, { tabela: "cp860" }));
    expect(impresso.previa).toContain("Açaí com granola");
    expect(impresso.previa).toContain("Guaraná");
    expect(impresso.previa).toContain("Conceição");
    expect(api.fila).toHaveLength(0);
  });

  it("@spec:AC-620 com a impressora na tabela 850, o agente escolhe a 850 e o acento continua certo", async () => {
    const api = apiFalsa();
    api.fila.push(trabalho(gerarCupom(pedido, { larguraMm: 58 })));
    const dep = {
      ...(await dependencias(api)),
      perfil: { tabela: "cp850" as const },
    };

    await rodarUmaVez(dep);

    expect(papel(0).tabela).toBe("cp850");
    expect(papel(0).previa).toContain("Açaí com granola");
  });

  it("@spec:AC-621 a reimpressão entregue pela fila sai marcada como reimpressão com o número da via", async () => {
    const api = apiFalsa();
    api.fila.push(trabalho(gerarCupom(pedido, { larguraMm: 58, via: 2 })));

    await rodarUmaVez(await dependencias(api));

    const impresso = papel(0);
    expect(impresso.previa).toContain("REIMPRESSÃO");
    expect(impresso.previa).toContain("2ª VIA");
    // A primeira via não leva marca nenhuma.
    api.fila.push(trabalho(gerarCupom(pedido, { larguraMm: 58, via: 1 })));
    await rodarUmaVez(await dependencias(api));
    expect(papel(1).previa).not.toContain("REIMPRESSÃO");
  });

  it("@spec:AC-625 confirmação perdida na rede: o reenvio do mesmo trabalho é só confirmado, e o papel sai uma vez", async () => {
    const api = apiFalsa();
    api.fila.push(trabalho(gerarCupom(pedido, { larguraMm: 80 })));
    api.perderProximasConfirmacoes(1);

    expect(await rodarUmaVez(await dependencias(api))).toEqual([
      "impresso_sem_confirmar",
    ]);
    // O agente reinicia (diário aberto de novo do disco) e a API reenvia.
    expect(await rodarUmaVez(await dependencias(api))).toEqual([
      "reconfirmado",
    ]);

    expect(emulador.recebidos).toHaveLength(1);
    expect(api.fila).toHaveLength(0);
  });

  it("@spec:AC-624 impressora fora do ar: a falha é contada à API, nada vai ao diário, e o cupom sai uma vez quando ela volta", async () => {
    const api = apiFalsa();
    const pendente = trabalho(gerarCupom(pedido, { larguraMm: 80 }));
    api.fila.push(pendente);
    impressoraLigada = false;

    expect(await rodarUmaVez(await dependencias(api))).toEqual(["falhou"]);
    const falha = api.chamadas.find((c) => c.caminho.endsWith("/falha"));
    expect(falha?.caminho).toContain(pendente.id);
    expect(falha?.corpo).toMatchObject({
      motivo: expect.stringContaining("impressora"),
    });

    impressoraLigada = true;
    expect(await rodarUmaVez(await dependencias(api))).toEqual(["impresso"]);
    expect(emulador.recebidos).toHaveLength(1);
  });

  it("@spec:AC-623 ligado e pareado, o laço imprime o pedido novo em poucos segundos sem ninguém clicar", async () => {
    const api = apiFalsa();
    const configuracao = await parear(
      {
        api: API,
        apelido: "sorveteria",
        codigo: "123456",
        nome: "Caixa",
        impressora: `${emulador.host}:${String(emulador.porta)}`,
      },
      api.buscar,
    );
    expect(configuracao.credencial).toBe(CREDENCIAL);
    expect(configuracao.impressora.porta).toBe(emulador.porta);

    const parar = new AbortController();
    const dep = await dependencias(api);
    const laco = executarAgente(dep, { intervaloMs: 50, sinal: parar.signal });
    // O pedido entra com o agente já rodando.
    const inicio = Date.now();
    api.fila.push(trabalho(gerarCupom(pedido, { larguraMm: 80 })));
    await emulador.aguardarImpressao(1, 3_000);
    parar.abort();
    await laco;

    expect(Date.now() - inicio).toBeLessThan(3_000);
    expect(api.fila).toHaveLength(0);
    // Cada consulta é o batimento, com a credencial; cada POST leva a origem.
    const consultas = api.chamadas.filter((c) =>
      c.caminho.endsWith("/trabalhos"),
    );
    expect(consultas.length).toBeGreaterThan(0);
    for (const post of api.chamadas.filter((c) => c.metodo === "POST")) {
      expect(post.cabecalhos.origin).toBe(API);
    }
  });

  it("cupom em versão desconhecida não vai ao papel: a falha é contada à API", async () => {
    const api = apiFalsa();
    const conhecido = trabalho(gerarCupom(pedido, { larguraMm: 80 }));
    // O contrato já recusa a versão 2 na resposta da consulta; aqui o
    // trabalho chega direto, para provar a segunda barreira, a do cupom.
    const futuro = {
      ...conhecido,
      cupom: { ...conhecido.cupom, versao: 2 },
    } as unknown as TrabalhoDeImpressaoNoContrato;

    expect(await processarTrabalho(futuro, await dependencias(api))).toBe(
      "falhou",
    );
    expect(emulador.recebidos).toHaveLength(0);
    const falha = api.chamadas.find((c) => c.caminho.endsWith("/falha"));
    expect(falha?.corpo).toMatchObject({
      motivo: expect.stringContaining("versão 2"),
    });
  });

  it("erro da API não derruba o laço: ele tenta de novo na volta seguinte", async () => {
    const api = apiFalsa();
    let falhas = 2;
    const dep = await dependencias(api);
    const cliente = dep.cliente;
    const eventos: string[] = [];
    const parar = new AbortController();
    const laco = executarAgente(
      {
        ...dep,
        registrar: (evento) => eventos.push(evento),
        cliente: {
          ...cliente,
          buscarTrabalhos: () => {
            if (falhas > 0) {
              falhas -= 1;
              return Promise.reject(new Error("API fora do ar"));
            }
            return cliente.buscarTrabalhos();
          },
        },
      },
      { intervaloMs: 20, sinal: parar.signal },
    );
    api.fila.push(trabalho(gerarCupom(pedido, { larguraMm: 80 })));
    await emulador.aguardarImpressao(1, 3_000);
    parar.abort();
    await laco;
    expect(eventos.filter((e) => e === "agente.consulta_falhou")).toHaveLength(
      2,
    );
  });
});
