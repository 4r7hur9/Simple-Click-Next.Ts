/**
 * As mensagens de e-mail da identidade (T-112): verificação, aviso de cadastro
 * repetido, código do login, recuperação de senha e os avisos de segurança.
 *
 * Funções puras: mesma entrada, mesmo texto. Quem entrega é a porta
 * `SaidaDeEmail`, que a borda (`app.ts`) monta conforme o ambiente. O assunto
 * nunca carrega dado da pessoa, porque é ele que o adaptador de registro
 * anota fora de produção (P-009).
 */

/** Mensagem pronta para entrega — a mesma forma de `jobs/email.job.ts`. */
export interface MensagemDeAcesso {
  readonly destinatario: string;
  readonly assunto: string;
  readonly corpo: string;
}

/**
 * Porta de saída do e-mail como a identidade a enxerga.
 *
 * `disponivel` é falso quando não há provedor (produção sem a decisão do
 * dono, dívida 35): a rota responde "envio indisponível" ANTES de fazer
 * qualquer coisa, com o mesmo texto para conta existente e inexistente
 * (AC-133). `enviar` lança quando a entrega não aconteceu.
 */
export interface SaidaDeEmail {
  readonly disponivel: boolean;
  enviar(mensagem: MensagemDeAcesso): Promise<void>;
}

/** Sem provedor: não finge que enviou. É o padrão seguro do módulo. */
export const SAIDA_DE_EMAIL_INDISPONIVEL: SaidaDeEmail = {
  disponivel: false,
  enviar: () => Promise.reject(new ErroDeEnvioIndisponivel()),
};

/** O e-mail não pôde sair. A rota traduz em 503 com texto fixo. */
export class ErroDeEnvioIndisponivel extends Error {
  constructor() {
    super("o envio de e-mail está indisponível");
    this.name = "ErroDeEnvioIndisponivel";
  }
}

/** Endereço do site sem barra no fim, para montar os links. */
function base(enderecoDoSite: string): string {
  return enderecoDoSite.replace(/\/+$/, "");
}

/** Link da tela de definir senha a partir da recuperação. */
export function linkDeRecuperacao(enderecoDoSite: string, token: string) {
  return `${base(enderecoDoSite)}/definir-senha?token=${encodeURIComponent(token)}`;
}

/** Saudação com o nome, quando a conta tem um. */
function ola(nome: string): string {
  return nome.trim() === "" ? "Olá." : `Olá, ${nome.trim()}.`;
}

export const ASSUNTOS_DE_ACESSO = {
  verificacao: "Confirme seu e-mail no SimpleClick",
  cadastroRepetido: "Tentativa de cadastro com o seu e-mail",
  codigoDoLogin: "Seu código de acesso ao SimpleClick",
  recuperacao: "Redefina sua senha do SimpleClick",
  reusoDeSessao: "Encerramos uma sessão suspeita na sua conta",
  codigoDeRecuperacaoUsado: "Um código de recuperação foi usado",
  contaBloqueada: "Bloqueamos tentativas de entrar na sua conta",
} as const;

export function emailDeVerificacao(dados: {
  readonly para: string;
  readonly nome: string;
  readonly link: string;
}): MensagemDeAcesso {
  return {
    destinatario: dados.para,
    assunto: ASSUNTOS_DE_ACESSO.verificacao,
    corpo: [
      ola(dados.nome),
      "",
      "Confirme seu endereço de e-mail para terminar o cadastro:",
      dados.link,
      "",
      "O link vale por 24 horas. Se não foi você quem se cadastrou, ignore esta mensagem.",
    ].join("\n"),
  };
}

/** AC-101: quem já tem conta é avisado; quem tentou não fica sabendo. */
export function emailDeCadastroRepetido(dados: {
  readonly para: string;
  readonly nome: string;
}): MensagemDeAcesso {
  return {
    destinatario: dados.para,
    assunto: ASSUNTOS_DE_ACESSO.cadastroRepetido,
    corpo: [
      ola(dados.nome),
      "",
      "Alguém tentou criar uma conta no SimpleClick com este e-mail, que já tem conta.",
      'Se foi você, entre com a sua senha ou use "Esqueci minha senha".',
      "Se não foi você, nada muda: a sua conta continua protegida.",
    ].join("\n"),
  };
}

export function emailDoCodigoDoLogin(dados: {
  readonly para: string;
  readonly nome: string;
  readonly codigo: string;
}): MensagemDeAcesso {
  return {
    destinatario: dados.para,
    assunto: ASSUNTOS_DE_ACESSO.codigoDoLogin,
    corpo: [
      ola(dados.nome),
      "",
      `Seu código de acesso é ${dados.codigo}.`,
      "Ele vale por 10 minutos e só pode ser usado uma vez.",
      "Se você não está tentando entrar, troque sua senha.",
    ].join("\n"),
  };
}

export function emailDeRecuperacao(dados: {
  readonly para: string;
  readonly link: string;
}): MensagemDeAcesso {
  return {
    destinatario: dados.para,
    assunto: ASSUNTOS_DE_ACESSO.recuperacao,
    corpo: [
      "Olá.",
      "",
      "Recebemos um pedido para redefinir a senha da sua conta:",
      dados.link,
      "",
      "O link vale por 1 hora e só pode ser usado uma vez. Se não foi você, ignore esta mensagem.",
    ].join("\n"),
  };
}

/** AC-110: o token de renovação antigo apareceu de novo. */
export function emailDeReusoDeSessao(para: string): MensagemDeAcesso {
  return {
    destinatario: para,
    assunto: ASSUNTOS_DE_ACESSO.reusoDeSessao,
    corpo: [
      "Olá.",
      "",
      "Um acesso antigo da sua conta foi usado de novo, o que pode indicar uma cópia indevida.",
      "Por segurança, encerramos as sessões daquele dispositivo. Entre de novo e, se não reconhece o acesso, troque sua senha.",
    ].join("\n"),
  };
}

/** AC-123: código de recuperação gasto. */
export function emailDeCodigoDeRecuperacaoUsado(
  para: string,
): MensagemDeAcesso {
  return {
    destinatario: para,
    assunto: ASSUNTOS_DE_ACESSO.codigoDeRecuperacaoUsado,
    corpo: [
      "Olá.",
      "",
      "Alguém entrou na sua conta usando um código de recuperação. Esse código não vale mais.",
      "Se foi você, configure o aplicativo autenticador no aparelho novo. Se não foi, troque sua senha agora.",
    ].join("\n"),
  };
}

/** AC-119: a conta foi bloqueada por excesso de tentativas. */
export function emailDeContaBloqueada(dados: {
  readonly para: string;
  readonly esperaMs: number;
}): MensagemDeAcesso {
  const minutos = Math.max(1, Math.ceil(dados.esperaMs / 60_000));
  return {
    destinatario: dados.para,
    assunto: ASSUNTOS_DE_ACESSO.contaBloqueada,
    corpo: [
      "Olá.",
      "",
      `Houve muitas tentativas de entrar na sua conta com senha errada. Bloqueamos novas tentativas por ${minutos} minuto(s).`,
      "Se não foi você, recomendamos trocar sua senha.",
    ].join("\n"),
  };
}
