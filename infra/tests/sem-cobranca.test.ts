import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));

/**
 * AC-513 — em nenhum momento se pede número de cartão, e nenhuma cobrança
 * automática acontece.
 *
 * POR QUE ISTO É UM TESTE E NÃO UMA COMBINAÇÃO. É uma promessa feita ao dono da
 * loja e ao cliente, e promessa sem verificação dura até a primeira pressa. Uma
 * dependência de meio de pagamento entra num `pnpm add` de trinta segundos; um
 * campo de cartão entra num formulário porque "depois a gente tira". Nenhuma
 * revisão pega isso de forma confiável, e nada mais no portão olharia.
 *
 * O teste varre o que está VERSIONADO — não a árvore de trabalho — porque é o
 * que efetivamente vai para produção, e porque assim ele não reprova por causa
 * de um arquivo temporário de quem está trabalhando.
 */

/**
 * Bibliotecas de cobrança. A presença de qualquer uma nas dependências já
 * contradiz o critério, mesmo sem nenhuma linha que a use: ninguém instala um
 * meio de pagamento por engano, e quem instalou pretende cobrar.
 */
const BIBLIOTECAS_DE_COBRANCA = [
  "stripe",
  "mercadopago",
  "pagseguro",
  "paypal",
  "iugu",
  "asaas",
  "gerencianet",
  "efipay",
  "cielo",
  "braintree",
  "adyen",
  "pagarme",
  "juno",
  "openpix",
];

/**
 * Nomes de campo que só existem para receber dado de cartão. A lista é de
 * NOMES DE CAMPO, e não de palavras soltas: "cartão na entrega" é uma forma de
 * pagamento legítima e aparece no produto o tempo todo — o que não pode existir
 * é um lugar onde o número seja digitado.
 */
const CAMPOS_DE_CARTAO = [
  "cardNumber",
  "card_number",
  "numeroDoCartao",
  "numero_do_cartao",
  "cardholder",
  "securityCode",
  "codigoDeSeguranca",
  "expiryMonth",
  "expiryYear",
  "validadeDoCartao",
];

const SECOES_DE_DEPENDENCIA = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
];

/** Este arquivo cita as palavras proibidas: sem esta lista, ele se acusaria. */
const DISPENSADOS = new Set([
  "infra/tests/sem-cobranca.test.ts",
  ".spec/features/pedido-checkout/spec.md",
  ".spec/features/pedido-checkout/tasks.md",
]);

function arquivosVersionados(): string[] {
  const saida = execFileSync("git", ["ls-files", "-z"], {
    cwd: RAIZ,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return saida.split("\0").filter((caminho) => caminho !== "");
}

/** Todo pacote de cobrança declarado num manifesto, em qualquer seção. */
function cobrancaDeclaradaEm(manifesto: string): string[] {
  const conteudo = JSON.parse(
    readFileSync(join(RAIZ, manifesto), "utf8"),
  ) as Record<string, unknown>;

  const declarados = SECOES_DE_DEPENDENCIA.flatMap((secao) =>
    Object.keys((conteudo[secao] as Record<string, string> | undefined) ?? {}),
  );

  return declarados.filter((pacote) =>
    BIBLIOTECAS_DE_COBRANCA.some((proibida) =>
      pacote.toLowerCase().includes(proibida),
    ),
  );
}

function ehTexto(caminho: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|json|md|sql|sh|yml|yaml|css|html)$/.test(
    caminho,
  );
}

describe("a versão 1 não cobra e não pede cartão (AC-513)", () => {
  const versionados = arquivosVersionados();

  it("@spec:AC-513 nenhuma biblioteca de cobrança está declarada como dependência", () => {
    const manifestos = versionados.filter((caminho) =>
      caminho.endsWith("package.json"),
    );
    // Sem esta asserção, um erro no comando faria a lista vir vazia e o teste
    // passaria por não ter olhado nada — que é como um teste de ausência mente.
    expect(manifestos.length).toBeGreaterThan(3);

    const encontradas = manifestos.flatMap((manifesto) =>
      cobrancaDeclaradaEm(manifesto).map((pacote) => `${manifesto}: ${pacote}`),
    );

    expect(encontradas, encontradas.join(" | ")).toEqual([]);
  });

  it("@spec:AC-513 nenhum campo do sistema recebe número de cartão", () => {
    const textos = versionados.filter(
      (caminho) =>
        ehTexto(caminho) &&
        !DISPENSADOS.has(caminho) &&
        // O QUE VEM DO GIT É O ÍNDICE, e não o disco: arquivo APAGADO e ainda
        // não registrado continua listado, e lê-lo estoura. Ele também não
        // pode ter campo de cartão — não existe mais. Sem esta conferência, um
        // arquivo removido reprova um teste que fala de outra coisa, e o motivo
        // real fica escondido atrás de um erro de leitura.
        existsSync(join(RAIZ, caminho)),
    );
    expect(textos.length).toBeGreaterThan(20);

    const encontrados: string[] = [];
    for (const caminho of textos) {
      const conteudo = readFileSync(join(RAIZ, caminho), "utf8");
      for (const campo of CAMPOS_DE_CARTAO) {
        if (conteudo.includes(campo)) {
          encontrados.push(`${relative(RAIZ, caminho)}: ${campo}`);
        }
      }
    }

    expect(encontrados, encontrados.join(" | ")).toEqual([]);
  });

  it("@spec:AC-513 a única forma com cartão é combinada na entrega, sem dado nenhum", () => {
    // O produto OFERECE cartão — na maquininha do entregador. O que o critério
    // proíbe é o sistema participar da cobrança, e a diferença entre as duas
    // coisas é exatamente esta: a forma existe, o dado do cartão não.
    const pagamento = readFileSync(
      join(RAIZ, "apps/api/src/modules/orders/pagamento.ts"),
      "utf8",
    );

    expect(pagamento).toContain("CARD_ON_DELIVERY");
    for (const campo of CAMPOS_DE_CARTAO) {
      expect(pagamento, `campo de cartão no domínio: ${campo}`).not.toContain(
        campo,
      );
    }
  });
});
