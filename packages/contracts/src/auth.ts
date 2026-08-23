/**
 * Formas públicas da jornada de cadastro.
 *
 * Este contrato não contém senha em nenhuma resposta: senha é credencial de
 * entrada, nunca dado que a API devolve para a tela.
 */

/** Dados que a pessoa informa ao criar uma conta de cliente final. */
export interface CadastroDeClienteFinal {
  readonly nome: string;
  readonly email: string;
  readonly telefone: string;
  readonly senha: string;
}

/** A confirmação é a mesma para e-mail novo e e-mail já cadastrado. */
export interface ConfirmacaoDeCadastro {
  readonly cadastrado: true;
  readonly mensagem: string;
  readonly verificacaoDeEmailPendente: true;
}

/** Texto deliberadamente genérico, para não enumerar contas existentes. */
export const MENSAGEM_DE_CADASTRO_CONFIRMADO =
  "Seus dados foram recebidos. Enviamos instruções para confirmar seu e-mail.";

/** Resposta estável do cadastro, inclusive quando a conta já existe. */
export const CONFIRMACAO_DE_CADASTRO: ConfirmacaoDeCadastro = {
  cadastrado: true,
  mensagem: MENSAGEM_DE_CADASTRO_CONFIRMADO,
  verificacaoDeEmailPendente: true,
};
