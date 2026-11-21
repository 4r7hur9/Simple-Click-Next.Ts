/**
 * Um pedido, um nome (card #135): a confirmação, Meus pedidos, a visão geral
 * da conta, o acompanhamento, o quadro de pedidos, o detalhe, o pedido de
 * balcão e a ficha do cliente mostram o MESMO código ("A-0004"): o `codigo`
 * GRAVADO que a API envia (card #137). A função do contrato só formata o
 * número quando o código falta, e nunca derruba a tela.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import {
  CODIGO_DO_PEDIDO_INDISPONIVEL,
  codigoDoPedido,
  codigoDoPedidoNaTela,
} from "@simpleclick/contracts";
import { describe, expect, it } from "vitest";

const RAIZ = join(import.meta.dirname, "..", "src");

/** As telas do cliente e do painel que mostram o número do pedido. */
const TELAS_COM_PEDIDO = [
  "features/checkout/FechamentoDaCompra.tsx",
  "features/conta/MeusPedidos.tsx",
  "features/conta/VisaoGeralDaConta.tsx",
  "features/pedido/AcompanhamentoDoPedido.tsx",
  "features/painel-pedidos/CartaoDoKanban.tsx",
  "features/painel-pedidos/DetalheDoPedido.tsx",
  "features/painel-pedidos/JanelaDoPedido.tsx",
  "features/painel-pedidos/QuadroKanban.tsx",
  "features/painel-pedidos/MontarPedido.tsx",
  "features/painel-clientes/HistoricoCliente.tsx",
] as const;

function arquivos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

describe("o código do pedido", () => {
  it("[CA-3] é letra, hífen e quatro dígitos, e a letra avança a cada 9.999", () => {
    expect(codigoDoPedido(4)).toBe("A-0004");
    expect(codigoDoPedido(42)).toBe("A-0042");
    expect(codigoDoPedido(9999)).toBe("A-9999");
    expect(codigoDoPedido(10_000)).toBe("B-0001");
  });

  it("[CA-2] a formatação de reserva nunca lança: número 0, negativo, fracionário ou ausente vira '—'", () => {
    for (const numero of [0, -1, 1.5, Number.NaN, null, undefined]) {
      expect(() => codigoDoPedido(numero), String(numero)).not.toThrow();
      expect(codigoDoPedido(numero)).toBe(CODIGO_DO_PEDIDO_INDISPONIVEL);
    }
  });

  it("[CA-2] a tela mostra o código GRAVADO que a API envia, mesmo quando ele difere do número", () => {
    // O seed grava "A-1000" com número 1000; recalcular daria "A-1000" por
    // acaso, mas um pedido importado ("B-1003" com número 4) mostraria outro.
    expect(codigoDoPedidoNaTela({ codigo: "B-1003", numero: 4 })).toBe("B-1003");
    expect(codigoDoPedidoNaTela({ codigo: "A-1000", numero: 1000 })).toBe("A-1000");
    // Sem código, a reserva formata o número; com número 0, não derruba.
    expect(codigoDoPedidoNaTela({ numero: 4 })).toBe("A-0004");
    expect(codigoDoPedidoNaTela({ codigo: "  ", numero: 4 })).toBe("A-0004");
    expect(codigoDoPedidoNaTela({ codigo: null, numero: 0 })).toBe(
      CODIGO_DO_PEDIDO_INDISPONIVEL,
    );
  });

  it("[CA-2] toda tela do cliente e do painel nomeia o pedido pelo código gravado, sem recalcular do número", () => {
    for (const tela of TELAS_COM_PEDIDO) {
      const fonte = readFileSync(join(RAIZ, tela), "utf8");
      expect(fonte, tela).toMatch(/codigoDoPedidoNaTela\(|`Pedido \$\{codigo\}`/);
      expect(fonte, tela).not.toMatch(/codigoDoPedido\(/);
    }
    // E nenhuma outra tela recalcula o código a partir do número.
    const recalculam = arquivos(join(RAIZ, "features"))
      .concat(arquivos(join(RAIZ, "app")))
      .filter((arquivo) => /codigoDoPedido\([^)]*numero/.test(readFileSync(arquivo, "utf8")))
      .map((arquivo) => relative(RAIZ, arquivo));
    expect(recalculam).toEqual([]);
  });

  it("[CA-3] nenhuma tela escreve o número à mão ('nº 4', '#4', 'Pedido número 4')", () => {
    const aMao =
      /(?:nº|#)\s*\{[^}]*\bnumero\}|#\$\{[^}]*\bnumero\}|[Pp]edido número \$?\{/;
    const achados = arquivos(join(RAIZ, "features"))
      .concat(arquivos(join(RAIZ, "app")))
      .filter((arquivo) => !arquivo.includes(`${join("app", "(dev)")}`))
      .filter((arquivo) => aMao.test(readFileSync(arquivo, "utf8")))
      .map((arquivo) => relative(RAIZ, arquivo));
    expect(achados).toEqual([]);
  });
});
