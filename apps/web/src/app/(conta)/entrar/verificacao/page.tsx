"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  CodigoForm,
  type RespostaDoCodigoNaTela,
} from "../../../../features/auth/CodigoForm.tsx";

async function confirmarCodigo(
  desafioId: string,
  codigo: string,
): Promise<RespostaDoCodigoNaTela> {
  const resposta = await fetch("/v1/auth/segundo-fator", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ desafioId, codigo }),
  });
  return (await resposta.json()) as RespostaDoCodigoNaTela;
}

function ConteudoDaVerificacao() {
  const roteador = useRouter();
  const parametros = useSearchParams();
  const desafioId = parametros.get("desafio");

  useEffect(() => {
    if (desafioId === null || desafioId === "") roteador.replace("/entrar");
  }, [desafioId, roteador]);

  if (desafioId === null || desafioId === "") {
    return <p role="status">Voltando para o login…</p>;
  }

  return (
    <main>
      <h1>Confirme seu acesso</h1>
      <p>Informe o código de seis dígitos que enviamos ao seu e-mail.</p>
      <CodigoForm
        aoConfirmar={(codigo) => confirmarCodigo(desafioId, codigo)}
        aoCriarSessao={(destino) => roteador.replace(destino)}
        aoRecomecarLogin={() => roteador.replace("/entrar")}
      />
    </main>
  );
}

export default function PaginaDeVerificacao() {
  return (
    <Suspense fallback={<p role="status">Carregando confirmação…</p>}>
      <ConteudoDaVerificacao />
    </Suspense>
  );
}
