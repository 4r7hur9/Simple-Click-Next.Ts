/**
 * Sessão persistida: rotação com detecção de reuso, cliente nativo, saída e
 * encerrar todas, contra PostgreSQL de verdade (T-111).
 *
 * As regras são as de `sessao.usecase.ts` e `logout.usecase.ts`; aqui a porta
 * é o banco. Criar e renovar rodam como visitante (antes de haver identidade
 * no contexto); sair e encerrar todas rodam como a pessoa logada, e o banco
 * só deixa cada um derrubar o que é seu.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  conectarNoBancoDoArquivo,
  criarIdentidade,
  criarLoja,
} from "@simpleclick/testing";

import {
  abrirInstancia,
  ASSINATURA_DA_PROVA,
  comoPessoa,
  comoVisitante,
  dependenciasDaSessao,
  type RepositoriosDaIdentidade,
} from "./apoio-da-identidade.ts";
import { ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import { ErroDeRecursoNaoEncontrado } from "../src/core/db.ts";
import {
  encerrarSessaoAtual,
  encerrarTodasAsSessoes,
} from "../src/modules/auth/logout.usecase.ts";
import {
  iniciarSessao,
  renovarSessao,
  type ClienteDaSessao,
  type SessaoEntregue,
} from "../src/modules/auth/sessao.usecase.ts";
import {
  resumirTokenDeRenovacao,
  verificarTokenDeAcesso,
  type PapelDaSessao,
} from "../src/modules/auth/token.ts";

let migrador: pg.Client;
let primeira: RepositoriosDaIdentidade;
let segunda: RepositoriosDaIdentidade;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  primeira = abrirInstancia();
  segunda = abrirInstancia();
}, ESPERA_LONGA);

afterAll(async () => {
  await primeira?.acesso.encerrar();
  await segunda?.acesso.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

function abrirSessao(
  repositorios: RepositoriosDaIdentidade,
  identidadeId: string,
  papel: PapelDaSessao = "CUSTOMER",
  cliente: ClienteDaSessao = "navegador",
): Promise<SessaoEntregue> {
  return comoVisitante(() =>
    iniciarSessao(
      { identidadeId, papel, cliente },
      dependenciasDaSessao(repositorios),
    ),
  );
}

function renovar(
  repositorios: RepositoriosDaIdentidade,
  token: string,
  avisar = vi.fn(async () => undefined),
) {
  return comoVisitante(() =>
    renovarSessao(token, dependenciasDaSessao(repositorios, avisar)),
  );
}

function sessaoDoToken(sessao: SessaoEntregue) {
  return verificarTokenDeAcesso(sessao.tokenDeAcesso, ASSINATURA_DA_PROVA);
}

describe("rotação do token de renovação no banco", () => {
  it(
    "@spec:AC-110 @spec:AC-129 a renovação troca o par numa instância, a outra detecta o reuso do token anterior, a família inteira cai e o aviso sai uma vez",
    async () => {
      const pessoa = await criarIdentidade();
      const avisar = vi.fn(async () => undefined);

      const inicial = await abrirSessao(primeira, pessoa.id);

      // Só o resumo do token mora no banco.
      const { rows: gravadas } = await migrador.query<{
        token_sha256: string;
        role_at_issue: string;
        client_kind: string;
      }>(
        `SELECT token_sha256, role_at_issue, client_kind FROM app.sessions
          WHERE identity_id = $1`,
        [pessoa.id],
      );
      expect(gravadas).toEqual([
        {
          token_sha256: resumirTokenDeRenovacao(inicial.tokenDeRenovacao),
          role_at_issue: "CUSTOMER",
          client_kind: "WEB",
        },
      ]);

      const renovada = await renovar(segunda, inicial.tokenDeRenovacao, avisar);
      expect(renovada.estado).toBe("renovada");
      if (renovada.estado !== "renovada") return;
      expect(renovada.sessao.tokenDeRenovacao).not.toBe(
        inicial.tokenDeRenovacao,
      );
      expect(sessaoDoToken(renovada.sessao)).toMatchObject({
        identidadeId: pessoa.id,
        papel: "CUSTOMER",
        familiaId: sessaoDoToken(inicial).familiaId,
      });

      // O token anterior, de novo, pela outra instância: cópia detectada.
      expect(await renovar(primeira, inicial.tokenDeRenovacao, avisar)).toEqual(
        { estado: "reuso_detectado" },
      );
      expect(avisar).toHaveBeenCalledTimes(1);
      expect(avisar).toHaveBeenCalledWith({
        identidadeId: pessoa.id,
        familiaId: sessaoDoToken(inicial).familiaId,
      });

      // A família caiu inteira: nem o token mais novo renova.
      expect(
        await renovar(segunda, renovada.sessao.tokenDeRenovacao, avisar),
      ).toEqual({ estado: "recusada" });

      // Repetir o token roubado não vira um e-mail por repetição.
      expect(await renovar(segunda, inicial.tokenDeRenovacao, avisar)).toEqual({
        estado: "reuso_detectado",
      });
      expect(avisar).toHaveBeenCalledTimes(1);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-111 cliente nativo recebe o par no corpo, e a mesma rotação persistida vale para ele",
    async () => {
      const pessoa = await criarIdentidade();

      const inicial = await abrirSessao(
        primeira,
        pessoa.id,
        "CUSTOMER",
        "nativo",
      );
      const renovada = await renovar(segunda, inicial.tokenDeRenovacao);

      expect(inicial.destino).toBe("nativo");
      expect(renovada).toMatchObject({
        estado: "renovada",
        sessao: { destino: "nativo" },
      });
      const { rows } = await migrador.query<{ client_kind: string }>(
        `SELECT DISTINCT client_kind FROM app.sessions WHERE identity_id = $1`,
        [pessoa.id],
      );
      expect(rows).toEqual([{ client_kind: "NATIVE" }]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-117 o banco não grava sessão com papel acima do papel real da identidade",
    async () => {
      const cliente = await criarIdentidade();

      for (const papel of ["OWNER", "ADMIN"] as const) {
        await expect(
          abrirSessao(primeira, cliente.id, papel),
        ).rejects.toThrow();
      }
      const { rows } = await migrador.query(
        `SELECT 1 FROM app.sessions WHERE identity_id = $1`,
        [cliente.id],
      );
      expect(rows).toHaveLength(0);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-116 dono que perde o vínculo com a loja não renova o token de dono",
    async () => {
      const loja = await criarLoja();
      const sessao = await abrirSessao(primeira, loja.dono.id, "OWNER");

      await migrador.query(
        `UPDATE app.store_members SET revoked_at = now()
          WHERE store_id = $1 AND identity_id = $2`,
        [loja.id, loja.dono.id],
      );

      expect(await renovar(segunda, sessao.tokenDeRenovacao)).toEqual({
        estado: "recusada",
      });
      const { rows } = await migrador.query<{ revoked_reason: string }>(
        `SELECT revoked_reason FROM app.sessions WHERE identity_id = $1`,
        [loja.dono.id],
      );
      expect(rows).toEqual([{ revoked_reason: "ROLE_CHANGED" }]);
    },
    ESPERA_LONGA,
  );
});

describe("encerrar sessões no banco", () => {
  it(
    "@spec:AC-112 @spec:AC-129 sair por uma instância derruba a sessão do aparelho no servidor, e o token de renovação anterior não devolve acesso na outra",
    async () => {
      const pessoa = await criarIdentidade();
      const intrusa = await criarIdentidade();
      const inicial = await abrirSessao(primeira, pessoa.id);
      const renovada = await renovar(primeira, inicial.tokenDeRenovacao);
      if (renovada.estado !== "renovada") throw new Error("não renovou");
      const sessaoAtual = sessaoDoToken(renovada.sessao).sessaoId;

      // Outra pessoa não derruba a sessão de ninguém, nem sabendo o id.
      await expect(
        comoPessoa(intrusa.id, "CUSTOMER", () =>
          encerrarSessaoAtual(sessaoAtual, segunda.sessoes),
        ),
      ).rejects.toBeInstanceOf(ErroDeRecursoNaoEncontrado);

      await comoPessoa(pessoa.id, "CUSTOMER", () =>
        encerrarSessaoAtual(sessaoAtual, segunda.sessoes),
      );
      expect(await renovar(primeira, renovada.sessao.tokenDeRenovacao)).toEqual(
        { estado: "recusada" },
      );
      // Sair de novo não é erro.
      await comoPessoa(pessoa.id, "CUSTOMER", () =>
        encerrarSessaoAtual(sessaoAtual, primeira.sessoes),
      );

      // Saída só com o cookie na mão: o token de renovação basta.
      const outroAparelho = await abrirSessao(primeira, pessoa.id);
      expect(
        await comoVisitante(() =>
          segunda.sessoes.encerrarPeloToken(
            resumirTokenDeRenovacao(outroAparelho.tokenDeRenovacao),
            new Date(),
          ),
        ),
      ).toBe(true);
      expect(await renovar(primeira, outroAparelho.tokenDeRenovacao)).toEqual({
        estado: "recusada",
      });
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-113 encerrar todas derruba os outros aparelhos na próxima renovação, e só da própria conta",
    async () => {
      const pessoa = await criarIdentidade();
      const vizinha = await criarIdentidade();
      const celular = await abrirSessao(primeira, pessoa.id);
      const computador = await abrirSessao(segunda, pessoa.id);
      const daVizinha = await abrirSessao(primeira, vizinha.id);

      await expect(
        comoPessoa(vizinha.id, "CUSTOMER", () =>
          encerrarTodasAsSessoes(pessoa.id, primeira.sessoes),
        ),
      ).rejects.toBeInstanceOf(ErroDeRecursoNaoEncontrado);

      await comoPessoa(pessoa.id, "CUSTOMER", () =>
        encerrarTodasAsSessoes(pessoa.id, primeira.sessoes),
      );

      for (const aparelho of [celular, computador]) {
        expect(await renovar(segunda, aparelho.tokenDeRenovacao)).toEqual({
          estado: "recusada",
        });
      }
      expect((await renovar(segunda, daVizinha.tokenDeRenovacao)).estado).toBe(
        "renovada",
      );
    },
    ESPERA_LONGA,
  );
});
