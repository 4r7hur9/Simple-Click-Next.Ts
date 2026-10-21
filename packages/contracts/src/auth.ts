/**
 * Formas públicas da identidade: o que entra e o que sai das rotas de
 * `/v1/auth` (T-112).
 *
 * Senha só entra, nunca sai. Token de renovação só sai no corpo para o
 * aplicativo nativo; o navegador o recebe em cookie protegido. As respostas
 * que poderiam revelar se um e-mail tem conta são sempre as mesmas.
 */
import { z } from "zod";

import { esquemaDoAceiteDoCadastro } from "./legal.ts";

// ---------------------------------------------------------------------------
// Peças comuns
// ---------------------------------------------------------------------------

/** E-mail como a API o compara: sem espaço nas pontas e em minúsculas. */
const esquemaDoEmail = z
  .email("Informe um e-mail válido.")
  .trim()
  .toLowerCase();

/**
 * Senha como foi digitada. Sem `trim`: espaço pode fazer parte da senha que a
 * pessoa escolheu. A política (tamanho e vazamentos) é conferida pela API.
 */
const esquemaDaSenha = z.string().min(1, "Informe uma senha.").max(1024);

/** Token de link (verificação, recuperação, convite): opaco, em base64url. */
const esquemaDoTokenDeLink = z
  .string()
  .min(20, "Link incompleto.")
  .max(200, "Link inválido.")
  .regex(/^[A-Za-z0-9_-]+$/, "Link inválido.");

/** Código de seis dígitos: o do e-mail ou o do aplicativo autenticador. */
const esquemaDoCodigoDeSeisDigitos = z
  .string()
  .regex(/^\d{6}$/, "Informe os seis dígitos do código.");

/** Papel da sessão, do jeito que o token de acesso o carrega. */
export const esquemaDoPapelDaSessao = z.enum(["CUSTOMER", "OWNER", "ADMIN"]);

// ---------------------------------------------------------------------------
// Cadastro (AC-100 a AC-102)
// ---------------------------------------------------------------------------

/** Dados que a pessoa informa ao criar uma conta de cliente final. */
export const esquemaDoCadastro = z.strictObject({
  nome: z
    .string()
    .trim()
    .min(2, "Informe seu nome.")
    .max(120, "Nome muito longo."),
  email: esquemaDoEmail,
  /**
   * Opcional no cadastro: o pedido pede o telefone quando a conta não tem.
   * Texto vazio vale como "não informado".
   */
  telefone: z.preprocess(
    (valor) =>
      typeof valor === "string" && valor.trim() === "" ? undefined : valor,
    z
      .string()
      .trim()
      .regex(
        /^\+[1-9]\d{7,14}$/,
        "Informe o telefone com código do país, por exemplo +5511912345678.",
      )
      .optional(),
  ),
  senha: esquemaDaSenha,
  /** "Li e aceito os Termos de Uso e a Política de Privacidade" (card #79). */
  aceitouTermos: esquemaDoAceiteDoCadastro,
});

export type CadastroDeClienteFinal = z.infer<typeof esquemaDoCadastro>;

/** A confirmação é a mesma para e-mail novo e e-mail já cadastrado. */
export const esquemaDaConfirmacaoDeCadastro = z.strictObject({
  cadastrado: z.literal(true),
  mensagem: z.string(),
  verificacaoDeEmailPendente: z.literal(true),
});

export type ConfirmacaoDeCadastro = z.infer<
  typeof esquemaDaConfirmacaoDeCadastro
>;

/** Texto deliberadamente genérico, para não enumerar contas existentes. */
export const MENSAGEM_DE_CADASTRO_CONFIRMADO =
  "Seus dados foram recebidos. Enviamos instruções para confirmar seu e-mail.";

/** Resposta estável do cadastro, inclusive quando a conta já existe. */
export const CONFIRMACAO_DE_CADASTRO: ConfirmacaoDeCadastro = {
  cadastrado: true,
  mensagem: MENSAGEM_DE_CADASTRO_CONFIRMADO,
  verificacaoDeEmailPendente: true,
};

/** Texto do envio indisponível: o mesmo para conta existente e inexistente. */
export const MENSAGEM_DE_ENVIO_INDISPONIVEL =
  "O envio de e-mail está indisponível no momento. Tente novamente mais tarde.";

/**
 * Ponte do site → API (AC-120): o servidor do site chama a API em nome do
 * navegador, então a API só vê o endereço do site. O site informa o endereço
 * do visitante em `CABECALHO_DO_ENDERECO_DO_VISITANTE` e prova que é ele em
 * `CABECALHO_DA_PONTE` com o segredo compartilhado `SEGREDO_DA_PONTE`; sem a
 * prova, a API ignora o endereço informado.
 */
export const CABECALHO_DA_PONTE = "x-simpleclick-ponte";
export const CABECALHO_DO_ENDERECO_DO_VISITANTE =
  "x-simpleclick-endereco-do-cliente";
/** Tamanho mínimo do segredo da ponte; mais curto é tratado como ausente. */
export const TAMANHO_MINIMO_DO_SEGREDO_DA_PONTE = 32;

// ---------------------------------------------------------------------------
// Verificação de e-mail (AC-103, AC-104)
// ---------------------------------------------------------------------------

/** O token do link (verificação), como chegou no endereço. */
export const esquemaDoLinkRecebido = z.strictObject({
  token: esquemaDoTokenDeLink,
});

/** O que aconteceu com o link aberto. */
export const esquemaDaVerificacaoDeEmail = z.strictObject({
  situacao: z.enum(["verificado", "expirado", "invalido"]),
});

/** O pedido de um link novo, a partir do link expirado. */
export const esquemaDoReenvioDeVerificacao = z.discriminatedUnion("situacao", [
  z.strictObject({ situacao: z.literal("reenviado") }),
  z.strictObject({
    situacao: z.literal("limite_atingido"),
    disponivelEm: z.iso.datetime(),
  }),
  z.strictObject({ situacao: z.literal("invalido") }),
]);

// ---------------------------------------------------------------------------
// Sessão, login e segundo fator (AC-105 a AC-113, AC-121 a AC-124)
// ---------------------------------------------------------------------------

/**
 * A sessão aberta. `tokenDeRenovacao` só vem no corpo para o cliente nativo;
 * o navegador o recebe no cookie `sc_refresh`. `orientarPara` aparece quando
 * a entrada foi por código de recuperação (AC-123).
 */
export const esquemaDaSessaoAberta = z.strictObject({
  status: z.literal("SESSAO_CRIADA"),
  papel: esquemaDoPapelDaSessao,
  tokenDeAcesso: z.string(),
  acessoExpiraEm: z.iso.datetime(),
  renovacaoExpiraEm: z.iso.datetime(),
  tokenDeRenovacao: z.string().optional(),
  orientarPara: z.string().optional(),
});

/**
 * Cadastro de cliente: a conta nasce com o e-mail já verificado e a sessão
 * aberta — sem etapa de código nem de link. E-mail que já tem conta volta 409
 * `email_em_uso` (a pessoa entra com a senha que já tem).
 */
export const esquemaDoCadastroComSessao = esquemaDaSessaoAberta.extend({
  cadastrado: z.literal(true),
  mensagem: z.string(),
});

export type CadastroComSessao = z.infer<typeof esquemaDoCadastroComSessao>;

export const MENSAGEM_DE_CONTA_CRIADA = "Conta criada. Você já está conectado.";

/** E-mail e senha do login. */
export const esquemaDoLogin = z.strictObject({
  email: esquemaDoEmail,
  senha: esquemaDaSenha,
});

/** O resultado do login: sessão, desafio ou configuração obrigatória. */
export const esquemaDoResultadoDoLogin = z.discriminatedUnion("status", [
  esquemaDaSessaoAberta,
  z.strictObject({
    status: z.literal("DESAFIO_DE_SEGUNDO_FATOR"),
    desafioId: z.uuid(),
    canal: z.enum(["EMAIL", "TOTP"]),
  }),
  z.strictObject({
    status: z.literal("CONFIGURACAO_DO_APLICATIVO_OBRIGATORIA"),
    caminho: z.string(),
  }),
]);

/** O código do segundo fator, para o desafio aberto no login. */
export const esquemaDoCodigoDoDesafio = z.strictObject({
  desafioId: z.uuid("Desafio inválido. Comece o login de novo."),
  codigo: esquemaDoCodigoDeSeisDigitos,
});

/** O resultado do segundo fator. */
export const esquemaDoResultadoDoSegundoFator = z.discriminatedUnion("status", [
  esquemaDaSessaoAberta,
  z.strictObject({
    status: z.literal("CODIGO_INCORRETO"),
    tentativasRestantes: z.number().int().nonnegative(),
  }),
  z.strictObject({
    status: z.enum(["BLOQUEADO", "DESAFIO_EXPIRADO", "DESAFIO_INVALIDO"]),
    mensagem: z.string(),
  }),
]);

/** Código de recuperação no lugar do código de seis dígitos (AC-123). */
export const esquemaDoCodigoDeRecuperacao = z.strictObject({
  desafioId: z.uuid("Desafio inválido. Comece o login de novo."),
  codigo: z
    .string()
    .trim()
    .min(8, "Informe o código de recuperação completo.")
    .max(20, "Código de recuperação inválido."),
});

/** O resultado da entrada por código de recuperação. */
export const esquemaDoResultadoDaRecuperacao = z.discriminatedUnion("status", [
  esquemaDaSessaoAberta,
  z.strictObject({ status: z.literal("CODIGO_INVALIDO") }),
]);

/**
 * Renovar ou sair. O navegador manda o cookie e corpo nenhum; o cliente
 * nativo manda o token de renovação no corpo (AC-111).
 */
export const esquemaDoTokenDeRenovacao = z
  .strictObject({
    tokenDeRenovacao: z.string().min(20).max(200).optional(),
  })
  .optional();

/** A saída deste dispositivo. */
export const esquemaDaSaida = z.strictObject({ encerrada: z.boolean() });

/** A saída de todos os dispositivos. */
export const esquemaDaSaidaDeTodas = z.strictObject({
  encerradas: z.literal(true),
});

// ---------------------------------------------------------------------------
// Recuperação de senha e convite (AC-114, AC-115, AC-200)
// ---------------------------------------------------------------------------

/** O e-mail da tela de esqueci minha senha. */
export const esquemaDoPedidoDeRecuperacao = z.strictObject({
  email: esquemaDoEmail,
});

/** A confirmação, idêntica exista ou não a conta. */
export const esquemaDaConfirmacaoDeRecuperacao = z.strictObject({
  confirmacao: z.string(),
});

/** Nova senha a partir de um link (recuperação ou convite). */
export const esquemaDaNovaSenha = z.strictObject({
  token: esquemaDoTokenDeLink,
  senha: esquemaDaSenha,
});

/** Senha redefinida. */
export const esquemaDaSenhaRedefinida = z.strictObject({
  redefinida: z.literal(true),
});

/** Convite aceito: o dono já pode entrar. */
export const esquemaDoConviteAceito = z.strictObject({
  acessoLiberado: z.literal(true),
});

// ---------------------------------------------------------------------------
// Aplicativo autenticador e códigos de recuperação (AC-121, AC-123)
// ---------------------------------------------------------------------------

/** O segredo novo, para a pessoa cadastrar no aplicativo. */
export const esquemaDaAtivacaoPreparada = z.strictObject({
  segredo: z.string(),
  uriDoAplicativo: z.string(),
});

/** O código que o aplicativo mostrou, para confirmar a ativação. */
export const esquemaDoCodigoDoAplicativo = z.strictObject({
  codigo: esquemaDoCodigoDeSeisDigitos,
});

/** Códigos de recuperação: aparecem uma vez, para a pessoa guardar. */
export const esquemaDosCodigosDeRecuperacao = z.strictObject({
  codigosDeRecuperacao: z.array(z.string()),
});

/** Aplicativo ativado, com os códigos de recuperação. */
export const esquemaDoAplicativoAtivado = z.strictObject({
  status: z.literal("ATIVADO"),
  codigosDeRecuperacao: z.array(z.string()),
});
