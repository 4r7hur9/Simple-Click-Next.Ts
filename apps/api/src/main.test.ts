import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { EventEmitter } from "node:events";
import { request, type RequestListener } from "node:http";
import { createServer } from "node:net";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import { VARIAVEIS, VARIAVEIS_APOSENTADAS } from "./core/env.ts";
import { VARIAVEIS_DE_OBSERVABILIDADE } from "./core/observabilidade.ts";
import { rastreamentoAtivo } from "./core/rastreamento.ts";
import {
  criarRegistrador,
  definirRegistrador,
  type Registrador,
} from "./core/log.ts";
import {
  iniciarApi,
  instalarDesligamento,
  type ApiEmPe,
  type RecursoDaApi,
} from "./main.ts";

/** Processo da API subido pelo teste: sem entrada, com saída e erro em mãos. */
type ProcessoDaApi = ChildProcessByStdio<null, Readable, Readable>;

const CAMINHO_DO_MAIN = fileURLToPath(new URL("./main.ts", import.meta.url));

/**
 * Cadeias de exemplo, em constante para que o arquivo de teste nunca pareça —
 * nem seja — lugar onde credencial mora (P-002). Nenhuma é alcançada: a
 * partida não abre banco, que só conecta na primeira requisição que precisa.
 */
const CONEXAO_DA_APLICACAO =
  "postgresql://aplicacao:trocar@127.0.0.1:1/sc_partida";
const CONEXAO_DIRETA = "postgresql://migracao:trocar@127.0.0.1:1/sc_partida";
const CONEXAO_DE_TESTE =
  "postgresql://aplicacao:trocar@127.0.0.1:1/sc_partida_teste";
/**
 * Segredo de prova com 48 caracteres distintos, montado em código: produção
 * recusa repetição como "x" × 48 (A-1 da revisão #149). Não é chave real.
 */
const CHAVE_DE_ASSINATURA = Array.from(
  { length: 48 },
  (_, i) =>
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[(i * 7) % 62],
).join("");
/** 32 bytes de exemplo: produção não parte sem a chave da cifra (AC-130). */
const CHAVE_DE_CIFRA = Buffer.alloc(32, 7).toString("base64");

/** Pede ao sistema uma porta livre, para o teste não disputar com o ambiente. */
async function portaLivre(): Promise<number> {
  return new Promise((resolver, rejeitar) => {
    const servidor = createServer();
    servidor.on("error", rejeitar);
    servidor.listen(0, "127.0.0.1", () => {
      const endereco = servidor.address();
      if (endereco === null || typeof endereco === "string") {
        servidor.close();
        rejeitar(new Error("não foi possível descobrir uma porta livre"));
        return;
      }
      const { port } = endereco;
      servidor.close(() => resolver(port));
    });
  });
}

/**
 * Ambiente completo e válido para a partida — nenhum valor é segredo real, e
 * nenhum serviço é alcançado: a partida não abre banco nem cache (eles abrem
 * na primeira requisição que precisa deles), e o segundo plano vem desligado.
 * Cada teste tira ou troca a peça que está provando.
 */
function ambienteDeProva(
  extras: Record<string, string> = {},
): Record<string, string> {
  return {
    NODE_ENV: "test",
    DATABASE_URL: CONEXAO_DA_APLICACAO,
    DATABASE_URL_DIRETA: CONEXAO_DIRETA,
    DATABASE_URL_TEST: CONEXAO_DE_TESTE,
    REDIS_URL: "redis://127.0.0.1:1/0",
    JWT_SECRET: CHAVE_DE_ASSINATURA,
    ORIGENS_PERMITIDAS: "http://localhost:3100",
    LOG_LEVEL: "info",
    SEGUNDO_PLANO: "desligado",
    ...extras,
  };
}

/**
 * O ambiente do processo filho: o do teste, SEM nenhuma variável que a API lê,
 * mais as que o caso pediu. Herdar `JWT_SECRET` ou `API_PORT` do `.env` de quem
 * roda a prova faria o teste provar a máquina, e não a partida.
 */
function ambienteDoFilho(ambiente: Record<string, string>): NodeJS.ProcessEnv {
  const herdado: NodeJS.ProcessEnv = { ...process.env };
  for (const nome of [
    ...VARIAVEIS,
    ...VARIAVEIS_APOSENTADAS,
    ...VARIAVEIS_DE_OBSERVABILIDADE,
  ]) {
    delete herdado[nome];
  }
  return { ...herdado, ...ambiente };
}

/**
 * Sobe a API como o ambiente sobe: `node src/main.ts`, sem transpilador.
 * É o mesmo caminho que o desenvolvimento e o contêiner usam.
 */
function subirApi(ambiente: Record<string, string>): ProcessoDaApi {
  return spawn(process.execPath, [CAMINHO_DO_MAIN], {
    env: ambienteDoFilho(ambiente),
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** Espera a saída do processo conter o trecho, ou desiste no prazo. */
function esperarSaida(
  processo: ProcessoDaApi,
  canal: "stdout" | "stderr",
  trecho: string,
  prazoMs = 15000,
): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    let acumulado = "";
    const relogio = setTimeout(() => {
      rejeitar(
        new Error(`prazo esgotado esperando "${trecho}". Saída: ${acumulado}`),
      );
    }, prazoMs);

    processo[canal].on("data", (pedaco: Buffer) => {
      acumulado += pedaco.toString();
      if (acumulado.includes(trecho)) {
        clearTimeout(relogio);
        resolver(acumulado);
      }
    });
  });
}

/** Espera o processo acabar e devolve o código e tudo o que ele escreveu. */
function esperarFim(
  processo: ProcessoDaApi,
): Promise<{ codigo: number | null; saida: string; erro: string }> {
  return new Promise((resolver) => {
    let saida = "";
    let erro = "";
    processo.stdout.on("data", (pedaco: Buffer) => (saida += pedaco));
    processo.stderr.on("data", (pedaco: Buffer) => (erro += pedaco));
    processo.on("close", (codigo) => resolver({ codigo, saida, erro }));
  });
}

let emExecucao: ProcessoDaApi | undefined;
let emPe: ApiEmPe | undefined;

afterEach(async () => {
  emExecucao?.kill("SIGKILL");
  emExecucao = undefined;
  await emPe?.desligar("fim do teste");
  emPe = undefined;
  definirRegistrador(undefined);
});

describe("partida da API", () => {
  it("@spec:AC-001 sobe no endereço local e responde que está viva", async () => {
    const porta = await portaLivre();
    const api = subirApi(ambienteDeProva({ PORT: String(porta) }));
    emExecucao = api;

    // A linha de partida agora sai pelo registro estruturado (AC-021): uma
    // linha de JSON com o nome do evento, e não mais texto corrido.
    const saida = await esperarSaida(api, "stdout", '"api.iniciou"');
    const resposta = await fetch(`http://127.0.0.1:${porta}/`);

    const linhaDaPartida = saida
      .split("\n")
      .find((linha) => linha.includes("api.iniciou"));
    const partida = JSON.parse(linhaDaPartida ?? "") as Record<string, unknown>;
    expect(partida.msg).toBe("api.iniciou");
    expect(partida.porta).toBe(porta);

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ status: "viva" });
  }, 30000);

  it("@spec:AC-001 recusa subir quando a porta configurada não é porta válida", async () => {
    const api = subirApi(ambienteDeProva({ PORT: "porta-errada" }));
    emExecucao = api;

    const { codigo, erro } = await esperarFim(api);

    // Falhar na partida nomeando a variável é melhor do que subir num número
    // inesperado e ninguém achar a API.
    expect(erro).toContain("PORT — valor inválido");
    expect(codigo).not.toBe(0);
  }, 30000);

  it("@spec:AC-002 o processo da API recusa partir sem variável obrigatória, dizendo qual falta e o que se espera dela", async () => {
    const ambiente = ambienteDeProva({ PORT: String(await portaLivre()) });
    delete ambiente.JWT_SECRET;
    const api = subirApi(ambiente);
    emExecucao = api;

    const { codigo, saida, erro } = await esperarFim(api);

    expect(codigo).not.toBe(0);
    expect(erro).toContain("JWT_SECRET — ausente");
    expect(erro).toContain("esperado:");
    expect(erro).toContain("ao menos 32 caracteres");
    // Recusou ANTES de escutar: nenhuma linha de partida, e o registro da
    // recusa nomeia a variável sem carregar valor nenhum.
    expect(saida).not.toContain("api.iniciou");
    const recusa = JSON.parse(
      saida.split("\n").find((linha) => linha.includes("partida_recusada")) ??
        "",
    ) as Record<string, unknown>;
    expect(recusa.campos).toEqual(["JWT_SECRET"]);
  }, 30000);

  it("@spec:AC-048 o processo recusa partir quando o nome antigo da porta aponta para outra porta, nomeando as duas", async () => {
    const porta = await portaLivre();
    const api = subirApi(
      ambienteDeProva({ PORT: String(porta), API_PORT: String(porta + 1) }),
    );
    emExecucao = api;

    const { codigo, saida, erro } = await esperarFim(api);

    expect(codigo).not.toBe(0);
    expect(erro).toContain("API_PORT");
    expect(erro).toContain(`PORT (${porta})`);
    expect(saida).not.toContain("api.iniciou");
  }, 30000);
});

// ---------------------------------------------------------------------------
// A partida e o desligamento por dentro do processo
// ---------------------------------------------------------------------------

/** Linhas de registro em JSON, lidas de volta para a prova. */
interface Captura {
  readonly registrador: Registrador;
  linha(evento: string): Record<string, unknown> | undefined;
}

function capturarRegistro(): Captura {
  const linhas: Record<string, unknown>[] = [];
  const registrador = criarRegistrador({
    nivel: "debug",
    ambiente: "test",
    destino: {
      write: (texto: string) => {
        for (const linha of texto.split("\n")) {
          if (linha.trim() !== "") {
            linhas.push(JSON.parse(linha) as Record<string, unknown>);
          }
        }
      },
    },
  });
  return {
    registrador,
    linha: (evento) => linhas.find((linha) => linha.msg === evento),
  };
}

/** Requisição numa conexão própria, sem reaproveitar conexão de outra. */
function pedir(
  porta: number,
  caminho: string,
): Promise<{ status: number; corpo: string }> {
  return new Promise((resolver, rejeitar) => {
    const requisicao = request(
      { host: "127.0.0.1", port: porta, path: caminho, agent: false },
      (resposta) => {
        let corpo = "";
        resposta.setEncoding("utf8");
        resposta.on("data", (pedaco: string) => (corpo += pedaco));
        resposta.on("end", () =>
          resolver({ status: resposta.statusCode ?? 0, corpo }),
        );
      },
    );
    requisicao.on("error", rejeitar);
    requisicao.end();
  });
}

/** Aplicação de prova com uma rota que só responde quando o teste liberar. */
function aplicacaoComRotaLenta() {
  let avisarChegada: () => void = () => undefined;
  let liberar: () => void = () => undefined;
  const chegou = new Promise<void>((resolver) => (avisarChegada = resolver));
  const liberada = new Promise<void>((resolver) => (liberar = resolver));

  const aplicacao: RequestListener = (requisicao, resposta) => {
    if (requisicao.url === "/lenta") {
      avisarChegada();
      void liberada.then(() => {
        resposta.writeHead(200, { "content-type": "text/plain" });
        resposta.end("resposta inteira");
      });
      return;
    }
    resposta.end("rápida");
  };

  return { aplicacao, chegou, liberar: () => liberar() };
}

/** Banco e cache de mentira, que anotam quando foram fechados. */
function recursosDeProva(fechados: string[]): RecursoDaApi[] {
  return ["banco", "banco_da_administracao", "cache"].map((nome) => ({
    nome,
    encerrar: () => {
      fechados.push(nome);
      return Promise.resolve();
    },
  }));
}

/** Espera a condição valer, sem dormir tempo fixo. */
async function esperarAte(condicao: () => boolean, oQue: string) {
  const limite = Date.now() + 10_000;
  while (!condicao()) {
    if (Date.now() > limite) throw new Error(`não aconteceu: ${oQue}`);
    await new Promise((seguir) => setTimeout(seguir, 10));
  }
}

describe("desligamento da API", () => {
  it("@spec:AC-047 ao sinal de término, para de aceitar conexão, entrega a resposta em curso, só então fecha o resto e sai com zero", async () => {
    const porta = await portaLivre();
    const captura = capturarRegistro();
    const lenta = aplicacaoComRotaLenta();
    const fechados: string[] = [];
    const api = await iniciarApi({
      fonte: ambienteDeProva({ PORT: String(porta) }),
      aplicacao: lenta.aplicacao,
      recursos: recursosDeProva(fechados),
      registrador: captura.registrador,
    });
    emPe = api;

    // O emissor de mentira faz o papel de `process`: no Windows não existe
    // sinal de verdade para mandar a um processo filho.
    const sinais = new EventEmitter();
    const codigos: number[] = [];
    instalarDesligamento(api, sinais, (codigo) => codigos.push(codigo));

    const emCurso = pedir(porta, "/lenta");
    await lenta.chegou;

    sinais.emit("SIGTERM");

    await expect(pedir(porta, "/rapida")).rejects.toMatchObject({
      code: "ECONNREFUSED",
    });
    // Com uma resposta ainda saindo, nada mais pode ter sido fechado.
    expect(fechados).toEqual([]);
    expect(codigos).toEqual([]);

    lenta.liberar();
    expect(await emCurso).toEqual({ status: 200, corpo: "resposta inteira" });

    await esperarAte(() => codigos.length > 0, "o processo pedir para sair");
    expect(codigos).toEqual([0]);
    expect([...fechados].sort()).toEqual([
      "banco",
      "banco_da_administracao",
      "cache",
    ]);
    expect(captura.linha("api.desligando")?.detalhe).toBe("SIGTERM");
    expect(captura.linha("api.desligou")?.estado).toBe("limpo");
  }, 30000);

  it("@spec:AC-047 se o fechamento passa do prazo, sai sozinha com código diferente de zero e registra o que não fechou", async () => {
    const porta = await portaLivre();
    const captura = capturarRegistro();
    const lenta = aplicacaoComRotaLenta();
    const api = await iniciarApi({
      fonte: ambienteDeProva({ PORT: String(porta) }),
      aplicacao: lenta.aplicacao,
      recursos: recursosDeProva([]),
      prazoDeDesligamentoMs: 300,
      registrador: captura.registrador,
    });
    emPe = api;
    const sinais = new EventEmitter();
    const codigos: number[] = [];
    instalarDesligamento(api, sinais, (codigo) => codigos.push(codigo));

    // A resposta nunca é liberada: é a requisição que segura o desligamento.
    const presa = pedir(porta, "/lenta").then(
      () => "respondeu",
      () => "conexão cortada",
    );
    await lenta.chegou;

    sinais.emit("SIGTERM");

    await esperarAte(() => codigos.length > 0, "o prazo estourar");
    expect(codigos).toEqual([1]);
    const estouro = captura.linha("api.desligamento_estourou");
    expect(estouro?.esperaMs).toBe(300);
    expect(estouro?.itens).toEqual(
      expect.arrayContaining(["http", "banco", "cache"]),
    );
    // Quem ficou pendurado perde a conexão: o processo vai sair de qualquer jeito.
    expect(await presa).toBe("conexão cortada");
  }, 30000);

  it("@spec:AC-047 recurso que falha ao fechar não impede os outros de fechar, e o desfecho não é limpo", async () => {
    const porta = await portaLivre();
    const captura = capturarRegistro();
    const fechados: string[] = [];
    const api = await iniciarApi({
      fonte: ambienteDeProva({ PORT: String(porta) }),
      aplicacao: (_requisicao, resposta) => resposta.end("ok"),
      recursos: [
        {
          nome: "banco",
          encerrar: () => Promise.reject(new Error("conexão já tinha caído")),
        },
        ...recursosDeProva(fechados).filter((r) => r.nome === "cache"),
      ],
      registrador: captura.registrador,
    });
    emPe = api;

    const primeiro = api.desligar("SIGTERM");
    // Desligar de novo é o mesmo desligamento, e não um segundo.
    expect(api.desligar("SIGINT")).toBe(primeiro);
    const resultado = await primeiro;

    expect(resultado).toMatchObject({ limpo: false, naoFechou: ["banco"] });
    expect(fechados).toEqual(["cache"]);
    expect(captura.linha("api.recurso_nao_fechou")?.recurso).toBe("banco");
  }, 30000);
});

describe("o que a partida sobe", () => {
  it("@spec:AC-046 com o segundo plano desligado de propósito, a API sobe sem abrir conexão de fila e o registro diz que ele está desligado", async () => {
    // Um "Redis" que só conta quem bate na porta. Produção liga o segundo
    // plano sozinha — por isso o caso é em produção, desligado de propósito.
    let conexoes = 0;
    const redisDeMentira = createServer((socket) => {
      conexoes += 1;
      socket.destroy();
    });
    await new Promise<void>((pronto) =>
      redisDeMentira.listen(0, "127.0.0.1", pronto),
    );
    const enderecoDoRedis = redisDeMentira.address();
    if (enderecoDoRedis === null || typeof enderecoDoRedis === "string") {
      throw new Error("o Redis de mentira não abriu porta");
    }

    try {
      const porta = await portaLivre();
      const captura = capturarRegistro();
      const api = await iniciarApi({
        fonte: ambienteDeProva({
          NODE_ENV: "production",
          CHAVE_CIFRA_TOTP: CHAVE_DE_CIFRA,
          PORT: String(porta),
          REDIS_URL: `redis://127.0.0.1:${enderecoDoRedis.port}/0`,
          SEGUNDO_PLANO: "desligado",
        }),
        aplicacao: (_requisicao, resposta) => resposta.end("ok"),
        recursos: [],
        registrador: captura.registrador,
      });
      emPe = api;

      // Conexão de fila nasce na hora em que a fila é aberta; dar um respiro
      // é só para não confundir "não abriu" com "ainda não chegou".
      await new Promise((seguir) => setTimeout(seguir, 300));

      expect(api.segundoPlano).toBeUndefined();
      expect(conexoes).toBe(0);
      expect(captura.linha("segundo_plano.desligado")?.estado).toBe(
        "desligado",
      );
      expect(captura.linha("segundo_plano.iniciou")).toBeUndefined();
      expect(await pedir(porta, "/")).toEqual({ status: 200, corpo: "ok" });
    } finally {
      await new Promise((fechado) => redisDeMentira.close(fechado));
    }
  }, 30000);

  it("@spec:AC-048 escuta na porta de PORT e só avisa quando o nome antigo aponta para a mesma porta", async () => {
    const porta = await portaLivre();
    const captura = capturarRegistro();
    const api = await iniciarApi({
      fonte: ambienteDeProva({ PORT: String(porta), API_PORT: String(porta) }),
      aplicacao: (_requisicao, resposta) => resposta.end("ok"),
      recursos: [],
      registrador: captura.registrador,
    });
    emPe = api;

    expect(api.porta).toBe(porta);
    expect(captura.linha("api.iniciou")?.porta).toBe(porta);
    expect(await pedir(porta, "/")).toEqual({ status: 200, corpo: "ok" });
    expect(captura.linha("ambiente.variavel_aposentada")?.campos).toEqual([
      "API_PORT",
    ]);
  }, 30000);
});

describe("observabilidade na partida (#139)", () => {
  it("sem OTEL_EXPORTER_OTLP_ENDPOINT nenhum provedor é registrado e /metrics fica fechado", async () => {
    const porta = await portaLivre();
    const api = await iniciarApi({
      fonte: ambienteDeProva({ PORT: String(porta) }),
      registrador: capturarRegistro().registrador,
    });
    emPe = api;

    expect(rastreamentoAtivo()).toBe(false);
    expect((await fetch(`http://127.0.0.1:${porta}/metrics`)).status).toBe(404);
    expect((await api.desligar("teste")).limpo).toBe(true);
    emPe = undefined;
  }, 30000);

  it("com o coletor inalcançável a API sobe, responde e desliga limpa", async () => {
    const porta = await portaLivre();
    const api = await iniciarApi({
      fonte: ambienteDeProva({
        PORT: String(porta),
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:9",
      }),
      registrador: capturarRegistro().registrador,
    });
    emPe = api;

    expect(rastreamentoAtivo()).toBe(true);
    const viva = await fetch(`http://127.0.0.1:${porta}/v1/health/live`);
    expect(viva.status).toBe(200);
    const raiz = await fetch(`http://127.0.0.1:${porta}/`);
    expect(raiz.status).toBe(200);

    expect((await api.desligar("teste")).limpo).toBe(true);
    emPe = undefined;
    expect(rastreamentoAtivo()).toBe(false);
  }, 30000);

  it("/metrics com token: 401 sem ele e 200 com ele", async () => {
    const porta = await portaLivre();
    const token = "m".repeat(40);
    const api = await iniciarApi({
      fonte: ambienteDeProva({ PORT: String(porta), METRICAS_TOKEN: token }),
      registrador: capturarRegistro().registrador,
    });
    emPe = api;

    expect((await fetch(`http://127.0.0.1:${porta}/metrics`)).status).toBe(401);
    const ok = await fetch(`http://127.0.0.1:${porta}/metrics`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain("process_cpu_user_seconds_total");
    await api.desligar("teste");
    emPe = undefined;
  }, 30000);

  it("recusa a partida com token de métricas curto, sem repetir o valor", async () => {
    const porta = await portaLivre();
    const api = subirApi(
      ambienteDeProva({ PORT: String(porta), METRICAS_TOKEN: "curto-secreto" }),
    );
    emExecucao = api;
    const { codigo, erro, saida } = await esperarFim(api);
    expect(codigo).not.toBe(0);
    expect(erro + saida).toContain("METRICAS_TOKEN");
    expect(erro + saida).not.toContain("curto-secreto");
  }, 30000);
});
