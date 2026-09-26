/**
 * Configurações da loja, por seção (T-900, AC-921, AC-923).
 *
 * UMA SEÇÃO É UMA PERGUNTA QUE O DONO RESPONDE SOZINHO: como recebo, como
 * entrego, quando abro, onde recebo o pedido, como apareço, como imprimo. É a
 * lista fechada de `SECOES_DO_DONO`, e ela é fechada de propósito — o que não
 * está nela pertence à administração da plataforma (AC-921): tipo de negócio,
 * apelido da loja, documento, contrato e funcionalidades liberadas.
 *
 * O ESQUEMA AQUI É O DA FORMA, não o da regra. Ele diz que a chave PIX é texto
 * e que a taxa é inteiro em centavos; quem diz que um CPF tem dígito
 * verificador é a regra pura de `packages/core`, que a API compõe por cima
 * destes esquemas na borda (P-007). O site usa os mesmos esquemas para apontar
 * o campo errado antes de ir à rede, e a API é quem decide.
 *
 * CADA MENSAGEM FALA DO CAMPO, em português, porque ela chega à tela ao lado do
 * campo que está errado (AC-923). Mensagem genérica do validador ("Expected
 * number, received string") obrigaria o dono a adivinhar o que consertar.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// As seções
// ---------------------------------------------------------------------------

/**
 * O que o dono configura, na ordem em que o painel mostra (AC-921).
 *
 * `horario` é a grade semanal, o fechamento temporário e as exceções datadas —
 * o cálculo de aberto ou fechado mora em `packages/core` (T-903); aqui mora só
 * o formulário que alimenta esse cálculo.
 */
export const SECOES_DO_DONO = [
  "pagamento",
  "entrega",
  "horario",
  "contato",
  "aparencia",
  "impressao",
] as const;

export type SecaoDoDono = (typeof SECOES_DO_DONO)[number];

/** Como cada seção se chama na tela. */
export const ROTULOS_DAS_SECOES: Readonly<Record<SecaoDoDono, string>> = {
  pagamento: "Pagamento",
  entrega: "Entrega",
  horario: "Horário",
  contato: "Contato",
  aparencia: "Apresentação",
  impressao: "Impressão",
};

/**
 * O que NÃO é do dono, e por isso não aparece nas configurações dele (AC-921).
 *
 * A lista não autoriza nada — quem autoriza é `SECOES_DO_DONO`. Ela existe
 * para a fronteira ser explícita: o teste afirma que nenhum destes aparece
 * no painel do dono, e quem ler o código sabe onde cada um mora.
 */
export const CONFIGURACOES_DA_PLATAFORMA = [
  "Tipo de negócio",
  "Apelido da loja",
  "Documento",
  "Contrato",
  "Funcionalidades liberadas",
] as const;

/** Verdadeiro quando o texto é o nome de uma seção do dono. */
export function ehSecaoDoDono(valor: unknown): valor is SecaoDoDono {
  return (
    typeof valor === "string" &&
    (SECOES_DO_DONO as readonly string[]).includes(valor)
  );
}

// ---------------------------------------------------------------------------
// Blocos
// ---------------------------------------------------------------------------

/** Dinheiro é inteiro em centavos, sempre (P-005). */
const centavos = (rotulo: string) =>
  z
    .int(`${rotulo}: informe o valor em centavos inteiros.`)
    .nonnegative(`${rotulo}: o valor não pode ser negativo.`)
    .max(100_000_000, `${rotulo}: o valor passa do limite aceito.`);

/** Texto opcional: vazio chega como nulo, e não como "". */
const textoOpcional = (maximo: number, rotulo: string) =>
  z
    .string(`${rotulo}: informe um texto.`)
    .trim()
    .max(maximo, `${rotulo}: use no máximo ${maximo} caracteres.`)
    .nullable()
    .transform((valor) => (valor === "" ? null : valor));

/** Hora local da loja, "18:30". Sem data e sem fuso — é a hora do relógio dela. */
const hora = z
  .string("Informe a hora.")
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a hora no formato 18:30.");

// ---------------------------------------------------------------------------
// Pagamento (US-900)
// ---------------------------------------------------------------------------

export const FORMAS_DE_PAGAMENTO_DA_LOJA = [
  "PIX",
  "CASH",
  "CARD_ON_DELIVERY",
] as const;

export const TIPOS_DE_CHAVE_PIX = [
  "CPF",
  "CNPJ",
  "TELEFONE",
  "EMAIL",
  "ALEATORIA",
] as const;

export type TipoDeChavePix = (typeof TIPOS_DE_CHAVE_PIX)[number];

export const esquemaDaChavePixDaLoja = z.strictObject({
  tipo: z.enum(TIPOS_DE_CHAVE_PIX, "Escolha o tipo da chave PIX."),
  chave: z
    .string("Informe a chave PIX.")
    .trim()
    .min(1, "Informe a chave PIX.")
    .max(140, "A chave PIX tem no máximo 140 caracteres."),
  titular: z
    .string("Informe o nome de quem recebe.")
    .trim()
    .min(1, "Informe o nome de quem recebe, como aparece no banco.")
    .max(160, "O nome de quem recebe tem no máximo 160 caracteres."),
});

export const esquemaDaConfiguracaoDePagamento = z
  .strictObject({
    formas: z
      .array(
        z.enum(FORMAS_DE_PAGAMENTO_DA_LOJA, "Forma de pagamento desconhecida."),
      )
      .max(FORMAS_DE_PAGAMENTO_DA_LOJA.length),
    pix: esquemaDaChavePixDaLoja.nullable(),
  })
  .superRefine((valor, contexto) => {
    if (new Set(valor.formas).size !== valor.formas.length) {
      contexto.addIssue({
        code: "custom",
        path: ["formas"],
        message: "Cada forma de pagamento aparece uma vez só.",
      });
    }
    if (valor.formas.includes("PIX") && valor.pix === null) {
      contexto.addIssue({
        code: "custom",
        path: ["pix", "chave"],
        message: "Informe a chave PIX para oferecer PIX no checkout.",
      });
    }
  });

export type SecaoDePagamento = z.infer<typeof esquemaDaConfiguracaoDePagamento>;

// ---------------------------------------------------------------------------
// Entrega (US-901)
// ---------------------------------------------------------------------------

export const esquemaDaConfiguracaoDeEntrega = z.strictObject({
  aceitaEntrega: z.boolean("Diga se a loja entrega."),
  aceitaRetirada: z.boolean("Diga se o cliente pode retirar."),
  /** Zero é taxa zero; NULO é "a combinar". Os dois são diferentes. */
  taxaCentavos: centavos("Taxa de entrega").nullable(),
  nomeDaTaxa: textoOpcional(80, "Nome da taxa"),
  gratisAcimaDeCentavos: centavos("Entrega grátis acima de").nullable(),
  minimoParaEntregaCentavos: centavos("Mínimo para entrega").nullable(),
  minimoParaRetiradaCentavos: centavos("Mínimo para retirada").nullable(),
  prazoMinutos: z
    .int("Prazo: informe os minutos em número inteiro.")
    .nonnegative("Prazo: o valor não pode ser negativo.")
    .max(24 * 60, "Prazo: use no máximo 1440 minutos (um dia).")
    .nullable(),
});

export type SecaoDeEntrega = z.infer<typeof esquemaDaConfiguracaoDeEntrega>;

// ---------------------------------------------------------------------------
// Horário (US-902) — o formulário que alimenta o cálculo da T-903
// ---------------------------------------------------------------------------

const esquemaDaFaixa = z
  .strictObject({ abre: hora, fecha: hora })
  .refine((faixa) => faixa.abre < faixa.fecha, {
    path: ["fecha"],
    message:
      "O fechamento precisa vir depois da abertura. Faixa que passa da meia-noite: cadastre a madrugada no dia seguinte.",
  });

const esquemaDoDia = z
  .strictObject({
    /** 0 no domingo, como o JavaScript numera. */
    dia: z.int("Dia da semana inválido.").min(0).max(6),
    faixas: z
      .array(esquemaDaFaixa)
      .max(4, "Use no máximo quatro faixas por dia."),
  })
  .superRefine((dia, contexto) => {
    const ordenadas = [...dia.faixas].sort((a, b) =>
      a.abre.localeCompare(b.abre),
    );
    for (let indice = 1; indice < ordenadas.length; indice += 1) {
      const anterior = ordenadas[indice - 1];
      const atual = ordenadas[indice];
      if (anterior !== undefined && atual !== undefined) {
        if (atual.abre < anterior.fecha) {
          contexto.addIssue({
            code: "custom",
            path: ["faixas"],
            message: "Duas faixas do mesmo dia se sobrepõem.",
          });
          return;
        }
      }
    }
  });

const esquemaDaExcecao = z
  .strictObject({
    /** Data local da loja, "2026-12-25". */
    data: z.iso.date("Use a data no formato 2026-12-25."),
    fechada: z.boolean("Diga se a loja fecha nesse dia."),
    abre: hora.nullable(),
    fecha: hora.nullable(),
    motivo: textoOpcional(120, "Motivo"),
  })
  .superRefine((excecao, contexto) => {
    if (excecao.fechada) return;
    if (excecao.abre === null || excecao.fecha === null) {
      contexto.addIssue({
        code: "custom",
        path: [excecao.abre === null ? "abre" : "fecha"],
        message: "Dia de horário especial precisa dizer quando abre e fecha.",
      });
      return;
    }
    if (excecao.abre >= excecao.fecha) {
      contexto.addIssue({
        code: "custom",
        path: ["fecha"],
        message: "O fechamento precisa vir depois da abertura.",
      });
    }
  });

export const esquemaDaConfiguracaoDeHorario = z
  .strictObject({
    semana: z.array(esquemaDoDia).max(7),
    /** "Fechar agora" (AC-911): vale até o dono desligar, sem mexer na grade. */
    fechadoAgora: z.boolean("Diga se a loja está fechada agora."),
    excecoes: z
      .array(esquemaDaExcecao)
      .max(120, "Use no máximo 120 datas especiais."),
  })
  .superRefine((horario, contexto) => {
    const dias = horario.semana.map((dia) => dia.dia);
    if (new Set(dias).size !== dias.length) {
      contexto.addIssue({
        code: "custom",
        path: ["semana"],
        message: "Cada dia da semana aparece uma vez só.",
      });
    }
    const datas = horario.excecoes.map((excecao) => excecao.data);
    if (new Set(datas).size !== datas.length) {
      contexto.addIssue({
        code: "custom",
        path: ["excecoes"],
        message: "Cada data especial aparece uma vez só.",
      });
    }
  });

export type SecaoDeHorario = z.infer<typeof esquemaDaConfiguracaoDeHorario>;

// ---------------------------------------------------------------------------
// Contato (US-903)
// ---------------------------------------------------------------------------

export const esquemaDaConfiguracaoDeContato = z.strictObject({
  /**
   * Como o dono digitou: com máscara, espaço ou sem o código do país. Quem
   * normaliza e explica o que falta é a regra de `packages/core` (AC-913).
   */
  numero: z
    .string("Informe o WhatsApp da loja.")
    .trim()
    .max(30, "O número tem caracteres demais."),
  saudacao: z
    .string("Informe a saudação.")
    .trim()
    .min(1, "Informe a saudação da mensagem.")
    .max(280, "A saudação tem no máximo 280 caracteres."),
  publico: z.boolean("Diga se o número aparece na página da loja."),
});

export type SecaoDeContato = z.infer<typeof esquemaDaConfiguracaoDeContato>;

// ---------------------------------------------------------------------------
// Apresentação (US-904)
// ---------------------------------------------------------------------------

/** Endereço de imagem: só HTTPS, para a vitrine não carregar conteúdo misto. */
const enderecoDeImagem = (rotulo: string) =>
  z
    .url(`${rotulo}: informe um endereço completo, começando por https://.`)
    .max(1_000, `${rotulo}: o endereço é longo demais.`)
    .refine((valor) => valor.startsWith("https://"), {
      message: `${rotulo}: o endereço precisa começar por https://.`,
    })
    .nullable();

export const esquemaDaConfiguracaoDeAparencia = z.strictObject({
  boasVindas: textoOpcional(280, "Boas-vindas"),
  sobre: textoOpcional(2_000, "Sobre a loja"),
  logo: enderecoDeImagem("Logo"),
  capa: enderecoDeImagem("Capa"),
  corPrimaria: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a cor no formato #1a2b3c.")
    .nullable(),
});

export type SecaoDeAparencia = z.infer<typeof esquemaDaConfiguracaoDeAparencia>;

// ---------------------------------------------------------------------------
// A recusa (AC-923)
// ---------------------------------------------------------------------------

/**
 * A resposta de configuração recusada: um problema por campo.
 *
 * É O MESMO FORMATO de toda recusa de entrada da API (`core/validar.ts`), e não
 * um formato próprio: o site lê a recusa do checkout e a da configuração com
 * o mesmo código. `caminho` usa ponto entre os níveis ("pix.chave",
 * "semana.2.faixas"), que é o nome que a tela dá ao campo — é assim que a
 * mensagem chega ao lado do campo certo, e não num aviso genérico no topo.
 */
export const esquemaDaRecusaDeConfiguracao = z.strictObject({
  erro: z.literal("entrada_invalida"),
  campos: z.array(
    z.strictObject({
      onde: z.enum(["params", "query", "body", "headers"]),
      caminho: z.string(),
      mensagem: z.string(),
    }),
  ),
});

export type RecusaDeConfiguracao = z.infer<
  typeof esquemaDaRecusaDeConfiguracao
>;

/**
 * Um problema por campo do formulário, na ordem em que o validador os achou.
 *
 * TODOS os problemas, e não o primeiro: corrigir um campo, enviar e descobrir
 * o segundo é o caminho mais curto para o dono desistir no terceiro. O que não
 * é do corpo (apelido na URL, por exemplo) não é campo do formulário e fica de
 * fora — a tela não tem onde mostrá-lo.
 */
export function problemasPorCampo(
  campos: RecusaDeConfiguracao["campos"],
): Record<string, string> {
  const porCampo: Record<string, string> = {};
  for (const campo of campos) {
    if (campo.onde !== "body") continue;
    const nome = campo.caminho === "" ? "formulario" : campo.caminho;
    porCampo[nome] ??= campo.mensagem;
  }
  return porCampo;
}
