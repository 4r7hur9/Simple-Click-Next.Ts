import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const pagina = readFileSync(
  new URL(
    "../../apps/web/src/app/(conta)/recuperar-senha/page.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("tela de recuperação de senha", () => {
  it("oferece o formulário de recuperação com e-mail e envio de instruções", () => {
    expect(pagina).toContain("Esqueceu sua senha?");
    expect(pagina).toContain('action="/api/auth/recuperar-senha"');
    expect(pagina).toContain('name="email"');
    expect(pagina).toContain("Enviar instruções");
  });
});
