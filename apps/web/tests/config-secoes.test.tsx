// @vitest-environment jsdom
/**
 * Prova das telas de configuração por seção (T-900: AC-921, AC-923).
 *
 * A fronteira do que o dono configura aparece em dois lugares: nas rotas da
 * API (provado em `apps/api/tests/config-loja-secoes.int.test.ts`) e na
 * navegação do painel, provada aqui. E a recusa da API precisa chegar ao lado
 * do campo certo, dizendo que nada foi salvo.
 */
import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CONFIGURACOES_DA_PLATAFORMA } from "@simpleclick/contracts";

import LayoutDaConfiguracao from "../src/app/(painel)/painel/config/layout.tsx";
import { FormularioHorario } from "../src/features/config/FormularioHorario.tsx";
import { InicioDoPainel } from "../src/features/dashboard/InicioDoPainel.tsx";
import { MENSAGEM_DE_RECUSA } from "../src/features/config/useSecao.ts";
import {
  clicar,
  desmontar,
  enviar,
  esperar,
  exigir,
  montar,
  simularApi,
} from "./apoio-config.tsx";

afterEach(desmontar);

describe("a navegação das configurações (AC-921)", () => {
  function navegacao(): { rotulo: string; href: string }[] {
    const html = renderToStaticMarkup(
      <LayoutDaConfiguracao>
        <p>conteúdo</p>
      </LayoutDaConfiguracao>,
    );
    const documento = new DOMParser().parseFromString(html, "text/html");
    return [
      ...documento.querySelectorAll(
        'nav[aria-label="Configurações da loja"] a',
      ),
    ].map((link) => ({
      rotulo: link.textContent ?? "",
      href: link.getAttribute("href") ?? "",
    }));
  }

  it("@spec:AC-921 o dono encontra pagamento, entrega, horário, contato, apresentação e impressão", () => {
    expect(navegacao()).toEqual([
      { rotulo: "Pagamento", href: "/painel/config/pagamento" },
      { rotulo: "Entrega", href: "/painel/config/entrega" },
      { rotulo: "Horário", href: "/painel/config/horarios" },
      { rotulo: "Contato", href: "/painel/config/contato" },
      { rotulo: "Apresentação", href: "/painel/config/aparencia" },
      { rotulo: "Impressão", href: "/painel/config/impressao" },
    ]);
  });

  it("@spec:AC-921 e não encontra tipo de negócio, apelido, documento, contrato nem funcionalidades", () => {
    const textos = navegacao()
      .map((item) => `${item.rotulo} ${item.href}`.toLowerCase())
      .join(" | ");

    for (const daPlataforma of CONFIGURACOES_DA_PLATAFORMA) {
      expect(textos).not.toContain(daPlataforma.toLowerCase());
    }
    for (const trecho of ["ramo", "slug", "cnpj", "cpf", "/admin"]) {
      expect(textos).not.toContain(trecho);
    }
  });
});

describe("o tipo de negócio não é campo do painel (AC-323)", () => {
  /** O que o dono pode tocar numa tela: links, campos e seus rótulos. */
  function editaveis(html: string): string {
    const documento = new DOMParser().parseFromString(html, "text/html");
    return [...documento.querySelectorAll("a, input, select, textarea, label")]
      .map((elemento) =>
        [
          elemento.textContent ?? "",
          elemento.getAttribute("href") ?? "",
          elemento.getAttribute("name") ?? "",
          elemento.getAttribute("aria-label") ?? "",
        ].join(" "),
      )
      .join(" | ")
      .toLowerCase();
  }

  it("@spec:AC-323 nem a casa do painel nem as configurações oferecem o tipo de negócio para editar", () => {
    const telas = [
      renderToStaticMarkup(
        <InicioDoPainel apelidoDaLoja="pastelaria-da-vila" />,
      ),
      renderToStaticMarkup(
        <LayoutDaConfiguracao>
          <p>conteúdo</p>
        </LayoutDaConfiguracao>,
      ),
    ];

    for (const html of telas) {
      const tocavel = editaveis(html);
      for (const trecho of ["tipo de negócio", "tipo-de-negocio", "ramo"]) {
        expect(tocavel).not.toContain(trecho);
      }
    }
  });

  it("@spec:AC-323 o painel diz que o tipo de negócio é cuidado pela administração da plataforma", () => {
    const texto = new DOMParser()
      .parseFromString(
        renderToStaticMarkup(
          <InicioDoPainel apelidoDaLoja="pastelaria-da-vila" />,
        ),
        "text/html",
      )
      .body.textContent?.replace(/\s+/g, " ");

    expect(texto).toMatch(
      /Tipo de negócio[^.]*cuidados pela administração da plataforma/,
    );
  });
});

describe("a recusa chega ao lado do campo (AC-923)", () => {
  const HORARIO_SALVO = {
    semana: [{ dia: 2, faixas: [{ abre: "18:00", fecha: "22:00" }] }],
    fechadoAgora: false,
    excecoes: [],
  };

  it("@spec:AC-923 cada campo recusado ganha a própria mensagem, e a tela diz que a configuração anterior continua valendo", async () => {
    const chamadas = simularApi((chamada) =>
      chamada.metodo === "GET"
        ? { status: 200, corpo: HORARIO_SALVO }
        : {
            status: 400,
            corpo: {
              erro: "entrada_invalida",
              campos: [
                {
                  onde: "body",
                  caminho: "semana.2.faixas.0.fecha",
                  mensagem: "O fechamento precisa vir depois da abertura.",
                },
                {
                  onde: "body",
                  caminho: "excecoes",
                  mensagem: "Cada data especial aparece uma vez só.",
                },
              ],
            },
          },
    );
    const tela = montar(<FormularioHorario />);
    await esperar();

    await enviar(exigir<HTMLFormElement>(tela, "form"));

    // A tela enviou os SETE dias, e é por isso que o índice da recusa é o dia.
    const envio = chamadas.find((chamada) => chamada.metodo === "PUT");
    expect((envio?.corpo as { semana: unknown[] }).semana).toHaveLength(7);

    const campo = exigir<HTMLInputElement>(
      tela,
      'input[name="semana.2.faixas.0.fecha"]',
    );
    expect(campo.getAttribute("aria-invalid")).toBe("true");
    const mensagem = exigir(
      tela,
      `#${campo.getAttribute("aria-describedby") ?? "sem-descricao"}`,
    );
    expect(mensagem.textContent).toBe(
      "O fechamento precisa vir depois da abertura.",
    );
    expect(tela.textContent).toContain(
      "Cada data especial aparece uma vez só.",
    );
    expect(exigir(tela, '[role="status"]').textContent).toBe(
      MENSAGEM_DE_RECUSA,
    );
    expect(MENSAGEM_DE_RECUSA).toMatch(/anterior continua valendo/);
  });

  it("@spec:AC-923 salvar com sucesso limpa as marcas e mostra o que o servidor guardou", async () => {
    let salvo = HORARIO_SALVO;
    simularApi((chamada) => {
      if (chamada.metodo === "PUT") {
        salvo = {
          ...HORARIO_SALVO,
          fechadoAgora: (chamada.corpo as { fechadoAgora: boolean })
            .fechadoAgora,
        };
        return { status: 204 };
      }
      return { status: 200, corpo: salvo };
    });
    const tela = montar(<FormularioHorario />);
    await esperar();

    const fechar = exigir<HTMLInputElement>(tela, 'input[name="fechadoAgora"]');
    clicar(fechar);
    await enviar(exigir<HTMLFormElement>(tela, "form"));

    expect(tela.querySelector('[aria-invalid="true"]')).toBeNull();
    expect(exigir(tela, '[role="status"]').textContent).toContain(
      "Horário salvo",
    );
    expect(
      exigir<HTMLInputElement>(tela, 'input[name="fechadoAgora"]').checked,
    ).toBe(true);
  });

  it("@spec:AC-923 falha ao carregar não mostra formulário vazio como se fosse a configuração da loja", async () => {
    simularApi(() => ({ status: 401, corpo: { erro: "nao_autenticado" } }));
    const tela = montar(<FormularioHorario />);
    await esperar();

    expect(tela.querySelector("form")).toBeNull();
    expect(exigir(tela, '[role="alert"]').textContent).toContain(
      "Não foi possível carregar",
    );
  });
});
