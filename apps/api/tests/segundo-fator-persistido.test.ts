/**
 * Desafio do segundo fator depois da senha, contra PostgreSQL de verdade
 * (T-111): código por e-mail derivado no banco, tentativas contadas com o
 * desafio travado, canal recusado para quem tem aplicativo ativo e para a
 * administração.
 *
 * As regras são as dos casos de uso (`login`, `segundo-fator`); aqui a
 * porta é o banco, pela credencial que atende requisição.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  conectarNoBancoDoArquivo,
  criarAdministradorDaPlataforma,
} from "@simpleclick/testing";

import {
  abrirInstancia,
  comoVisitante,
  FRASE_DA_PROVA,
  type RepositoriosDaIdentidade,
} from "./apoio-da-identidade.ts";
import {
  codigoDiferente,
  criarSessaoDe,
  darSenha,
  desafioPorEmail,
  donaComSenha,
  sessoesDe,
} from "./apoio-do-segundo-fator.ts";
import { ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import { entrarComSenha } from "../src/modules/auth/login.usecase.ts";
import { TENTATIVAS_DO_DESAFIO } from "../src/modules/auth/segundo-fator.repo.ts";
import { confirmarSegundoFator } from "../src/modules/auth/segundo-fator.usecase.ts";
import { senhaConfere } from "../src/modules/auth/senha.ts";
import { decidirSegundoFatorObrigatorio } from "../src/modules/auth/totp.usecase.ts";

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

// ---------------------------------------------------------------------------
// Desafio por e-mail
// ---------------------------------------------------------------------------

describe("desafio do segundo fator no banco", () => {
  it(
    "@spec:AC-105 @spec:AC-106 @spec:AC-129 senha certa da dona abre o desafio sem sessão; o código certo cria a sessão numa instância e não serve de novo na outra",
    async () => {
      const dona = await donaComSenha(migrador);
      const codigosEnviados: string[] = [];

      const login = await comoVisitante(() =>
        entrarComSenha(
          { email: dona.email, senha: FRASE_DA_PROVA },
          {
            identidades: primeira.login,
            conferirSenha: senhaConfere,
            criarDesafioDeSegundoFator: async ({ identidadeId }) => {
              const desafio = await desafioPorEmail(primeira, identidadeId);
              codigosEnviados.push(desafio.codigo);
              return { desafioId: desafio.desafioId };
            },
            criarSessao: criarSessaoDe(primeira, "OWNER"),
          },
        ),
      );

      expect(login.status).toBe("DESAFIO_DE_SEGUNDO_FATOR");
      if (login.status !== "DESAFIO_DE_SEGUNDO_FATOR") return;
      expect(await sessoesDe(migrador, dona.id)).toEqual([]);
      const codigo = codigosEnviados[0] ?? "";
      const { rows: guardado } = await migrador.query<{ code_hash: string }>(
        `SELECT code_hash FROM app.verification_codes WHERE id = $1`,
        [login.desafioId],
      );
      expect(guardado[0]?.code_hash.startsWith("argon2id$")).toBe(true);
      expect(guardado[0]?.code_hash).not.toContain(codigo);

      const aceito = await comoVisitante(() =>
        confirmarSegundoFator(
          { desafioId: login.desafioId, codigo },
          {
            desafios: segunda.desafios,
            criarSessao: criarSessaoDe(segunda, "OWNER"),
          },
        ),
      );
      expect(aceito.status).toBe("SESSAO_CRIADA");
      expect(await sessoesDe(migrador, dona.id)).toEqual([
        { role_at_issue: "OWNER" },
      ]);

      const deNovo = await comoVisitante(() =>
        confirmarSegundoFator(
          { desafioId: login.desafioId, codigo },
          {
            desafios: primeira.desafios,
            criarSessao: criarSessaoDe(primeira, "OWNER"),
          },
        ),
      );
      expect(deNovo).toEqual({ status: "DESAFIO_INVALIDO" });
      expect(await sessoesDe(migrador, dona.id)).toHaveLength(1);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-107 @spec:AC-129 cinco erros, contados no banco entre instâncias, bloqueiam o desafio e invalidam o código",
    async () => {
      const dona = await donaComSenha(migrador);
      const { desafioId, codigo } = await desafioPorEmail(primeira, dona.id);
      const errado = codigoDiferente(codigo);
      const criarSessao = vi.fn(criarSessaoDe(primeira, "OWNER"));
      const confirmar = (
        repositorios: RepositoriosDaIdentidade,
        tentativa: string,
      ) =>
        comoVisitante(() =>
          confirmarSegundoFator(
            { desafioId, codigo: tentativa },
            { desafios: repositorios.desafios, criarSessao },
          ),
        );

      for (
        let tentativa = 1;
        tentativa < TENTATIVAS_DO_DESAFIO;
        tentativa += 1
      ) {
        const instancia = tentativa % 2 === 0 ? segunda : primeira;
        expect(await confirmar(instancia, errado)).toEqual({
          status: "CODIGO_INCORRETO",
          tentativasRestantes: TENTATIVAS_DO_DESAFIO - tentativa,
        });
      }
      expect(await confirmar(segunda, errado)).toEqual({
        status: "BLOQUEADO",
        mensagem: "A tentativa foi bloqueada. Comece o login de novo.",
      });
      expect(await confirmar(primeira, codigo)).toEqual({
        status: "DESAFIO_INVALIDO",
      });
      expect(criarSessao).not.toHaveBeenCalled();

      const { rows } = await migrador.query<{
        attempt_count: number;
        consumido: boolean;
      }>(
        `SELECT attempt_count, consumed_at IS NOT NULL AS consumido
           FROM app.verification_codes WHERE id = $1`,
        [desafioId],
      );
      expect(rows).toEqual([
        { attempt_count: TENTATIVAS_DO_DESAFIO, consumido: true },
      ]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-122 a administração sem aplicativo não recebe desafio por e-mail, nem perguntando direto ao banco",
    async () => {
      const administracao = await criarAdministradorDaPlataforma();
      await darSenha(migrador, administracao.id);

      const lida = await comoVisitante(() =>
        primeira.login.buscarPorEmail(administracao.email),
      );
      expect(lida).toMatchObject({
        papel: "ADMINISTRADOR",
        aplicativoAtivo: false,
      });
      expect(
        decidirSegundoFatorObrigatorio(
          "ADMINISTRADOR",
          lida?.aplicativoAtivo ?? true,
        ),
      ).toEqual({
        status: "CONFIGURACAO_OBRIGATORIA",
        caminho: "/minha-conta/seguranca/aplicativo",
      });

      await expect(
        desafioPorEmail(primeira, administracao.id),
      ).rejects.toThrow();
      const { rows } = await migrador.query(
        `SELECT 1 FROM app.verification_codes
          WHERE identity_id = $1 AND purpose = 'LOGIN_OTP'`,
        [administracao.id],
      );
      expect(rows).toHaveLength(0);
    },
    ESPERA_LONGA,
  );
});
