// @vitest-environment jsdom
/**
 * A ficha da loja na tela da administração (AC-207, P-011, P-012).
 *
 * A edição de verdade está provada contra o banco em
 * `apps/api/tests/admin-ficha.test.ts`. Aqui se prova o que só a tela mostra:
 * os quatro estados, o formulário preenchido com a ficha, o envio de SÓ O QUE
 * MUDOU, a recusa do documento antes de sair qualquer requisição e o
 * histórico com quem, quando e quais campos.
 */
import axe from "axe-core";
import type { FichaDaLojaNoContrato } from "@simpleclick/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import {
  FichaDaLojaNaTela,
  FichaLoja,
  MENSAGEM_DE_SESSAO_DA_FICHA,
  type FichaDaLojaNaTelaProps,
} from "../src/features/admin/FichaLoja.tsx";
import {
  botao,
  desmontar,
  digitar,
  enviar,
  esperar,
  exigir,
  montar,
  simularApi,
  type ChamadaDaApi,
  type RespostaSimulada,
} from "./apoio-config.tsx";

const LOJA_ID = "3a3c3d4e-0000-4000-8000-000000000001";

const FICHA: FichaDaLojaNoContrato = {
  id: LOJA_ID,
  codigo: "0001",
  nome: "Pastel da Joi",
  razaoSocial: "Joice Almeida Pastelaria ME",
  documento: { numero: "11222333000181", tipo: "CNPJ" },
  apelido: "pastel-da-joi",
  status: "ACTIVE",
  tipoDeNegocio: {
    codigo: "FOOD_SNACK",
    nome: "Lanchonete",
    controlaEstoque: false,
  },
  contato: { email: "joice@exemplo.test", telefone: "+5511988887777" },
  endereco: {
    cep: "01310100",
    logradouro: "Avenida Paulista",
    numero: "1000",
    complemento: null,
    bairro: "Bela Vista",
    cidade: "São Paulo",
    uf: "SP",
  },
  criadaEm: "2026-09-01T12:00:00.000Z",
  atualizadaEm: "2026-09-01T12:00:00.000Z",
  suspensao: null,
  retencao: null,
  historico: [
    {
      id: "1",
      quando: "2026-09-01T12:00:00.000Z",
      acao: "LOJA_CRIADA",
      quem: { id: "admin-1", nome: "Administradora geral" },
      papel: "ADMIN",
      campos: [{ campo: "codigo", antes: null, depois: "0001" }],
      sensivel: false,
    },
  ],
};

function desenhar(sobrescrita: Partial<FichaDaLojaNaTelaProps> = {}): Document {
  const props: FichaDaLojaNaTelaProps = {
    estado: { fase: "pronta", ficha: FICHA },
    aoTentarDeNovo: () => undefined,
    aoAtualizar: () => undefined,
    ...sobrescrita,
  };
  document.body.innerHTML = renderToStaticMarkup(
    <FichaDaLojaNaTela {...props} />,
  );
  return document;
}

/**
 * A API que a ficha consulta: a ficha, a lista de tipos de negócio (da seção
 * de troca do ramo) e, quando vier, a gravação do cadastro.
 */
function respostasDaFicha(salva: FichaDaLojaNoContrato = FICHA) {
  return (chamada: ChamadaDaApi): RespostaSimulada => {
    if (chamada.url === "/api/admin/tipos-de-negocio") {
      return {
        status: 200,
        corpo: {
          tipos: [
            {
              codigo: "FOOD_SNACK",
              nome: "Lanchonete",
              controlaEstoque: false,
            },
            { codigo: "APPAREL", nome: "Roupas", controlaEstoque: true },
          ],
        },
      };
    }
    return { status: 200, corpo: chamada.metodo === "PATCH" ? salva : FICHA };
  };
}

/** Cada campo do ato como a pessoa lê: "Campo: antes → depois". */
function camposDo(elemento: Element | null | undefined): string[] {
  return [...(elemento?.querySelectorAll("dl > div") ?? [])].map(
    (par) =>
      `${par.querySelector("dt")?.textContent ?? ""} ${par.querySelector("dd")?.textContent ?? ""}`,
  );
}

afterEach(() => {
  desmontar();
  document.body.innerHTML = "";
});

describe("a ficha da loja na tela (AC-207)", () => {
  it("@spec:AC-207 @principle:P-011 cobre carregando, não encontrada, erro e sucesso, cada um com o papel de acessibilidade certo", () => {
    const carregando = desenhar({ estado: { fase: "carregando" } });
    expect(carregando.querySelector('[role="status"]')?.textContent).toContain(
      "Carregando a ficha",
    );

    const vazio = desenhar({ estado: { fase: "nao-encontrada" } });
    expect(vazio.body.textContent).toContain("Loja não encontrada");
    expect(vazio.querySelector('a[href="/admin/lojas"]')).not.toBeNull();

    const erro = desenhar({
      estado: { fase: "erro", mensagem: MENSAGEM_DE_SESSAO_DA_FICHA },
    });
    const alerta = erro.querySelector('[role="alert"]');
    expect(alerta?.textContent).toContain("A ficha não carregou");
    expect(alerta?.querySelector("button")?.textContent).toContain(
      "Tentar de novo",
    );

    const sucesso = desenhar();
    expect(sucesso.querySelector("h1")?.textContent).toBe("Pastel da Joi");
    expect(sucesso.body.textContent).toContain("Código 0001");
    expect(sucesso.body.textContent).toContain("Lanchonete · Ativa");
  });

  it("@spec:AC-207 @principle:P-012 a ficha pronta não tem violação crítica nem séria de acessibilidade", async () => {
    simularApi(respostasDaFicha());
    const tela = montar(<FichaLoja lojaId={LOJA_ID} />);
    await esperar();

    const resultado = await axe.run(tela, {
      rules: { region: { enabled: false } },
    });
    const graves = resultado.violations.filter(
      (violacao) =>
        violacao.impact === "critical" || violacao.impact === "serious",
    );
    expect(graves.map((violacao) => violacao.id)).toEqual([]);
    // O axe percorre a árvore inteira no jsdom e leva segundos com a máquina
    // ocupada: o prazo padrão de 5 s reprovava por tempo, não por violação.
  }, 60_000);

  it("@spec:AC-207 o formulário abre preenchido com o cadastro e o histórico diz quem fez o quê e quando", async () => {
    simularApi(respostasDaFicha());
    const tela = montar(<FichaLoja lojaId={LOJA_ID} />);
    await esperar();

    expect(exigir<HTMLInputElement>(tela, "#ficha-nome").value).toBe(
      "Pastel da Joi",
    );
    expect(exigir<HTMLInputElement>(tela, "#ficha-documento").value).toBe(
      "11222333000181",
    );
    expect(exigir<HTMLSelectElement>(tela, "#ficha-uf").value).toBe("SP");

    const historico = exigir<HTMLElement>(tela, "ol");
    expect(historico.textContent).toContain("Loja cadastrada");
    expect(historico.textContent).toContain("Por Administradora geral (ADMIN)");
    expect(camposDo(historico)).toEqual(["Código: — → 0001"]);
    expect(historico.querySelector("time")?.getAttribute("dateTime")).toBe(
      "2026-09-01T12:00:00.000Z",
    );
  });

  it("@spec:AC-207 salvar manda só o que mudou e mostra os dados novos com a alteração no topo do histórico", async () => {
    const salva: FichaDaLojaNoContrato = {
      ...FICHA,
      nome: "Pastelaria da Joi",
      atualizadaEm: "2026-09-27T12:00:00.000Z",
      historico: [
        {
          id: "2",
          quando: "2026-09-27T12:00:00.000Z",
          acao: "LOJA_ALTERADA",
          quem: { id: "admin-1", nome: "Administradora geral" },
          papel: "ADMIN",
          campos: [
            {
              campo: "nome",
              antes: "Pastel da Joi",
              depois: "Pastelaria da Joi",
            },
          ],
          sensivel: false,
        },
        ...FICHA.historico,
      ],
    };
    const chamadas = simularApi(respostasDaFicha(salva));
    const tela = montar(<FichaLoja lojaId={LOJA_ID} />);
    await esperar();

    digitar(exigir<HTMLInputElement>(tela, "#ficha-nome"), "Pastelaria da Joi");
    await enviar(exigir<HTMLFormElement>(tela, "form"));

    const envio = chamadas.find((chamada) => chamada.metodo === "PATCH");
    expect(envio?.url).toBe(`/api/admin/lojas/${LOJA_ID}`);
    expect(envio?.corpo).toEqual({ nome: "Pastelaria da Joi" });

    expect(tela.querySelector("h1")?.textContent).toBe("Pastelaria da Joi");
    expect(tela.textContent).toContain("Cadastro salvo");
    const primeiro = tela.querySelector("ol li");
    expect(primeiro?.textContent).toContain("Cadastro alterado");
    expect(camposDo(primeiro)).toEqual([
      "Nome: Pastel da Joi → Pastelaria da Joi",
    ]);
  });

  it("@spec:AC-207 documento inválido é recusado na tela, antes de sair qualquer requisição", async () => {
    const chamadas = simularApi(respostasDaFicha());
    const tela = montar(<FichaLoja lojaId={LOJA_ID} />);
    await esperar();

    digitar(
      exigir<HTMLInputElement>(tela, "#ficha-documento"),
      "111.222.333-44",
    );
    await enviar(exigir<HTMLFormElement>(tela, "form"));

    expect(chamadas.filter((chamada) => chamada.metodo === "PATCH")).toEqual(
      [],
    );
    expect(tela.querySelector("#ficha-documento-erro")?.textContent).toContain(
      "CPF ou CNPJ inválido",
    );
  });

  it("@spec:AC-207 salvar sem mudar nada não envia nada e diz por quê", async () => {
    const chamadas = simularApi(respostasDaFicha());
    const tela = montar(<FichaLoja lojaId={LOJA_ID} />);
    await esperar();

    await enviar(exigir<HTMLFormElement>(tela, "form"));

    expect(chamadas.filter((chamada) => chamada.metodo === "PATCH")).toEqual(
      [],
    );
    expect(tela.textContent).toContain("Nada mudou");
    expect(botao(tela, "Salvar cadastro")).toBeDefined();
  });

  it("@spec:AC-207 ficha inexistente e sessão sem acesso viram estados próprios, e não uma ficha vazia", async () => {
    simularApi(() => ({ status: 404, corpo: { erro: "nao_encontrado" } }));
    const inexistente = montar(<FichaLoja lojaId={LOJA_ID} />);
    await esperar();
    expect(inexistente.textContent).toContain("Loja não encontrada");
    desmontar();

    simularApi(() => ({ status: 403, corpo: { erro: "acesso_negado" } }));
    const semAcesso = montar(<FichaLoja lojaId={LOJA_ID} />);
    await esperar();
    expect(semAcesso.querySelector('[role="alert"]')?.textContent).toContain(
      MENSAGEM_DE_SESSAO_DA_FICHA,
    );
  });
});
