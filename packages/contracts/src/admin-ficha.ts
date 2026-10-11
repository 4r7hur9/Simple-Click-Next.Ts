/**
 * Ficha da loja na administração (AC-207, AC-118): a trilha como a tela a lê,
 * a ficha, a edição do cadastro e as trocas de tipo de negócio (AC-214) e de
 * apelido (AC-208), que têm endereço próprio.
 */

import { z } from "zod";

import {
  esquemaDaSituacaoDaLoja,
  esquemaDoApelidoDaLoja,
  esquemaDoDocumento,
  esquemaDoEmail,
  esquemaDoEnderecoDaLoja,
  esquemaDoTelefone,
  esquemaDoTipoDeNegocio,
  esquemaDoTipoDeNegocioDisponivel,
  textoObrigatorio,
} from "./admin-cadastro.ts";
import {
  esquemaDaRetencaoDaLoja,
  esquemaDaSuspensaoEmCurso,
} from "./admin-situacao.ts";

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
  DOCUMENTO_ENVIADO: "Documento enviado",
  DOCUMENTO_BAIXADO: "Documento aberto",
  LOJA_SUSPENSA: "Loja suspensa",
  LOJA_REATIVADA: "Loja reativada",
  LOJA_EXCLUIDA: "Loja excluída",
  LOJA_RESTAURADA: "Loja restaurada",
  LOJA_REMOVIDA: "Dados da loja removidos em definitivo",
  FUNCIONALIDADE_DESLIGADA: "Funcionalidade desligada",
  FUNCIONALIDADE_RELIGADA: "Funcionalidade religada",
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
  tipo: "Tipo",
  tamanhoEmBytes: "Tamanho (bytes)",
  tipoDeConteudo: "Formato",
  status: "Situação",
  motivo: "Motivo",
  funcionalidade: "Funcionalidade",
  ligada: "Ligada",
  suspensaDesde: "Suspensa desde",
  suspensaAte: "Suspensa até",
  excluidaEm: "Excluída em",
  removerApos: "Remoção definitiva a partir de",
  equipe: "Acessos da equipe retirados",
  enderecos: "Endereços liberados",
  documentos: "Documentos do responsável apagados",
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
  /** A suspensão em curso, quando a loja está suspensa (AC-209). */
  suspensao: esquemaDaSuspensaoEmCurso.nullable(),
  /** A retenção, quando a loja foi excluída (AC-211). */
  retencao: esquemaDaRetencaoDaLoja.nullable(),
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
