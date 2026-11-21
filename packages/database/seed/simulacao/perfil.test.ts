/**
 * O plano puro do perfil de simulação: 100 lojas, 1.000 pedidos, tudo
 * determinístico. Não toca banco.
 */

import { describe, expect, it } from "vitest";

// Caminho relativo, sem dependência nova: a tabela de transições é a do núcleo.
// Se o lint recusar o import, copiar a tabela aqui com este comentário.
import { proximosStatus } from "../../../core/src/maquina-status.ts";
import { LOJAS_NOVAS } from "../demo/lojas/index.ts";
import {
  ATACADO,
  caminhoEsperado,
  CHAVE_DO_PEDIDO_PROVA,
  codigoDaLoja,
  fotosDoProduto,
  idsDaLoja,
  impressaoDoPerfil,
  impressoesDoPlano,
  montarPlano,
  PEDIDOS_POR_LOJA,
  PRODUTOS_POR_LOJA,
  SEGMENTOS_COM_ATACADO,
  todosOsIds,
  tokenDoPedido,
  totalDaProva,
} from "./perfil.ts";

const SEMENTE = "sc-2026";
const REFERENCIA = new Date("2026-11-01T18:00:00-03:00");
const plano = montarPlano(SEMENTE, REFERENCIA);

const contar = <T>(lista: readonly T[]): Map<T, number> => {
  const m = new Map<T, number>();
  for (const x of lista) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
};

describe("as 100 lojas", () => {
  it("são 100, com nomes e apelidos únicos, em 22 segmentos de 4 ou 5", () => {
    expect(plano.lojas).toHaveLength(100);
    expect(new Set(plano.lojas.map((l) => l.loja.nova!.nome)).size).toBe(100);
    expect(new Set(plano.lojas.map((l) => l.loja.nova!.apelido)).size).toBe(100);
    expect(new Set(plano.lojas.map((l) => l.bairro)).size).toBe(100);
    const porSegmento = contar(plano.lojas.map((l) => l.segmento));
    expect(porSegmento.size).toBe(22);
    for (const n of porSegmento.values()) expect([4, 5]).toContain(n);
    expect(new Set(plano.lojas.map((l) => l.codigo)).size).toBe(100);
  });

  it("a loja 000 é a Cozinha do Benfica (FOOD_MARMITA)", () => {
    const l = plano.lojas[0]!;
    expect(l.loja.nova!.nome).toBe("Cozinha do Benfica");
    expect(l.loja.nova!.apelido).toBe("cozinha-do-benfica");
    expect(l.segmento).toBe("FOOD_MARMITA");
    expect(l.bairro).toBe("Benfica");
    expect(l.chave).toBe("sim-000");
    expect(l.codigo).toBe(`SIM-${plano.impressao}-000`);
    expect(l.loja.entrega["taxaPadraoCents"]).toBe(500);
    expect(l.loja.entrega["gratisAcimaDeCents"]).toBe(10_000);
    expect(l.loja.entrega["minimoEntregaCents"]).toBe(2000);
  });

  it("nada herda do modelo: apelido, contatos, pasta, dono, PIX, stories e pedidos", () => {
    const modelos = LOJAS_NOVAS;
    const apelidosDosModelos = new Set(modelos.map((m) => m.nova!.apelido));
    const contatosDosModelos = new Set(
      modelos.flatMap((m) => [m.email, m.whatsapp, m.telefone, m.nova!.dono.email]),
    );
    const contatos: string[] = [];
    for (const l of plano.lojas) {
      const { loja } = l;
      expect(apelidosDosModelos.has(loja.nova!.apelido)).toBe(false);
      for (const c of [loja.email, loja.whatsapp, loja.telefone, loja.nova!.dono.email]) {
        expect(contatosDosModelos.has(c), c).toBe(false);
      }
      expect(loja.chave).toBe(l.chave);
      expect(loja.pasta).toBe(`simulacao/${loja.nova!.apelido}`);
      expect(loja.nova!.dono.email).toBe(`dono@${loja.nova!.apelido}.simulacao.test`);
      expect(loja.email).toBe(`contato@${loja.nova!.apelido}.simulacao.test`);
      expect((loja.pagamento["pix"] as { chave: string }).chave).toBe(
        `pix@${loja.nova!.apelido}.simulacao.test`,
      );
      expect(loja.whatsapp).toMatch(/^\+55859\d{8}$/);
      expect(loja.stories).toBeUndefined();
      expect(loja.pedidos).toBeUndefined();
      expect(loja.horarios).toEqual([["00:00", "00:00"]]);
      expect(loja.capa).toBe(true);
      expect(loja.clientes).toHaveLength(6);
      expect(loja.clientes!.some((c) => c.chave === "ana")).toBe(false);
      contatos.push(loja.telefone, loja.email, loja.nova!.dono.email);
    }
    expect(new Set(contatos).size).toBe(contatos.length);
  });

  it("os ids de loja, categoria, produto, cliente e pedido não se repetem nas 100 lojas", () => {
    const todos = todosOsIds(plano);
    expect(new Set(todos).size).toBe(todos.length);
    const l0 = idsDaLoja(plano.lojas[0]!);
    const l1 = idsDaLoja(plano.lojas[22]!); // mesmo modelo da 000
    expect(plano.lojas[22]!.modelo).toBe(plano.lojas[0]!.modelo);
    for (const campo of ["categorias", "produtos", "clientes", "pedidos"] as const) {
      expect(l0[campo].some((x) => l1[campo].includes(x)), campo).toBe(false);
    }
  });
});

describe("catálogo", () => {
  it("2 categorias, 8 produtos publicados e descrição com a especificação original", () => {
    for (const { loja, chave } of plano.lojas) {
      expect(loja.categorias, chave).toHaveLength(2);
      expect(loja.produtos, chave).toHaveLength(PRODUTOS_POR_LOJA);
      expect(loja.produtos.every((p) => p.rascunho !== true)).toBe(true);
      const categorias = new Set(loja.categorias.map((c) => c.chave));
      const chaves = loja.produtos.map((p) => p.chave);
      expect(new Set(chaves).size).toBe(chaves.length);
      for (const p of loja.produtos) {
        expect(categorias.has(p.categoria), `${chave}/${p.chave}`).toBe(true);
      }
    }
  });

  it("produto movido de categoria perde as especificações e o rótulo vai para a descrição", () => {
    let movidos = 0;
    for (const l of plano.lojas) {
      const modelo = LOJAS_NOVAS.find((m) => m.chave === l.modelo)!;
      for (const p of l.loja.produtos) {
        const original = modelo.produtos.find((o) => o.chave === p.chave)!;
        if (original.categoria !== p.categoria) {
          movidos++;
          expect(p.especificacoes).toEqual({});
        }
        const definicoes = modelo.categorias.find((c) => c.chave === original.categoria)!;
        if (p.chave === "marmita-frango-grelhado" && l.indice === 0) continue;
        for (const chave of Object.keys(original.especificacoes)) {
          const rotulo = definicoes.especificacoes.find((e) => e.chave === chave)!.rotulo;
          expect(p.descricao, `${l.chave}/${p.chave}`).toContain(`${rotulo}: `);
        }
      }
    }
    expect(movidos).toBeGreaterThan(0);
  });

  it("preços arredondados a R$ 0,50, com promoção abaixo do preço e custo abaixo do preço", () => {
    for (const { loja } of plano.lojas) {
      for (const p of loja.produtos) {
        expect(p.preco % 50).toBe(0);
        expect(p.preco).toBeGreaterThanOrEqual(50);
        if (p.promo !== undefined) {
          expect(p.promo % 50).toBe(0);
          expect(p.promo).toBeLessThan(p.preco);
        }
        expect(p.custo).toBeLessThan(p.preco);
        for (const eixo of p.eixos ?? []) {
          for (const o of eixo.opcoes) {
            if (o.preco !== undefined) expect(o.preco % 50).toBe(0);
          }
        }
      }
    }
  });

  it("o ±10 % vale para preço, promoção, custo e preços das opções de eixo", () => {
    const l = plano.lojas.find((x) => x.modelo === "marmitaria" && x.indice !== 0)!;
    const modelo = LOJAS_NOVAS.find((m) => m.chave === "marmitaria")!;
    const original = modelo.produtos.find((p) => p.chave === "marmita-carne-de-sol")!;
    const p = l.loja.produtos.find((x) => x.chave === "marmita-carne-de-sol");
    if (p === undefined) return; // a semente pode cortar este produto
    const fator = p.preco / original.preco;
    expect(fator).toBeGreaterThan(0.85);
    expect(fator).toBeLessThan(1.15);
    const opcoes = p.eixos![0]!.opcoes.map((o) => o.preco!);
    const originais = original.eixos![0]!.opcoes.map((o) => o.preco!);
    for (const [i, valor] of opcoes.entries()) {
      expect(valor / originais[i]!).toBeGreaterThan(0.85);
      expect(valor / originais[i]!).toBeLessThan(1.15);
    }
    // Pelo menos alguma loja saiu do preço do modelo.
    const mudou = plano.lojas.some((x) =>
      x.loja.produtos.some((q) => {
        const m = LOJAS_NOVAS.find((mm) => mm.chave === x.modelo)!;
        const o = m.produtos.find((r) => r.chave === q.chave)!;
        return q.preco !== o.preco;
      }),
    );
    expect(mudou).toBe(true);
  });

  it("estoque 9999 no varejo e nenhum controle na comida", () => {
    for (const { loja } of plano.lojas) {
      for (const p of loja.produtos) {
        if (loja.ehComida) expect(p.estoque).toBeUndefined();
        else expect(p.estoque!(["qualquer"])).toBe(9999);
      }
    }
  });

  it("atacado em 1 produto só nas lojas de varejo escolhidas", () => {
    for (const l of plano.lojas) {
      if (SEGMENTOS_COM_ATACADO.includes(l.segmento)) {
        expect(l.atacado, l.chave).not.toBeNull();
        const produto = l.loja.produtos.find((p) => p.chave === l.atacado!.produto);
        expect(produto, l.chave).toBeDefined();
        // Preço único: com eixo o cartão da vitrine não tem preço de varejo.
        expect(produto!.eixos).toBeUndefined();
      } else {
        expect(l.atacado, l.chave).toBeNull();
      }
    }
    expect(ATACADO).toEqual({ minimo: 10, desconto: 5 });
  });

  it("conta as fotos por produto (principal + extras até 3)", () => {
    const total = plano.lojas.reduce(
      (s, l) => s + l.loja.produtos.reduce((t, p) => t + fotosDoProduto(p), 0),
      0,
    );
    expect(total).toBeGreaterThanOrEqual(800);
    for (const l of plano.lojas) {
      for (const p of l.loja.produtos) {
        expect(fotosDoProduto(p)).toBeGreaterThanOrEqual(1);
        expect(fotosDoProduto(p)).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe("os 1.000 pedidos", () => {
  it("10 por loja, com a distribuição exata de status", () => {
    let total = 0;
    for (const l of plano.lojas) {
      expect(l.pedidos, l.chave).toHaveLength(PEDIDOS_POR_LOJA);
      total += l.pedidos.length;
      const c = contar(l.pedidos.map((p) => p.pedido.status));
      expect(c.get("PENDING")).toBe(1);
      expect(c.get("ACCEPTED")).toBe(1);
      expect(c.get("PREPARING")).toBe(2);
      expect(c.get("COMPLETED")).toBe(3);
      expect(c.get("CANCELLED")).toBe(1);
      const formas = l.loja.nova!.formas ?? ["DELIVERY", "PICKUP"];
      const pronto = c.get("READY_FOR_PICKUP") ?? 0;
      const saiu = c.get("OUT_FOR_DELIVERY") ?? 0;
      expect(pronto + saiu).toBe(2);
      if (formas.length === 2) expect([pronto, saiu]).toEqual([1, 1]);
      else if (formas[0] === "PICKUP") expect([pronto, saiu]).toEqual([2, 0]);
      else expect([pronto, saiu]).toEqual([0, 2]);
    }
    expect(total).toBe(1000);
  });

  it("números 1001…1010 e chaves sim-NNN:pedido:K, sem repetição", () => {
    const chaves = plano.lojas.flatMap((l) => l.pedidos.map((p) => p.chave));
    expect(new Set(chaves).size).toBe(1000);
    for (const l of plano.lojas) {
      expect(l.pedidos.map((p) => p.numero)).toEqual(
        Array.from({ length: 10 }, (_v, i) => 1001 + i),
      );
      expect(l.pedidos[0]!.chave).toBe(`${l.chave}:pedido:1`);
    }
  });

  it("a entrega respeita as formas da loja e as etapas intermediárias combinam com ela", () => {
    for (const l of plano.lojas) {
      const formas = l.loja.nova!.formas ?? ["DELIVERY", "PICKUP"];
      for (const { pedido } of l.pedidos) {
        expect(formas, l.chave).toContain(pedido.entrega);
        if (pedido.status === "READY_FOR_PICKUP") expect(pedido.entrega).toBe("PICKUP");
        if (pedido.status === "OUT_FOR_DELIVERY") expect(pedido.entrega).toBe("DELIVERY");
      }
    }
  });

  it("o histórico só passa por transições permitidas pela máquina de status", () => {
    for (const l of plano.lojas) {
      for (const { pedido } of l.pedidos) {
        const caminho = caminhoEsperado(pedido.status, pedido.entrega);
        expect(caminho[0]).toBe("PENDING");
        expect(caminho.at(-1)).toBe(pedido.status);
        for (let i = 1; i < caminho.length; i++) {
          const permitidos = proximosStatus(caminho[i - 1]!, pedido.entrega).map((o) => o.status);
          expect(permitidos, `${l.chave} ${caminho[i - 1]}→${caminho[i]}`).toContain(caminho[i]);
        }
      }
    }
  });

  it("todo o pedido, com o histórico, acontece antes da referência", () => {
    const ref = REFERENCIA.getTime();
    for (const l of plano.lojas) {
      for (const { pedido } of l.pedidos) {
        const feitoEm = ref - pedido.minutosAtras * 60_000;
        const caminho = caminhoEsperado(pedido.status, pedido.entrega);
        const ultimo = feitoEm + (caminho.length - 1) * 6 * 60_000;
        expect(feitoEm).toBeLessThan(ref);
        expect(ultimo).toBeLessThan(ref);
      }
    }
  });

  it("ativos de 30 a 240 min antes; concluídos e cancelado de 1 a 6 dias, entre 11 h e 21 h de Fortaleza", () => {
    const ativos = new Set(["PENDING", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY"]);
    for (const l of plano.lojas) {
      for (const { pedido } of l.pedidos) {
        if (ativos.has(pedido.status)) {
          expect(pedido.minutosAtras).toBeGreaterThanOrEqual(30);
          expect(pedido.minutosAtras).toBeLessThanOrEqual(240);
        } else {
          const feitoEm = new Date(REFERENCIA.getTime() - pedido.minutosAtras * 60_000);
          const hora = Number(
            new Intl.DateTimeFormat("en-GB", {
              timeZone: "America/Fortaleza",
              hour: "2-digit",
              hourCycle: "h23",
            }).format(feitoEm),
          );
          expect(hora).toBeGreaterThanOrEqual(11);
          expect(hora).toBeLessThan(21);
          const dias = pedido.minutosAtras / 1440;
          expect(dias).toBeGreaterThan(0.4);
          expect(dias).toBeLessThan(7);
        }
      }
    }
  });

  it("os pedidos citam produtos e clientes da própria loja", () => {
    for (const l of plano.lojas) {
      const produtos = new Set(l.loja.produtos.map((p) => p.chave));
      const clientes = new Set(l.loja.clientes!.map((c) => c.chave));
      for (const { pedido } of l.pedidos) {
        expect(clientes.has(pedido.cliente)).toBe(true);
        expect(pedido.itens.length).toBeGreaterThanOrEqual(1);
        for (const [chave] of pedido.itens) expect(produtos.has(chave)).toBe(true);
      }
    }
  });

  it("cancelado leva motivo; os demais não", () => {
    for (const l of plano.lojas) {
      for (const { pedido } of l.pedidos) {
        if (pedido.status === "CANCELLED") expect(pedido.observacao).toBeTruthy();
        else expect(pedido.observacao).toBeUndefined();
      }
    }
  });

  it("o pedido-prova da Cozinha do Benfica soma R$ 51,00: 2 × (2000 + 300) + 500", () => {
    const l = plano.lojas[0]!;
    const prova = l.pedidos.find((p) => p.chave === CHAVE_DO_PEDIDO_PROVA)!;
    expect(prova.pedido.status).toBe("COMPLETED");
    expect(prova.pedido.entrega).toBe("DELIVERY");
    expect(prova.pedido.itens).toEqual([["marmita-frango-grelhado", 2, 0, ["ovo-frito"]]]);
    const marmita = l.loja.produtos.find((p) => p.chave === "marmita-frango-grelhado")!;
    expect(marmita.preco).toBe(2000);
    expect(marmita.eixos).toBeUndefined();
    expect(marmita.promo).toBeUndefined();
    expect(marmita.descricao).toBe("Porção de 450 g com arroz, feijão e legumes");
    const ovo = marmita.grupos![0]!;
    expect(ovo.kind).toBe("ADDON");
    expect(ovo.nome).toBe("Adicionais");
    expect(ovo.opcoes[0]).toMatchObject({ nome: "Ovo frito", acrescimo: 300 });
    expect(totalDaProva(plano)).toBe(5100);
  });

  it("o token do pedido é calculável sem gravar", () => {
    expect(tokenDoPedido(CHAVE_DO_PEDIDO_PROVA)).toMatch(/^[0-9a-f]{40}$/);
    expect(tokenDoPedido("a")).not.toBe(tokenDoPedido("b"));
  });
});

describe("determinismo", () => {
  it("mesmos parâmetros, mesmo plano; outra semente muda o conteúdo", () => {
    const igual = montarPlano(SEMENTE, REFERENCIA);
    expect(impressoesDoPlano(igual)).toEqual(impressoesDoPlano(plano));
    expect(JSON.stringify(igual.lojas.map((l) => l.pedidos))).toBe(
      JSON.stringify(plano.lojas.map((l) => l.pedidos)),
    );

    const outra = montarPlano("outra-semente", REFERENCIA);
    const a = impressoesDoPlano(plano);
    const b = impressoesDoPlano(outra);
    // Os ids de loja e pedido vêm de sim-NNN, mas produtos e clientes escolhidos mudam com a semente.
    expect(outra.lojas.map((l) => l.chave)).toEqual(plano.lojas.map((l) => l.chave));
    expect(b.conteudo).not.toBe(a.conteudo);
    expect(outra.impressao).not.toBe(plano.impressao);
    expect(outra.lojas[0]!.loja.nova!.nome).toBe("Cozinha do Benfica");
    expect(outra.lojas.map((l) => l.bairro)).not.toEqual(plano.lojas.map((l) => l.bairro));
  });

  it("outra referência muda a impressão do perfil e as datas, não os ids", () => {
    const outra = montarPlano(SEMENTE, new Date("2026-12-01T18:00:00-03:00"));
    expect(impressaoDoPerfil(SEMENTE, REFERENCIA)).not.toBe(outra.impressao);
    expect(codigoDaLoja(outra.impressao, 7)).toMatch(/^SIM-[0-9a-f]{8}-007$/);
    expect(impressoesDoPlano(outra).ids).toBe(impressoesDoPlano(plano).ids);
    expect(impressoesDoPlano(outra).conteudo).not.toBe(impressoesDoPlano(plano).conteudo);
  });

  it("a impressão do perfil não depende de como o fuso foi escrito", () => {
    expect(impressaoDoPerfil(SEMENTE, new Date("2026-11-01T18:00:00-03:00"))).toBe(
      impressaoDoPerfil(SEMENTE, new Date("2026-11-01T21:00:00Z")),
    );
  });
});
