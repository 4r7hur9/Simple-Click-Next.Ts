import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement, type ReactElement } from "react";
import { Aviso } from "../src/aviso";
import { Botao } from "../src/botao";
import { Campo } from "../src/campo";
import { Cartao } from "../src/cartao";
import { Dialogo } from "../src/dialogo";
import { Lista } from "../src/lista";
import { Carregando, Erro, Esqueleto, Sucesso, Vazio } from "../src/estados";

/**
 * Os quatro estados dos componentes base (AC-013).
 *
 * Cada asserção olha o comportamento, não a existência: o que se prova é que o
 * estado chega até a árvore de acessibilidade — o papel certo, o texto certo, o
 * controle realmente bloqueado. Componente que "tem" estado de carregando mas
 * deixa o botão clicável não cumpre nada.
 */

/** Procura o primeiro elemento de um tipo na árvore devolvida pelo componente. */
function encontrar(no: unknown, tipo: string): ReactElement | null {
  if (Array.isArray(no)) {
    for (const filho of no) {
      const achado = encontrar(filho, tipo);
      if (achado !== null) return achado;
    }
    return null;
  }
  if (!isValidElement(no)) return null;
  if (no.type === tipo) return no;
  return encontrar((no.props as { children?: unknown }).children, tipo);
}

describe("estados reutilizáveis", () => {
  it("@spec:AC-013 a espera é anunciada com educação, e nunca fica em tela muda", () => {
    const html = renderToStaticMarkup(
      <Carregando rotulo="Carregando o catálogo…" />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Carregando o catálogo…");
  });

  it("@spec:AC-013 o esqueleto esconde o desenho do leitor de tela e anuncia por texto", () => {
    const html = renderToStaticMarkup(
      <Esqueleto linhas={4} rotulo="Carregando a lista…" />,
    );

    // Barra cinza não significa nada para quem não enxerga.
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(4);
    expect(html).toContain("Carregando a lista…");
    expect(html).toContain('role="status"');
  });

  it("@spec:AC-013 o vazio explica a situação e oferece saída", () => {
    const html = renderToStaticMarkup(
      <Vazio
        acao={<a href="/painel/catalogo/novo">Cadastrar produto</a>}
        descricao="Cadastre o primeiro produto."
        titulo="Nenhum produto cadastrado"
      />,
    );

    expect(html).toContain("Nenhum produto cadastrado");
    expect(html).toContain("Cadastre o primeiro produto.");
    // Vazio sem saída vira beco: o usuário não sabe o que fazer em seguida.
    expect(html).toContain('href="/painel/catalogo/novo"');
    expect(html).not.toContain('role="alert"');
  });

  it("@spec:AC-013 o erro interrompe o leitor de tela e mostra o código de referência", () => {
    const html = renderToStaticMarkup(
      <Erro mensagem="Não foi possível carregar." referencia="ref-7f3a" />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("Não foi possível carregar.");
    expect(html).toContain("ref-7f3a");
  });

  it("@spec:AC-013 o sucesso confirma sem roubar a vez de quem digita", () => {
    const html = renderToStaticMarkup(
      <Sucesso
        descricao="A chave PIX foi salva."
        titulo="Configuração salva"
      />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    // `alert` interromperia a digitação para dizer que deu certo.
    expect(html).not.toContain('role="alert"');
  });
});

describe("botão", () => {
  it("@spec:AC-013 carregando bloqueia o clique de verdade, e não só troca o rótulo", () => {
    const arvore = Botao({ carregando: true, children: "Salvar" });
    const botao = encontrar(arvore, "button");
    const props = botao?.props as { disabled?: boolean; "aria-busy"?: boolean };

    // Sem `disabled` real, o segundo clique chega antes da primeira resposta e
    // o pedido nasce duplicado.
    expect(props.disabled).toBe(true);
    expect(props["aria-busy"]).toBe(true);
  });

  it("@spec:AC-013 carregando anuncia a espera sem apagar o rótulo da ação", () => {
    const html = renderToStaticMarkup(
      <Botao carregando rotuloDeEspera="Salvando o pedido…">
        Salvar
      </Botao>,
    );

    expect(html).toContain("Salvando o pedido…");
    // O rótulo continua: botão que troca de nome no meio da ação desorienta.
    expect(html).toContain("Salvar");
  });

  it("@spec:AC-013 desabilitado bloqueia sem anunciar espera nenhuma", () => {
    const html = renderToStaticMarkup(<Botao desabilitado>Indisponível</Botao>);

    expect(html).toContain("disabled");
    expect(html).not.toContain("aria-busy");
  });

  it("@spec:AC-013 o botão pronto continua clicável e chama a ação", () => {
    const aoClicar = vi.fn();
    const arvore = Botao({ children: "Salvar", onClick: aoClicar });
    const botao = encontrar(arvore, "button");
    const props = botao?.props as {
      disabled?: boolean;
      onClick?: () => void;
    };
    props.onClick?.();

    expect(props.disabled).toBe(false);
    expect(aoClicar).toHaveBeenCalledTimes(1);
  });
});

describe("campo", () => {
  it("@spec:AC-013 o erro marca o campo como inválido e é lido junto dele", () => {
    const html = renderToStaticMarkup(
      <Campo
        erro="Este apelido já é usado por outra loja."
        id="apelido"
        rotulo="Apelido da loja"
      />,
    );

    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="apelido-erro"');
    expect(html).toContain('id="apelido-erro"');
    // `alert` faz o leitor de tela avisar na hora em que o erro aparece.
    expect(html).toContain('role="alert"');
    expect(html).toContain("Este apelido já é usado por outra loja.");
  });

  it("@spec:AC-013 o sucesso confirma e some com a marca de inválido", () => {
    const html = renderToStaticMarkup(
      <Campo id="apelido" rotulo="Apelido da loja" sucesso="Apelido livre." />,
    );

    expect(html).not.toContain("aria-invalid");
    expect(html).toContain('aria-describedby="apelido-sucesso"');
    expect(html).toContain("Apelido livre.");
  });

  it("@spec:AC-013 carregando anuncia a verificação em andamento ligada ao campo", () => {
    const html = renderToStaticMarkup(
      <Campo
        carregando
        id="apelido"
        rotulo="Apelido da loja"
        rotuloDeEspera="Verificando se o apelido está livre…"
      />,
    );

    expect(html).toContain('aria-describedby="apelido-espera"');
    expect(html).toContain("Verificando se o apelido está livre…");
    expect(html).toContain('role="status"');
  });

  it("@spec:AC-013 o rótulo aponta para o controle, que é o que o leitor de tela segue", () => {
    const html = renderToStaticMarkup(
      <Campo
        dica="Aparece no endereço da vitrine."
        id="apelido"
        obrigatorio
        rotulo="Apelido da loja"
      />,
    );

    expect(html).toContain('for="apelido"');
    expect(html).toContain('id="apelido"');
    expect(html).toContain('aria-describedby="apelido-dica"');
    expect(html).toContain("required");
  });
});

describe("cartão", () => {
  const estados = [
    { estado: "carregando", esperado: 'role="status"' },
    { estado: "vazio", esperado: "Nada por aqui ainda" },
    { estado: "erro", esperado: 'role="alert"' },
    { estado: "sucesso", esperado: "Tudo certo" },
  ] as const;

  for (const { estado, esperado } of estados) {
    it(`@spec:AC-013 o cartão em ${estado} mostra o estado dentro da própria moldura`, () => {
      const html = renderToStaticMarkup(
        <Cartao estado={estado} titulo="Resumo do dia">
          <p>conteúdo que não deve aparecer</p>
        </Cartao>,
      );

      expect(html).toContain("Resumo do dia");
      expect(html).toContain(esperado);
      // O bloco não some da tela enquanto espera: bloco que aparece do nada
      // empurra o resto e faz o dono clicar no lugar errado.
      expect(html).not.toContain("conteúdo que não deve aparecer");
    });
  }

  it("@spec:AC-013 o cartão pronto mostra o conteúdo e nenhum estado", () => {
    const html = renderToStaticMarkup(
      <Cartao titulo="Pedidos de hoje">
        <p>12 pedidos aceitos.</p>
      </Cartao>,
    );

    expect(html).toContain("12 pedidos aceitos.");
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("aria-busy");
  });
});

describe("lista", () => {
  type Pedido = { id: string; cliente: string };
  const pedidos: Pedido[] = [{ id: "p-1", cliente: "Ana" }];
  const comuns = {
    chaveDoItem: (pedido: Pedido) => pedido.id,
    renderizarItem: (pedido: Pedido) => <span>{pedido.cliente}</span>,
    rotulo: "Pedidos recebidos",
  };

  it("@spec:AC-013 a lista pronta rotula a lista e desenha um item por pedido", () => {
    const html = renderToStaticMarkup(<Lista {...comuns} itens={pedidos} />);

    expect(html).toContain('aria-label="Pedidos recebidos"');
    expect(html).toContain("Ana");
    expect(html.match(/<li/g)).toHaveLength(1);
  });

  it("@spec:AC-013 a lista carregando desenha a espera, e não uma lista vazia", () => {
    const html = renderToStaticMarkup(
      <Lista
        {...comuns}
        estado="carregando"
        itens={[]}
        rotuloDeEspera="Carregando os pedidos…"
      />,
    );

    expect(html).toContain("Carregando os pedidos…");
    expect(html).not.toContain("<ul");
  });

  it("@spec:AC-013 lista sem item é vazio explícito, nunca a mesma tela de quem está sem internet", () => {
    const html = renderToStaticMarkup(
      <Lista
        {...comuns}
        descricaoVazio="Assim que a primeira venda entrar, ela aparece aqui."
        itens={[]}
        tituloVazio="Nenhum pedido ainda"
      />,
    );

    expect(html).toContain("Nenhum pedido ainda");
    expect(html).toContain("Assim que a primeira venda entrar");
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("<ul");
  });

  it("@spec:AC-013 a lista em erro avisa e não finge que a loja não tem pedido", () => {
    const html = renderToStaticMarkup(
      <Lista
        {...comuns}
        estado="erro"
        itens={[]}
        mensagemDeErro="A fila de pedidos não respondeu."
        referenciaDoErro="ref-2c19"
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("A fila de pedidos não respondeu.");
    expect(html).toContain("ref-2c19");
    expect(html).not.toContain("Nenhum pedido");
  });

  it("@spec:AC-013 a lista em sucesso anuncia a atualização e mantém os itens na tela", () => {
    const html = renderToStaticMarkup(
      <Lista
        {...comuns}
        descricaoDeSucesso="3 pedidos novos."
        estado="sucesso"
        itens={pedidos}
      />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain("3 pedidos novos.");
    expect(html).toContain("Ana");
  });
});

describe("aviso", () => {
  it("@spec:AC-013 o aviso de erro interrompe; os outros esperam a próxima pausa", () => {
    const erro = renderToStaticMarkup(
      <Aviso titulo="Não foi possível imprimir" tom="erro">
        A impressora não respondeu.
      </Aviso>,
    );
    const sucesso = renderToStaticMarkup(
      <Aviso titulo="Pedido aceito" tom="sucesso">
        O cliente já foi avisado.
      </Aviso>,
    );

    expect(erro).toContain('role="alert"');
    expect(sucesso).toContain('role="status"');
    expect(sucesso).toContain('aria-live="polite"');
  });

  it("@spec:AC-013 aviso que já estava na tela não anuncia nada", () => {
    const html = renderToStaticMarkup(
      <Aviso aoVivo={false} tom="info" titulo="Horário reduzido">
        Hoje até as 16h.
      </Aviso>,
    );

    // Leitor de tela repetindo texto estático é ruído, não acessibilidade.
    expect(html).not.toContain("role=");
    expect(html).toContain("Hoje até as 16h.");
  });
});

describe("caixa de diálogo", () => {
  it("@spec:AC-013 o diálogo fechado não existe na árvore", () => {
    const html = renderToStaticMarkup(
      <Dialogo aberto={false} id="d" titulo="Recusar o pedido?" />,
    );

    expect(html).toBe("");
  });

  it("@spec:AC-013 o diálogo aberto tem nome acessível e descrição ligados a ele", () => {
    const html = renderToStaticMarkup(
      <Dialogo
        aberto
        descricao="O cliente será avisado."
        id="recusar"
        titulo="Recusar o pedido #1042?"
      />,
    );

    // Sem `aria-labelledby`, o leitor de tela anuncia só "diálogo".
    expect(html).toContain('aria-labelledby="recusar-titulo"');
    expect(html).toContain('aria-describedby="recusar-descricao"');
    expect(html).toContain('id="recusar-titulo"');
    expect(html).toContain('aria-modal="true"');
  });

  const estados = [
    { estado: "carregando", esperado: 'aria-busy="true"' },
    { estado: "erro", esperado: 'role="alert"' },
    { estado: "sucesso", esperado: "Pronto" },
  ] as const;

  for (const { estado, esperado } of estados) {
    it(`@spec:AC-013 o diálogo em ${estado} mostra o andamento da ação que ele confirma`, () => {
      const html = renderToStaticMarkup(
        <Dialogo aberto estado={estado} id="recusar" titulo="Recusar?">
          <p>conteúdo que não deve aparecer</p>
        </Dialogo>,
      );

      expect(html).toContain(esperado);
      expect(html).not.toContain("conteúdo que não deve aparecer");
    });
  }

  it("@spec:AC-013 o botão de fechar tem nome para quem não vê o × e chama o fechamento", () => {
    const aoFechar = vi.fn();
    const html = renderToStaticMarkup(
      <Dialogo aberto aoFechar={aoFechar} id="recusar" titulo="Recusar?" />,
    );
    const arvore = Dialogo({
      aberto: true,
      aoFechar,
      id: "recusar",
      titulo: "Recusar?",
    });
    const botao = encontrar(arvore, "button");
    (botao?.props as { onClick?: () => void }).onClick?.();

    expect(html).toContain("Fechar");
    expect(html).toContain('aria-hidden="true"');
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });
});
