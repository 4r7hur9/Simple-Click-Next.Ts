// @vitest-environment jsdom
/**
 * Formulários da administração (card #113, T-11307): o erro aparece junto do
 * campo certo e é anunciado a leitores de tela (`Campo` do pacote), e as
 * regras de validação de hoje não mudam. Complementa os testes atuais
 * `admin-nova-loja`, `admin-ficha-loja` e `admin-funcionalidades`.
 */
import type { FichaDaLojaNoContrato } from "@simpleclick/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CamposDaNovaLoja } from "../src/features/admin/FormularioNovaLoja.tsx";
import { CadastroDaLoja } from "../src/features/admin/FichaLoja.tsx";
import { validarEdicao } from "../src/features/admin/edicao-da-loja.ts";
import {
  validarNovaLoja,
  VALORES_INICIAIS,
} from "../src/features/admin/formulario-da-loja.ts";
import {
  desmontar,
  digitar,
  enviar,
  exigir,
  montar,
  simularApi,
} from "./apoio-config.tsx";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/lojas",
}));

const FICHA: FichaDaLojaNoContrato = {
  id: "5c1d0e2f-0000-4000-8000-000000000001",
  codigo: "0007",
  nome: "Pastel da Joi",
  razaoSocial: null,
  documento: { numero: "11222333000181", tipo: "CNPJ" },
  apelido: "pastel-da-joi",
  status: "ACTIVE",
  tipoDeNegocio: {
    codigo: "FOOD_SNACK",
    nome: "Lanchonete",
    controlaEstoque: false,
  },
  contato: { email: null, telefone: null },
  endereco: {
    cep: null,
    logradouro: null,
    numero: null,
    complemento: null,
    bairro: null,
    cidade: null,
    uf: null,
  },
  criadaEm: "2026-09-01T12:00:00.000Z",
  atualizadaEm: "2026-09-01T12:00:00.000Z",
  suspensao: null,
  retencao: null,
  historico: [],
};

afterEach(() => {
  desmontar();
  document.body.innerHTML = "";
});

describe("nova loja: erro junto do campo e anunciado", () => {
  it("[CA-10] @spec:AC-11323 todo campo recusado ganha aria-invalid, mensagem com role=alert e a ligação por aria-describedby", () => {
    const validacao = validarNovaLoja(VALORES_INICIAIS);
    expect(validacao.ok).toBe(false);
    if (validacao.ok) return;
    const campos = Object.keys(validacao.erros).filter(
      (campo) =>
        validacao.erros[campo as keyof typeof validacao.erros] !== undefined,
    );
    expect(campos.length).toBeGreaterThan(3);

    document.body.innerHTML = renderToStaticMarkup(
      <CamposDaNovaLoja
        valores={VALORES_INICIAIS}
        erros={validacao.erros}
        sugestao={null}
        tipos={{
          estado: "pronto",
          tipos: [
            {
              codigo: "FOOD_SNACK",
              nome: "Lanchonete",
              controlaEstoque: false,
            },
          ],
        }}
        envio={{ estado: "parado" }}
        aoMudar={() => undefined}
        aoEnviar={() => undefined}
        aoUsarSugestao={() => undefined}
        aoRecarregarTipos={() => undefined}
        aoRecomecar={() => undefined}
      />,
    );

    for (const campo of campos) {
      const erro = document.getElementById(`nova-loja-${campo}-erro`);
      expect(erro, `${campo}: mensagem de erro`).not.toBeNull();
      expect(erro?.getAttribute("role"), campo).toBe("alert");
      expect(erro?.textContent?.trim().length, campo).toBeGreaterThan(3);
      const controle = document.getElementById(`nova-loja-${campo}`);
      expect(controle, `${campo}: controle`).not.toBeNull();
      expect(controle?.getAttribute("aria-invalid"), campo).toBe("true");
      expect(controle?.getAttribute("aria-describedby"), campo).toContain(
        `nova-loja-${campo}-erro`,
      );
    }
  });
});

describe("cadastro da loja: erro no campo, sem envio", () => {
  it("[CA-10] @spec:AC-11323 um CNPJ inválido não envia nada, e o erro fica junto do campo", async () => {
    const chamadas = simularApi(() => ({ status: 200, corpo: FICHA }));
    const tela = montar(
      <CadastroDaLoja ficha={FICHA} aoSalvar={() => undefined} />,
    );
    const campo = exigir<HTMLInputElement>(tela, 'input[name="documento"]');
    digitar(campo, "123");
    await enviar(
      exigir<HTMLFormElement>(tela, 'form[aria-label="Cadastro da loja"]'),
    );

    expect(chamadas).toEqual([]);
    const marcado = exigir<HTMLInputElement>(tela, 'input[name="documento"]');
    expect(marcado.getAttribute("aria-invalid")).toBe("true");
    const alvo = marcado.getAttribute("aria-describedby") ?? "";
    const erro = alvo
      .split(" ")
      .map((id) => document.getElementById(id))
      .find((el) => el?.getAttribute("role") === "alert");
    expect(erro?.textContent?.trim().length).toBeGreaterThan(3);
  });

  it("[CA-10] @spec:AC-11323 as regras de validação de hoje seguem: documento com dígito errado e nome vazio são recusados; edição válida passa", () => {
    const invalido = validarEdicao({ documento: "123" });
    expect(invalido.ok).toBe(false);
    if (!invalido.ok) expect(invalido.erros.documento).toBeDefined();

    const semNome = validarEdicao({ nome: "   " });
    expect(semNome.ok).toBe(false);

    expect(validarEdicao({ documento: "11.222.333/0001-81" }).ok).toBe(true);
  });
});
