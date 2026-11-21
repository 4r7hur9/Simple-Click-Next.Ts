/**
 * Formulários de acesso que funcionam sem JavaScript (T-113): confirmar o
 * e-mail, pedir outro link, pedir a recuperação de senha e definir a senha
 * (recuperação e convite do dono).
 *
 * A tela envia um formulário comum para `/api/auth/<acao>`; aqui o servidor
 * do site chama a API e devolve um redirecionamento 303 para a mesma tela
 * com `?estado=...`. A tela, renderizada no servidor, mostra o estado. Nada
 * de token volta na resposta; o token de verificar-email só volta no endereço quando a
 * pessoa precisa tentar de novo; o de definir-senha nunca volta no endereço:
 * vai num cookie httpOnly curto em Path=/definir-senha.
 */
import { chamarIdentidade } from "./chamada-de-identidade.ts";

export const FORMULARIOS_DE_ACESSO = [
  "verificar-email",
  "verificar-email/reenviar",
  "recuperar-senha",
  "definir-senha",
] as const;

export type FormularioDeAcesso = (typeof FORMULARIOS_DE_ACESSO)[number];

/** Só ações conhecidas: caminho livre aqui viraria proxy aberto. */
export function ehFormularioDeAcesso(acao: string): acao is FormularioDeAcesso {
  return (FORMULARIOS_DE_ACESSO as readonly string[]).includes(acao);
}

/** Cookie curto que leva o token do link de definir senha entre o erro e o reenvio. */
export const COOKIE_DO_LINK_DE_SENHA = "sc_definir_senha";

/**
 * O token do link não volta no endereço (Referer, histórico, log): fica num
 * cookie httpOnly de 10 minutos, restrito à tela. `null` apaga o cookie.
 */
function cookieDoLink(requisicao: Request, token: string | null): string {
  const seguro = new URL(requisicao.url).protocol === "https:";
  return [
    `${COOKIE_DO_LINK_DE_SENHA}=${token === null ? "" : encodeURIComponent(token)}`,
    "Path=/definir-senha",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${token === null ? 0 : 600}`,
    ...(seguro ? ["Secure"] : []),
  ].join("; ");
}

/** Redireciona para uma tela do site com os parâmetros informados. */
function irPara(
  requisicao: Request,
  caminho: string,
  parametros: Record<string, string | undefined>,
  cookie?: string,
): Response {
  const destino = new URL(caminho, requisicao.url);
  for (const [nome, valor] of Object.entries(parametros)) {
    if (valor !== undefined && valor !== "")
      destino.searchParams.set(nome, valor);
  }
  const cabecalhos = new Headers({
    location: destino.toString(),
    "cache-control": "no-store",
  });
  if (cookie !== undefined) cabecalhos.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers: cabecalhos });
}

/** Campo de texto do formulário, ou cadeia vazia. */
function campo(dados: FormData, nome: string): string {
  const valor = dados.get(nome);
  return typeof valor === "string" ? valor : "";
}

/** Situação da API traduzida em estado da tela. */
function estadoDaResposta(status: number, porSucesso: string): string {
  if (status >= 200 && status < 300) return porSucesso;
  if (status === 503) return "indisponivel";
  if (status === 400) return "invalido";
  return "erro";
}

/**
 * Atende o formulário. `buscar` entra por parâmetro para a prova responder
 * sem rede.
 */
export async function responderFormularioDeAcesso(
  requisicao: Request,
  acao: FormularioDeAcesso,
  buscar: typeof fetch = fetch,
): Promise<Response> {
  let dados: FormData;
  try {
    dados = await requisicao.formData();
  } catch {
    dados = new FormData();
  }

  try {
    if (acao === "verificar-email" || acao === "verificar-email/reenviar") {
      const token = campo(dados, "token");
      const caminho =
        acao === "verificar-email" ? "/email/verificar" : "/email/reenviar";
      const resposta = await chamarIdentidade(
        caminho,
        requisicao,
        { token },
        { buscar },
      );
      const situacao = String(resposta.corpo["situacao"] ?? "");
      const estado =
        resposta.status === 200
          ? situacao === "limite_atingido"
            ? "limite"
            : situacao
          : estadoDaResposta(resposta.status, "invalido");
      return irPara(requisicao, "/verificar-email", {
        estado,
        // O link expirado continua servindo para pedir outro.
        token: estado === "expirado" || estado === "limite" ? token : undefined,
      });
    }

    if (acao === "recuperar-senha") {
      const resposta = await chamarIdentidade(
        "/senha/esqueci",
        requisicao,
        { email: campo(dados, "email") },
        { buscar },
      );
      return irPara(requisicao, "/recuperar-senha", {
        estado: estadoDaResposta(resposta.status, "enviado"),
      });
    }

    // definir-senha: recuperação ou convite do dono.
    const token = campo(dados, "token");
    const convite = campo(dados, "convite") === "true" ? "true" : undefined;
    const senha = campo(dados, "senha");
    if (senha !== campo(dados, "confirmacao")) {
      return irPara(
        requisicao,
        "/definir-senha",
        { estado: "repeticao_diferente", convite },
        cookieDoLink(requisicao, token),
      );
    }
    const resposta = await chamarIdentidade(
      convite === "true" ? "/convite/aceitar" : "/senha/redefinir",
      requisicao,
      { token, senha },
      { buscar },
    );
    if (resposta.status === 422) {
      return irPara(
        requisicao,
        "/definir-senha",
        { estado: "senha_fraca", convite },
        cookieDoLink(requisicao, token),
      );
    }
    return irPara(
      requisicao,
      "/definir-senha",
      {
        estado:
          resposta.status === 410
            ? "link_invalido"
            : estadoDaResposta(resposta.status, "concluido"),
        convite,
      },
      cookieDoLink(requisicao, null),
    );
  } catch {
    // A API não respondeu: a tela diz que o serviço está fora, sem detalhe.
    const telas: Record<FormularioDeAcesso, string> = {
      "verificar-email": "/verificar-email",
      "verificar-email/reenviar": "/verificar-email",
      "recuperar-senha": "/recuperar-senha",
      "definir-senha": "/definir-senha",
    };
    return irPara(requisicao, telas[acao], { estado: "indisponivel" });
  }
}
