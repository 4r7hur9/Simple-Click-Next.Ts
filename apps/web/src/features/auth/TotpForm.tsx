"use client";

/**
 * Ativação do aplicativo autenticador (AC-121, T-113).
 *
 * Quatro estados: preparando (o segredo novo está sendo gerado), erro (com
 * nova tentativa), pronto (a chave para cadastrar no aplicativo e o campo do
 * código) e ativado (os códigos de recuperação, mostrados uma única vez).
 *
 * A chave aparece em texto, agrupada de quatro em quatro, e também como link
 * `otpauth://`, que no celular abre o aplicativo autenticador direto.
 */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Aviso,
  Botao,
  Campo,
  Carregando,
  Erro,
  Sucesso,
} from "@simpleclick/ui";

export type PreparoDoAplicativo =
  | { readonly segredo: string; readonly uriDoAplicativo: string }
  | { readonly erro: string };

export type ConfirmacaoDoAplicativo =
  | { readonly status: "ATIVADO"; readonly codigosDeRecuperacao: string[] }
  | { readonly status: "CODIGO_INVALIDO" }
  | { readonly status: "ERRO"; readonly mensagem: string };

export interface TotpFormProps {
  readonly aoPreparar: () => Promise<PreparoDoAplicativo>;
  readonly aoConfirmar: (codigo: string) => Promise<ConfirmacaoDoAplicativo>;
}

/** `JBSWY3DPEHPK3PXP` vira `JBSW Y3DP EHPK 3PXP`, mais fácil de digitar. */
function emGrupos(segredo: string): string {
  return segredo.replace(/(.{4})(?=.)/g, "$1 ");
}

export function TotpForm({ aoPreparar, aoConfirmar }: TotpFormProps) {
  const [preparo, setPreparo] = useState<PreparoDoAplicativo>();
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();
  const [codigos, setCodigos] = useState<string[]>();

  const preparar = useCallback(() => {
    setPreparo(undefined);
    aoPreparar()
      .then(setPreparo)
      .catch(() =>
        setPreparo({ erro: "Não foi possível gerar a chave agora." }),
      );
  }, [aoPreparar]);

  useEffect(preparar, [preparar]);

  async function confirmar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!/^\d{6}$/.test(codigo)) {
      setErro("Informe os seis dígitos exibidos pelo aplicativo.");
      return;
    }
    setEnviando(true);
    setErro(undefined);
    try {
      const resposta = await aoConfirmar(codigo);
      if (resposta.status === "ATIVADO") {
        setCodigos(resposta.codigosDeRecuperacao);
        return;
      }
      setErro(
        resposta.status === "CODIGO_INVALIDO"
          ? "Código não confere. Confira se o horário do celular está certo e tente de novo."
          : resposta.mensagem,
      );
    } catch {
      setErro("Não foi possível ativar agora. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  if (codigos !== undefined) {
    return (
      <div className="mt-8 space-y-4">
        <Sucesso
          titulo="Aplicativo autenticador ativado."
          descricao="A partir de agora o login pede o código do aplicativo, e não mais o do e-mail."
        />
        <section aria-labelledby="codigos-titulo" className="space-y-2">
          <h2 id="codigos-titulo" className="text-xl font-semibold">
            Guarde seus códigos de recuperação
          </h2>
          <p>
            Eles aparecem só agora. Cada um serve uma vez, se você perder o
            celular.
          </p>
          <ul className="grid grid-cols-2 gap-2 font-mono" data-codigos>
            {codigos.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  if (preparo === undefined) {
    return <Carregando rotulo="Gerando a chave do aplicativo…" />;
  }

  if ("erro" in preparo) {
    return (
      <Erro
        mensagem={preparo.erro}
        acao={
          <button type="button" onClick={preparar}>
            Tentar de novo
          </button>
        }
      />
    );
  }

  return (
    <form
      onSubmit={(evento) => void confirmar(evento)}
      className="mt-8 space-y-4"
      noValidate
    >
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          Abra o aplicativo autenticador no celular e escolha adicionar conta.
        </li>
        <li>
          Digite a chave abaixo, ou{" "}
          <a href={preparo.uriDoAplicativo}>abra direto no aplicativo</a>.
        </li>
        <li>Informe o código de seis dígitos que o aplicativo mostrar.</li>
      </ol>
      <p>
        <span className="block text-sm">Chave para digitar</span>
        <code className="text-lg" data-chave>
          {emGrupos(preparo.segredo)}
        </code>
      </p>
      <Campo
        id="codigo-aplicativo"
        name="codigo"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        rotulo="Código de seis dígitos"
        obrigatorio
        value={codigo}
        onChange={(evento) => setCodigo(evento.target.value.replace(/\D/g, ""))}
        desabilitado={enviando}
      />
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      <Botao type="submit" carregando={enviando} rotuloDeEspera="Ativando…">
        Ativar aplicativo
      </Botao>
    </form>
  );
}

export default TotpForm;
