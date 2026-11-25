"use client";

/**
 * A etapa do código na entrada da administração (card #11).
 *
 * Os mesmos formulários e a mesma ponte da verificação comum
 * (`/api/auth/segundo-fator` e `/api/auth/segundo-fator/recuperacao`). Depois
 * do código certo, volta para `/admin/entrar`, e o servidor decide pelo grant
 * ao vivo. A única exceção é a orientação da API depois de um código de
 * recuperação (reconfigurar o aplicativo), e só esse caminho exato.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

import { comDestino } from "../../lib/destino-seguro.ts";
import { CodigoDeRecuperacaoForm } from "./CodigoDeRecuperacaoForm.tsx";
import { CodigoForm } from "./CodigoForm.tsx";
import {
  respostaDaRecuperacao,
  respostaDoCodigo,
} from "./respostas-de-acesso.ts";

/** A única orientação da API que a entrada da administração segue. */
const RECONFIGURAR_O_APLICATIVO = "/conta/seguranca/aplicativo";

/** POST na ponte e o corpo lido, sem confiar na forma. */
async function enviarParaAPonte(caminho: string, corpo: unknown) {
  const resposta = await fetch(`/api/auth/${caminho}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(corpo),
  });
  let lido: Record<string, unknown> = {};
  try {
    const bruto: unknown = await resposta.json();
    if (bruto !== null && typeof bruto === "object") {
      lido = bruto as Record<string, unknown>;
    }
  } catch {
    // Corpo que não é JSON: a tradução cai no caso de erro.
  }
  return { status: resposta.status, corpo: lido };
}

export interface VerificacaoDaAdministracaoProps {
  readonly desafioId: string;
  readonly canal: "EMAIL" | "TOTP";
  /** O `proximo` já conferido pelo servidor (só caminho do `/admin`). */
  readonly destino?: string | undefined;
}

export function VerificacaoDaAdministracao({
  desafioId,
  canal,
  destino,
}: VerificacaoDaAdministracaoProps) {
  const roteador = useRouter();
  const [porRecuperacao, setPorRecuperacao] = useState(false);
  const paraAEntrada = comDestino("/admin/entrar", destino);

  function voltarParaAEntrada() {
    roteador.replace(paraAEntrada);
    roteador.refresh();
  }

  return (
    <>
      <p className="sc-entrada-admin__instrucao">
        {porRecuperacao
          ? "Use um dos códigos de recuperação que você guardou."
          : canal === "TOTP"
            ? "Informe o código de seis dígitos do seu aplicativo autenticador."
            : "Informe o código de seis dígitos que enviamos ao seu e-mail."}
      </p>
      {porRecuperacao ? (
        <CodigoDeRecuperacaoForm
          aoConfirmar={async (codigo) => {
            const { status, corpo } = await enviarParaAPonte(
              "segundo-fator/recuperacao",
              { desafioId, codigo },
            );
            return respostaDaRecuperacao(status, corpo);
          }}
          aoCriarSessao={(resposta) => {
            if (resposta.orientarPara === RECONFIGURAR_O_APLICATIVO) {
              roteador.replace(RECONFIGURAR_O_APLICATIVO);
              return;
            }
            voltarParaAEntrada();
          }}
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
          aoCriarSessao={voltarParaAEntrada}
          aoRecomecarLogin={() => roteador.replace(paraAEntrada)}
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
    </>
  );
}
