/**
 * Aplicativo autenticador e códigos de recuperação contra PostgreSQL de
 * verdade (T-111): segredo guardado só cifrado (AC-130), passo usado que não
 * vale de novo (AC-124), troca de aparelho e códigos de uso único (AC-123).
 *
 * Os códigos do aplicativo são calculados com o relógio de verdade, como um
 * celular faria — a janela de um passo para cada lado absorve a virada de
 * passo no meio da prova.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  conectarNoBancoDoArquivo,
  criarIdentidade,
} from "@simpleclick/testing";

import {
  abrirInstancia,
  comoPessoa,
  comoVisitante,
  type RepositoriosDaIdentidade,
} from "./apoio-da-identidade.ts";
import {
  ativarAplicativo,
  codigoDiferente,
  codigoDoAplicativo,
  criarSessaoDe,
  desafioPorEmail,
  donaComSenha,
} from "./apoio-do-segundo-fator.ts";
import { ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import {
  CONTEXTO_DO_TOTP,
  criarCifradorDeSegredos,
} from "../src/core/cifra.ts";
import {
  criarCodigosDeRecuperacao,
  usarCodigoDeRecuperacao,
} from "../src/modules/auth/recovery-codes.ts";
import { PRAZO_DO_DESAFIO_EM_MS } from "../src/modules/auth/segundo-fator.repo.ts";
import { confirmarSegundoFator } from "../src/modules/auth/segundo-fator.usecase.ts";
import {
  ativarAplicativoTotp,
  prepararAtivacaoTotp,
  validarCodigoTotp,
} from "../src/modules/auth/totp.usecase.ts";

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
// Aplicativo autenticador e recuperação
// ---------------------------------------------------------------------------

describe("aplicativo autenticador no banco", () => {
  it(
    "@spec:AC-121 @spec:AC-130 ativar guarda só o segredo cifrado, exige código válido, devolve códigos de recuperação, e o código por e-mail deixa de valer",
    async () => {
      const dona = await donaComSenha(migrador);

      const preparada = await comoPessoa(dona.id, "OWNER", () =>
        prepararAtivacaoTotp(dona.id, dona.email, {
          repositorio: primeira.totp,
          cifrador: primeira.cifrador,
        }),
      );
      const { rows: guardados } = await migrador.query<{
        secret_enc: string;
        confirmado: boolean;
      }>(
        `SELECT secret_enc, confirmed_at IS NOT NULL AS confirmado
           FROM app.totp_credentials WHERE identity_id = $1`,
        [dona.id],
      );
      expect(guardados).toHaveLength(1);
      expect(guardados[0]?.secret_enc.startsWith("v1.")).toBe(true);
      expect(guardados[0]?.secret_enc).not.toContain(preparada.segredo);
      expect(guardados[0]?.confirmado).toBe(false);

      // O segredo cru nem entra: o banco recusa o formato.
      await expect(
        migrador.query(
          `INSERT INTO app.totp_credentials (identity_id, secret_enc) VALUES ($1, $2)`,
          [dona.id, preparada.segredo],
        ),
      ).rejects.toThrow(/totp_credentials_cifra_ck/);

      const dependenciasDaAtivacao = {
        repositorio: segunda.totp,
        cifrador: segunda.cifrador,
        gerarCodigosDeRecuperacao: (id: string) =>
          criarCodigosDeRecuperacao(id, segunda.codigosDeRecuperacao),
      };
      const codigoCerto = codigoDoAplicativo(preparada.segredo);
      expect(
        await comoPessoa(dona.id, "OWNER", () =>
          ativarAplicativoTotp(
            dona.id,
            codigoDiferente(codigoCerto),
            dependenciasDaAtivacao,
          ),
        ),
      ).toEqual({ status: "CODIGO_INVALIDO" });
      const ativacao = await comoPessoa(dona.id, "OWNER", () =>
        ativarAplicativoTotp(dona.id, codigoCerto, dependenciasDaAtivacao),
      );
      expect(ativacao.status).toBe("ATIVADO");
      if (ativacao.status !== "ATIVADO") return;
      expect(ativacao.codigosDeRecuperacao).toHaveLength(10);

      const { rows: recuperacao } = await migrador.query<{
        code_sha256: string;
      }>(`SELECT code_sha256 FROM app.recovery_codes WHERE identity_id = $1`, [
        dona.id,
      ]);
      expect(recuperacao).toHaveLength(10);
      for (const codigo of ativacao.codigosDeRecuperacao) {
        expect(recuperacao.map((linha) => linha.code_sha256)).not.toContain(
          codigo,
        );
      }

      // Com o aplicativo ativo, o login não oferece e-mail: o banco recusa.
      expect(
        await comoVisitante(() => primeira.login.buscarPorEmail(dona.email)),
      ).toMatchObject({ papel: "DONO", aplicativoAtivo: true });
      await expect(desafioPorEmail(primeira, dona.id)).rejects.toThrow();

      // O desafio pelo aplicativo funciona com o código do próximo passo.
      const agora = new Date();
      const { desafioId } = await comoVisitante(() =>
        primeira.desafios.criar({
          identidadeId: dona.id,
          canal: "TOTP",
          expiraEm: new Date(agora.getTime() + PRAZO_DO_DESAFIO_EM_MS),
          agora,
        }),
      );
      expect(
        await comoVisitante(() =>
          confirmarSegundoFator(
            { desafioId, codigo: codigoDoAplicativo(preparada.segredo, 1) },
            {
              desafios: segunda.desafios,
              criarSessao: criarSessaoDe(segunda, "OWNER"),
            },
          ),
        ),
      ).toMatchObject({ status: "SESSAO_CRIADA" });
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-124 o mesmo código do aplicativo não entra duas vezes, nem o código que ativou",
    async () => {
      const pessoa = await criarIdentidade();
      const aplicativo = await ativarAplicativo(
        primeira,
        pessoa.id,
        "CUSTOMER",
      );
      const validar = (
        repositorios: RepositoriosDaIdentidade,
        codigo: string,
      ) =>
        comoVisitante(() =>
          validarCodigoTotp(pessoa.id, codigo, {
            repositorio: repositorios.totp,
          }),
        );

      expect(await validar(segunda, aplicativo.codigoDaAtivacao)).toBe(
        "INVALIDO",
      );
      const proximo = codigoDoAplicativo(aplicativo.segredo, 1);
      expect(await validar(segunda, proximo)).toBe("ACEITO");
      expect(await validar(primeira, proximo)).toBe("INVALIDO");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-123 código de recuperação entra uma vez só, avisa, orienta a configurar de novo, e só o último jogo vale",
    async () => {
      const pessoa = await criarIdentidade();
      const outra = await criarIdentidade();
      const aplicativo = await ativarAplicativo(
        primeira,
        pessoa.id,
        "CUSTOMER",
      );
      const [primeiroCodigo, segundoCodigo] =
        aplicativo.codigosDeRecuperacao as [string, string];
      const avisarUso = vi.fn(async () => undefined);
      const usar = (
        repositorios: RepositoriosDaIdentidade,
        identidadeId: string,
        codigo: string,
      ) =>
        comoVisitante(() =>
          usarCodigoDeRecuperacao(
            { identidadeId, codigo },
            {
              repositorio: repositorios.codigosDeRecuperacao,
              avisador: { avisarUso },
              criarSessao: criarSessaoDe(repositorios, "CUSTOMER"),
            },
          ),
        );

      expect(await usar(segunda, outra.id, primeiroCodigo)).toEqual({
        status: "CODIGO_INVALIDO",
      });
      expect(await usar(segunda, pessoa.id, primeiroCodigo)).toMatchObject({
        status: "SESSAO_LIBERADA",
        orientarPara: "/minha-conta/seguranca/aplicativo",
      });
      expect(await usar(primeira, pessoa.id, primeiroCodigo)).toEqual({
        status: "CODIGO_INVALIDO",
      });
      expect(avisarUso).toHaveBeenCalledTimes(1);

      // Um jogo novo descarta os não usados do anterior.
      await comoPessoa(pessoa.id, "CUSTOMER", () =>
        criarCodigosDeRecuperacao(pessoa.id, primeira.codigosDeRecuperacao),
      );
      expect(await usar(primeira, pessoa.id, segundoCodigo)).toEqual({
        status: "CODIGO_INVALIDO",
      });
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-130 segredo adulterado no banco, ou cifrado com outra chave, faz o código ser recusado em vez de aceito",
    async () => {
      const pessoa = await criarIdentidade();
      const aplicativo = await ativarAplicativo(
        primeira,
        pessoa.id,
        "CUSTOMER",
      );

      // Outra instância com OUTRA chave: o segredo não decifra, código recusado.
      const comOutraChave = abrirInstancia(
        criarCifradorDeSegredos(
          Buffer.alloc(32, 99).toString("base64"),
          CONTEXTO_DO_TOTP,
        ),
      );
      try {
        expect(
          await comoVisitante(() =>
            validarCodigoTotp(
              pessoa.id,
              codigoDoAplicativo(aplicativo.segredo, 1),
              { repositorio: comOutraChave.totp },
            ),
          ),
        ).toBe("INVALIDO");
      } finally {
        await comOutraChave.acesso.encerrar();
      }

      // Segredo adulterado gravado direto no banco por quem tem acesso a ele.
      const adulterada = await criarIdentidade();
      const cifrado = await primeira.cifrador.cifrar(aplicativo.segredo);
      const partes = cifrado.split(".");
      const conteudo = partes[4] ?? "";
      partes[4] = (conteudo[0] === "A" ? "B" : "A") + conteudo.slice(1);
      await migrador.query(
        `INSERT INTO app.totp_credentials (identity_id, secret_enc, confirmed_at)
         VALUES ($1, $2, now())`,
        [adulterada.id, partes.join(".")],
      );
      expect(
        await comoVisitante(() =>
          validarCodigoTotp(
            adulterada.id,
            codigoDoAplicativo(aplicativo.segredo),
            { repositorio: primeira.totp },
          ),
        ),
      ).toBe("INVALIDO");
    },
    ESPERA_LONGA,
  );
});
