/**
 * Recuperação de senha e convite do dono contra PostgreSQL de verdade
 * (T-111).
 *
 * Mesma montagem de `identidade-persistida.test.ts`: repositórios de banco
 * pela credencial que atende requisição (`sc_app`), cada passo num contexto
 * de requisição, e duas "instâncias" sobre o mesmo banco (AC-129). O reenvio
 * do convite é ato da administração e usa a credencial dela.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  conectarNoBancoDoArquivo,
  criarAdministradorDaPlataforma,
  criarLoja,
} from "@simpleclick/testing";

import { abrirAcessoDaAdministracao } from "./apoio-da-administracao.ts";
import {
  contaVerificada,
  emailNovo,
  entrar,
  identidadeNoBanco,
  validarNovaSenha,
} from "./apoio-da-conta.ts";
import {
  abrirInstancia,
  comoPessoa,
  comoVisitante,
  dependenciasDaSessao,
  FRASE_DA_PROVA,
  OUTRA_FRASE_DA_PROVA,
  type RepositoriosDaIdentidade,
} from "./apoio-da-identidade.ts";
import { ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import { executarComoRequisicao } from "../src/core/contexto.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import {
  definirPrimeiraSenha,
  gerarTokenDeConvite,
  PRAZO_DO_CONVITE_EM_MS,
  reenviarConviteDoDono,
  resumirTokenDeConvite,
} from "../src/modules/auth/convite.usecase.ts";
import { repositorioDoConviteNoBanco } from "../src/modules/auth/identidade.repo.ts";
import {
  CONFIRMACAO_DE_RECUPERACAO,
  definirNovaSenha,
  gerarTokenDeRecuperacao,
  pedirRecuperacaoDeSenha,
  resumirTokenDeRecuperacao,
  type DependenciasDeRecuperacaoDeSenha,
} from "../src/modules/auth/recuperar-senha.usecase.ts";
import { derivarSenha } from "../src/modules/auth/senha.ts";
import {
  iniciarSessao,
  renovarSessao,
} from "../src/modules/auth/sessao.usecase.ts";

let migrador: pg.Client;
let primeira: RepositoriosDaIdentidade;
let segunda: RepositoriosDaIdentidade;
let acessoDaAdministracao: AcessoAoBanco;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  primeira = abrirInstancia();
  segunda = abrirInstancia();
  acessoDaAdministracao = abrirAcessoDaAdministracao();
}, ESPERA_LONGA);

afterAll(async () => {
  await primeira?.acesso.encerrar();
  await segunda?.acesso.encerrar();
  await acessoDaAdministracao?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

// ---------------------------------------------------------------------------
// Recuperação de senha
// ---------------------------------------------------------------------------

describe("recuperação de senha gravada no banco", () => {
  function dependenciasDaRecuperacao(repositorios: RepositoriosDaIdentidade) {
    const links: string[] = [];
    const dependencias: DependenciasDeRecuperacaoDeSenha = {
      repositorio: repositorios.recuperacao,
      enviarLinkDeRecuperacao: vi.fn(async ({ token }: { token: string }) => {
        links.push(token);
      }),
      validarNovaSenha,
      gerarHashDaSenha: derivarSenha,
      agora: () => new Date(),
      gerarToken: gerarTokenDeRecuperacao,
      resumirToken: resumirTokenDeRecuperacao,
    };
    return { links, dependencias };
  }

  async function pedidosDeRecuperacao(identidadeId: string) {
    const { rows } = await migrador.query<{
      code_hash: string;
      consumido: boolean;
    }>(
      `SELECT code_hash, consumed_at IS NOT NULL AS consumido
         FROM app.verification_codes
        WHERE identity_id = $1 AND purpose = 'PASSWORD_RESET'
        ORDER BY created_at`,
      [identidadeId],
    );
    return rows;
  }

  it(
    "@spec:AC-114 a confirmação é a mesma com e sem conta, e só a conta existente ganha link — guardado como resumo",
    async () => {
      const conta = await contaVerificada(primeira);
      const comConta = dependenciasDaRecuperacao(primeira);
      const semConta = dependenciasDaRecuperacao(segunda);

      const respostaComConta = await comoVisitante(() =>
        pedirRecuperacaoDeSenha(conta.email, comConta.dependencias),
      );
      const respostaSemConta = await comoVisitante(() =>
        pedirRecuperacaoDeSenha(emailNovo(), semConta.dependencias),
      );

      expect(respostaComConta).toEqual({
        confirmacao: CONFIRMACAO_DE_RECUPERACAO,
      });
      expect(respostaSemConta).toEqual(respostaComConta);
      expect(comConta.links).toHaveLength(1);
      expect(semConta.links).toHaveLength(0);

      const pedidos = await pedidosDeRecuperacao(conta.id);
      expect(pedidos).toEqual([
        {
          code_hash: resumirTokenDeRecuperacao(comConta.links[0] ?? ""),
          consumido: false,
        },
      ]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-115 @spec:AC-129 a senha nova vale, o link não serve de novo, o pedido anterior morre e toda sessão antiga cai — em qualquer instância",
    async () => {
      const conta = await contaVerificada(primeira);
      const sessoes = dependenciasDaSessao(primeira);
      const aparelhoA = await comoVisitante(() =>
        iniciarSessao(
          { identidadeId: conta.id, papel: "CUSTOMER", cliente: "navegador" },
          sessoes,
        ),
      );
      const aparelhoB = await comoVisitante(() =>
        iniciarSessao(
          { identidadeId: conta.id, papel: "CUSTOMER", cliente: "nativo" },
          sessoes,
        ),
      );

      const recuperacao = dependenciasDaRecuperacao(primeira);
      await comoVisitante(() =>
        pedirRecuperacaoDeSenha(conta.email, recuperacao.dependencias),
      );
      await comoVisitante(() =>
        pedirRecuperacaoDeSenha(conta.email, recuperacao.dependencias),
      );
      const [linkAntigo, linkNovo] = recuperacao.links as [string, string];

      const naSegunda = dependenciasDaRecuperacao(segunda).dependencias;
      expect(
        await comoVisitante(() =>
          definirNovaSenha(
            { token: linkAntigo, senha: OUTRA_FRASE_DA_PROVA },
            naSegunda,
          ),
        ),
      ).toEqual({ ok: false, motivo: "LINK_INVALIDO" });
      expect(
        await comoVisitante(() =>
          definirNovaSenha(
            { token: linkNovo, senha: OUTRA_FRASE_DA_PROVA },
            naSegunda,
          ),
        ),
      ).toEqual({ ok: true });
      expect(
        await comoVisitante(() =>
          definirNovaSenha(
            { token: linkNovo, senha: OUTRA_FRASE_DA_PROVA },
            naSegunda,
          ),
        ),
      ).toEqual({ ok: false, motivo: "LINK_INVALIDO" });

      // As duas sessões de antes caem na próxima renovação.
      for (const aparelho of [aparelhoA, aparelhoB]) {
        expect(
          await comoVisitante(() =>
            renovarSessao(
              aparelho.tokenDeRenovacao,
              dependenciasDaSessao(segunda),
            ),
          ),
        ).toEqual({ estado: "recusada" });
      }

      expect(
        (await entrar(primeira, conta.email, FRASE_DA_PROVA)).resultado,
      ).toEqual({ status: "CREDENCIAIS_INVALIDAS" });
      expect(
        (await entrar(primeira, conta.email, OUTRA_FRASE_DA_PROVA)).resultado,
      ).toMatchObject({ status: "SESSAO_CRIADA" });
    },
    ESPERA_LONGA,
  );
});

// ---------------------------------------------------------------------------
// Convite do dono
// ---------------------------------------------------------------------------

describe("convite do dono gravado no banco", () => {
  it(
    "@spec:AC-103 @spec:AC-200 o convite reenviado troca o link, o aceite define a senha uma vez só, vira dono e fica na trilha",
    async () => {
      const loja = await criarLoja();
      const administracao = await criarAdministradorDaPlataforma();
      const email = emailNovo();
      const tokenOriginal = gerarTokenDeConvite();
      const {
        rows: [convidada],
      } = await migrador.query<{ id: string }>(
        `INSERT INTO app.identities (email_norm, display_name)
         VALUES ($1, 'Dona convidada') RETURNING id`,
        [email],
      );
      await migrador.query(
        `INSERT INTO app.store_members
           (store_id, identity_id, role, invite_token_hash, invite_expires_at)
         VALUES ($1, $2, 'OWNER', $3, now() + interval '7 days')`,
        [loja.id, convidada?.id, resumirTokenDeConvite(tokenOriginal)],
      );

      const convites = repositorioDoConviteNoBanco({
        aplicacao: () => primeira.acesso,
        administracao: () => acessoDaAdministracao,
      });
      const enviados: { para: string; token: string }[] = [];
      const dependencias = {
        repositorio: convites,
        enviarConvite: vi.fn(
          async (convite: { para: string; token: string }) => {
            enviados.push(convite);
          },
        ),
        validarNovaSenha,
        gerarHashDaSenha: derivarSenha,
        agora: () => new Date(),
        gerarToken: gerarTokenDeConvite,
        resumirToken: resumirTokenDeConvite,
      };

      // Sem senha ainda: a conta convidada não entra.
      expect((await entrar(primeira, email, FRASE_DA_PROVA)).resultado).toEqual(
        { status: "CREDENCIAIS_INVALIDAS" },
      );

      // A administração reenvia: o link anterior deixa de valer.
      const reenviado = await executarComoRequisicao(
        { usuarioId: administracao.id },
        () => reenviarConviteDoDono(loja.id, dependencias),
      );
      expect(reenviado).toBe(true);
      expect(enviados.map((convite) => convite.para)).toEqual([email]);
      const tokenNovo = enviados[0]?.token ?? "";

      expect(
        await comoVisitante(() =>
          definirPrimeiraSenha(
            { token: tokenOriginal, senha: FRASE_DA_PROVA },
            dependencias,
          ),
        ),
      ).toEqual({ ok: false, motivo: "CONVITE_INVALIDO" });
      expect(
        await comoVisitante(() =>
          definirPrimeiraSenha(
            { token: tokenNovo, senha: FRASE_DA_PROVA },
            dependencias,
          ),
        ),
      ).toEqual({ ok: true, acessoLiberado: true });
      expect(
        await comoVisitante(() =>
          definirPrimeiraSenha(
            { token: tokenNovo, senha: OUTRA_FRASE_DA_PROVA },
            dependencias,
          ),
        ),
      ).toEqual({ ok: false, motivo: "CONVITE_INVALIDO" });

      const { rows: vinculo } = await migrador.query<{
        aceito: boolean;
        resumo: string | null;
      }>(
        `SELECT invite_accepted_at IS NOT NULL AS aceito, invite_token_hash AS resumo
           FROM app.store_members WHERE store_id = $1 AND identity_id = $2`,
        [loja.id, convidada?.id],
      );
      expect(vinculo).toEqual([{ aceito: true, resumo: null }]);
      const { rows: trilha } = await migrador.query<{
        action: string;
        actor_id: string;
      }>(
        `SELECT action, actor_id FROM app.audit_log
          WHERE store_id = $1 AND entity = 'store_members' ORDER BY id`,
        [loja.id],
      );
      expect(trilha).toEqual([
        { action: "CONVITE_REENVIADO", actor_id: administracao.id },
        { action: "CONVITE_ACEITO", actor_id: convidada?.id },
      ]);

      // Agora é dona: a senha confere e o segundo fator é exigido.
      const entrada = await entrar(segunda, email, FRASE_DA_PROVA);
      expect(entrada.resultado).toEqual({
        status: "DESAFIO_DE_SEGUNDO_FATOR",
        desafioId: "desafio-da-prova",
      });
      expect(entrada.criarSessao).not.toHaveBeenCalled();

      // Convite aceito não volta a valer por reenvio.
      expect(
        await executarComoRequisicao({ usuarioId: administracao.id }, () =>
          reenviarConviteDoDono(loja.id, dependencias),
        ),
      ).toBe(false);
      expect(dependencias.enviarConvite).toHaveBeenCalledTimes(1);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-103 convite vencido não define senha nenhuma",
    async () => {
      const loja = await criarLoja();
      const email = emailNovo();
      const token = gerarTokenDeConvite();
      const {
        rows: [convidada],
      } = await migrador.query<{ id: string }>(
        `INSERT INTO app.identities (email_norm) VALUES ($1) RETURNING id`,
        [email],
      );
      await migrador.query(
        `INSERT INTO app.store_members
           (store_id, identity_id, role, invite_token_hash, invite_expires_at)
         VALUES ($1, $2, 'OWNER', $3, now() - interval '1 minute')`,
        [loja.id, convidada?.id, resumirTokenDeConvite(token)],
      );
      const convites = repositorioDoConviteNoBanco({
        aplicacao: () => segunda.acesso,
        administracao: () => acessoDaAdministracao,
      });

      const resultado = await comoPessoa(convidada?.id ?? "", "CUSTOMER", () =>
        definirPrimeiraSenha(
          { token, senha: FRASE_DA_PROVA },
          {
            repositorio: convites,
            validarNovaSenha,
            gerarHashDaSenha: derivarSenha,
            agora: () => new Date(Date.now() + PRAZO_DO_CONVITE_EM_MS),
            resumirToken: resumirTokenDeConvite,
          },
        ),
      );

      expect(resultado).toEqual({ ok: false, motivo: "CONVITE_INVALIDO" });
      const [linha] = await identidadeNoBanco(migrador, email);
      expect(linha?.password_hash).toBeNull();
    },
    ESPERA_LONGA,
  );
});
