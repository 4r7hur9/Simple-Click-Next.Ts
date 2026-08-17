import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Botao } from "../src/botao";
import {
  CONTRASTE_MINIMO_GRAFICO,
  CONTRASTE_MINIMO_TEXTO,
  relacaoDeContraste,
} from "../src/contraste";
import { PALETA_CLARA, PALETA_ESCURA } from "../src/tokens";
import { TemaDaLoja, calcularTemaDaLoja } from "../src/tema-loja";

/**
 * A loja aplica a identidade dela sem quebrar o sistema (AC-015).
 *
 * O que se prova aqui é o comportamento inteiro: a cor escolhida chega à
 * vitrine, o texto por cima dela continua legível quando a escolha é ruim, e o
 * conserto não acontece em silêncio.
 */

/** Lê uma variável de CSS do atributo de estilo que o React gerou. */
function variavelNoHtml(html: string, nome: string): string | null {
  const achado = new RegExp(`${nome}\\s*:\\s*([^;"]+)`).exec(html);
  return achado === null ? null : (achado[1] ?? "").trim();
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** Amostra da escala de cor que um seletor de cores oferece ao dono da loja. */
const CANAIS = [0, 51, 102, 128, 153, 204, 255];
const CORES_DA_VARREDURA = CANAIS.flatMap((vermelho) =>
  CANAIS.flatMap((verde) =>
    CANAIS.map((azul) => `rgb(${vermelho}, ${verde}, ${azul})`),
  ),
);

/** As duas promessas do critério, medidas de uma vez para uma cor e um tema. */
function continuaLegivel(cor: string, tema: "claro" | "escuro"): boolean {
  const paleta = tema === "claro" ? PALETA_CLARA : PALETA_ESCURA;
  const { corPrincipal, corDoTexto, corPrincipalComoTexto } =
    calcularTemaDaLoja(cor, { tema });

  return (
    relacaoDeContraste(corDoTexto, corPrincipal) >= CONTRASTE_MINIMO_TEXTO &&
    relacaoDeContraste(corPrincipalComoTexto, paleta.fundo) >=
      CONTRASTE_MINIMO_TEXTO
  );
}

describe("cor da loja aplicada na vitrine", () => {
  it("@spec:AC-015 a cor escolhida pelo dono é a cor de preenchimento, sem alteração", () => {
    const html = renderToStaticMarkup(
      <TemaDaLoja corPrincipal="#0f766e">
        <Botao>Fazer pedido</Botao>
      </TemaDaLoja>,
    );

    // A identidade não é sequestrada: o que o dono escolheu é o que pinta.
    expect(variavelNoHtml(html, "--cor-primaria")).toBe("#0f766e");
    expect(html).toContain("Fazer pedido");
  });

  it("@spec:AC-015 cor com bom contraste mantém a letra clara e não gera aviso", () => {
    const calculado = calcularTemaDaLoja("#0f766e");

    expect(calculado.corDoTexto).toBe(PALETA_CLARA.emPrimaria);
    expect(calculado.avisos).toEqual([]);
    expect(calculado.relacaoDoTexto).toBeGreaterThanOrEqual(
      CONTRASTE_MINIMO_TEXTO,
    );
  });

  it("@spec:AC-015 cor clara demais troca a letra para a escura, e a vitrine continua legível", () => {
    const html = renderToStaticMarkup(
      <TemaDaLoja corPrincipal="#ffe066">
        <Botao>Fazer pedido</Botao>
      </TemaDaLoja>,
    );

    const preenchimento = variavelNoHtml(html, "--cor-primaria");
    const letra = variavelNoHtml(html, "--cor-em-primaria");

    expect(preenchimento).toBe("#ffe066");
    expect(letra).toBe(PALETA_CLARA.tinta);
    // A promessa do critério, medida: o botão da loja não fica ilegível.
    expect(
      relacaoDeContraste(letra ?? "", preenchimento ?? ""),
    ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
  });

  it("@spec:AC-015 a mesma cor clara também vira um tom legível quando é usada como texto", () => {
    const calculado = calcularTemaDaLoja("#ffe066");

    // Amarelo sobre branco é o caso em que o link da loja simplesmente some.
    expect(calculado.corPrincipalComoTexto).not.toBe("#ffe066");
    expect(
      relacaoDeContraste(calculado.corPrincipalComoTexto, PALETA_CLARA.fundo),
    ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
    expect(
      relacaoDeContraste(
        calculado.variaveis["--cor-foco"] ?? "",
        PALETA_CLARA.fundo,
      ),
    ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_GRAFICO);
  });

  it("@spec:AC-015 nenhuma cor escolhida derruba o mínimo de legibilidade, em nenhum dos temas", () => {
    // Varredura de verdade: a cor vem de um seletor, e o dono pode escolher
    // qualquer uma. Conferir só duas cores esconderia a faixa cinzenta do meio,
    // que é justamente onde nem a letra clara nem a escura funcionam sozinhas.
    const reprovadas = CORES_DA_VARREDURA.flatMap((cor) =>
      (["claro", "escuro"] as const)
        .filter((tema) => !continuaLegivel(cor, tema))
        .map((tema) => `${tema}: ${cor}`),
    );

    expect(reprovadas).toEqual([]);
  });
});

describe("aviso do conserto", () => {
  it("@spec:AC-015 o conserto vira aviso em português, dizendo a cor e a relação alcançada", () => {
    const avisados: string[][] = [];

    renderToStaticMarkup(
      <TemaDaLoja
        aoAvisar={(avisos) => avisados.push([...avisos])}
        corPrincipal="#ffe066"
      >
        <Botao>Fazer pedido</Botao>
      </TemaDaLoja>,
    );

    const avisos = avisados.at(0) ?? [];
    expect(avisos.length).toBeGreaterThan(0);
    expect(avisos.join(" ")).toContain("#ffe066");
    expect(avisos.join(" ")).toContain("4.5:1");
  });

  it("@spec:AC-015 sem quem escute, o aviso vai para o registro do ambiente — nunca para a tela do cliente", () => {
    const registro = vi.spyOn(console, "warn").mockImplementation(() => {});

    const html = renderToStaticMarkup(
      <TemaDaLoja corPrincipal="#ffe066">
        <Botao>Fazer pedido</Botao>
      </TemaDaLoja>,
    );

    expect(registro).toHaveBeenCalled();
    expect(registro.mock.calls[0]?.[0]).toContain("design system");
    // Quem compra na loja não tem nada a ver com a configuração dela.
    expect(html).not.toContain("não tem contraste suficiente");
    expect(html).toContain('data-contraste-ajustado="sim"');
  });

  it("@spec:AC-015 cor boa não gera aviso nenhum", () => {
    const registro = vi.spyOn(console, "warn").mockImplementation(() => {});

    const html = renderToStaticMarkup(
      <TemaDaLoja corPrincipal="#0f766e">
        <Botao>Fazer pedido</Botao>
      </TemaDaLoja>,
    );

    expect(registro).not.toHaveBeenCalled();
    expect(html).not.toContain("data-contraste-ajustado");
  });

  it("@spec:AC-015 cor irreconhecível não derruba a vitrine: cai no tema do sistema e avisa", () => {
    const registro = vi.spyOn(console, "warn").mockImplementation(() => {});

    const html = renderToStaticMarkup(
      <TemaDaLoja corPrincipal="azul da loja">
        <Botao>Fazer pedido</Botao>
      </TemaDaLoja>,
    );

    expect(variavelNoHtml(html, "--cor-primaria")).toBe(PALETA_CLARA.primaria);
    expect(html).toContain("Fazer pedido");
    expect(registro.mock.calls.flat().join(" ")).toContain(
      "não foi reconhecida",
    );
  });
});

describe("isolamento entre lojas", () => {
  it("@spec:AC-015 a identidade vale só dentro do envelope da loja", () => {
    const html = renderToStaticMarkup(
      <div>
        <TemaDaLoja corPrincipal="#0f766e">
          <Botao>Vitrine</Botao>
        </TemaDaLoja>
        <Botao>Painel</Botao>
      </div>,
    );

    // A cor aparece uma vez só: quem está fora do envelope segue com o tema do
    // sistema. É o que impede a cor de uma loja de vazar para o painel.
    expect(html.match(/--cor-primaria:/g)).toHaveLength(1);
  });

  it("@spec:AC-015 no tema escuro a decisão muda, porque lá a letra padrão é escura", () => {
    const escuro = calcularTemaDaLoja("#8ab4ff", { tema: "escuro" });
    const claro = calcularTemaDaLoja("#8ab4ff", { tema: "claro" });

    expect(escuro.corDoTexto).toBe(PALETA_ESCURA.emPrimaria);
    expect(escuro.avisos).toEqual([]);
    // A mesma cor, no tema claro, exige conserto para virar texto.
    expect(claro.corPrincipalComoTexto).not.toBe("#8ab4ff");
  });
});
