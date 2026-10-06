/**
 * As rotas de `/v1/auth` no contrato publicado (T-112).
 *
 * Cada rota diz o que recebe, o que devolve e como pode falhar. O documento
 * OpenAPI e o aplicativo nativo leem daqui; a API valida a entrada com os
 * mesmos esquemas.
 */
import {
  esquemaDaAtivacaoPreparada,
  esquemaDaConfirmacaoDeCadastro,
  esquemaDaConfirmacaoDeRecuperacao,
  esquemaDaNovaSenha,
  esquemaDaSaida,
  esquemaDaSaidaDeTodas,
  esquemaDaSenhaRedefinida,
  esquemaDaSessaoAberta,
  esquemaDaVerificacaoDeEmail,
  esquemaDoAplicativoAtivado,
  esquemaDoCadastro,
  esquemaDoCodigoDeRecuperacao,
  esquemaDoCodigoDoAplicativo,
  esquemaDoCodigoDoDesafio,
  esquemaDoConviteAceito,
  esquemaDoLinkRecebido,
  esquemaDoLogin,
  esquemaDoPedidoDeRecuperacao,
  esquemaDoReenvioDeVerificacao,
  esquemaDoResultadoDaRecuperacao,
  esquemaDoResultadoDoLogin,
  esquemaDoResultadoDoSegundoFator,
  esquemaDosCodigosDeRecuperacao,
  esquemaDoTokenDeRenovacao,
} from "./auth.ts";
import { definirRota } from "./rota.ts";

const etiqueta = "identidade";

export const rotaDeCadastro = definirRota({
  metodo: "post",
  caminho: "/v1/auth/cadastro",
  etiqueta,
  resumo: "Cria a conta de cliente final",
  descricao:
    "Mesma confirmação para e-mail novo e já cadastrado (AC-101). Senha fraca volta 422 com o motivo; sem provedor de e-mail volta 503.",
  corpo: esquemaDoCadastro,
  resposta: esquemaDaConfirmacaoDeCadastro,
  status: 201,
  errosPossiveis: [400, 422, 503],
});

export const rotaDeVerificarEmail = definirRota({
  metodo: "post",
  caminho: "/v1/auth/email/verificar",
  etiqueta,
  resumo: "Consome o link de verificação de e-mail",
  corpo: esquemaDoLinkRecebido,
  resposta: esquemaDaVerificacaoDeEmail,
  errosPossiveis: [400],
});

export const rotaDeReenviarVerificacao = definirRota({
  metodo: "post",
  caminho: "/v1/auth/email/reenviar",
  etiqueta,
  resumo: "Envia um link novo a partir do link expirado",
  corpo: esquemaDoLinkRecebido,
  resposta: esquemaDoReenvioDeVerificacao,
  errosPossiveis: [400, 503],
});

export const rotaDeLogin = definirRota({
  metodo: "post",
  caminho: "/v1/auth/login",
  etiqueta,
  resumo: "Confere e-mail e senha",
  descricao:
    "Devolve o desafio do segundo fator, a sessão (cliente sem segundo fator) ou a exigência de configurar o aplicativo (administração). O cliente nativo manda o cabeçalho x-simpleclick-client: nativo e recebe o token de renovação no corpo.",
  corpo: esquemaDoLogin,
  resposta: esquemaDoResultadoDoLogin,
  errosPossiveis: [400, 401, 403, 429, 503],
});

export const rotaDoSegundoFator = definirRota({
  metodo: "post",
  caminho: "/v1/auth/segundo-fator",
  etiqueta,
  resumo: "Confirma o código de seis dígitos e abre a sessão",
  corpo: esquemaDoCodigoDoDesafio,
  resposta: esquemaDoResultadoDoSegundoFator,
  errosPossiveis: [400, 429],
});

export const rotaDoCodigoDeRecuperacao = definirRota({
  metodo: "post",
  caminho: "/v1/auth/segundo-fator/recuperacao",
  etiqueta,
  resumo: "Entra com um código de recuperação no lugar do aplicativo",
  corpo: esquemaDoCodigoDeRecuperacao,
  resposta: esquemaDoResultadoDaRecuperacao,
  errosPossiveis: [400, 409, 429],
});

export const rotaDeRenovar = definirRota({
  metodo: "post",
  caminho: "/v1/auth/renovar",
  etiqueta,
  resumo: "Troca o token de renovação por um par novo",
  descricao:
    "Token já usado revoga a família inteira de sessões daquele dispositivo e avisa por e-mail (AC-110).",
  corpo: esquemaDoTokenDeRenovacao,
  resposta: esquemaDaSessaoAberta,
  errosPossiveis: [400, 401],
});

export const rotaDeSair = definirRota({
  metodo: "post",
  caminho: "/v1/auth/sessoes/atual/encerrar",
  etiqueta,
  resumo: "Encerra a sessão deste dispositivo",
  corpo: esquemaDoTokenDeRenovacao,
  resposta: esquemaDaSaida,
  errosPossiveis: [400],
});

export const rotaDeSairDeTodas = definirRota({
  metodo: "post",
  caminho: "/v1/auth/sessoes/encerrar-todas",
  etiqueta,
  resumo: "Encerra todas as sessões da conta",
  resposta: esquemaDaSaidaDeTodas,
  errosPossiveis: [401],
});

export const rotaDeEsqueciASenha = definirRota({
  metodo: "post",
  caminho: "/v1/auth/senha/esqueci",
  etiqueta,
  resumo: "Pede o link de recuperação de senha",
  descricao: "Mesma confirmação exista ou não a conta (AC-114).",
  corpo: esquemaDoPedidoDeRecuperacao,
  resposta: esquemaDaConfirmacaoDeRecuperacao,
  status: 202,
  errosPossiveis: [400, 503],
});

export const rotaDeRedefinirSenha = definirRota({
  metodo: "post",
  caminho: "/v1/auth/senha/redefinir",
  etiqueta,
  resumo: "Define a senha nova pelo link de recuperação",
  corpo: esquemaDaNovaSenha,
  resposta: esquemaDaSenhaRedefinida,
  errosPossiveis: [400, 410, 422],
});

export const rotaDeAceitarConvite = definirRota({
  metodo: "post",
  caminho: "/v1/auth/convite/aceitar",
  etiqueta,
  resumo: "Define a primeira senha do dono pelo convite",
  corpo: esquemaDaNovaSenha,
  resposta: esquemaDoConviteAceito,
  errosPossiveis: [400, 410, 422],
});

export const rotaDePrepararAplicativo = definirRota({
  metodo: "post",
  caminho: "/v1/auth/aplicativo/preparar",
  etiqueta,
  resumo: "Gera o segredo do aplicativo autenticador",
  resposta: esquemaDaAtivacaoPreparada,
  errosPossiveis: [401],
});

export const rotaDeConfirmarAplicativo = definirRota({
  metodo: "post",
  caminho: "/v1/auth/aplicativo/confirmar",
  etiqueta,
  resumo: "Ativa o aplicativo com o código que ele mostra",
  corpo: esquemaDoCodigoDoAplicativo,
  resposta: esquemaDoAplicativoAtivado,
  errosPossiveis: [400, 401, 422],
});

export const rotaDeNovosCodigosDeRecuperacao = definirRota({
  metodo: "post",
  caminho: "/v1/auth/aplicativo/codigos-de-recuperacao",
  etiqueta,
  resumo: "Gera um jogo novo de códigos de recuperação",
  resposta: esquemaDosCodigosDeRecuperacao,
  errosPossiveis: [401, 409],
});

/** Todas as rotas da identidade, na ordem do catálogo. */
export const ROTAS_DA_IDENTIDADE = [
  rotaDeCadastro,
  rotaDeVerificarEmail,
  rotaDeReenviarVerificacao,
  rotaDeLogin,
  rotaDoSegundoFator,
  rotaDoCodigoDeRecuperacao,
  rotaDeRenovar,
  rotaDeSair,
  rotaDeSairDeTodas,
  rotaDeEsqueciASenha,
  rotaDeRedefinirSenha,
  rotaDeAceitarConvite,
  rotaDePrepararAplicativo,
  rotaDeConfirmarAplicativo,
  rotaDeNovosCodigosDeRecuperacao,
] as const;
