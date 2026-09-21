import { z } from "zod";

/**
 * O registro é a única fonte de verdade dos tipos que uma categoria oferece.
 * O esquema do formulário e o esquema do valor são derivados dele, evitando
 * que a tela aceite um tipo que o domínio não conhece.
 */
export const DEFINICOES_DOS_TIPOS = {
  texto: {
    rotulo: "Texto",
    esquemaDoValor: z.string().trim().min(1, "Informe um texto."),
  },
  numero: {
    rotulo: "Número",
    esquemaDoValor: z.number().finite("Informe um número finito."),
  },
  lista: {
    rotulo: "Lista de opções",
    esquemaDoValor: z.string().trim().min(1, "Informe uma opção."),
  },
  booleano: {
    rotulo: "Verdadeiro ou falso",
    esquemaDoValor: z.boolean(),
  },
} as const;

export const TIPOS_DE_VALOR = Object.keys(DEFINICOES_DOS_TIPOS) as [
  keyof typeof DEFINICOES_DOS_TIPOS,
  ...(keyof typeof DEFINICOES_DOS_TIPOS)[],
];

export type TipoDeValor = (typeof TIPOS_DE_VALOR)[number];

export const esquemaDoTipoDeValor = z.enum(TIPOS_DE_VALOR);

const camposDaEspecificacao = z.strictObject({
  categoriaId: z.string().trim().min(1, "A categoria é obrigatória.").max(100),
  nome: z.string().trim().min(1, "Informe o nome.").max(120),
  tipo: esquemaDoTipoDeValor,
  unidade: z
    .string()
    .trim()
    .max(30, "A unidade pode ter no máximo 30 caracteres.")
    .nullable(),
  obrigatoria: z.boolean(),
  filtravel: z.boolean(),
  opcoes: z
    .array(z.string().trim().min(1, "A opção não pode ser vazia."))
    .max(100, "Uma especificação pode ter no máximo 100 opções."),
  ordem: z.number().int().min(0),
});

function validarOpcoesDoTipo(
  valor: z.infer<typeof camposDaEspecificacao>,
  contexto: z.RefinementCtx,
): void {
  const opcoesSemRepeticao = new Set(valor.opcoes);
  if (opcoesSemRepeticao.size !== valor.opcoes.length) {
    contexto.addIssue({
      code: "custom",
      path: ["opcoes"],
      message: "As opções da lista não podem se repetir.",
    });
  }

  if (valor.tipo === "lista" && valor.opcoes.length === 0) {
    contexto.addIssue({
      code: "custom",
      path: ["opcoes"],
      message: "Uma especificação de lista precisa de ao menos uma opção.",
    });
  }

  if (valor.tipo !== "lista" && valor.opcoes.length > 0) {
    contexto.addIssue({
      code: "custom",
      path: ["opcoes"],
      message: "Somente especificações de lista podem ter opções.",
    });
  }
}

/** Entrada usada para criar ou atualizar uma especificação da categoria. */
export const esquemaDaEspecificacao =
  camposDaEspecificacao.superRefine(validarOpcoesDoTipo);

/** Registro persistido, incluindo a versão que sustenta o histórico. */
export const esquemaDoRegistroDaEspecificacao = camposDaEspecificacao
  .extend({
    id: z.string().trim().min(1),
    versao: z.number().int().min(1),
    removidaEm: z.string().datetime().nullable(),
  })
  .superRefine(validarOpcoesDoTipo);

export type EntradaDaEspecificacao = z.input<typeof esquemaDaEspecificacao>;
export type RegistroDaEspecificacao = z.infer<
  typeof esquemaDoRegistroDaEspecificacao
>;

/**
 * Gera o validador do valor a partir do tipo registrado. Para lista, o
 * conjunto de opções da própria especificação fecha o vocabulário permitido.
 */
export function esquemaDoValorDaEspecificacao(
  especificacao: Pick<RegistroDaEspecificacao, "tipo" | "opcoes">,
): z.ZodTypeAny {
  const esquema: z.ZodTypeAny =
    DEFINICOES_DOS_TIPOS[especificacao.tipo].esquemaDoValor;
  if (especificacao.tipo !== "lista") return esquema;

  return esquema.refine(
    (valor: unknown) => especificacao.opcoes.includes(valor as string),
    {
      message: `Escolha uma das opções: ${especificacao.opcoes.join(", ")}.`,
    },
  );
}
