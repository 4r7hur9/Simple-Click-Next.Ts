"use client";

import { useRouter } from "next/navigation";

import {
  LoginForm,
  type RespostaDoLoginNaTela,
} from "../../../features/auth/LoginForm.tsx";
import { CascaDaConta } from "../../../features/auth/CascaDaConta.tsx";

async function enviarLogin(entrada: {
  readonly email: string;
  readonly senha: string;
}): Promise<RespostaDoLoginNaTela> {
  const resposta = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(entrada),
  });
  const corpo = (await resposta.json()) as {
    readonly autenticado?: boolean;
  };
  if (resposta.ok && corpo.autenticado === true) {
    return {
      status: "SESSAO_CRIADA",
      redirecionarPara: "/painel",
    };
  }
  return { status: "CREDENCIAIS_INVALIDAS" };
}

export default function PaginaDeEntrar() {
  const roteador = useRouter();

  return (
    <CascaDaConta
      identificadorDoTitulo="entrar-titulo"
      titulo="Bom ter você de volta."
      descricao="Use seu e-mail e sua senha para acessar sua conta."
    >
      <LoginForm
        aoEntrar={enviarLogin}
        aoPedirSegundoFator={(desafioId) =>
          roteador.push(
            `/entrar/verificacao?desafio=${encodeURIComponent(desafioId)}`,
          )
        }
        aoCriarSessao={(destino) => roteador.replace(destino)}
      />
      <p className="sc-conta__rodape-formulario">
        Primeiro acesso? Use o convite recebido para configurar sua conta.
      </p>
    </CascaDaConta>
  );
}
