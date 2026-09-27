/**
 * Apoio comum às provas do catálogo que passam pelas rotas de verdade
 * (T-304, T-305, T-306, T-309).
 *
 * POR QUE AS ROTAS DO DONO SÃO MONTADAS AQUI, e não por `criarApp`. As rotas
 * do painel leem o banco pelo acesso padrão do ambiente, e a prova precisa do
 * banco DESCARTÁVEL deste arquivo. O construtor de cada rota aceita o acesso e
 * o autenticador por parâmetro — é por eles que a prova entra, com o mesmo
 * Express, o mesmo JSON e o mesmo tratador de erros do servidor no ar.
 *
 * O AUTENTICADOR DE PROVA devolve sempre um dono. Não é atalho da segurança:
 * a autenticação por token tem prova própria na identidade; aqui o que se prova
 * é o que o dono consegue fazer DEPOIS de autenticado.
 */
import express, { type Express, type Router } from "express";
import type pg from "pg";
import request from "supertest";

import type { LojaDeTeste } from "@simpleclick/testing";

import { manipuladorDeErros } from "../src/core/erros.ts";
import {
  definirRegistrador,
  type DadosDeRegistro,
  type Registrador,
} from "../src/core/log.ts";
import { COOKIE_DA_SESSAO } from "../src/core/sessao-do-carrinho.ts";

/**
 * A origem autorizada destas provas.
 *
 * Método que muda estado exige origem confiável (AC-126, AC-128): o navegador
 * manda o cabeçalho sozinho, o supertest não — por isso ele vai à mão.
 */
export const ORIGEM = "https://app.exemplo.test";

/** Um dono autenticado, do jeito que as rotas do painel o recebem. */
export interface DonoDeTeste {
  readonly identidadeId: string;
  readonly papel: "OWNER";
}

/** Monta um Express só com as rotas do dono passadas, como `app.ts` monta. */
export function appDoDono(...rotas: readonly Router[]): Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  for (const rota of rotas) app.use("/v1/lojas", rota);
  app.use((_req, res) => {
    res.status(404).json({ erro: "nao_encontrado" });
  });
  app.use(manipuladorDeErros());
  return app;
}

/**
 * Deixa a loja PODER VENDER: formas de entrega, pagamento e horário aberto.
 *
 * Sem configuração de entrega ela não aceita pedido, e sem horário ela está
 * fechada — as duas recusas são o comportamento certo, e o que faltava era o
 * cenário. O que se prova com isto é o preço, e não o fechamento.
 */
export async function lojaQueVende(
  migrador: pg.Client,
  loja: LojaDeTeste,
): Promise<void> {
  await migrador.query(
    `INSERT INTO app.store_settings (store_id, delivery, payment, whatsapp)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (store_id) DO UPDATE
       SET delivery = EXCLUDED.delivery, payment = EXCLUDED.payment,
           whatsapp = EXCLUDED.whatsapp`,
    [
      loja.id,
      JSON.stringify({ taxaPadraoCents: 700, retiradaNoLocal: true }),
      JSON.stringify({ formas: ["PIX", "CASH"] }),
      JSON.stringify({ numero: "+5511911112222", saudacao: "Olá!" }),
    ],
  );
  for (let dia = 0; dia <= 6; dia += 1) {
    await migrador.query(
      `INSERT INTO app.store_hours (store_id, weekday, opens_at, closes_at)
       VALUES ($1, $2, '00:00', '23:59')
       ON CONFLICT DO NOTHING`,
      [loja.id, dia],
    );
  }
}

/** Tira o token da sessão do carrinho do cookie que a API emitiu. */
export function tokenDe(resposta: request.Response): string {
  const cabecalho = resposta.headers["set-cookie"];
  const cookies = Array.isArray(cabecalho) ? cabecalho : [cabecalho ?? ""];
  const nosso = cookies.find((c) => c.startsWith(`${COOKIE_DA_SESSAO}=`));
  const valor = nosso?.split(";")[0]?.split("=")[1];
  if (valor === undefined || valor === "") {
    throw new Error("a API não emitiu o cookie da sessão do carrinho");
  }
  return valor;
}

/** Uma sessão de visitante na vitrine de uma loja, com o cookie guardado. */
export class Visitante {
  private token: string | undefined;
  private readonly app: Express;
  private readonly apelido: string;

  constructor(app: Express, apelido: string) {
    this.app = app;
    this.apelido = apelido;
  }

  private comSessao(pedido: request.Test): request.Test {
    const comOrigem = pedido.set("Origin", ORIGEM);
    return this.token === undefined
      ? comOrigem
      : comOrigem.set("Cookie", `${COOKIE_DA_SESSAO}=${this.token}`);
  }

  /**
   * Guarda a sessão emitida na primeira resposta que a trouxer.
   *
   * Resposta recusada na borda (400) não chega a abrir sessão, e isso não é
   * falha da prova — é a borda recusando antes de gastar trabalho.
   */
  private guardar(resposta: request.Response): request.Response {
    if (this.token === undefined && resposta.headers["set-cookie"]) {
      this.token = tokenDe(resposta);
    }
    return resposta;
  }

  async acrescentar(corpo: Record<string, unknown>) {
    return this.guardar(
      await this.comSessao(
        request(this.app).post(`/v1/vitrine/${this.apelido}/carrinho/itens`),
      ).send(corpo),
    );
  }

  async conferir(corpo: Record<string, unknown> = {}) {
    return this.guardar(
      await this.comSessao(
        request(this.app).post(
          `/v1/vitrine/${this.apelido}/carrinho/conferencia`,
        ),
      ).send(corpo),
    );
  }

  async fechar(corpo: Record<string, unknown> = {}) {
    return this.guardar(
      await this.comSessao(
        request(this.app).post(`/v1/vitrine/${this.apelido}/pedidos`),
      ).send({
        contato: { nome: "Ana Paula", telefone: "11988887777" },
        entrega: "PICKUP",
        chaveDeIdempotencia: `chave-${Math.random().toString(36).slice(2)}-teste`,
        ...corpo,
      }),
    );
  }
}

/** Uma linha de registro capturada durante a prova. */
export interface LinhaRegistrada {
  readonly nivel: "depuracao" | "info" | "aviso" | "erro" | "fatal";
  readonly evento: string;
  readonly dados: DadosDeRegistro | undefined;
}

/**
 * Troca o registrador da aplicação por um que GUARDA as linhas.
 *
 * É assim que a prova confere que a tentativa ficou no registro de segurança
 * (AC-312), sem ler a saída do processo. Devolve a lista e a função que
 * devolve o registrador original.
 */
export function capturarRegistro(): {
  readonly linhas: LinhaRegistrada[];
  readonly devolver: () => void;
} {
  const linhas: LinhaRegistrada[] = [];
  const guardar =
    (nivel: LinhaRegistrada["nivel"]) =>
    (evento: string, dados?: DadosDeRegistro) => {
      linhas.push({ nivel, evento, dados });
    };
  const capturador: Registrador = {
    depuracao: guardar("depuracao"),
    info: guardar("info"),
    aviso: guardar("aviso"),
    erro: guardar("erro"),
    fatal: guardar("fatal"),
  };
  definirRegistrador(capturador);
  return { linhas, devolver: () => definirRegistrador(undefined) };
}
