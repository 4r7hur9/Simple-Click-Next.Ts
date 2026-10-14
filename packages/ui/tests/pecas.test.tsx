import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Botao } from "../src/botao";
import { CampoDeSenha, avaliarForcaDaSenha } from "../src/campo-senha";
import { Cartao } from "../src/cartao";
import { IconeEditar } from "../src/icones";
import { MenuSuspenso } from "../src/menu-suspenso";
import { Sanfona } from "../src/sanfona";
import { Selo } from "../src/selo";
import { Tabela, ordenarLinhas } from "../src/tabela";

/**
 * As peças da reforma visual: o que se prova é o que chega à árvore de
 * acessibilidade (nome, papel, estado), e não o desenho.
 */

const CSS = readFileSync(
  fileURLToPath(new URL("../styles/componentes.css", import.meta.url)),
  "utf8",
);

describe("linguagem visual", () => {
  it("usa os raios com nome de uso e nenhum efeito proibido", () => {
    expect(CSS).toMatch(/\.sc-cartao\s*\{[\s\S]*?var\(--raio-cartao\)/);
    expect(CSS).toMatch(/\.sc-dialogo\s*\{[\s\S]*?var\(--raio-janela\)/);
    expect(CSS).toMatch(/\.sc-selo\s*\{[\s\S]*?var\(--raio-completo\)/);
    expect(CSS).toMatch(/\.sc-cartao\s*\{[\s\S]*?var\(--sombra-larga\)/);
    expect(CSS).not.toContain("backdrop-filter");
  });
});

describe("botão", () => {
  it("só-ícone continua com nome para o leitor de tela", () => {
    const html = renderToStaticMarkup(
      <Botao icone={<IconeEditar />} soIcone variante="secundaria">
        Editar produto
      </Botao>,
    );

    expect(html).toContain("sc-botao--so-icone");
    expect(html).toContain('<span class="sc-so-leitor">Editar produto</span>');
    expect(html).toContain('aria-hidden="true"');
  });

  it("pílula e grande viram classe, sem mexer no resto", () => {
    const html = renderToStaticMarkup(
      <Botao forma="pilula" tamanho="grande">
        Fazer pedido
      </Botao>,
    );

    expect(html).toContain("sc-botao--pilula");
    expect(html).toContain("sc-botao--grande");
  });
});

describe("força da senha", () => {
  it("sobe de nível com tamanho e variedade", () => {
    expect(avaliarForcaDaSenha("")).toEqual({ nivel: 0, rotulo: "" });
    expect(avaliarForcaDaSenha("abc").nivel).toBe(1);
    expect(avaliarForcaDaSenha("abcdefgh").nivel).toBe(1);
    expect(avaliarForcaDaSenha("Abcdefgh").nivel).toBe(2);
    expect(avaliarForcaDaSenha("Abcdefg1").nivel).toBe(3);
    expect(avaliarForcaDaSenha("Abcdefg1!").nivel).toBe(4);
  });

  it("a senha mais forte enche o medidor, em vez de esvaziá-lo", () => {
    // Todos os critérios ao mesmo tempo somam 5 pontos: sem o teto, o nível
    // caía fora da lista e o medidor ficava vazio justamente aqui.
    const forte = avaliarForcaDaSenha("Uma-senha-longa-123");
    expect(forte).toEqual({ nivel: 4, rotulo: "forte" });

    const html = renderToStaticMarkup(
      <CampoDeSenha
        defaultValue="Uma-senha-longa-123"
        id="senha"
        mostrarForca
        rotulo="Senha nova"
      />,
    );
    expect(html.match(/data-cheia="true"/g)).toHaveLength(4);
    expect(html).toContain('aria-valuenow="4"');
    expect(html).toContain('aria-valuetext="forte"');
  });

  it("senha curta não passa de média, por mais variada que seja", () => {
    expect(avaliarForcaDaSenha("Ab1!").nivel).toBe(2);
  });
});

describe("campo de senha", () => {
  it("o olho é um botão nomeado que diz se está ligado", () => {
    const html = renderToStaticMarkup(
      <CampoDeSenha id="senha" rotulo="Senha" />,
    );

    expect(html).toContain('type="password"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-controls="senha"');
    expect(html).toContain("Mostrar senha");
    expect(html).toContain('for="senha"');
    expect(html).toContain('autoComplete="current-password"');
    // Sem medidor no login: ele só faz sentido em senha nova.
    expect(html).not.toContain('role="meter"');
  });

  it("anuncia a força em aria-live e liga o erro ao controle", () => {
    const html = renderToStaticMarkup(
      <CampoDeSenha
        defaultValue="abc"
        erro="A senha precisa de 8 caracteres."
        id="nova"
        mostrarForca
        rotulo="Senha nova"
      />,
    );

    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Força da senha: fraca");
    expect(html).toContain('aria-describedby="nova-erro"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('autoComplete="new-password"');
  });

  it("não vaza as props do campo como atributo do input", () => {
    const html = renderToStaticMarkup(
      <CampoDeSenha dica="Use 8 ou mais." id="s" rotulo="Senha" />,
    );

    expect(html).not.toMatch(/<input[^>]*\brotulo=/);
    expect(html).not.toMatch(/<input[^>]*\bdica=/);
  });
});

describe("cartão", () => {
  it("desenha ícone, descrição e ações no cabeçalho", () => {
    const html = renderToStaticMarkup(
      <Cartao
        acoes={<Selo tom="sucesso">Aberta</Selo>}
        descricao="Rua das Flores, 12"
        icone={<IconeEditar />}
        titulo="Padaria do Zé"
      >
        <p>corpo</p>
      </Cartao>,
    );

    expect(html).toContain("sc-cartao__cabecalho");
    expect(html).toContain("Rua das Flores, 12");
    expect(html).toContain("Aberta");
  });
});

describe("selo", () => {
  it("a bolinha é enfeite; o sentido está no texto", () => {
    const html = renderToStaticMarkup(<Selo tom="erro">Recusado</Selo>);

    expect(html).toContain("sc-selo--erro");
    expect(html).toContain(
      '<span aria-hidden="true" class="sc-selo__bolinha"></span>Recusado',
    );
    expect(html).not.toContain("role=");
  });
});

describe("sanfona", () => {
  it("é details e summary nativos, com grupo pelo name", () => {
    const html = renderToStaticMarkup(
      <Sanfona abertaInicialmente grupo="ajuda" titulo="Como pago?">
        PIX ou cartão.
      </Sanfona>,
    );

    expect(html).toMatch(/^<details[^>]*name="ajuda"[^>]*open=""/);
    expect(html).toContain("<summary");
    expect(html).toContain("PIX ou cartão.");
  });
});

describe("menu suspenso", () => {
  it("abre um popover nativo e diz que está fechado", () => {
    const html = renderToStaticMarkup(
      <MenuSuspenso
        id="conta"
        itens={[
          { id: "perfil", rotulo: "Meu perfil", href: "/conta" },
          { id: "sair", rotulo: "Sair", perigo: true },
        ]}
        rotulo="Minha conta"
      />,
    );

    expect(html).toContain('popoverTarget="conta-painel"');
    expect(html).toContain('popover="auto"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('href="/conta"');
    // Lista de botões, e não `menu`: o papel promete setas que não existem.
    expect(html).not.toContain('role="menu"');
  });
});

type Pedido = { id: string; cliente: string; total: number | null };

const PEDIDOS: readonly Pedido[] = Object.freeze([
  { id: "a", cliente: "Bruna", total: 30 },
  { id: "b", cliente: "ana", total: null },
  { id: "c", cliente: "Carlos", total: 12 },
]);

describe("tabela", () => {
  it("ordena uma cópia, sem mexer no array recebido", () => {
    const crescente = ordenarLinhas(PEDIDOS, (p) => p.total, "crescente");
    const decrescente = ordenarLinhas(PEDIDOS, (p) => p.total, "decrescente");

    expect(crescente.map((p) => p.id)).toEqual(["c", "a", "b"]);
    // Vazio fica no fim nos dois sentidos.
    expect(decrescente.map((p) => p.id)).toEqual(["a", "c", "b"]);
    expect(PEDIDOS.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("compara texto em português, sem separar maiúscula de minúscula", () => {
    const porNome = ordenarLinhas(PEDIDOS, (p) => p.cliente, "crescente");
    expect(porNome.map((p) => p.cliente)).toEqual(["ana", "Bruna", "Carlos"]);
  });

  it("marca a coluna ordenada com aria-sort e nomeia a caixa de rolagem", () => {
    const html = renderToStaticMarkup(
      <Tabela
        chaveDaLinha={(p) => p.id}
        colunas={[
          {
            chave: "cliente",
            titulo: "Cliente",
            celula: (p) => p.cliente,
            valorParaOrdenar: (p) => p.cliente,
          },
          {
            chave: "total",
            titulo: "Total",
            celula: (p) => p.total ?? "—",
            alinhamento: "fim",
          },
        ]}
        legenda="Pedidos de hoje"
        linhas={PEDIDOS}
        ordemInicial={{ coluna: "cliente", direcao: "crescente" }}
      />,
    );

    expect(html).toContain('aria-sort="ascending"');
    expect(html).toContain("<caption");
    expect(html).toContain('role="region"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('data-rotulo="Total"');
    expect(html.indexOf("ana")).toBeLessThan(html.indexOf("Bruna"));
  });

  it("sem linhas, mostra o vazio em vez de tabela muda", () => {
    const html = renderToStaticMarkup(
      <Tabela
        chaveDaLinha={(p: Pedido) => p.id}
        colunas={[]}
        legenda="Pedidos"
        linhas={[]}
        tituloVazio="Nenhum pedido hoje"
      />,
    );

    expect(html).toContain("Nenhum pedido hoje");
    expect(html).not.toContain("<table");
  });
});
