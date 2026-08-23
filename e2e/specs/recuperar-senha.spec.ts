import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import PaginaDeRecuperacaoDeSenha from "../../apps/web/src/app/(conta)/recuperar-senha/page.tsx";

describe("tela de recuperação de senha", () => {
  it("oferece o formulário de recuperação com e-mail e envio de instruções", () => {
    const tela = renderToStaticMarkup(
      createElement(PaginaDeRecuperacaoDeSenha),
    );

    expect(tela).toContain("Esqueceu sua senha?");
    expect(tela).toContain('action="/api/auth/recuperar-senha"');
    expect(tela).toContain('name="email"');
    expect(tela).toContain("Enviar instruções");
  });
});
