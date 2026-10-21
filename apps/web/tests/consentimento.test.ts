import { describe, expect, it } from "vitest";

import {
  VALIDADE_EM_DIAS,
  VERSAO_DA_POLITICA,
  lerConsentimento,
  serializarConsentimento,
  temConsentimento,
} from "../src/features/legal/consentimento";
import { emailDoEncarregado } from "../src/features/legal/contato";

describe("consentimento de cookies", () => {
  it("guarda e devolve a escolha", () => {
    const valor = serializarConsentimento(
      { desempenho: true, funcionais: false },
      1000,
    );
    expect(lerConsentimento(valor, 2000)).toEqual({
      versao: VERSAO_DA_POLITICA,
      desempenho: true,
      funcionais: false,
      em: 1000,
    });
  });

  it("pede de novo quando a versão muda, expira ou o cookie está estragado", () => {
    const antigo = encodeURIComponent(
      JSON.stringify({ v: "1999-01-01", d: true, f: true, t: 1000 }),
    );
    expect(lerConsentimento(antigo, 2000)).toBeNull();
    const valor = serializarConsentimento(
      { desempenho: true, funcionais: true },
      0,
    );
    expect(
      lerConsentimento(valor, (VALIDADE_EM_DIAS + 1) * 86_400_000),
    ).toBeNull();
    expect(lerConsentimento("%%%")).toBeNull();
    expect(lerConsentimento(undefined)).toBeNull();
    expect(lerConsentimento(encodeURIComponent('{"v":1}'))).toBeNull();
  });

  it("sem escolha, só o essencial está liberado", () => {
    expect(temConsentimento("essenciais")).toBe(true);
    expect(temConsentimento("desempenho")).toBe(false);
    expect(temConsentimento("funcionais")).toBe(false);
  });

  it("o e-mail do encarregado vem do ambiente", () => {
    expect(
      emailDoEncarregado({
        NEXT_PUBLIC_EMAIL_DO_ENCARREGADO: " dpo@loja.test ",
      }),
    ).toBe("dpo@loja.test");
    expect(emailDoEncarregado({})).toBe("privacidade@simpleclick.com.br");
  });
});
