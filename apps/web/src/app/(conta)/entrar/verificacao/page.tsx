"use client";

/**
 * Segundo fator (AC-105 a AC-107, AC-121 a AC-124, T-113): o código do
 * e-mail ou do aplicativo, e, para quem perdeu o celular, o código de
 * recuperação. Fala com a API pela ponte do site.
 */
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { CodigoDeRecuperacaoForm } from "../../../../features/auth/CodigoDeRecuperacaoForm.tsx";
import { CodigoForm } from "../../../../features/auth/CodigoForm.tsx";
import { CascaDaConta } from "../../../../features/auth/CascaDaConta.tsx";
import {
  respostaDaRecuperacao,
  respostaDoCodigo,
} from "../../../../features/auth/respostas-de-acesso.ts";

/** POST na ponte e o corpo lido, sem confiar na forma. */
async function enviarParaAPonte(caminho: string, corpo: unknown) {
  const resposta = await fetch(`/api/auth/${caminho}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(corpo),
  });
  const lido = (await resposta.json()) as Record<string, unknown>;
  return { status: resposta.status, corpo: lido };
}

function ConteudoDaVerificacao() {
  const roteador = useRouter();
  const parametros = useSearchParams();
  const desafioId = parametros.get("desafio");
  const canal = parametros.get("canal") === "TOTP" ? "TOTP" : "EMAIL";
  const [porRecuperacao, setPorRecuperacao] = useState(false);

  useEffect(() => {
    if (desafioId === null || desafioId === "") roteador.replace("/entrar");
  }, [desafioId, roteador]);

  if (desafioId === null || desafioId === "") {
    return <p role="status">Voltando para o login…</p>;
  }

  return (
    <CascaDaConta
      identificadorDoTitulo="verificacao-titulo"
      titulo="Confirme seu acesso."
      descricao={
        porRecuperacao
          ? "Use um dos códigos de recuperação que você guardou."
          : canal === "TOTP"
            ? "Informe o código de seis dígitos do seu aplicativo autenticador."
            : "Informe o código de seis dígitos que enviamos ao seu e-mail."
      }
      etiqueta="Última etapa"
    >
      {porRecuperacao ? (
        <CodigoDeRecuperacaoForm
          aoConfirmar={async (codigo) => {
            const { status, corpo } = await enviarParaAPonte(
              "segundo-fator/recuperacao",
              { desafioId, codigo },
            );
            return respostaDaRecuperacao(status, corpo);
          }}
          aoCriarSessao={(destino) => roteador.replace(destino)}
        />
      ) : (
        <CodigoForm
          canal={canal}
          aoConfirmar={async (codigo) => {
            const { status, corpo } = await enviarParaAPonte("segundo-fator", {
              desafioId,
              codigo,
            });
            return respostaDoCodigo(status, corpo);
          }}
          aoCriarSessao={(destino) => roteador.replace(destino)}
          aoRecomecarLogin={() => roteador.replace("/entrar")}
        />
      )}
      {canal === "TOTP" ? (
        <p className="sc-conta__rodape-formulario">
          <button
            type="button"
            className="sc-conta__alternar"
            onClick={() => setPorRecuperacao((atual) => !atual)}
          >
            {porRecuperacao
              ? "Voltar ao código do aplicativo"
              : "Perdi o celular: usar um código de recuperação"}
          </button>
        </p>
      ) : null}
    </CascaDaConta>
  );
}

export default function PaginaDeVerificacao() {
  return (
    <Suspense fallback={<p role="status">Carregando confirmação…</p>}>
      <ConteudoDaVerificacao />
    </Suspense>
  );
}
