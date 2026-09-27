// @vitest-environment jsdom
/**
 * Formulário de cadastro de loja (AC-200..AC-202) e a ponte até a API.
 *
 * O formulário é dividido em estado e desenho; aqui é o desenho que é
 * conferido, porque é ele que a pessoa vê: o campo apontado, a frase do
 * motivo, a sugestão de apelido, o sucesso com o código da loja. A validação
 * é a do contrato — a mesma da API.
 */
import {
  MENSAGEM_DE_APELIDO_EM_USO,
  MENSAGEM_DE_DOCUMENTO_INVALIDO,
} from "@simpleclick/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  CamposDaNovaLoja,
  type CamposDaNovaLojaProps,
} from "../src/features/admin/FormularioNovaLoja.tsx";
import {
  apelidoAPartirDoNome,
  errosPorCampo,
  primeiroCampoComErro,
  validarNovaLoja,
  VALORES_INICIAIS,
  type ValoresDaNovaLoja,
} from "../src/features/admin/formulario-da-loja.ts";
import {
  caminhoPermitido,
  encaminharParaAdministracao,
} from "../src/server/admin-api.ts";

const PREENCHIDO: ValoresDaNovaLoja = {
  ...VALORES_INICIAIS,
  nome: "Pastel da Joi",
  documento: "529.982.247-25",
  responsavelNome: "Joice Almeida",
  responsavelEmail: "joice@exemplo.test",
  responsavelTelefone: "11988887777",
  cep: "01310-100",
  logradouro: "Avenida Paulista",
  numero: "1000",
  bairro: "Bela Vista",
  cidade: "São Paulo",
  uf: "SP",
  tipoDeNegocio: "FOOD_SNACK",
  apelido: "pastel-da-joi",
};

function desenhar(sobrescrita: Partial<CamposDaNovaLojaProps> = {}): Document {
  const props: CamposDaNovaLojaProps = {
    valores: PREENCHIDO,
    erros: {},
    sugestao: null,
    tipos: {
      estado: "pronto",
      tipos: [
        { codigo: "FOOD_SNACK", nome: "Lanchonete", controlaEstoque: false },
        { codigo: "APPAREL", nome: "Roupas", controlaEstoque: true },
      ],
    },
    envio: { estado: "parado" },
    aoMudar: () => undefined,
    aoEnviar: () => undefined,
    aoUsarSugestao: () => undefined,
    aoRecarregarTipos: () => undefined,
    aoRecomecar: () => undefined,
    ...sobrescrita,
  };
  document.body.innerHTML = renderToStaticMarkup(
    <CamposDaNovaLoja {...props} />,
  );
  return document;
}

describe("cadastro de loja na tela", () => {
  it("@spec:AC-202 o formulário recusa o CPF com dígito errado antes do envio, apontando o campo e explicando o motivo", () => {
    const validacao = validarNovaLoja({
      ...PREENCHIDO,
      documento: "529.982.247-24",
    });

    expect(validacao.ok).toBe(false);
    if (validacao.ok) return;
    expect(validacao.erros.documento).toBe(MENSAGEM_DE_DOCUMENTO_INVALIDO);
    expect(primeiroCampoComErro(validacao.erros)).toBe("documento");

    const pagina = desenhar({ erros: validacao.erros });
    const campo = pagina.getElementById("nova-loja-documento");
    expect(campo?.getAttribute("aria-invalid")).toBe("true");
    const erro = pagina.getElementById("nova-loja-documento-erro");
    expect(erro?.getAttribute("role")).toBe("alert");
    expect(erro?.textContent).toBe(MENSAGEM_DE_DOCUMENTO_INVALIDO);
    expect(campo?.getAttribute("aria-describedby")).toContain(
      "nova-loja-documento-erro",
    );
  });

  it("@spec:AC-201 a recusa do apelido repetido aponta o campo e oferece a variação livre", () => {
    const erros = errosPorCampo([
      { caminho: "apelido", mensagem: MENSAGEM_DE_APELIDO_EM_USO },
    ]);
    const pagina = desenhar({ erros, sugestao: "pastel-da-joi-2" });

    expect(
      pagina.getElementById("nova-loja-apelido")?.getAttribute("aria-invalid"),
    ).toBe("true");
    expect(pagina.getElementById("nova-loja-apelido-erro")?.textContent).toBe(
      MENSAGEM_DE_APELIDO_EM_USO,
    );
    const botoes = [...pagina.querySelectorAll("button")].map(
      (botao) => botao.textContent,
    );
    expect(botoes).toContain("usar pastel-da-joi-2");
  });

  it("@spec:AC-200 depois de criada, a tela mostra o código da loja, o convite enviado e o caminho para a ficha", () => {
    const pagina = desenhar({
      envio: {
        estado: "criada",
        email: "joice@exemplo.test",
        loja: {
          id: "7f0c3f2e-2a1b-4c3d-9e8f-001122334455",
          codigo: "0003",
          apelido: "pastel-da-joi",
          status: "ACTIVE",
          conviteEnviado: true,
        },
      },
    });

    const texto = pagina.body.textContent ?? "";
    expect(texto).toContain("Loja criada com o código 0003");
    expect(texto).toContain("joice@exemplo.test");
    expect(
      pagina.querySelector(
        'a[href="/admin/lojas/7f0c3f2e-2a1b-4c3d-9e8f-001122334455"]',
      )?.textContent,
    ).toBe("Abrir a ficha da loja");
  });

  it("@principle:P-011 os tipos de negócio mostram espera e falha com saída", () => {
    const carregando = desenhar({ tipos: { estado: "carregando" } });
    expect(carregando.querySelector('[role="status"]')?.textContent).toContain(
      "Carregando os tipos de negócio",
    );

    const falha = desenhar({ tipos: { estado: "erro" } });
    expect(falha.querySelector('[role="alert"]')?.textContent).toContain(
      "Tentar de novo",
    );
  });

  it("o apelido nasce do nome, sem acento e sem espaço", () => {
    expect(apelidoAPartirDoNome("Pastel da Joí & Cia.")).toBe(
      "pastel-da-joi-cia",
    );
  });
});

describe("a ponte do site até a administração da API", () => {
  it("só repassa caminhos da lista fechada, e sem sessão nem chega à API", async () => {
    const buscar = vi.fn<typeof fetch>();

    expect(caminhoPermitido("lojas", "POST")).toBe(true);
    expect(caminhoPermitido("lojas", "DELETE")).toBe(false);
    expect(caminhoPermitido("usuarios", "GET")).toBe(false);

    const fora = await encaminharParaAdministracao(
      new Request("https://simpleclick.localhost/api/admin/usuarios"),
      ["usuarios"],
      buscar,
    );
    expect(fora.status).toBe(404);

    const semSessao = await encaminharParaAdministracao(
      new Request("https://simpleclick.localhost/api/admin/lojas"),
      ["lojas"],
      buscar,
    );
    expect(semSessao.status).toBe(401);
    expect(buscar).not.toHaveBeenCalled();
  });

  it("repassa com o token do cookie no cabeçalho, e a página não vê token nenhum", async () => {
    const buscar = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ tipos: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    const resposta = await encaminharParaAdministracao(
      new Request("https://simpleclick.localhost/api/admin/tipos-de-negocio", {
        headers: { cookie: "sc_access=abc.def.ghi" },
      }),
      ["tipos-de-negocio"],
      buscar,
    );

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ tipos: [] });
    const [endereco, opcoes] = buscar.mock.calls[0] ?? [];
    expect(String(endereco)).toMatch(/\/v1\/admin\/tipos-de-negocio$/);
    expect(new Headers(opcoes?.headers).get("authorization")).toBe(
      "Bearer abc.def.ghi",
    );
  });
});
