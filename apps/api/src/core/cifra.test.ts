import { describe, expect, it } from "vitest";

import {
  cifradorDoTotpDoAmbiente,
  CONTEXTO_DO_TOTP,
  criarCifradorDeSegredos,
  ErroDeChaveDeCifra,
  ErroDeDecifracao,
  problemaDaChaveDeCifra,
  VERSAO_DA_CIFRA,
} from "./cifra.ts";

/**
 * Chaves de exemplo, montadas em tempo de execução: nenhum valor aqui é chave
 * de ambiente nenhum, e o arquivo nunca parece um lugar onde segredo mora
 * (P-002).
 */
const CHAVE = Buffer.alloc(32, 11).toString("base64");
const OUTRA_CHAVE = Buffer.alloc(32, 12).toString("base64");
const SEGREDO_DO_APLICATIVO = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

function trocarUmCaractere(texto: string, posicao: number): string {
  const atual = texto[posicao];
  const novo = atual === "A" ? "B" : "A";
  return texto.slice(0, posicao) + novo + texto.slice(posicao + 1);
}

describe("cifra do segredo do aplicativo autenticador", () => {
  it("@spec:AC-130 o texto guardado é cifrado: não contém o segredo, muda a cada cifra e volta ao segredo só com a chave", async () => {
    const cifrador = criarCifradorDeSegredos(CHAVE, CONTEXTO_DO_TOTP);

    const primeiro = await cifrador.cifrar(SEGREDO_DO_APLICATIVO);
    const segundo = await cifrador.cifrar(SEGREDO_DO_APLICATIVO);

    expect(primeiro.startsWith(`${VERSAO_DA_CIFRA}.`)).toBe(true);
    expect(primeiro).not.toContain(SEGREDO_DO_APLICATIVO);
    // Vetor novo a cada cifra: o mesmo segredo nunca vira o mesmo texto.
    expect(primeiro).not.toBe(segundo);
    expect(await cifrador.decifrar(primeiro)).toBe(SEGREDO_DO_APLICATIVO);
    expect(await cifrador.decifrar(segundo)).toBe(SEGREDO_DO_APLICATIVO);
  });

  it("@spec:AC-130 texto adulterado não decifra para outro segredo: falha fechada", async () => {
    const cifrador = criarCifradorDeSegredos(CHAVE, CONTEXTO_DO_TOTP);
    const cifrado = await cifrador.cifrar(SEGREDO_DO_APLICATIVO);
    const partes = cifrado.split(".");
    const cifradoSoComOConteudo = partes[4] ?? "";
    partes[4] = trocarUmCaractere(cifradoSoComOConteudo, 0);

    await expect(cifrador.decifrar(partes.join("."))).rejects.toMatchObject({
      name: "ErroDeDecifracao",
      motivo: "adulterado",
    });
    await expect(cifrador.decifrar("v1.abc")).rejects.toBeInstanceOf(
      ErroDeDecifracao,
    );
  });

  it("@spec:AC-130 texto cifrado com outra chave, ou para outro propósito, é recusado", async () => {
    const cifrado = await criarCifradorDeSegredos(
      OUTRA_CHAVE,
      CONTEXTO_DO_TOTP,
    ).cifrar(SEGREDO_DO_APLICATIVO);

    await expect(
      criarCifradorDeSegredos(CHAVE, CONTEXTO_DO_TOTP).decifrar(cifrado),
    ).rejects.toMatchObject({ motivo: "outra_chave" });

    const deOutroProposito = await criarCifradorDeSegredos(
      CHAVE,
      "simpleclick:outro-proposito",
    ).cifrar(SEGREDO_DO_APLICATIVO);
    await expect(
      criarCifradorDeSegredos(CHAVE, CONTEXTO_DO_TOTP).decifrar(
        deOutroProposito,
      ),
    ).rejects.toMatchObject({ motivo: "adulterado" });
  });

  it("@spec:AC-130 chave fora do tamanho do AES-256 é recusada ao montar, sem ecoar o valor", () => {
    const curta = Buffer.alloc(16, 11).toString("base64");

    expect(problemaDaChaveDeCifra(curta)).toContain("16 bytes");
    expect(problemaDaChaveDeCifra("não é base64!")).toBe("não está em base64");
    expect(problemaDaChaveDeCifra(CHAVE)).toBeUndefined();
    expect(() => criarCifradorDeSegredos(curta, CONTEXTO_DO_TOTP)).toThrow(
      ErroDeChaveDeCifra,
    );
    try {
      criarCifradorDeSegredos(curta, CONTEXTO_DO_TOTP);
    } catch (erro) {
      expect(String((erro as Error).message)).not.toContain(curta);
    }
  });

  it("@spec:AC-130 sem a chave no ambiente o cifrador recusa de forma explícita, em vez de guardar o segredo de qualquer jeito", async () => {
    const semChave = cifradorDoTotpDoAmbiente({ NODE_ENV: "development" });

    await expect(semChave.cifrar(SEGREDO_DO_APLICATIVO)).rejects.toThrow(
      /CHAVE_CIFRA_TOTP.*não está definida/,
    );

    const comChave = cifradorDoTotpDoAmbiente({ CHAVE_CIFRA_TOTP: CHAVE });
    const cifrado = await comChave.cifrar(SEGREDO_DO_APLICATIVO);
    expect(
      await criarCifradorDeSegredos(CHAVE, CONTEXTO_DO_TOTP).decifrar(cifrado),
    ).toBe(SEGREDO_DO_APLICATIVO);
  });
});
