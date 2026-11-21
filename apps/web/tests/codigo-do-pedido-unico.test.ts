/**
 * Um pedido, um nome (card #135): a confirmação, Meus pedidos, a visão geral
 * da conta, o acompanhamento, o quadro de pedidos, o detalhe, o pedido de
 * balcão e a ficha do cliente mostram o MESMO código ("A-0004"), formatado
 * pela função do contrato que a API usa para gravar o código.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { codigoDoPedido } from "@simpleclick/contracts";
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
    expect(() => codigoDoPedido(0)).toThrow(RangeError);
  });

  it("[CA-3] toda tela do cliente e do painel que mostra o pedido usa a função do contrato", () => {
    for (const tela of TELAS_COM_PEDIDO) {
      const fonte = readFileSync(join(RAIZ, tela), "utf8");
      expect(fonte, tela).toMatch(/codigoDoPedido\([^)]*numero\)/);
    }
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
