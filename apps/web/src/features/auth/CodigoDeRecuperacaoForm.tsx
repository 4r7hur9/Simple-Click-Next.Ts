"use client";

/**
 * Entrada com código de recuperação, no lugar do código do aplicativo
 * (AC-123, T-113).
 *
 * Quem perdeu o celular informa um dos códigos guardados na ativação. Deu
 * certo: a pessoa entra e é levada a configurar o aplicativo no aparelho
 * novo. O código usado não vale de novo.
 */
import { useState, type FormEvent } from "react";
import { Aviso, Botao, Campo } from "@simpleclick/ui";

export type RespostaDaRecuperacaoNaTela =
  | {
      readonly status: "SESSAO_CRIADA";
      readonly redirecionarPara: string;
      readonly orientarPara?: string | undefined;
    }
  | { readonly status: "CODIGO_INVALIDO" }
  | { readonly status: "ERRO"; readonly mensagem: string };

export interface CodigoDeRecuperacaoFormProps {
  readonly aoConfirmar: (
    codigo: string,
  ) => Promise<RespostaDaRecuperacaoNaTela>;
  readonly aoCriarSessao: (destino: string) => void;
}

export function CodigoDeRecuperacaoForm({
  aoConfirmar,
  aoCriarSessao,
}: CodigoDeRecuperacaoFormProps) {
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const limpo = codigo.trim().toUpperCase();
    if (limpo.replace(/[^A-Z0-9]/g, "").length < 8) {
      setErro("Informe o código de recuperação completo.");
      return;
    }
    setEnviando(true);
    setErro(undefined);
    try {
      const resposta = await aoConfirmar(limpo);
      if (resposta.status === "SESSAO_CRIADA") {
        aoCriarSessao(resposta.orientarPara ?? resposta.redirecionarPara);
        return;
      }
      setErro(
        resposta.status === "CODIGO_INVALIDO"
          ? "Código de recuperação inválido ou já usado."
          : resposta.mensagem,
      );
    } catch {
      setErro("Não foi possível confirmar o código agora. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      className="sc-conta__form"
      onSubmit={(evento) => void enviar(evento)}
      noValidate
    >
      <div className="sc-conta__campos">
        <Campo
          id="codigo-de-recuperacao"
          name="codigo"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={20}
          rotulo="Código de recuperação"
          dica="Um dos códigos que você guardou ao ativar o aplicativo, como ABCD-EFGH."
          obrigatorio
          value={codigo}
          onChange={(evento) => setCodigo(evento.target.value)}
          desabilitado={enviando}
        />
      </div>
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      <Botao
        className="sc-conta__botao"
        type="submit"
        carregando={enviando}
        rotuloDeEspera="Confirmando…"
      >
        Entrar com o código
      </Botao>
    </form>
  );
}
