// @vitest-environment jsdom
/**
 * Prova do feed do lojista (card #38): a tela /painel/feed lê e grava a
 * configuração (só o que mudou), a prévia acompanha ao vivo, e o formulário
 * de produto mostra "Publicar no feed" só para quem pode mexer no feed —
 * com o padrão da loja no produto novo.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FormularioDoFeed,
  motivoForaDoFeed,
  produtosQueVaoParaOFeed,
} from "../src/features/feed-config/FormularioDoFeed.tsx";
import type { LojaDaPrevia } from "../src/features/feed-config/PreviaNoFeed.tsx";
import { FormularioProduto } from "../src/features/painel-catalogo/FormularioProduto.tsx";
import {
  botao,
  clicar,
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
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

afterEach(desmontar);

const LOJA: LojaDaPrevia = {
  nome: "Pastelaria da Vila",
  ramo: "Lanchonete",
  logo: null,
  capa: null,
  bairro: "Centro",
  cidade: "Campinas",
  formasDeEntrega: ["DELIVERY", "PICKUP"],
};

const PRODUTOS = [
  {
    id: "p1",
    nome: "Pastel de queijo",
    precoCentavos: 1200,
    status: "PUBLISHED",
    disponivel: true,
    publicarNoFeed: true,
  },
  {
    id: "p2",
    nome: "Pastel de carne",
    precoCentavos: 1300,
    status: "DRAFT",
    disponivel: true,
    publicarNoFeed: true,
  },
  {
    id: "p3",
    nome: "Caldo de cana",
    precoCentavos: 800,
    status: "PUBLISHED",
    disponivel: true,
    publicarNoFeed: false,
  },
];

function apiDoFeed(
  config = { aparecerNoFeed: true, publicarProdutosNovos: false },
) {
  return (chamada: ChamadaDaApi): RespostaSimulada => {
    if (chamada.url === "/api/loja/feed") {
      return {
        status: 200,
        corpo:
          chamada.metodo === "PUT"
            ? { ...config, ...(chamada.corpo as object) }
            : config,
      };
    }
    if (chamada.url === "/api/catalogo/produtos")
      return { status: 200, corpo: { produtos: PRODUTOS } };
    if (chamada.url === "/api/catalogo/categorias")
      return {
        status: 200,
        corpo: { categorias: [{ id: "c1", nome: "Pastéis" }] },
      };
    return { status: 200, corpo: { id: "novo" } };
  };
}

describe("regras do feed", () => {
  it("só vai para o feed o produto marcado, publicado e disponível", () => {
    expect(produtosQueVaoParaOFeed(PRODUTOS).map((p) => p.id)).toEqual(["p1"]);
  });

  it("explica por que a loja fica fora", () => {
    expect(motivoForaDoFeed(true, true)).toBeNull();
    expect(motivoForaDoFeed(false, true)).toMatch(/desligado/);
    expect(motivoForaDoFeed(true, false)).toMatch(/aprovada/);
  });
});

describe("/painel/feed", () => {
  it("carrega, mostra a prévia e grava só o que mudou", async () => {
    const chamadas = simularApi(apiDoFeed());
    const tela = montar(<FormularioDoFeed loja={LOJA} lojaAtiva />);
    await esperar();

    const previa = exigir(tela, "[data-previa-feed] article");
    expect(previa.getAttribute("data-no-feed")).toBe("sim");
    expect(previa.textContent).toContain("Pastel de queijo");
    expect(previa.textContent).not.toContain("Pastel de carne");
    expect(previa.textContent).toContain("1 produto no feed");
    expect(botao(tela, "Salvar").disabled).toBe(true);

    clicar(exigir(tela, 'input[name="aparecerNoFeed"]'));
    expect(previa.getAttribute("data-no-feed")).toBe("nao");
    clicar(exigir(tela, 'input[name="publicarProdutosNovos"]'));

    await enviar(exigir<HTMLFormElement>(tela, "form"));
    const put = chamadas.find((c) => c.metodo === "PUT");
    expect(put?.corpo).toEqual({
      aparecerNoFeed: false,
      publicarProdutosNovos: true,
    });
    expect(tela.textContent).toContain("Configuração do feed salva.");
  });

  it("loja ainda não ativa fica fora mesmo com o feed ligado", async () => {
    simularApi(apiDoFeed());
    const tela = montar(<FormularioDoFeed loja={LOJA} lojaAtiva={false} />);
    await esperar();
    expect(
      exigir(tela, "[data-previa-feed] article").getAttribute("data-no-feed"),
    ).toBe("nao");
    expect(tela.textContent).toContain("aprovada e ativa");
  });
});

describe("formulário de produto: Publicar no feed", () => {
  it("produto novo nasce com o padrão da loja e envia o campo", async () => {
    const chamadas = simularApi(
      apiDoFeed({ aparecerNoFeed: true, publicarProdutosNovos: true }),
    );
    const tela = montar(<FormularioProduto />);
    await esperar();

    const caixa = exigir<HTMLInputElement>(
      tela,
      'input[name="publicarNoFeed"]',
    );
    expect(caixa.checked).toBe(true);

    digitar(
      exigir<HTMLInputElement>(
        tela,
        'input[placeholder="Ex.: Pastel de queijo"]',
      ),
      "Pastel",
    );
    digitar(
      exigir<HTMLInputElement>(tela, 'input[placeholder="Ex.: 19,90"]'),
      "12,00",
    );
    await enviar(exigir<HTMLFormElement>(tela, "form"));
    const post = chamadas.find((c) => c.metodo === "POST");
    expect(post?.corpo).toMatchObject({ publicarNoFeed: true });
  });

  it("equipe (403 no feed) não vê o campo nem o envia", async () => {
    const base = apiDoFeed();
    const chamadas = simularApi((chamada) =>
      chamada.url === "/api/loja/feed"
        ? { status: 403, corpo: { erro: "sem_permissao", permissao: "feed" } }
        : base(chamada),
    );
    const tela = montar(<FormularioProduto />);
    await esperar();

    expect(tela.querySelector('input[name="publicarNoFeed"]')).toBeNull();
    digitar(
      exigir<HTMLInputElement>(
        tela,
        'input[placeholder="Ex.: Pastel de queijo"]',
      ),
      "Pastel",
    );
    digitar(
      exigir<HTMLInputElement>(tela, 'input[placeholder="Ex.: 19,90"]'),
      "12,00",
    );
    await enviar(exigir<HTMLFormElement>(tela, "form"));
    const post = chamadas.find((c) => c.metodo === "POST");
    expect(post?.corpo).not.toHaveProperty("publicarNoFeed");
  });

  it("na edição, mantém o que o produto tem gravado", async () => {
    simularApi(
      apiDoFeed({ aparecerNoFeed: false, publicarProdutosNovos: true }),
    );
    const tela = montar(
      <FormularioProduto
        produto={{
          id: "p3",
          nome: "Caldo de cana",
          descricao: null,
          categoriaId: "c1",
          precoCentavos: 800,
          status: "PUBLISHED",
          disponivel: true,
          publicarNoFeed: false,
        }}
      />,
    );
    await esperar();
    expect(
      exigir<HTMLInputElement>(tela, 'input[name="publicarNoFeed"]').checked,
    ).toBe(false);
    expect(tela.textContent).toContain("fora do feed");
  });
});
