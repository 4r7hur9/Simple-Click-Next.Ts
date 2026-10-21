/**
 * Cadastro e verificação de e-mail contra PostgreSQL de verdade (T-111).
 *
 * Os casos de uso são os mesmos que as provas de unidade exercitam com
 * duplos; o que muda aqui é a porta: repositórios de banco, pela credencial
 * que atende requisição (`sc_app`), cada passo dentro de um contexto de
 * requisição como a API faz. Duas "instâncias" — dois agrupadores sobre o
 * mesmo banco — provam que nada fica na memória do processo (AC-129).
 * Recuperação de senha e convite do dono ficam em
 * `recuperacao-e-convite-persistidos.test.ts`.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { conectarNoBancoDoArquivo } from "@simpleclick/testing";

import {
  avisosQueCriamOLink,
  cadastrar,
  emailNovo,
  entrar,
  identidadeNoBanco,
} from "./apoio-da-conta.ts";
import {
  abrirInstancia,
  comoVisitante,
  FRASE_DA_PROVA,
  OUTRA_FRASE_DA_PROVA,
  type RepositoriosDaIdentidade,
} from "./apoio-da-identidade.ts";
import { ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import {
  criarCasoDeUsoDeVerificacaoDeEmail,
  gerarTokenDeVerificacao,
  JANELA_DE_REENVIO_EM_MS,
  LIMITE_DE_REENVIOS_POR_JANELA,
  PRAZO_DO_LINK_DE_VERIFICACAO_EM_MS,
  resumirTokenDeVerificacao,
} from "../src/modules/auth/verificar-email.usecase.ts";

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
// Cadastro e verificação de e-mail
// ---------------------------------------------------------------------------

describe("cadastro e verificação de e-mail gravados no banco", () => {
  it(
    "@spec:AC-100 @spec:AC-129 conta pendente gravada com a senha derivada, e outra instância a reconhece e deixa o cliente entrar",
    async () => {
      const email = emailNovo();
      const avisos = avisosQueCriamOLink(primeira);

      const resultado = await cadastrar(primeira, email, avisos);

      expect(resultado).toMatchObject({
        cadastrado: true,
        verificacaoDeEmailPendente: true,
      });
      expect(avisos.enviarVerificacao).toHaveBeenCalledTimes(1);
      expect(avisos.links.has(email)).toBe(true);

      const [linha] = await identidadeNoBanco(migrador, email);
      expect(linha?.email_verified_at).toBeNull();
      expect(linha?.phone_e164).toBe("+5511912345678");
      expect(linha?.password_hash?.startsWith("argon2id$")).toBe(true);
      expect(linha?.password_hash).not.toContain(FRASE_DA_PROVA);

      // Outra instância, outro agrupador: a conta e a senha estão no banco.
      // Cliente entra mesmo com o e-mail pendente (a marca é organização).
      const tentativa = await entrar(segunda, email, FRASE_DA_PROVA);
      expect(tentativa.resultado).toEqual({
        status: "SESSAO_CRIADA",
        sessaoId: "sessao-da-prova",
      });
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-101 o mesmo e-mail de novo devolve a mesma confirmação, avisa o dono do endereço e não troca a senha de quem já tinha conta",
    async () => {
      const email = emailNovo();
      const primeiroCadastro = await cadastrar(primeira, email);
      const [antes] = await identidadeNoBanco(migrador, email);

      const avisos = avisosQueCriamOLink(segunda);
      const repetido = await cadastrar(
        segunda,
        email.toUpperCase(),
        avisos,
        OUTRA_FRASE_DA_PROVA,
      );

      expect(repetido).toEqual(primeiroCadastro);
      expect(avisos.enviarAvisoDeCadastroExistente).toHaveBeenCalledTimes(1);
      expect(avisos.enviarVerificacao).not.toHaveBeenCalled();
      const depois = await identidadeNoBanco(migrador, email);
      expect(depois).toHaveLength(1);
      expect(depois[0]?.password_hash).toBe(antes?.password_hash);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-103 o link libera o login, vale uma vez só, e a segunda instância enxerga o e-mail verificado",
    async () => {
      const email = emailNovo();
      const avisos = avisosQueCriamOLink(primeira);
      await cadastrar(primeira, email, avisos);
      const token = avisos.links.get(email) ?? "";
      const verificacao = (repositorios: RepositoriosDaIdentidade) =>
        criarCasoDeUsoDeVerificacaoDeEmail({
          codigos: repositorios.codigos,
          email: { enfileirar: async () => undefined },
          origemDoSite: "https://simpleclick.exemplo.test",
        });

      const verificado = await comoVisitante(() =>
        verificacao(primeira).verificar(token),
      );
      const deNovo = await comoVisitante(() =>
        verificacao(segunda).verificar(token),
      );

      expect(verificado).toMatchObject({
        situacao: "verificado",
        identidade: { email },
      });
      expect(deNovo).toEqual({ situacao: "invalido" });
      const entrada = await entrar(segunda, email, FRASE_DA_PROVA);
      expect(entrada.resultado).toEqual({
        status: "SESSAO_CRIADA",
        sessaoId: "sessao-da-prova",
      });
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-104 @spec:AC-129 link expirado oferece reenvio, o link novo funciona, e o limite conta por conta entre instâncias",
    async () => {
      const agora = new Date();
      const vencido = new Date(agora.getTime() - 60_000);
      const criadoHaMuito = new Date(
        agora.getTime() - PRAZO_DO_LINK_DE_VERIFICACAO_EM_MS - 60_000,
      );

      /** Conta pendente com um link já vencido; devolve o token dele. */
      async function contaComLinkVencido(): Promise<string> {
        const email = emailNovo();
        await cadastrar(primeira, email, {
          ...avisosQueCriamOLink(primeira),
          enviarVerificacao: vi.fn(async () => undefined),
        });
        const token = gerarTokenDeVerificacao();
        await comoVisitante(() =>
          primeira.codigos.criarVerificacaoParaEmail(email, {
            id: crypto.randomUUID(),
            resumoDoToken: resumirTokenDeVerificacao(token),
            enviadoEm: criadoHaMuito,
            expiraEm: vencido,
          }),
        );
        return token;
      }

      const enfileirados: string[] = [];
      const verificacao = (repositorios: RepositoriosDaIdentidade) =>
        criarCasoDeUsoDeVerificacaoDeEmail({
          codigos: repositorios.codigos,
          email: {
            enfileirar: async ({ urlDeVerificacao }) => {
              enfileirados.push(urlDeVerificacao);
            },
          },
          origemDoSite: "https://simpleclick.exemplo.test",
          agora: () => agora,
        });

      const vencidoDaAna = await contaComLinkVencido();
      expect(
        await comoVisitante(() =>
          verificacao(primeira).verificar(vencidoDaAna),
        ),
      ).toEqual({ situacao: "expirado" });

      // Reenvios alternando as instâncias: a conta é contada no banco.
      const instancias = [primeira, segunda, primeira];
      for (const instancia of instancias.slice(
        0,
        LIMITE_DE_REENVIOS_POR_JANELA,
      )) {
        expect(
          await comoVisitante(() =>
            verificacao(instancia).reenviar(vencidoDaAna),
          ),
        ).toEqual({ situacao: "reenviado" });
      }
      const bloqueado = await comoVisitante(() =>
        verificacao(segunda).reenviar(vencidoDaAna),
      );
      expect(bloqueado).toMatchObject({ situacao: "limite_atingido" });
      if (bloqueado.situacao === "limite_atingido") {
        expect(bloqueado.disponivelEm.getTime()).toBe(
          agora.getTime() + JANELA_DE_REENVIO_EM_MS,
        );
      }

      // O limite é da conta: outra pessoa reenvia normalmente.
      const vencidoDoBeto = await contaComLinkVencido();
      expect(
        await comoVisitante(() => verificacao(segunda).reenviar(vencidoDoBeto)),
      ).toEqual({ situacao: "reenviado" });

      // O link novo, que só existiu no e-mail, verifica a conta.
      const ultimoLink = new URL(enfileirados.at(-1) ?? "");
      const tokenNovo = ultimoLink.searchParams.get("token") ?? "";
      expect(
        await comoVisitante(() => verificacao(primeira).verificar(tokenNovo)),
      ).toMatchObject({ situacao: "verificado" });

      // No banco só existe o resumo de cada link, nunca o link.
      const { rows } = await migrador.query<{ quantidade: number }>(
        `SELECT count(*)::int AS quantidade FROM app.verification_codes
          WHERE code_hash IN ($1, $2)`,
        [vencidoDaAna, tokenNovo],
      );
      expect(rows[0]?.quantidade).toBe(0);
    },
    ESPERA_LONGA,
  );
});
