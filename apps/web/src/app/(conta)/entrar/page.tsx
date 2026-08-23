"use client";

import { useRouter } from "next/navigation";

import {
  LoginForm,
  type RespostaDoLoginNaTela,
} from "../../../features/auth/LoginForm.tsx";

async function enviarLogin(entrada: {
  readonly email: string;
  readonly senha: string;
}): Promise<RespostaDoLoginNaTela> {
  const resposta = await fetch("/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(entrada),
  });
  return (await resposta.json()) as RespostaDoLoginNaTela;
}

export default function PaginaDeEntrar() {
  const roteador = useRouter();

  return (
    <main>
      <h1>Entrar</h1>
      <p>Use seu e-mail e sua senha para acessar sua conta.</p>
      <LoginForm
        aoEntrar={enviarLogin}
        aoPedirSegundoFator={(desafioId) =>
          roteador.push(
            `/entrar/verificacao?desafio=${encodeURIComponent(desafioId)}`,
          )
        }
        aoCriarSessao={(destino) => roteador.replace(destino)}
      />
    </main>
  );
}
