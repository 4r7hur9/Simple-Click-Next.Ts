/**
 * O catálogo de funcionalidades da plataforma e a regra do padrão ligado
 * (admin-lojas, T-207 — AC-212, AC-213).
 *
 * Na versão 1 TUDO nasce ligado, sem cobrança e sem limite (AC-213). A
 * administração pode desligar uma funcionalidade para uma loja, gravando uma
 * EXCEÇÃO (`app.store_feature_overrides`, migração 0040); sem exceção, vale o
 * padrão. Planos e assinaturas ficam para depois (decisões, 03/10/2026).
 *
 * As chaves são as do modelo de dados. Só as que têm efeito hoje
 * (`temEfeito`) podem ser desligadas: desligar uma chave que nada consulta
 * daria à administração a impressão de um corte que não acontece.
 *
 * `auto_print` cobre a ÁREA DE IMPRESSÃO TÉRMICA inteira — o cupom por clique,
 * a configuração do papel e as rotas do agente de impressão —, que é o que o
 * AC-212 pede para sumir do menu e responder indisponível.
 *
 * Função pura: a API e o site usam a mesma regra.
 */

export const CHAVES_DE_FUNCIONALIDADE = [
  "auto_print",
  "multi_store",
  "orders_per_month",
] as const;

export type ChaveDeFuncionalidade = (typeof CHAVES_DE_FUNCIONALIDADE)[number];

export interface DescricaoDaFuncionalidade {
  readonly chave: ChaveDeFuncionalidade;
  readonly rotulo: string;
  readonly descricao: string;
  /** Algum ponto do sistema consulta esta chave hoje. */
  readonly temEfeito: boolean;
}

export const CATALOGO_DE_FUNCIONALIDADES: readonly DescricaoDaFuncionalidade[] =
  [
    {
      chave: "auto_print",
      rotulo: "Impressão térmica",
      descricao:
        "Cupom na impressora térmica, configuração do papel e impressão automática pelo agente.",
      temEfeito: true,
    },
    {
      chave: "multi_store",
      rotulo: "Várias lojas",
      descricao: "Mais de uma loja para o mesmo responsável.",
      temEfeito: false,
    },
    {
      chave: "orders_per_month",
      rotulo: "Pedidos por mês",
      descricao: "Quantidade de pedidos recebidos por mês.",
      temEfeito: false,
    },
  ];

/** A exceção gravada para uma loja, como o banco a guarda. */
export interface ExcecaoDeFuncionalidade {
  readonly chave: string;
  readonly ligada: boolean;
  /** `null` = sem limite. */
  readonly limite: number | null;
}

/** A funcionalidade como vale para a loja: padrão ou exceção. */
export interface FuncionalidadeDaLoja extends DescricaoDaFuncionalidade {
  readonly ligada: boolean;
  /** `null` = sem limite — o padrão da versão 1. */
  readonly limite: number | null;
  /** Há exceção gravada pela administração. */
  readonly porExcecao: boolean;
}

/** O texto é uma chave do catálogo de funcionalidades. */
export function ehChaveDeFuncionalidade(
  valor: unknown,
): valor is ChaveDeFuncionalidade {
  return (
    typeof valor === "string" &&
    (CHAVES_DE_FUNCIONALIDADE as readonly string[]).includes(valor)
  );
}

/**
 * Todas as funcionalidades do catálogo, como valem para a loja. Exceção de
 * chave fora do catálogo é ignorada; sem exceção, ligada e sem limite.
 */
export function funcionalidadesDaLoja(
  excecoes: readonly ExcecaoDeFuncionalidade[],
): readonly FuncionalidadeDaLoja[] {
  return CATALOGO_DE_FUNCIONALIDADES.map((descricao) => {
    const excecao = excecoes.find((item) => item.chave === descricao.chave);
    return {
      ...descricao,
      ligada: excecao?.ligada ?? true,
      limite: excecao?.limite ?? null,
      porExcecao: excecao !== undefined,
    };
  });
}

/** A funcionalidade está ligada para a loja? Sem exceção, sim. */
export function funcionalidadeLigada(
  chave: ChaveDeFuncionalidade,
  excecoes: readonly ExcecaoDeFuncionalidade[],
): boolean {
  return excecoes.find((item) => item.chave === chave)?.ligada ?? true;
}
