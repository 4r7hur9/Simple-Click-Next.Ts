/**
 * O que a credencial das lojas NÃO alcança nas tabelas de acesso, contra
 * PostgreSQL de verdade (T-111, AC-131): sessão, segredo do aplicativo e
 * códigos de recuperação de outra pessoa, e código de uso único de ninguém.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  conectarNoBancoDoArquivo,
  criarIdentidade,
  criarLoja,
  sufixoDeTeste,
} from "@simpleclick/testing";

import {
  abrirInstancia,
  comoVisitante,
  dependenciasDaSessao,
  type RepositoriosDaIdentidade,
} from "./apoio-da-identidade.ts";
import { ativarAplicativo, darSenha } from "./apoio-do-segundo-fator.ts";
import {
  codigoDoPostgres,
  comoRequisicao,
  ESPERA_LONGA,
  RECUSA_DE_PERMISSAO,
} from "./apoio-de-isolamento.ts";
import type { DadosDoContexto } from "../src/core/contexto.ts";
import { iniciarSessao } from "../src/modules/auth/sessao.usecase.ts";
import { resumirTokenDeRenovacao } from "../src/modules/auth/token.ts";

let migrador: pg.Client;
let primeira: RepositoriosDaIdentidade;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  primeira = abrirInstancia();
}, ESPERA_LONGA);

afterAll(async () => {
  await primeira?.acesso.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

// ---------------------------------------------------------------------------
// O que a credencial das lojas não alcança (AC-131)
// ---------------------------------------------------------------------------

describe("dado de acesso fora do alcance da credencial das lojas", () => {
  async function recusa(
    dados: DadosDoContexto,
    consulta: string,
  ): Promise<string | undefined> {
    try {
      await comoRequisicao(primeira.acesso, dados, (tx) =>
        tx.$queryRawUnsafe(consulta),
      );
      return undefined;
    } catch (erro) {
      return codigoDoPostgres(erro);
    }
  }

  function contar(
    dados: DadosDoContexto,
    tabela: string,
    identidadeId: string,
  ) {
    return comoRequisicao(primeira.acesso, dados, async (tx) => {
      const linhas = await tx.$queryRawUnsafe<{ quantidade: number }[]>(
        `SELECT count(*)::int AS quantidade FROM app.${tabela} WHERE identity_id = $1::uuid`,
        identidadeId,
      );
      return linhas[0]?.quantidade ?? -1;
    });
  }

  it(
    "@spec:AC-131 a dona de uma loja não lê sessão, segredo nem código de recuperação do cliente, e ninguém lê código de uso único — nem o próprio",
    async () => {
      const loja = await criarLoja();
      const cliente = await criarIdentidade({
        email: `cliente-${sufixoDeTeste()}@exemplo.test`,
      });
      await darSenha(migrador, cliente.id);
      await comoVisitante(() =>
        iniciarSessao(
          { identidadeId: cliente.id, papel: "CUSTOMER", cliente: "navegador" },
          dependenciasDaSessao(primeira),
        ),
      );
      await ativarAplicativo(primeira, cliente.id, "CUSTOMER");
      await comoVisitante(() =>
        primeira.recuperacao.criarPedido({
          identidadeId: cliente.id,
          resumoDoToken: resumirTokenDeRenovacao(sufixoDeTeste()),
          expiraEm: new Date(Date.now() + 60_000),
        }),
      );

      const daDona: DadosDoContexto = {
        lojaId: loja.id,
        usuarioId: loja.dono.id,
        papel: "OWNER",
      };
      const doCliente: DadosDoContexto = {
        usuarioId: cliente.id,
        papel: "CUSTOMER",
      };

      // A dona da loja: zero linhas do cliente, em toda tabela de acesso.
      for (const tabela of ["sessions", "totp_credentials", "recovery_codes"]) {
        expect(await contar(daDona, tabela, cliente.id)).toBe(0);
      }
      // O próprio cliente enxerga o que é dele...
      expect(await contar(doCliente, "sessions", cliente.id)).toBe(1);
      expect(await contar(doCliente, "totp_credentials", cliente.id)).toBe(1);
      // ...mas código de uso único não é lido por ninguém pela credencial
      // das lojas: a tabela nem tem privilégio para ela.
      for (const dados of [daDona, doCliente]) {
        expect(
          await recusa(dados, `SELECT 1 FROM app.verification_codes LIMIT 1`),
        ).toBe(RECUSA_DE_PERMISSAO);
      }

      // Criar sessão ou trocar segredo direto na tabela, nem a própria pessoa.
      expect(
        await recusa(
          doCliente,
          `INSERT INTO app.sessions (id, identity_id, family_id, token_sha256,
                                     role_at_issue, client_kind, expires_at)
           VALUES (gen_random_uuid(), '${cliente.id}', gen_random_uuid(),
                   repeat('a', 64), 'ADMIN', 'WEB', now() + interval '1 day')`,
        ),
      ).toBe(RECUSA_DE_PERMISSAO);
      expect(
        await recusa(
          doCliente,
          `UPDATE app.totp_credentials SET secret_enc = 'v1.trocado'
            WHERE identity_id = '${cliente.id}'`,
        ),
      ).toBe(RECUSA_DE_PERMISSAO);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-131 os passos antes da sessão só recebem a lista fechada de campos de cada passo",
    async () => {
      const cliente = await criarIdentidade();
      await darSenha(migrador, cliente.id);

      const linhas = await comoRequisicao(
        primeira.acesso,
        {},
        (tx) =>
          tx.$queryRaw<Record<string, unknown>[]>`
          SELECT * FROM app.auth_identidade_para_login(${cliente.email})`,
      );
      expect(Object.keys(linhas[0] ?? {}).sort()).toEqual([
        "email_verificado",
        "endereco",
        "identidade_id",
        "nome",
        "papel",
        "senha_hash",
        "totp_ativo",
      ]);

      const recuperacao = await comoRequisicao(
        primeira.acesso,
        {},
        (tx) =>
          tx.$queryRaw<Record<string, unknown>[]>`
          SELECT * FROM app.auth_identidade_para_recuperacao(${cliente.email})`,
      );
      expect(Object.keys(recuperacao[0] ?? {}).sort()).toEqual([
        "endereco",
        "identidade_id",
      ]);

      // Toda função dos passos de acesso roda com caminho de busca fixo, é do
      // migrador e não é executável por quem não atende requisição.
      const { rows } = await migrador.query<{
        nome: string;
        caminho_fixo: boolean;
        do_migrador: boolean;
        publica: boolean;
      }>(
        `SELECT p.proname AS nome,
                EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c
                         WHERE c LIKE 'search_path=%') AS caminho_fixo,
                pg_get_userbyid(p.proowner) = 'sc_migrator' AS do_migrador,
                has_function_privilege('public', p.oid, 'EXECUTE') AS publica
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'app' AND p.proname LIKE 'auth\\_%' AND p.prosecdef`,
      );
      expect(rows.length).toBeGreaterThanOrEqual(15);
      for (const funcao of rows) {
        expect(funcao, funcao.nome).toMatchObject({
          caminho_fixo: true,
          do_migrador: true,
          publica: false,
        });
      }
    },
    ESPERA_LONGA,
  );
});
