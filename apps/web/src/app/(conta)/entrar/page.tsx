"use client";

/**
 * Tela de entrar (AC-105, AC-108, AC-119, AC-122, T-113). Serve a todo
 * mundo: cliente, dono, equipe e administração.
 *
 * Fala com a API pela ponte do site (`/api/auth/login`): os tokens ficam em
 * cookie HttpOnly gravado pelo servidor do site, e este código só recebe o
 * próximo passo — segundo fator ou a área da pessoa. Com `?proximo=` (já
 * conferido contra endereço de fora), a pessoa volta para onde estava.
 */
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AoContinuarVoceConcorda } from "../../../features/legal/RodapeLegal.tsx";
import { LoginForm } from "../../../features/auth/LoginForm.tsx";
import { CascaDaConta } from "../../../features/auth/CascaDaConta.tsx";
import { enviarLogin } from "../../../features/auth/acesso-na-ponte.ts";
import {
  comDestino,
  destinoDosParametros,
} from "../../../features/auth/destino-seguro.ts";

function ConteudoDeEntrar() {
  const roteador = useRouter();
  const parametros = useSearchParams();
  const destino =
    parametros === null ? undefined : destinoDosParametros(parametros);

  return (
    <CascaDaConta
      identificadorDoTitulo="entrar-titulo"
      titulo="Entrar"
      descricao="Use o e-mail e a senha da sua conta SimpleClick."
    >
      <LoginForm
        aoEntrar={enviarLogin}
        aoPedirSegundoFator={(desafioId, canal) =>
          roteador.push(
            comDestino(
              `/entrar/verificacao?desafio=${encodeURIComponent(desafioId)}&canal=${canal}`,
              destino,
            ),
          )
        }
        aoCriarSessao={(paraOPapel) => roteador.replace(destino ?? paraOPapel)}
      />
      <p className="sc-conta__rodape-formulario">
        Ainda não tem conta?{" "}
        <a href={comDestino("/cadastrar", destino)}>Criar conta</a>
      </p>
      <AoContinuarVoceConcorda />
      <p className="sc-conta__vender">
        <a href="/vender">Quero vender com o SimpleClick</a>
      </p>
    </CascaDaConta>
  );
}

export default function PaginaDeEntrar() {
  return (
    <Suspense fallback={null}>
      <ConteudoDeEntrar />
    </Suspense>
  );
}
