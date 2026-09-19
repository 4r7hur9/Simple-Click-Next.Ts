"use client";

import { useState, type FormEvent } from "react";
import { Aviso, Botao, Campo } from "@simpleclick/ui";

export type RespostaDoCodigoNaTela =
  | { readonly status: "SESSAO_CRIADA"; readonly redirecionarPara: string }
  | {
      readonly status: "CODIGO_INCORRETO";
      readonly tentativasRestantes: number;
    }
  | { readonly status: "BLOQUEADO" | "DESAFIO_EXPIRADO" | "DESAFIO_INVALIDO" };

export interface CodigoFormProps {
  readonly aoConfirmar: (codigo: string) => Promise<RespostaDoCodigoNaTela>;
  readonly aoCriarSessao: (redirecionarPara: string) => void;
  readonly aoRecomecarLogin: () => void;
}

export function CodigoForm({
  aoConfirmar,
  aoCriarSessao,
  aoRecomecarLogin,
}: CodigoFormProps) {
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const codigoLimpo = codigo.replace(/\D/g, "");
    if (codigoLimpo.length !== 6) {
      setErro("Informe os seis dígitos do código.");
      return;
    }

    setEnviando(true);
    setErro(undefined);
    try {
      const resposta = await aoConfirmar(codigoLimpo);
      if (resposta.status === "SESSAO_CRIADA") {
        aoCriarSessao(resposta.redirecionarPara);
        return;
      }
      if (resposta.status === "CODIGO_INCORRETO") {
        setErro(
          `Código incorreto. ${resposta.tentativasRestantes} tentativa${resposta.tentativasRestantes === 1 ? "" : "s"} restante${resposta.tentativasRestantes === 1 ? "" : "s"}.`,
        );
        return;
      }
      setErro(
        resposta.status === "BLOQUEADO"
          ? "A tentativa foi bloqueada. Comece o login de novo."
          : "Este código não está mais válido. Comece o login de novo.",
      );
    } catch {
      setErro("Não foi possível confirmar o código agora. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={(evento) => void enviar(evento)} noValidate>
      <Campo
        id="segundo-fator-codigo"
        name="codigo"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        rotulo="Código de seis dígitos"
        dica="Enviamos o código para seu e-mail."
        obrigatorio
        value={codigo}
        onChange={(evento) => setCodigo(evento.target.value.replace(/\D/g, ""))}
        desabilitado={enviando}
      />
      {erro ? (
        <Aviso
          tom="erro"
          acao={
            erro.includes("Comece o login") ? (
              <button type="button" onClick={aoRecomecarLogin}>
                Voltar ao login
              </button>
            ) : undefined
          }
        >
          {erro}
        </Aviso>
      ) : null}
      <Botao type="submit" carregando={enviando} rotuloDeEspera="Confirmando…">
        Confirmar código
      </Botao>
    </form>
  );
}
