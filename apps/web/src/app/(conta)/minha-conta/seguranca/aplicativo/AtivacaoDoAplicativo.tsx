"use client";

/**
 * Liga a tela de ativação do aplicativo à ponte do site (T-113): gerar a
 * chave e confirmar o código passam por `/api/auth/aplicativo/...`, que usa
 * a sessão do cookie. Nenhum token chega a este código.
 */
import TotpForm, {
  type ConfirmacaoDoAplicativo,
  type PreparoDoAplicativo,
} from "../../../../../features/auth/TotpForm.tsx";

async function pedir(caminho: string, corpo?: unknown) {
  const resposta = await fetch(`/api/auth/aplicativo/${caminho}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const lido = (await resposta.json()) as Record<string, unknown>;
  return { status: resposta.status, corpo: lido };
}

async function preparar(): Promise<PreparoDoAplicativo> {
  const { status, corpo } = await pedir("preparar");
  if (status === 200) {
    return {
      segredo: String(corpo["segredo"]),
      uriDoAplicativo: String(corpo["uriDoAplicativo"]),
    };
  }
  return {
    erro:
      status === 401
        ? "Sua sessão terminou. Entre de novo para ativar o aplicativo."
        : "Não foi possível gerar a chave agora.",
  };
}

async function confirmar(codigo: string): Promise<ConfirmacaoDoAplicativo> {
  const { status, corpo } = await pedir("confirmar", { codigo });
  if (status === 200) {
    return {
      status: "ATIVADO",
      codigosDeRecuperacao: (corpo["codigosDeRecuperacao"] as string[]) ?? [],
    };
  }
  if (status === 422) return { status: "CODIGO_INVALIDO" };
  return {
    status: "ERRO",
    mensagem:
      status === 401
        ? "Sua sessão terminou. Entre de novo para ativar o aplicativo."
        : "Não foi possível ativar agora. Tente novamente.",
  };
}

export function AtivacaoDoAplicativo() {
  return <TotpForm aoPreparar={preparar} aoConfirmar={confirmar} />;
}
