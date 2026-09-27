/**
 * A mensagem do convite do dono (AC-200).
 *
 * Função pura: mesma entrada, mesmo texto — conferida por comparação, sem fila
 * e sem rede. Quem entrega é a porta de saída de e-mail, montada em `app.ts`.
 *
 * O link leva à tela de definir a primeira senha (`/definir-senha`), que é da
 * feature de identidade: o token vai em claro SÓ aqui, no e-mail da pessoa. O
 * banco guarda o resumo dele.
 */

export interface ConviteParaEnviar {
  readonly para: string;
  readonly nome: string;
  readonly nomeDaLoja: string;
  readonly token: string;
  readonly expiraEm: Date;
}

export interface MensagemDoConvite {
  readonly destinatario: string;
  readonly assunto: string;
  readonly corpo: string;
}

export const ASSUNTO_DO_CONVITE = "Sua loja no SimpleClick está pronta";

/** Data do prazo por extenso curto, no fuso de Brasília. */
function dataDoPrazo(data: Date): string {
  return data.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function linkDoConvite(enderecoDoSite: string, token: string): string {
  const base = enderecoDoSite.replace(/\/+$/, "");
  return `${base}/definir-senha?convite=true&token=${encodeURIComponent(token)}`;
}

export function montarEmailDoConvite(
  convite: ConviteParaEnviar,
  enderecoDoSite: string,
): MensagemDoConvite {
  return {
    destinatario: convite.para,
    assunto: ASSUNTO_DO_CONVITE,
    corpo: [
      `Olá, ${convite.nome}.`,
      "",
      `A loja ${convite.nomeDaLoja} foi cadastrada no SimpleClick e você é o responsável por ela.`,
      "Defina a sua senha para entrar no painel:",
      linkDoConvite(enderecoDoSite, convite.token),
      "",
      `O link vale até ${dataDoPrazo(convite.expiraEm)} e só pode ser usado uma vez.`,
      "Se você não esperava este convite, ignore esta mensagem.",
    ].join("\n"),
  };
}
