import { describe, expect, it } from "vitest";

import {
  CodigosRepoEmMemoria,
  type CodigoDeVerificacao,
  type IdentidadeDeVerificacao,
} from "./codigos.repo.ts";
import {
  criarCasoDeUsoDeVerificacaoDeEmail,
  resumirTokenDeVerificacao,
} from "./verificar-email.usecase.ts";

const AGORA = new Date("2026-08-23T12:00:00.000Z");
const IDENTIDADE: IdentidadeDeVerificacao = {
  id: "6db640e5-6a7b-452b-955c-b5372c01ae0b",
  email: "ana@exemplo.test",
  nome: "Ana",
  emailVerificadoEm: null,
};

function codigo(token: string, expiraEm: Date): CodigoDeVerificacao {
  return { id: "codigo-1", identidadeId: IDENTIDADE.id, resumoDoToken: resumirTokenDeVerificacao(token), enviadoEm: AGORA, expiraEm, usadoEm: null };
}

function preparar(codigos: readonly CodigoDeVerificacao[], agora = () => AGORA) {
  const enviados: { urlDeVerificacao: string }[] = [];
  const repo = new CodigosRepoEmMemoria([IDENTIDADE], codigos);
  return {
    enviados,
    casoDeUso: criarCasoDeUsoDeVerificacaoDeEmail({
      codigos: repo,
      email: { enfileirar: async (dados) => { enviados.push(dados); } },
      origemDoSite: "https://app.simpleclick.test/",
      agora,
      gerarToken: () => "novo-token-seguro",
      gerarId: () => "codigo-2",
    }),
  };
}

describe("verificação de e-mail", () => {
  it("@spec:AC-103 link válido verifica a conta e o mesmo link não funciona novamente", async () => {
    const { casoDeUso } = preparar([codigo("link-ainda-valido", new Date("2026-08-24T12:00:00.000Z"))]);

    await expect(casoDeUso.verificar("link-ainda-valido")).resolves.toMatchObject({
      situacao: "verificado",
      identidade: { id: IDENTIDADE.id, emailVerificadoEm: AGORA },
    });
    await expect(casoDeUso.verificar("link-ainda-valido")).resolves.toEqual({ situacao: "invalido" });
  });

  it("@spec:AC-104 link expirado oferece reenvio, gera outro link e limita tentativas na janela", async () => {
    const { casoDeUso, enviados } = preparar([codigo("link-expirado", new Date("2026-08-23T11:59:59.999Z"))]);

    await expect(casoDeUso.verificar("link-expirado")).resolves.toEqual({ situacao: "expirado" });
    await expect(casoDeUso.reenviar("link-expirado")).resolves.toEqual({ situacao: "reenviado" });
    await expect(casoDeUso.reenviar("link-expirado")).resolves.toEqual({ situacao: "reenviado" });
    await expect(casoDeUso.reenviar("link-expirado")).resolves.toEqual({ situacao: "reenviado" });
    await expect(casoDeUso.reenviar("link-expirado")).resolves.toMatchObject({ situacao: "limite_atingido" });
    expect(enviados.map((email) => email.urlDeVerificacao)).toEqual([
      "https://app.simpleclick.test/verificar-email?token=novo-token-seguro",
      "https://app.simpleclick.test/verificar-email?token=novo-token-seguro",
      "https://app.simpleclick.test/verificar-email?token=novo-token-seguro",
    ]);
  });
});
