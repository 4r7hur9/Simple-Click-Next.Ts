/**
 * Contrato da administração da plataforma (feature admin-lojas).
 *
 * O formulário do site e a API validam com ESTES esquemas, e é por isso que
 * eles moram aqui: a recusa do documento inválido (AC-202) e do apelido fora do
 * formato acontece antes do envio, na tela, e acontece de novo na API — porque
 * quem chama a API direto não passa pelo formulário. Uma regra, dois lugares
 * que a aplicam, nenhuma segunda cópia.
 *
 * As mensagens são escritas para quem está preenchendo, e não para quem
 * programa: é a frase que aparece embaixo do campo.
 */

import { z } from "zod";

import {
  conferirDocumento,
  MENSAGEM_DE_DOCUMENTO_INVALIDO,
  somenteDigitos,
} from "./documento.ts";

// ---------------------------------------------------------------------------
// Apelido — o endereço da loja na web
// ---------------------------------------------------------------------------

/** Minúsculas, números e hífen no meio, de 2 a 63 caracteres (rótulo de DNS). */
export const FORMATO_DO_APELIDO = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/;

/**
 * Nomes que pertencem à plataforma e nunca viram loja. Sem esta lista, quem
 * cadastrasse a loja "admin" passaria a receber o tráfego da administração —
 * é a mesma lista que o site usa para ler o endereço (`lib/host-loja.ts`).
 */
export const APELIDOS_RESERVADOS: readonly string[] = [
  "www",
  "app",
  "api",
  "painel",
  "admin",
  "static",
  "cdn",
  "mail",
  "l",
  "entrar",
  "imprimir",
];

export const MENSAGEM_DE_APELIDO_EM_USO =
  "Este endereço já está em uso por outra loja.";

export const esquemaDoApelidoDaLoja = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    FORMATO_DO_APELIDO,
    "Use de 2 a 63 letras minúsculas, números e hífen, sem hífen no começo nem no fim.",
  )
  .refine((apelido) => !APELIDOS_RESERVADOS.includes(apelido), {
    message: "Este endereço é reservado pela plataforma.",
  });

// ---------------------------------------------------------------------------
// Campos de cadastro
// ---------------------------------------------------------------------------

/** CPF ou CNPJ, com ou sem máscara. Sai só com dígitos (AC-202). */
export const esquemaDoDocumento = z
  .string()
  .trim()
  .min(1, "Informe o CPF ou o CNPJ.")
  .refine((valor) => conferirDocumento(valor).valido, {
    message: MENSAGEM_DE_DOCUMENTO_INVALIDO,
  })
  .transform((valor) => somenteDigitos(valor));

/** Telefone brasileiro com DDD. Sai no formato internacional (+55…). */
export const esquemaDoTelefone = z
  .string()
  .trim()
  .transform((valor) => valor.replace(/[\s().-]/g, ""))
  .refine((valor) => /^(\+?55)?\d{10,11}$/.test(valor), {
    message: "Informe o telefone com DDD, só números.",
  })
  .transform((valor) => {
    const digitos = valor.replace(/^\+/, "");
    return digitos.length > 11 ? `+${digitos}` : `+55${digitos}`;
  });

export const esquemaDoEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "O e-mail está longo demais.")
  .pipe(z.email("Informe um e-mail válido."));

/** As 27 unidades da federação. Sigla fora da lista é erro de digitação. */
export const UNIDADES_DA_FEDERACAO = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
] as const;

const textoObrigatorio = (rotulo: string, maximo: number) =>
  z
    .string()
    .trim()
    .min(1, `Informe ${rotulo}.`)
    .max(
      maximo,
      `${rotulo[0]?.toUpperCase() ?? ""}${rotulo.slice(1)} está longo demais.`,
    );

export const esquemaDoEnderecoDaLoja = z.strictObject({
  cep: z
    .string()
    .trim()
    .transform((valor) => valor.replace(/\D/g, ""))
    .refine((valor) => valor.length === 8, {
      message: "Informe o CEP com 8 números.",
    }),
  logradouro: textoObrigatorio("o logradouro", 160),
  numero: textoObrigatorio("o número", 20),
  complemento: z.string().trim().max(80).nullable().optional(),
  bairro: textoObrigatorio("o bairro", 80),
  cidade: textoObrigatorio("a cidade", 80),
  uf: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.enum(UNIDADES_DA_FEDERACAO, "Escolha a UF da loja.")),
});

/** Código de um tipo de negócio (`vertical_presets.code`), como FOOD_SNACK. */
export const esquemaDoTipoDeNegocio = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z_]{1,40}$/, "Escolha o tipo de negócio.");

// ---------------------------------------------------------------------------
// Cadastro de loja (AC-200, AC-201, AC-202)
// ---------------------------------------------------------------------------

export const esquemaDaNovaLoja = z.strictObject({
  /** Nome da loja, ou a razão social quando não há nome fantasia. */
  nome: textoObrigatorio("o nome ou a razão social", 120),
  razaoSocial: z.string().trim().max(160).nullable().optional(),
  documento: esquemaDoDocumento,
  responsavel: z.strictObject({
    nome: textoObrigatorio("o nome do responsável", 120),
    email: esquemaDoEmail,
    telefone: esquemaDoTelefone,
  }),
  endereco: esquemaDoEnderecoDaLoja,
  tipoDeNegocio: esquemaDoTipoDeNegocio,
  apelido: esquemaDoApelidoDaLoja,
});

export type NovaLojaNoContrato = z.output<typeof esquemaDaNovaLoja>;
export type NovaLojaEnviada = z.input<typeof esquemaDaNovaLoja>;

/** Situações de uma loja, na língua de quem administra. */
export const SITUACOES_DA_LOJA = [
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "DELETED",
] as const;

export const esquemaDaSituacaoDaLoja = z.enum(SITUACOES_DA_LOJA);

export const esquemaDaLojaCriada = z.strictObject({
  id: z.string(),
  /** Código humano de atendimento, sequencial, com quatro dígitos: `0002`. */
  codigo: z.string().regex(/^\d{4,}$/),
  apelido: z.string(),
  status: esquemaDaSituacaoDaLoja,
  /** Falso quando a loja foi criada mas o e-mail ainda não saiu. */
  conviteEnviado: z.boolean(),
});

export type LojaCriadaNoContrato = z.infer<typeof esquemaDaLojaCriada>;

/**
 * Recusa de campo, no mesmo formato da borda de validação da API
 * (`core/validar.ts`): é o que permite ao formulário apontar o campo.
 */
export const esquemaDoCampoRecusado = z.strictObject({
  onde: z.string(),
  caminho: z.string(),
  mensagem: z.string(),
});

export const esquemaDaRecusaDeCadastro = z.strictObject({
  erro: z.enum(["entrada_invalida", "apelido_em_uso", "tipo_desconhecido"]),
  campos: z.array(esquemaDoCampoRecusado),
  /** Um apelido livre parecido, quando o pedido foi recusado por repetição. */
  sugestao: z.string().nullable().optional(),
});

export type RecusaDeCadastroNoContrato = z.infer<
  typeof esquemaDaRecusaDeCadastro
>;

/** Os tipos de negócio que o formulário oferece. */
export const esquemaDoTipoDeNegocioDisponivel = z.strictObject({
  codigo: z.string(),
  nome: z.string(),
  controlaEstoque: z.boolean(),
});

export const esquemaDosTiposDeNegocio = z.strictObject({
  tipos: z.array(esquemaDoTipoDeNegocioDisponivel),
});

export type TipoDeNegocioNoContrato = z.infer<
  typeof esquemaDoTipoDeNegocioDisponivel
>;

export type SituacaoDaLoja = (typeof SITUACOES_DA_LOJA)[number];

/** Como cada situação se chama na tela da administração. */
export const ROTULOS_DAS_SITUACOES: Readonly<Record<SituacaoDaLoja, string>> = {
  PENDING: "Pendente",
  ACTIVE: "Ativa",
  SUSPENDED: "Suspensa",
  DELETED: "Excluída",
};

// ---------------------------------------------------------------------------
// Lista e busca de lojas (AC-206)
// ---------------------------------------------------------------------------

/**
 * `GET /v1/admin/lojas?busca=&situacao=&pagina=&porPagina=`
 *
 * A busca é UM campo só, de propósito: quem atende o telefone tem na mão um
 * nome, um CNPJ ou um código de atendimento, e não deveria precisar saber em
 * qual caixinha cada um entra. A API descobre pelo formato.
 */
export const esquemaDaConsultaDeLojas = z.object({
  /** Parte do nome, do documento (com ou sem máscara) ou do código. */
  busca: z.string().trim().max(80).optional(),
  /** Sem filtro, a lista traz tudo que não foi excluído (AC-211). */
  situacao: esquemaDaSituacaoDaLoja.optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(25),
});

export type ConsultaDeLojasNoContrato = z.output<
  typeof esquemaDaConsultaDeLojas
>;

/** Uma loja como a lista da administração a mostra. Sem dado pessoal. */
export const esquemaDaLojaNaLista = z.strictObject({
  id: z.string(),
  codigo: z.string(),
  nome: z.string(),
  apelido: z.string(),
  tipoDeNegocio: z.strictObject({ codigo: z.string(), nome: z.string() }),
  status: esquemaDaSituacaoDaLoja,
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
  /** Instante do cadastro, em ISO 8601. */
  criadaEm: z.string(),
});

export const esquemaDaListaDeLojas = z.strictObject({
  lojas: z.array(esquemaDaLojaNaLista),
  /** Quantas lojas casam com a consulta, contando as páginas seguintes. */
  total: z.number().int().min(0),
  pagina: z.number().int().min(1),
  porPagina: z.number().int().min(1),
});

export type LojaNaListaNoContrato = z.infer<typeof esquemaDaLojaNaLista>;
export type ListaDeLojasNoContrato = z.infer<typeof esquemaDaListaDeLojas>;

// ---------------------------------------------------------------------------
// Trilha de auditoria, do jeito que a administração a lê (AC-207, AC-118)
// ---------------------------------------------------------------------------

/**
 * Um campo que mudou num ato registrado. `antes` e `depois` chegam como a
 * trilha os guardou — o dado pessoal já MASCARADO na gravação (P-009): a
 * trilha diz que o documento mudou, e de qual final para qual final, sem
 * virar um segundo lugar de onde se copia o documento de alguém.
 */
export const esquemaDoCampoDaTrilha = z.strictObject({
  campo: z.string(),
  antes: z.unknown(),
  depois: z.unknown(),
});

/** Um ato da trilha: quem, quando, o quê e quais campos. */
export const esquemaDoRegistroDaTrilha = z.strictObject({
  id: z.string(),
  /** Instante do ato, em ISO 8601. */
  quando: z.string(),
  /** Código do ato (`LOJA_ALTERADA`, `CONFIG_SENSIVEL_ALTERADA`…). */
  acao: z.string(),
  /** Quem praticou. Nulo quando o ato não tem pessoa (tarefa do sistema). */
  quem: z.strictObject({ id: z.string(), nome: z.string() }).nullable(),
  /** Com que poder: ADMIN, OWNER… — o papel NO MOMENTO do ato. */
  papel: z.string(),
  campos: z.array(esquemaDoCampoDaTrilha),
  /** Alteração sensível (chave PIX, número do WhatsApp…): a tela destaca. */
  sensivel: z.boolean(),
});

export type CampoDaTrilhaNoContrato = z.infer<typeof esquemaDoCampoDaTrilha>;
export type RegistroDaTrilhaNoContrato = z.infer<
  typeof esquemaDoRegistroDaTrilha
>;

/** Como cada ato se chama na tela. Ato desconhecido aparece pelo código. */
export const ROTULOS_DOS_ATOS: Readonly<Record<string, string>> = {
  LOJA_CRIADA: "Loja cadastrada",
  LOJA_ALTERADA: "Cadastro alterado",
  ADMIN_ACCESS: "Consulta da administração",
  CONFIG_ALTERADA: "Configuração alterada",
  CONFIG_SENSIVEL_ALTERADA: "Dado sensível alterado",
  TIPO_DE_NEGOCIO_ALTERADO: "Tipo de negócio alterado",
  APELIDO_ALTERADO: "Endereço na web alterado",
};

/** Como cada campo do cadastro se chama na tela. */
export const ROTULOS_DOS_CAMPOS_DA_LOJA: Readonly<Record<string, string>> = {
  nome: "Nome",
  razaoSocial: "Razão social",
  documento: "CPF/CNPJ",
  email: "E-mail",
  telefone: "Telefone",
  cep: "CEP",
  logradouro: "Logradouro",
  numero: "Número",
  complemento: "Complemento",
  bairro: "Bairro",
  cidade: "Cidade",
  uf: "UF",
  codigo: "Código",
  apelido: "Endereço na web",
  tipoDeNegocio: "Tipo de negócio",
  controlaEstoque: "Controle de estoque",
  status: "Situação",
};

// ---------------------------------------------------------------------------
// Ficha e edição da loja (AC-207)
// ---------------------------------------------------------------------------

/**
 * A ficha que a administração abre. Aqui o documento e o contato APARECEM:
 * é o único lugar da plataforma que os mostra, e só pela credencial da
 * administração — e cada abertura fica na trilha (AC-118).
 */
export const esquemaDaFichaDaLoja = z.strictObject({
  id: z.string(),
  codigo: z.string(),
  nome: z.string(),
  razaoSocial: z.string().nullable(),
  documento: z.strictObject({
    /** Só os dígitos, como o banco guarda. */
    numero: z.string().nullable(),
    tipo: z.enum(["CPF", "CNPJ"]).nullable(),
  }),
  apelido: z.string(),
  status: esquemaDaSituacaoDaLoja,
  tipoDeNegocio: esquemaDoTipoDeNegocioDisponivel,
  contato: z.strictObject({
    email: z.string().nullable(),
    telefone: z.string().nullable(),
  }),
  endereco: z.strictObject({
    cep: z.string().nullable(),
    logradouro: z.string().nullable(),
    numero: z.string().nullable(),
    complemento: z.string().nullable(),
    bairro: z.string().nullable(),
    cidade: z.string().nullable(),
    uf: z.string().nullable(),
  }),
  criadaEm: z.string(),
  atualizadaEm: z.string(),
  /** As últimas alterações desta loja, da mais nova para a mais antiga. */
  historico: z.array(esquemaDoRegistroDaTrilha),
});

export type FichaDaLojaNoContrato = z.infer<typeof esquemaDaFichaDaLoja>;

/**
 * `PATCH /v1/admin/lojas/:id` — só o que mudou.
 *
 * Apelido, tipo de negócio e situação NÃO entram aqui: cada um tem endereço
 * próprio, porque cada um mexe em mais do que uma coluna (o endereço antigo
 * que precisa continuar funcionando, o vocabulário das telas, a vitrine que
 * sai do ar).
 */
export const esquemaDaEdicaoDaLoja = z
  .strictObject({
    nome: textoObrigatorio("o nome ou a razão social", 120).optional(),
    razaoSocial: z.string().trim().max(160).nullable().optional(),
    documento: esquemaDoDocumento.optional(),
    email: esquemaDoEmail.optional(),
    telefone: esquemaDoTelefone.optional(),
    endereco: esquemaDoEnderecoDaLoja.optional(),
  })
  .refine((edicao) => Object.keys(edicao).length > 0, {
    message: "Nada para alterar: envie ao menos um campo.",
  });

export type EdicaoDaLojaNoContrato = z.output<typeof esquemaDaEdicaoDaLoja>;
export type EdicaoDaLojaEnviada = z.input<typeof esquemaDaEdicaoDaLoja>;

// ---------------------------------------------------------------------------
// Tipo de negócio trocado pela administração (AC-214)
// ---------------------------------------------------------------------------

/**
 * `PUT /v1/admin/lojas/:id/tipo-de-negocio`. Endereço próprio, e não um campo
 * da edição do cadastro: a troca muda o vocabulário e o layout de todas as
 * telas da loja e liga o controle de estoque do ramo novo.
 */
export const esquemaDaTrocaDeTipoDeNegocio = z.strictObject({
  tipoDeNegocio: esquemaDoTipoDeNegocio,
});

export type TrocaDeTipoDeNegocioEnviada = z.input<
  typeof esquemaDaTrocaDeTipoDeNegocio
>;

// ---------------------------------------------------------------------------
// Apelido trocado pela administração (AC-208)
// ---------------------------------------------------------------------------

/**
 * `PUT /v1/admin/lojas/:id/apelido`. O apelido antigo continua levando à
 * loja: fica guardado como endereço que redireciona para o novo.
 */
export const esquemaDaTrocaDeApelido = z.strictObject({
  apelido: esquemaDoApelidoDaLoja,
});

export type TrocaDeApelidoEnviada = z.input<typeof esquemaDaTrocaDeApelido>;
