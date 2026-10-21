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
import { afterEach, describe, expect, it, vi } from "vitest";

import { CabecalhoDaFicha } from "../src/features/admin/CabecalhoDaFicha.tsx";
import { DadosDaLoja } from "../src/features/admin/DadosDaLoja.tsx";
import { MENSAGEM_DE_SESSAO_DA_FICHA } from "../src/features/admin/FichaLoja.tsx";
import { HistoricoDaLoja } from "../src/features/admin/HistoricoDaLoja.tsx";
import { ProvedorDaFicha } from "../src/features/admin/ProvedorDaFicha.tsx";
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () =>
    "/admin/lojas/3a3c3d4e-0000-4000-8000-000000000001/cadastro",
}));

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

/** A ficha como as abas a montam: um provedor, o cabeçalho e as abas de dados. */
function FichaLoja({ lojaId }: { readonly lojaId: string }) {
  return (
    <ProvedorDaFicha lojaId={lojaId}>
      <CabecalhoDaFicha />
      <DadosDaLoja />
      <HistoricoDaLoja />
    </ProvedorDaFicha>
  );
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
  it("@spec:AC-207 @principle:P-011 cobre carregando, não encontrada, erro e sucesso, cada um com o papel de acessibilidade certo", async () => {
    simularApi(respostasDaFicha());
    const tela = montar(<FichaLoja lojaId={LOJA_ID} />);
    expect(tela.querySelector('[role="status"]')?.textContent).toContain(
      "Carregando a ficha",
    );
    await esperar();
    expect(tela.querySelector("h1")?.textContent).toBe("Pastel da Joi");
    expect(tela.textContent).toContain("Código 0001");
    expect(tela.textContent).toContain("Ativa");
    expect(tela.textContent).toContain("Lanchonete");
    desmontar();

    simularApi(() => ({ status: 404, corpo: { erro: "nao_encontrado" } }));
    const vazio = montar(<FichaLoja lojaId={LOJA_ID} />);
    await esperar();
    expect(vazio.textContent).toContain("Loja não encontrada");
    expect(vazio.querySelector('a[href="/admin/lojas"]')).not.toBeNull();
    desmontar();

    simularApi(() => ({ status: 403, corpo: { erro: "acesso_negado" } }));
    const erro = montar(<FichaLoja lojaId={LOJA_ID} />);
    await esperar();
    const alerta = erro.querySelector('[role="alert"]');
    expect(alerta?.textContent).toContain("A ficha não carregou");
    expect(alerta?.textContent).toContain(MENSAGEM_DE_SESSAO_DA_FICHA);
    expect(alerta?.querySelector("button")?.textContent).toContain(
      "Tentar de novo",
    );
  });

  it("card #29 a ficha é buscada uma vez só, mesmo com cabeçalho e abas: abrir a ficha deixa um registro na trilha", async () => {
    const chamadas = simularApi(respostasDaFicha());
    montar(<FichaLoja lojaId={LOJA_ID} />);
    await esperar();
    expect(
      chamadas.filter(
        (chamada) =>
          chamada.metodo === "GET" &&
          chamada.url === `/api/admin/lojas/${LOJA_ID}`,
      ),
    ).toHaveLength(1);
  });

  it("card #29 a ficha pendente tem Aprovar e Recusar no cabeçalho; a recusada mostra o motivo; a ativa oferece Desativar", async () => {
    simularApi(() => ({
      status: 200,
      corpo: { ...FICHA, status: "PENDING_APPROVAL" },
    }));
    const pendente = montar(<FichaLoja lojaId={LOJA_ID} />);
    await esperar();
    const botoes = [...pendente.querySelectorAll("header button")].map((b) =>
      b.textContent?.trim(),
    );
    expect(botoes).toEqual(["Aprovar", "Recusar"]);
    expect(pendente.textContent).toContain("Esta loja espera a sua aprovação");
    desmontar();

    simularApi(() => ({
      status: 200,
      corpo: {
        ...FICHA,
        status: "REJECTED",
        recusa: {
          desde: "2026-10-01T12:00:00.000Z",
          motivo: "Documento ilegível",
        },
      },
    }));
    const recusada = montar(<FichaLoja lojaId={LOJA_ID} />);
    await esperar();
    expect(recusada.textContent).toContain("Motivo: Documento ilegível");
    expect(botao(recusada, "Aprovar mesmo assim")).toBeDefined();
    desmontar();

    simularApi(respostasDaFicha());
    const ativa = montar(<FichaLoja lojaId={LOJA_ID} />);
    await esperar();
    expect(botao(ativa, "Desativar loja")).toBeDefined();
    expect(
      ativa.querySelector(`a[href="/loja/pastel-da-joi"]`)?.textContent,
    ).toContain("Ver vitrine");
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
    expect(historico.textContent).toContain("Por Administradora geral (administração)");
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
});
