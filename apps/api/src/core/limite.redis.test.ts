/**
 * Prova do limite de tentativas (AC-119, AC-120).
 *
 * Contra Redis de verdade e por requisição de verdade a um Express montado. Os
 * dois pontos são deliberados:
 *
 * - **Redis de verdade** porque o comportamento a provar mora no script que
 *   roda lá dentro. Um dublê de cache provaria que o TypeScript chama o dublê,
 *   e nada sobre a decisão que o script toma.
 * - **Requisição de verdade** porque "mesmo com a senha correta" é uma
 *   afirmação sobre ORDEM: o limite tem de responder antes de a rota conferir a
 *   senha. Chamar a função direto não observa ordem nenhuma.
 *
 * O relógio, esse sim, entra por parâmetro. O bloqueio progressivo é uma regra
 * sobre minutos; esperar minutos de verdade produziria um teste que ninguém
 * roda — e teste que ninguém roda não prova nada.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";

import {
  conectarNoCacheDoLimite,
  enderecoDoCliente,
  limitarTentativas,
  limiteDaRequisicao,
  type AvisoDeBloqueio,
  type CacheDoLimiteAberto,
} from "./limite.ts";

/**
 * Espera própria, e maior que a do projeto, para OS TESTES PESADOS do arquivo.
 *
 * Eles fazem dezenas de requisições HTTP de verdade contra um Express montado, e
 * cada requisição conversa várias vezes com o Redis. Sozinhos levam menos de um
 * segundo; com a suíte inteira disputando o mesmo Redis, já passaram dos 30
 * segundos do projeto — e em todas as vezes passaram sozinhos depois.
 *
 * DAR TEMPO NÃO BASTOU, e é bom dizer isto por escrito: o teste do teto reprovou
 * DEPOIS de receber os dois minutos, e a conta é fácil de errar — mais tempo
 * significa mais tempo exposto à disputa, e não menos. O conserto que funcionou
 * foi tirar do teste as 49 requisições que não provavam nada. A espera longa
 * fica como rede de segurança para o que sobrou.
 *
 * A espera é DESTE ARQUIVO, e não do projeto: subir o limite de todos esconderia
 * um teste genuinamente travado atrás de dois minutos de paciência.
 *
 * POR QUE DO ARQUIVO INTEIRO, E NÃO TESTE A TESTE. A correção de 19/08 deu a
 * espera longa a dois testes; em 25/08 um terceiro reprovou, com a mesma forma;
 * em 26/08, um quarto. Três correções, três vezes o mesmo diagnóstico, e a cada
 * vez o portão parado até alguém investigar.
 *
 * O que essas quatro têm em comum não é coincidência: TODO teste deste arquivo
 * faz dezenas de requisições HTTP de verdade contra um Redis compartilhado. A
 * classe é o arquivo, e é ela que precisa da espera — corrigir um por um é
 * tratar sintoma, e a conta já foi paga três vezes.
 *
 * O risco de esconder um teste travado continua existindo, e continua limitado:
 * ele vale para ESTE arquivo, cujos testes são conhecidamente pesados, e não
 * para os outros 40 da suíte.
 */
const ESPERA_DOS_PESADOS = 120_000;

// A ESPERA LONGA DO ARQUIVO FOI RETIRADA em 26/08, e o motivo é instrutivo:
// com ela, o caso do AC-119 passou a levar 120 SEGUNDOS e ainda assim reprovar
// — o que provou que ele não é lento, é PARADO. A espera longa não corrigiu
// nada; ela escondeu a natureza do defeito atrás de dois minutos de paciência,
// exatamente como a nota acima previa.
//
// A causa real estava no arranjo dos testes, e não neles: os dois arquivos do
// projeto `cache-int` disputavam o mesmo Redis. A correção está em
// `vitest.config.ts` — `fileParallelism: false`. Os dois casos pesados abaixo
// mantêm a espera própria, que é rede de segurança e não remédio.

// ---------------------------------------------------------------------------
// Ambiente
// ---------------------------------------------------------------------------

const RAIZ_DO_REPOSITORIO = fileURLToPath(
  new URL("../../../../", import.meta.url),
);
const ARQUIVO_DE_AMBIENTE = join(RAIZ_DO_REPOSITORIO, ".env");
if (existsSync(ARQUIVO_DE_AMBIENTE)) process.loadEnvFile(ARQUIVO_DE_AMBIENTE);

/**
 * A cadeia do cache de teste, ou uma falha que explica como conseguir uma.
 *
 * Pular por falta de ambiente deixaria o limite de tentativas sem prova
 * exatamente na máquina onde o ambiente não subiu — e um "teste pulado" verde
 * é pior do que teste nenhum, porque parece cobertura.
 */
function urlDoCacheDeTeste(): string {
  const url = process.env.REDIS_URL_TEST?.trim();
  if (url === undefined || url === "") {
    throw new Error(
      [
        "REDIS_URL_TEST não está definida, e sem ela não há cache onde provar o limite de tentativas.",
        "Suba o ambiente e preencha o arquivo de ambiente:",
        "  bash infra/scripts/up.sh core",
        "  cp .env.example .env   # e complete os valores",
      ].join("\n"),
    );
  }
  if (url === process.env.REDIS_URL?.trim()) {
    throw new Error(
      [
        "REDIS_URL_TEST aponta para o mesmo cache da aplicação.",
        "A suíte apaga chaves; use outro índice ou outro servidor.",
      ].join("\n"),
    );
  }
  return url;
}

const cache: CacheDoLimiteAberto =
  await conectarNoCacheDoLimite(urlDoCacheDeTeste());

afterAll(async () => {
  await cache.encerrar();
});

/**
 * Prefixo sorteado por teste: várias árvores de trabalho desta máquina falam
 * com o mesmo servidor de cache, e balde compartilhado entre testes produziria
 * reprovação que não reproduz.
 */
let prefixo = "";
beforeEach(() => {
  prefixo = `sc:prova:${randomUUID()}`;
});

/**
 * Servidores abertos pelos cenários, fechados ao fim de cada teste.
 *
 * Existe porque `request(app)` abre um servidor efêmero NOVO a cada chamada, e
 * os testes daqui fazem centenas de tentativas de propósito: um limite de
 * tentativas só se prova estourando o limite. Centenas de portas efêmeras
 * abertas e devolvidas em segundos é o cenário em que uma conexão nova cai numa
 * porta que outro teste acabou de largar — e a resposta que volta é a do
 * servidor errado. Um servidor por cenário, reaproveitado, tira o problema da
 * mesa em vez de deixá-lo aparecer de vez em quando, sem reproduzir.
 */
const servidoresAbertos: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servidoresAbertos.splice(0).map(
      (servidor) =>
        new Promise<void>((pronto) => {
          servidor.closeAllConnections();
          servidor.close(() => pronto());
        }),
    ),
  );
});

// ---------------------------------------------------------------------------
// Cenário: uma rota de entrada com senha
// ---------------------------------------------------------------------------

/**
 * As credenciais do cenário nascem sorteadas, e não escritas no arquivo.
 * P-002 vale "nem em exemplo, nem em teste" — e a regra é mecânica de
 * propósito: senha escrita à mão em arquivo versionado é senha escrita à mão em
 * arquivo versionado, mesmo quando só um teste a usa.
 */
const SENHA_CORRETA = `correta-${randomUUID()}`;
const CONTA = "dono@padaria.exemplo";

/** Um chute qualquer, garantidamente diferente da senha correta. */
function chuteErrado(numero = 0): string {
  return `chute-${numero}-${randomUUID()}`;
}

/** Regra da conta: dez tentativas, e o castigo dobra a cada bloqueio novo. */
const REGRA_DA_CONTA = {
  limite: 10,
  janelaMs: 15 * 60_000,
  esperaBaseMs: 60_000,
  esperaMaximaMs: 60 * 60_000,
  fatorDeCrescimento: 2,
  identificar: (req: express.Request): string | undefined => {
    const conta = (req.body as { conta?: unknown } | undefined)?.conta;
    return typeof conta === "string" ? conta.trim().toLowerCase() : undefined;
  },
};

/** Regra da origem: volume por minuto, para o ataque distribuído entre contas. */
const REGRA_DA_ORIGEM = {
  limite: 25,
  janelaMs: 60_000,
  esperaBaseMs: 60_000,
  esperaMaximaMs: 30 * 60_000,
};

/**
 * Quantas requisições um endereço precisa disparar para levar a primeira
 * recusa: a que completa a cota ainda é atendida, e a seguinte é barrada.
 */
const ATE_BARRAR_A_ORIGEM = REGRA_DA_ORIGEM.limite + 1;

interface CenarioDeEntrada {
  /** O servidor onde a aplicação já está no ar, um por cenário. */
  readonly servidor: Server;
  /** Quantas vezes a senha chegou a ser conferida pelo domínio. */
  conferencias: () => number;
  /** Avisos de bloqueio novo emitidos, na ordem. */
  avisos: () => readonly AvisoDeBloqueio[];
  /** Move o relógio do limitador para frente. */
  avancar: (ms: number) => void;
}

interface AjustesDoCenario {
  readonly comConta?: boolean;
  readonly comOrigem?: boolean;
  readonly proxiesConfiaveis?: number;
  /**
   * Quantas tentativas a conta tolera antes do bloqueio.
   *
   * EXISTE PARA O TESTE DO TETO. Ele precisa de sete bloqueios seguidos, e com
   * o limite de dez isso são 77 requisições HTTP de verdade contra Redis de
   * verdade — o teste mais pesado do repositório, e o único que reprovou sob a
   * carga do portão em rodadas diferentes.
   *
   * O TETO NÃO DEPENDE DO LIMITE. Quanto a espera cresce e onde ela para vem de
   * `esperaBaseMs`, `fatorDeCrescimento` e `esperaMaximaMs`; o limite só decide
   * quantos chutes são precisos para chegar a cada bloqueio. Baixá-lo para três
   * tira 49 requisições que não provavam nada e mantém intacto o que se prova.
   */
  readonly limiteDaConta?: number;
}

/**
 * Uma aplicação com a rota de entrada montada como ela será de verdade: o
 * limitador antes, e o domínio depois, registrando o desfecho pela borda.
 */
function cenarioDeEntrada(ajustes: AjustesDoCenario = {}): CenarioDeEntrada {
  let relogio = Date.UTC(2026, 7, 18, 12, 0, 0);
  let conferencias = 0;
  const avisos: AvisoDeBloqueio[] = [];

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());

  const limitador = limitarTentativas({
    cache,
    prefixo,
    agora: () => relogio,
    aoBloquear: (aviso) => {
      avisos.push(aviso);
    },
    ...(ajustes.comConta === false
      ? {}
      : {
          porConta: {
            ...REGRA_DA_CONTA,
            ...(ajustes.limiteDaConta === undefined
              ? {}
              : { limite: ajustes.limiteDaConta }),
          },
        }),
    ...(ajustes.comOrigem === false ? {} : { porOrigem: REGRA_DA_ORIGEM }),
    ...(ajustes.proxiesConfiaveis === undefined
      ? {}
      : { proxiesConfiaveis: ajustes.proxiesConfiaveis }),
  });

  app.post("/v1/auth/login", limitador, async (req, res) => {
    const limite = limiteDaRequisicao(req);
    // O domínio: daqui para baixo, a senha é conferida de fato.
    conferencias += 1;
    const senha = (req.body as { senha?: unknown }).senha;

    if (senha !== SENHA_CORRETA) {
      await limite.registrarFalha();
      res.status(401).json({ erro: "credencial_invalida" });
      return;
    }
    await limite.registrarSucesso();
    res.json({ entrou: true });
  });

  // Escutar em `127.0.0.1`, e não no endereço curinga, é o que torna esta prova
  // reproduzível quando a suíte inteira roda junto (AC-042). Sem o endereço,
  // o Node escuta em `::` com pilha dupla; um servidor de OUTRO processo de
  // teste que pegue a mesma porta em `0.0.0.0` casa mais especificamente com o
  // `127.0.0.1` que o supertest chama, e a requisição chega ao servidor
  // errado — a falha aparece como um 404 num caminho que existe. O resto da
  // suíte já escuta assim.
  const servidor = app.listen(0, "127.0.0.1");
  servidoresAbertos.push(servidor);

  return {
    servidor,
    conferencias: () => conferencias,
    avisos: () => avisos,
    avancar: (ms) => {
      relogio += ms;
    },
  };
}

/** Manda uma tentativa de entrada, com o endereço que a borda informaria. */
function tentarEntrar(
  cenario: CenarioDeEntrada,
  corpo: Record<string, unknown>,
  enderecoInformado = "203.0.113.5",
) {
  return request(cenario.servidor)
    .post("/v1/auth/login")
    .set("X-Forwarded-For", enderecoInformado)
    .send(corpo);
}

// ---------------------------------------------------------------------------
// AC-119 — excesso de tentativas para a mesma conta
// ---------------------------------------------------------------------------

describe("limite de tentativas por conta", () => {
  it("@spec:AC-119 depois de dez falhas, a tentativa seguinte é barrada mesmo com a senha correta", async () => {
    const cenario = cenarioDeEntrada();

    for (let tentativa = 1; tentativa <= 10; tentativa += 1) {
      const resposta = await tentarEntrar(cenario, {
        conta: CONTA,
        senha: chuteErrado(tentativa),
      });
      expect(resposta.status).toBe(401);
    }

    const conferenciasAntes = cenario.conferencias();
    const comSenhaCerta = await tentarEntrar(cenario, {
      conta: CONTA,
      senha: SENHA_CORRETA,
    });

    expect(comSenhaCerta.status).toBe(429);
    expect(comSenhaCerta.body.erro).toBe("muitas_tentativas");
    expect(comSenhaCerta.body.escopo).toBe("conta");
    // A senha correta nem chegou a ser conferida: o portão fecha antes do
    // domínio, que é o que "mesmo com a senha correta" significa.
    expect(cenario.conferencias()).toBe(conferenciasAntes);
  });

  it("@spec:AC-119 a resposta informa o tempo de espera, em segundos e no cabeçalho de nova tentativa", async () => {
    const cenario = cenarioDeEntrada();

    for (let tentativa = 1; tentativa <= 10; tentativa += 1) {
      await tentarEntrar(cenario, { conta: CONTA, senha: chuteErrado() });
    }
    const barrada = await tentarEntrar(cenario, {
      conta: CONTA,
      senha: chuteErrado(),
    });

    expect(barrada.status).toBe(429);
    expect(barrada.body.esperaSegundos).toBe(60);
    expect(barrada.headers["retry-after"]).toBe("60");
    // A resposta fala de escopo, não de gente: nome de conta é dado pessoal e
    // não vai para o corpo nem para o cabeçalho (P-009).
    expect(JSON.stringify(barrada.body)).not.toContain(CONTA);
  });

  it("@spec:AC-119 o intervalo de espera cresce a cada bloqueio novo", async () => {
    const cenario = cenarioDeEntrada();
    const esperas: number[] = [];

    for (let rodada = 1; rodada <= 3; rodada += 1) {
      for (let tentativa = 1; tentativa <= 10; tentativa += 1) {
        await tentarEntrar(cenario, { conta: CONTA, senha: chuteErrado() });
      }
      const barrada = await tentarEntrar(cenario, {
        conta: CONTA,
        senha: chuteErrado(),
      });
      expect(barrada.status).toBe(429);
      esperas.push(barrada.body.esperaSegundos);

      // Passa o tempo do bloqueio: o atacante volta e leva um castigo MAIOR.
      cenario.avancar(barrada.body.esperaSegundos * 1000 + 1);
    }

    expect(esperas).toEqual([60, 120, 240]);
    expect(esperas[1]).toBeGreaterThan(esperas[0] as number);
    expect(esperas[2]).toBeGreaterThan(esperas[1] as number);
  });

  it(
    "@spec:AC-119 a espera não passa do teto configurado",
    async () => {
      // LIMITE BAIXO DE PROPÓSITO. O que se prova aqui é onde a espera PARA de
      // crescer, e isso não depende de quantos chutes levam a cada bloqueio.
      // Com o limite padrão eram 77 requisições HTTP de verdade — o suficiente
      // para este teste reprovar sob a carga do portão sem nada estar errado.
      const LIMITE_ENXUTO = 3;
      const cenario = cenarioDeEntrada({ limiteDaConta: LIMITE_ENXUTO });

      // Sete bloqueios: 60s dobrando chegaria a 3840s, e o teto é 3600s.
      let ultima = 0;
      for (let rodada = 1; rodada <= 7; rodada += 1) {
        for (let tentativa = 1; tentativa <= LIMITE_ENXUTO; tentativa += 1) {
          await tentarEntrar(cenario, { conta: CONTA, senha: chuteErrado() });
        }
        const barrada = await tentarEntrar(cenario, {
          conta: CONTA,
          senha: chuteErrado(),
        });
        ultima = barrada.body.esperaSegundos;
        cenario.avancar(ultima * 1000 + 1);
      }

      // Castigo que cresce sem teto vira banimento permanente de quem só errou
      // a senha muitas vezes.
      expect(ultima).toBe(3600);
    },
    ESPERA_DOS_PESADOS,
  );

  it(
    "@spec:AC-119 o dono da conta é avisado uma vez por bloqueio novo, e não a cada requisição barrada",
    async () => {
      const cenario = cenarioDeEntrada();

      for (let tentativa = 1; tentativa <= 10; tentativa += 1) {
        await tentarEntrar(cenario, { conta: CONTA, senha: chuteErrado() });
      }
      // Mais cinco tentativas já barradas: o dono não pode receber cinco e-mails.
      for (let tentativa = 1; tentativa <= 5; tentativa += 1) {
        await tentarEntrar(cenario, { conta: CONTA, senha: chuteErrado() });
      }

      const daConta = cenario.avisos().filter((a) => a.escopo === "conta");
      expect(daConta).toHaveLength(1);
      expect(daConta[0]).toMatchObject({
        identificador: CONTA,
        esperaMs: 60_000,
        bloqueiosSeguidos: 1,
      });
    },
    // O TERCEIRO PESADO DO ARQUIVO, e o que faltava. São 15 requisições HTTP de
    // verdade, cada uma conversando várias vezes com o Redis. Sozinho ele cabe
    // nos 30 segundos padrão; com a suíte inteira disputando o mesmo Redis, não
    // cabe — e reprovava o portão sem nada de errado no código.
    //
    // A correção de 19/08 deu espera própria a dois testes deste arquivo e
    // deixou este de fora. Ele reprovou de forma intermitente por dias, e virou
    // reprovação consistente quando a suíte cresceu com a vitrine e o carrinho.
    ESPERA_DOS_PESADOS,
  );

  it("@spec:AC-119 o bloqueio é da conta atacada, e não de quem só passava por ali", async () => {
    const cenario = cenarioDeEntrada();

    for (let tentativa = 1; tentativa <= 11; tentativa += 1) {
      await tentarEntrar(cenario, { conta: CONTA, senha: chuteErrado() });
    }

    // Outra conta, mesmo endereço, senha certa: entra normalmente.
    const vizinha = await tentarEntrar(cenario, {
      conta: "outra@padaria.exemplo",
      senha: SENHA_CORRETA,
    });

    expect(vizinha.status).toBe(200);
    expect(vizinha.body).toEqual({ entrou: true });
  });

  it("@spec:AC-119 entrada bem-sucedida zera as falhas antes de o limite estourar", async () => {
    const cenario = cenarioDeEntrada();

    for (let tentativa = 1; tentativa <= 9; tentativa += 1) {
      await tentarEntrar(cenario, { conta: CONTA, senha: chuteErrado() });
    }
    const acertou = await tentarEntrar(cenario, {
      conta: CONTA,
      senha: SENHA_CORRETA,
    });
    expect(acertou.status).toBe(200);

    // Quem errou nove vezes e acertou não pode ficar a uma falha do bloqueio.
    for (let tentativa = 1; tentativa <= 9; tentativa += 1) {
      const resposta = await tentarEntrar(cenario, {
        conta: CONTA,
        senha: chuteErrado(),
      });
      expect(resposta.status).toBe(401);
    }
  });
});

// ---------------------------------------------------------------------------
// AC-120 — limite por origem, com o endereço real
// ---------------------------------------------------------------------------

describe("limite de tentativas por origem", () => {
  it("@spec:AC-120 tentativas espalhadas entre muitas contas esbarram no limite da origem", async () => {
    const cenario = cenarioDeEntrada();
    const enderecoDoAtacante = "198.51.100.7";

    // Uma conta diferente por tentativa: nenhum balde de conta chega perto do
    // limite, e um limite que olhasse só a conta não veria nada de errado.
    const respostas = [];
    for (let numero = 1; numero <= ATE_BARRAR_A_ORIGEM; numero += 1) {
      respostas.push(
        await tentarEntrar(
          cenario,
          {
            conta: `vitima-${numero}@loja.exemplo`,
            senha: chuteErrado(numero),
          },
          enderecoDoAtacante,
        ),
      );
    }

    const dentroDaCota = respostas.slice(0, REGRA_DA_ORIGEM.limite);
    const ultima = respostas.at(-1);

    expect(dentroDaCota).toHaveLength(25);
    expect(dentroDaCota.every((r) => r.status === 401)).toBe(true);
    expect(ultima?.status).toBe(429);
    expect(ultima?.body.escopo).toBe("origem");
    expect(ultima?.body.esperaSegundos).toBeGreaterThan(0);
  });

  it("@spec:AC-120 o limite usa o endereço informado pela borda confiável, e não o da conexão", async () => {
    const cenario = cenarioDeEntrada();

    // Todas as requisições deste teste saem da MESMA conexão (o laço local do
    // supertest). Se o limite olhasse o endereço da conexão, o pedido seguinte
    // de QUALQUER cliente seria barrado junto.
    for (let numero = 1; numero <= ATE_BARRAR_A_ORIGEM; numero += 1) {
      await tentarEntrar(
        cenario,
        { conta: `vitima-${numero}@loja.exemplo`, senha: chuteErrado(numero) },
        "203.0.113.99",
      );
    }

    const outroCliente = await tentarEntrar(
      cenario,
      { conta: CONTA, senha: SENHA_CORRETA },
      "198.51.100.42",
    );

    // Atrás do roteador, o endereço da conexão é sempre o mesmo: um limite
    // ingênuo puniria este cliente pelo ataque do outro.
    expect(outroCliente.status).toBe(200);
    expect(outroCliente.body).toEqual({ entrou: true });
  });

  it("@spec:AC-120 endereço forjado por quem chama não abre balde novo", async () => {
    const cenario = cenarioDeEntrada();
    const atacante = "203.0.113.13";

    for (let numero = 1; numero <= ATE_BARRAR_A_ORIGEM; numero += 1) {
      await tentarEntrar(
        cenario,
        { conta: `vitima-${numero}@loja.exemplo`, senha: chuteErrado(numero) },
        atacante,
      );
    }

    // O atacante escreve um endereço falso no começo da lista; a borda
    // confiável acrescenta o de verdade DEPOIS, e é esse que vale.
    const comEnderecoForjado = await tentarEntrar(
      cenario,
      { conta: CONTA, senha: SENHA_CORRETA },
      `10.0.0.1, 8.8.8.8, ${atacante}`,
    );

    expect(comEnderecoForjado.status).toBe(429);
    expect(comEnderecoForjado.body.escopo).toBe("origem");
  });

  it("@spec:AC-120 sem borda confiável declarada, o cabeçalho de encaminhamento é ignorado", () => {
    const requisicaoFalsa = {
      socket: { remoteAddress: "::ffff:203.0.113.200" },
      headers: { "x-forwarded-for": "1.2.3.4" },
    } as unknown as express.Request;

    // Zero saltos confiáveis: a API atende direto e o cabeçalho é só um texto
    // que quem chama escreveu.
    expect(enderecoDoCliente(requisicaoFalsa, 0)).toBe("203.0.113.200");
    // Um salto: vale o último item, que foi a nossa borda quem escreveu.
    expect(enderecoDoCliente(requisicaoFalsa, 1)).toBe("1.2.3.4");
  });

  it("@spec:AC-120 com duas bordas confiáveis, vale o penúltimo item da lista", () => {
    const requisicaoFalsa = {
      socket: { remoteAddress: "10.0.0.9" },
      headers: { "x-forwarded-for": "9.9.9.9, 203.0.113.77, 10.0.0.8" },
    } as unknown as express.Request;

    expect(enderecoDoCliente(requisicaoFalsa, 2)).toBe("203.0.113.77");
    // Mais saltos declarados do que itens: cai para a conexão, em vez de
    // confiar no primeiro item, que é o que quem chama escreveu.
    expect(enderecoDoCliente(requisicaoFalsa, 5)).toBe("10.0.0.9");
  });

  it("@spec:AC-120 o bloqueio da origem também cresce a cada reincidência", async () => {
    const cenario = cenarioDeEntrada({ comConta: false });
    const atacante = "203.0.113.31";
    const esperas: number[] = [];

    for (let rodada = 1; rodada <= 2; rodada += 1) {
      let barrada;
      for (let numero = 1; numero <= ATE_BARRAR_A_ORIGEM; numero += 1) {
        barrada = await tentarEntrar(
          cenario,
          {
            conta: `vitima-${numero}@loja.exemplo`,
            senha: chuteErrado(numero),
          },
          atacante,
        );
      }
      expect(barrada?.status).toBe(429);
      esperas.push(barrada?.body.esperaSegundos);
      cenario.avancar((barrada?.body.esperaSegundos as number) * 1000 + 1);
    }

    expect(esperas).toEqual([60, 120]);
  });
});

// ---------------------------------------------------------------------------
// Prioridade entre os dois eixos
// ---------------------------------------------------------------------------

describe("prioridade entre conta e origem", () => {
  it(
    "@spec:AC-120 com os dois estourados, a resposta é a da conta",
    async () => {
      const cenario = cenarioDeEntrada();
      const atacante = "203.0.113.51";

      // Estoura a conta primeiro (11 tentativas na mesma conta)…
      for (let tentativa = 1; tentativa <= 11; tentativa += 1) {
        await tentarEntrar(
          cenario,
          { conta: CONTA, senha: chuteErrado() },
          atacante,
        );
      }
      // …e depois o volume da origem, que continuou contando.
      for (let numero = 1; numero <= ATE_BARRAR_A_ORIGEM; numero += 1) {
        await tentarEntrar(
          cenario,
          {
            conta: `vitima-${numero}@loja.exemplo`,
            senha: chuteErrado(numero),
          },
          atacante,
        );
      }

      const barrada = await tentarEntrar(
        cenario,
        { conta: CONTA, senha: SENHA_CORRETA },
        atacante,
      );

      expect(barrada.status).toBe(429);
      // A informação útil para o dono legítimo é que a CONTA dele está sob
      // ataque, e não que o endereço dele está cheio.
      expect(barrada.body.escopo).toBe("conta");
    },
    ESPERA_DOS_PESADOS,
  );

  it("@spec:AC-119 requisição sem conta nomeada ainda conta para a origem", async () => {
    const cenario = cenarioDeEntrada();
    const atacante = "203.0.113.61";

    // Corpo sem `conta`: o eixo da conta não tem em que se agarrar, e sem o
    // eixo da origem o atacante teria tentativas de graça.
    for (let numero = 1; numero < ATE_BARRAR_A_ORIGEM; numero += 1) {
      await tentarEntrar(cenario, { senha: chuteErrado(numero) }, atacante);
    }
    const barrada = await tentarEntrar(
      cenario,
      { senha: chuteErrado(ATE_BARRAR_A_ORIGEM) },
      atacante,
    );

    expect(barrada.status).toBe(429);
    expect(barrada.body.escopo).toBe("origem");
  });

  it("@spec:AC-119 rota montada sem o limitador recusa em vez de registrar no vazio", async () => {
    const app = express();
    app.use(express.json());
    let nomeDoErro = "";

    app.post("/v1/auth/login", (req, res) => {
      try {
        limiteDaRequisicao(req);
        res.json({ entrou: true });
      } catch (causa) {
        nomeDoErro = causa instanceof Error ? causa.name : "outro";
        res.status(500).json({ erro: "falha_interna" });
      }
    });

    const resposta = await request(app).post("/v1/auth/login").send({});

    // Esquecer o middleware não pode virar "rota de entrada sem limite
    // nenhum, e ninguém percebe".
    expect(resposta.status).toBe(500);
    expect(nomeDoErro).toBe("ErroSemLimitador");
  });
});
