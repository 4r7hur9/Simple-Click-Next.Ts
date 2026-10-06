"use client";

/**
 * Tela de login (AC-105, AC-108, AC-119, AC-122, T-113).
 *
 * Fala com a API pela ponte do site (`/api/auth/login`): os tokens ficam em
 * cookie HttpOnly gravado pelo servidor do site, e este código só recebe o
 * próximo passo — segundo fator ou a área da pessoa.
 */
import { useRouter } from "next/navigation";

import {
  LoginForm,
  type RespostaDoLoginNaTela,
} from "../../../features/auth/LoginForm.tsx";
import { CascaDaConta } from "../../../features/auth/CascaDaConta.tsx";
import { respostaDoLogin } from "../../../features/auth/respostas-de-acesso.ts";

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
  const corpo = (await resposta.json()) as Record<string, unknown>;
  return respostaDoLogin(resposta.status, corpo);
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
        aoPedirSegundoFator={(desafioId, canal) =>
          roteador.push(
            `/entrar/verificacao?desafio=${encodeURIComponent(desafioId)}&canal=${canal}`,
          )
        }
        aoCriarSessao={(destino) => roteador.replace(destino)}
      />
      <p className="sc-conta__rodape-formulario">
        Ainda não tem conta? <a href="/cadastrar">Criar conta</a>. Dono de loja:
        use o convite recebido por e-mail para o primeiro acesso.
      </p>
    </CascaDaConta>
  );
}
