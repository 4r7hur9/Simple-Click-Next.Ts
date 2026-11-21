import { describe, expect, it } from "vitest";
import {
  CONTRASTE_MINIMO_GRAFICO,
  CONTRASTE_MINIMO_TEXTO,
  misturar,
  relacaoDeContraste,
} from "../src/contraste";
import {
  NOME_NO_CSS,
  PALETA_CLARA,
  PALETA_ESCURA,
  type PaletaDeCores,
} from "../src/tokens";
import {
  contarFiltros,
  lerArquivo,
  lerFolha,
  regrasDe,
  valorDe,
} from "./apoio-css";

/**
 * Vidro líquido das superfícies flutuantes (card #153).
 *
 * Provas: os tokens existem nos quatro blocos de tema, o fallback sólido vence
 * a cascata, a folha nova nunca mira botão nem campo, cada superfície tem a
 * forma de desfoque certa e o texto passa de AA sobre o vidro no pior fundo.
 */

const THEME = lerFolha(
  lerArquivo(new URL("../styles/theme.css", import.meta.url)),
);
const VIDRO_TEXTO = lerArquivo(new URL("../styles/vidro.css", import.meta.url));
const VIDRO = lerFolha(VIDRO_TEXTO);
const COMPONENTES = lerFolha(
  lerArquivo(new URL("../styles/componentes.css", import.meta.url)),
);
const VITRINE = lerFolha(
  lerArquivo(new URL("../styles/vitrine.css", import.meta.url)),
);
const PEDIDOS = lerFolha(
  lerArquivo(new URL("../styles/pedidos.css", import.meta.url)),
);

const raiz = THEME.regras.find(
  (r) =>
    r.contexto.length === 0 &&
    r.seletores.length === 1 &&
    r.seletores[0] === ":root",
)!;
const escuroDoSistema = THEME.regras.find((r) =>
  r.seletores.includes(':root:not([data-tema="claro"])'),
)!;
const escuroEscolhido = THEME.regras.find((r) =>
  r.seletores.includes(':root[data-tema="escuro"]'),
)!;
const trechoClaro = THEME.regras.find(
  (r) => r.contexto.length === 0 && r.seletores.includes('[data-tema="claro"]'),
)!;

/** Só existem em `:root`: o fallback os zera e nenhum bloco de tema os repete. */
const SO_NA_RAIZ = [
  "--vidro-opacidade-leve",
  "--vidro-opacidade-medio",
  "--vidro-opacidade-forte",
  "--vidro-blur-leve",
  "--vidro-blur-medio",
  "--vidro-blur-forte",
  "--vidro-saturacao",
  "--vidro-filtro-leve",
  "--vidro-filtro-medio",
  "--vidro-filtro-forte",
  "--vidro-brilho-alfa",
  "--vidro-desfoque-do-fundo",
  "--vidro-sobre-midia",
] as const;

/** Mudam com o tema: estão na raiz (claro) e nos três blocos de tema. */
const POR_TEMA = [
  "--vidro-base",
  "--vidro-borda",
  "--vidro-realce",
  "--vidro-sombra-leve",
  "--vidro-sombra-medio",
  "--vidro-sombra-forte",
  "--vidro-sombra-acima",
  "--vidro-sobreposicao",
] as const;

/** O que o fallback sólido redefine. */
const ZERADOS_PELO_FALLBACK = [
  "--vidro-opacidade-leve",
  "--vidro-opacidade-medio",
  "--vidro-opacidade-forte",
  "--vidro-filtro-leve",
  "--vidro-filtro-medio",
  "--vidro-filtro-forte",
  "--vidro-brilho-alfa",
  "--vidro-desfoque-do-fundo",
] as const;

describe("tokens de vidro", () => {
  it("[CA-1] os tokens que só existem na raiz estão em :root e em nenhum bloco de tema", () => {
    for (const nome of SO_NA_RAIZ) {
      expect(raiz.declaracoes.has(nome), `${nome} em :root`).toBe(true);
      for (const [rotulo, bloco] of [
        ["escuro do sistema", escuroDoSistema],
        ["escuro escolhido", escuroEscolhido],
        ["trecho claro", trechoClaro],
      ] as const) {
        expect(bloco.declaracoes.has(nome), `${nome} em ${rotulo}`).toBe(false);
      }
    }
  });

  it("[CA-1] a cor do vidro está na raiz e nos três blocos de tema, igual onde o tema é o mesmo", () => {
    for (const nome of POR_TEMA) {
      for (const bloco of [
        raiz,
        escuroDoSistema,
        escuroEscolhido,
        trechoClaro,
      ]) {
        expect(bloco.declaracoes.has(nome), nome).toBe(true);
      }
      // Claro com claro, escuro com escuro: sem isso um trecho escuro dentro de
      // página clara (os cookies) ou o contrário ficaria com a cor do outro.
      expect(trechoClaro.declaracoes.get(nome), `${nome} claro`).toBe(
        raiz.declaracoes.get(nome),
      );
      expect(escuroEscolhido.declaracoes.get(nome), `${nome} escuro`).toBe(
        escuroDoSistema.declaracoes.get(nome),
      );
      expect(
        escuroEscolhido.declaracoes.get(nome),
        `${nome} muda com o tema`,
      ).not.toBe(raiz.declaracoes.get(nome));
    }
  });

  it("[CA-1] são três níveis (leve, médio, forte), do mais transparente ao mais denso", () => {
    const opacidade = (nivel: string): number =>
      Number.parseFloat(raiz.declaracoes.get(`--vidro-opacidade-${nivel}`)!);
    const blur = (nivel: string): number =>
      Number.parseFloat(raiz.declaracoes.get(`--vidro-blur-${nivel}`)!);
    expect(opacidade("leve")).toBeLessThan(opacidade("medio"));
    expect(opacidade("medio")).toBeLessThan(opacidade("forte"));
    expect(blur("leve")).toBeLessThan(blur("medio"));
    expect(blur("medio")).toBeLessThan(blur("forte"));
  });
});

describe("a folha do vidro", () => {
  it("[CA-2] vidro.css é importado por theme.css, depois do componentes.css e antes de qualquer regra", () => {
    const importa = (nome: string): number =>
      THEME.texto.indexOf(`@import "./${nome}"`);
    expect(importa("vidro.css")).toBeGreaterThan(importa("componentes.css"));
    expect(importa("vidro.css")).toBeLessThan(THEME.texto.indexOf(":root {"));
  });

  it("[CA-2] define o utilitário com os três níveis e a versão estática", () => {
    for (const classe of [
      ".sc-vidro",
      ".sc-vidro--leve",
      ".sc-vidro--forte",
      ".sc-vidro--estatico",
    ]) {
      expect(regrasDe(VIDRO, classe).length, classe).toBeGreaterThan(0);
    }
    const estatico = regrasDe(VIDRO, ".sc-vidro--estatico")[0]!;
    expect(estatico.declaracoes.get("backdrop-filter")).toBe("none");
    expect(estatico.declaracoes.get("-webkit-backdrop-filter")).toBe("none");
  });

  it("[CA-2] todo backdrop-filter vem com o par do Safari", () => {
    const { puro, webkit } = contarFiltros(VIDRO_TEXTO);
    expect(puro).toBeGreaterThan(0);
    expect(webkit).toBe(puro);
  });

  it("[CA-2] nunca mira botão nem campo: o AC-950 continua valendo para eles", () => {
    const seletores = VIDRO.regras.flatMap((r) => r.seletores).join(" ");
    expect(seletores).not.toMatch(
      /\.sc-botao|\.sc-campo|\bbutton\b|\binput\b|\btextarea\b|\bselect\b/,
    );
  });

  it("[CA-2] componentes.css segue sem backdrop-filter: o vidro não entrou onde os testes antigos o proíbem", () => {
    const { puro, webkit } = contarFiltros(COMPONENTES.texto);
    expect(puro + webkit).toBe(0);
  });

  it("[CA-9] não escreve cor fixa nem lê a cor da marca: o vidro é neutro e o acento vem de --cor-primaria", () => {
    expect(VIDRO_TEXTO).not.toMatch(/#[\da-f]{3,8}\b/i);
    expect(VIDRO_TEXTO).not.toMatch(/--cor-marca|--marca-/);
    expect(VIDRO_TEXTO).not.toMatch(/\brgba?\(/);
  });
});

/**
 * O inventário: a forma do desfoque de cada superfície, escolhida pelo que ela
 * tem dentro. Uma janela com filho `position: fixed` que não é popover (o
 * calendário do período) não pode ter `backdrop-filter` nela mesma, porque o
 * filtro prenderia o filho à janela. E o `::before` só serve a quem não rola
 * por dentro, senão ele sai da vista com a rolagem.
 */
type Forma = "direta" | "camada" | "estatica";
const INVENTARIO: ReadonlyArray<{
  host: string;
  forma: Forma;
  /** Onde conferir o `overflow` do host, quando a forma depende dele. */
  overflow?: { folha: typeof COMPONENTES; seletor: string };
}> = [
  { host: ".sc-menu__painel", forma: "direta" },
  { host: ".sc-seletor__painel", forma: "direta" },
  { host: ".sc-barra-inferior", forma: "direta" },
  { host: ".sc-painel", forma: "direta" },
  { host: ".sc-aviso-flutuante__cartao", forma: "direta" },
  { host: ".sc-aviso-rapido__texto", forma: "direta" },
  { host: ".sc-acesso-janela", forma: "direta" },
  { host: ".sc-sobre-janela", forma: "direta" },
  { host: ".sc-cookies", forma: "direta" },
  { host: ".sc-sacola-barra", forma: "direta" },
  {
    host: ".sc-gaveta-modal:not(.sc-gaveta-modal--embutida)",
    forma: "camada",
    overflow: { folha: COMPONENTES, seletor: ".sc-gaveta-modal" },
  },
  { host: ".sc-dialogo[aria-modal]", forma: "camada" },
  {
    host: ".sc-flutuante__gaveta.sc-carrinho-janela",
    forma: "camada",
    overflow: { folha: VITRINE, seletor: ".sc-carrinho-janela[open]" },
  },
  {
    host: ".sc-janela-pedido",
    forma: "camada",
    overflow: { folha: PEDIDOS, seletor: ".sc-janela-pedido" },
  },
  { host: ".sc-janela-produto", forma: "estatica" },
  { host: ".sc-dialogo:not([aria-modal])", forma: "estatica" },
];

describe("a forma do desfoque de cada superfície", () => {
  for (const { host, forma, overflow } of INVENTARIO) {
    it(`[CA-2] ${host} → ${forma}`, () => {
      // Sem as regras de `@media` (o contraste forçado também cita estes hosts).
      const regras = regrasDe(VIDRO, host).filter(
        (r) => r.contexto.length === 0,
      );
      const pintaFundo = regras.some((r) =>
        r.declaracoes.has("background-color"),
      );
      const filtroNoHost = regras.some(
        (r) => r.declaracoes.get("backdrop-filter") !== undefined,
      );
      const camada = regrasDe(VIDRO, `${host}::before`).filter(
        (r) => r.contexto.length === 0,
      );

      expect(pintaFundo, "o preenchimento está no próprio elemento").toBe(true);

      if (forma === "direta") {
        expect(filtroNoHost).toBe(true);
        expect(camada).toHaveLength(0);
      }

      if (forma === "camada") {
        expect(filtroNoHost, "o desfoque não fica no host").toBe(false);
        expect(camada).toHaveLength(1);
        const declaracoes = camada[0]!.declaracoes;
        expect(declaracoes.get("position")).toBe("absolute");
        expect(declaracoes.get("inset")).toBe("0");
        expect(declaracoes.get("z-index")).toBe("-1");
        expect(declaracoes.get("pointer-events")).toBe("none");
        expect(declaracoes.get("backdrop-filter")).toBe("var(--v-filtro)");
        expect(declaracoes.get("-webkit-backdrop-filter")).toBe(
          "var(--v-filtro)",
        );
        expect(
          regras.some((r) => r.declaracoes.get("isolation") === "isolate"),
          "isolation: isolate no host",
        ).toBe(true);
      }

      if (forma === "estatica") {
        expect(filtroNoHost).toBe(false);
        expect(camada).toHaveLength(0);
      }

      if (overflow !== undefined) {
        const valor = valorDe(overflow.folha, overflow.seletor, "overflow");
        expect(
          valor,
          `${overflow.seletor} não rola por dentro (overflow: ${valor})`,
        ).not.toMatch(/auto|scroll/);
      }
    });
  }

  it("[CA-2] a janela do produto fica estática porque rola por dentro", () => {
    const produto = lerFolha(
      lerArquivo(new URL("../styles/produto.css", import.meta.url)),
    );
    expect(valorDe(produto, ".sc-janela-produto", "overflow-y")).toBe("auto");
  });

  it("[CA-2] na forma camada a entrada é só por transform: nenhuma keyframe anima opacity", () => {
    for (const nome of [
      "sc-vidro-entrar",
      "sc-vidro-entrar-lateral",
      "sc-vidro-surgir",
      "sc-vidro-janela-aparece",
    ]) {
      const corpo = VIDRO.keyframes.get(nome);
      expect(corpo, `@keyframes ${nome}`).toBeDefined();
      expect(corpo).toContain("transform");
      expect(corpo).not.toContain("opacity");
    }
    const entrada = (host: string): string | undefined =>
      regrasDe(VIDRO, host)
        .map((r) => r.declaracoes.get("animation-name"))
        .find((v) => v !== undefined);
    expect(entrada(".sc-gaveta-modal:not(.sc-gaveta-modal--embutida)")).toBe(
      "sc-vidro-entrar",
    );
    expect(entrada(".sc-dialogo[aria-modal]")).toBe("sc-vidro-surgir");
    expect(entrada(".sc-flutuante__gaveta.sc-carrinho-janela[open]")).toBe(
      "sc-vidro-janela-aparece",
    );
  });

  it("[CA-2] quem pediu menos movimento não recebe a entrada de volta", () => {
    const reduzido = VIDRO.regras.filter((r) =>
      r.contexto.some((c) => c.includes("prefers-reduced-motion: reduce")),
    );
    const hosts = reduzido.flatMap((r) => r.seletores);
    for (const host of [
      ".sc-gaveta-modal:not(.sc-gaveta-modal--embutida)",
      ".sc-dialogo[aria-modal]",
      ".sc-flutuante__gaveta.sc-carrinho-janela[open]",
    ]) {
      expect(hosts, host).toContain(host);
    }
    expect(
      reduzido.every((r) => r.declaracoes.get("animation") === "none"),
    ).toBe(true);
  });
});

describe("o fallback sólido", () => {
  // As regras do bloco de fallback: dentro de um @supports/@media e com os
  // tokens de opacidade do vidro.
  const fallbacks = THEME.regras.filter(
    (r) => r.contexto.length > 0 && r.declaracoes.has("--vidro-opacidade-leve"),
  );

  it("[CA-3] cobre os três casos: sem backdrop-filter, menos transparência e mais contraste", () => {
    const contextos = fallbacks.map((r) => r.contexto.join(" | "));
    expect(
      contextos.some(
        (c) =>
          c.includes("@supports not") &&
          c.includes("backdrop-filter: blur(1px)") &&
          c.includes("-webkit-backdrop-filter: blur(1px)"),
      ),
    ).toBe(true);
    expect(
      contextos.some((c) => c.includes("prefers-reduced-transparency: reduce")),
    ).toBe(true);
    expect(contextos.some((c) => c.includes("prefers-contrast: more"))).toBe(
      true,
    );
    expect(fallbacks).toHaveLength(3);
  });

  it("[CA-3] os três deixam o vidro inteiro, sem filtro e sem brilho", () => {
    for (const regra of fallbacks) {
      expect(regra.seletores).toEqual([":root"]);
      for (const nome of ZERADOS_PELO_FALLBACK) {
        const esperado = nome.startsWith("--vidro-opacidade")
          ? "100%"
          : nome.startsWith("--vidro-filtro")
            ? "none"
            : nome === "--vidro-brilho-alfa"
              ? "0"
              : "0px";
        expect(
          regra.declaracoes.get(nome),
          `${nome} em ${regra.contexto.join(" ")}`,
        ).toBe(esperado);
      }
    }
  });

  it("[CA-3] vem DEPOIS do último bloco de tema, senão perderia para ele na cascata", () => {
    const ultimoTema = Math.max(
      escuroDoSistema.ordem,
      escuroEscolhido.ordem,
      trechoClaro.ordem,
    );
    for (const regra of fallbacks)
      expect(regra.ordem).toBeGreaterThan(ultimoTema);
  });

  it("[CA-3] o contraste forçado usa as cores do sistema", () => {
    const forcado = VIDRO.regras.filter((r) =>
      r.contexto.some((c) => c.includes("forced-colors: active")),
    );
    expect(forcado.length).toBeGreaterThan(0);
    expect(forcado[0]!.declaracoes.get("background-color")).toBe("Canvas");
    expect(forcado[0]!.declaracoes.get("border-color")).toBe("CanvasText");
  });
});

describe("contraste sobre o vidro", () => {
  const porcentagem = (nome: string): number =>
    Number.parseFloat(raiz.declaracoes.get(nome)!) / 100;
  const alfaDoRealce = (bloco: typeof raiz): number => {
    const achado = /^rgb\(255 255 255 \/ ([\d.]+)%\)$/.exec(
      bloco.declaracoes.get("--vidro-realce")!,
    );
    expect(achado, "o realce é branco com alfa").not.toBeNull();
    return Number(achado![1]) / 100;
  };
  const brilhoAlfa = Number(raiz.declaracoes.get("--vidro-brilho-alfa"));

  /** A cor da paleta que `--vidro-base` aponta (`var(--cor-x)`) num tema. */
  const baseDoTema = (bloco: typeof raiz, paleta: PaletaDeCores): string => {
    const achado = /^var\((--cor-[\w-]+)\)$/.exec(
      bloco.declaracoes.get("--vidro-base")!,
    );
    expect(achado, "--vidro-base aponta para um token de cor").not.toBeNull();
    const chave = (Object.keys(NOME_NO_CSS) as Array<keyof PaletaDeCores>).find(
      (k) => NOME_NO_CSS[k] === achado![1],
    );
    expect(chave, `${achado![1]} é da paleta`).toBeDefined();
    return paleta[chave!];
  };

  /** Os dois extremos do fundo que pode estar atrás do vidro. */
  const FUNDOS_ATRAS = ["#ffffff", "#000000"] as const;
  const NIVEIS = ["leve", "medio", "forte"] as const;
  const TEMAS: ReadonlyArray<readonly [string, PaletaDeCores, typeof raiz]> = [
    ["claro", PALETA_CLARA, raiz],
    ["escuro", PALETA_ESCURA, escuroEscolhido],
  ];

  const TEXTOS = [
    "tinta",
    "tintaSuave",
    "primariaTexto",
    "sucesso",
    "erro",
    "atencao",
    "info",
  ] as const;
  // A borda forte é a do campo, e campo continua sólido: fica de fora.
  const GRAFICOS = ["foco", "sucesso", "erro", "atencao"] as const;

  /**
   * A cor que o olho vê no pior caso: o fundo extremo atrás, o preenchimento
   * por cima e o brilho no máximo. O desfoque não entra na conta (só ajudaria),
   * então a medida fica do lado seguro.
   */
  function visto(
    base: string,
    atras: string,
    nivel: string,
    realce: number,
  ): ReturnType<typeof misturar> {
    const preenchimento = misturar(
      atras,
      base,
      porcentagem(`--vidro-opacidade-${nivel}`),
    );
    return misturar(preenchimento, "#ffffff", realce * brilhoAlfa);
  }

  for (const [tema, paleta, bloco] of TEMAS) {
    for (const nivel of NIVEIS) {
      it(`[CA-4] tema ${tema}, nível ${nivel}: texto ≥ 4,5:1 e elementos gráficos ≥ 3:1 no pior fundo`, () => {
        const realce = alfaDoRealce(bloco);
        const base = baseDoTema(bloco, paleta);
        for (const atras of FUNDOS_ATRAS) {
          const fundo = visto(base, atras, nivel, realce);
          for (const texto of TEXTOS) {
            expect(
              relacaoDeContraste(paleta[texto], fundo),
              `${texto} sobre o vidro ${nivel}, atrás ${atras}`,
            ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
          }
          for (const grafico of GRAFICOS) {
            expect(
              relacaoDeContraste(paleta[grafico], fundo),
              `${grafico} sobre o vidro ${nivel}, atrás ${atras}`,
            ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_GRAFICO);
          }
        }
      });
    }
  }

  it("[CA-4] os três blocos escuros e o trecho claro dão a mesma base que o tema da raiz", () => {
    expect(baseDoTema(escuroDoSistema, PALETA_ESCURA)).toBe(
      baseDoTema(escuroEscolhido, PALETA_ESCURA),
    );
    expect(baseDoTema(trechoClaro, PALETA_CLARA)).toBe(
      baseDoTema(raiz, PALETA_CLARA),
    );
  });

  it("[CA-4] o brilho é branco e tem força: o pior caso dele é clarear o fundo", () => {
    expect(alfaDoRealce(raiz)).toBeGreaterThan(0);
    expect(alfaDoRealce(escuroEscolhido)).toBeGreaterThan(0);
    expect(brilhoAlfa).toBeGreaterThan(0);
    expect(brilhoAlfa).toBeLessThanOrEqual(1);
  });
});
