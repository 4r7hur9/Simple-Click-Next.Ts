"use client";

import { useState, type FormEvent } from "react";
import { Aviso, Botao, Campo } from "@simpleclick/ui";

export type RespostaDoLoginNaTela =
  | { readonly status: "DESAFIO_DE_SEGUNDO_FATOR"; readonly desafioId: string }
  | { readonly status: "SESSAO_CRIADA"; readonly redirecionarPara: string }
  | { readonly status: "CREDENCIAIS_INVALIDAS" | "EMAIL_NAO_VERIFICADO" };

export interface LoginFormProps {
  readonly aoEntrar: (entrada: {
    readonly email: string;
    readonly senha: string;
  }) => Promise<RespostaDoLoginNaTela>;
  readonly aoPedirSegundoFator: (desafioId: string) => void;
  readonly aoCriarSessao: (redirecionarPara: string) => void;
}

export function LoginForm({
  aoEntrar,
  aoPedirSegundoFator,
  aoCriarSessao,
}: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(undefined);
    try {
      const resposta = await aoEntrar({ email: email.trim(), senha });
      if (resposta.status === "DESAFIO_DE_SEGUNDO_FATOR") {
        aoPedirSegundoFator(resposta.desafioId);
        return;
      }
      if (resposta.status === "SESSAO_CRIADA") {
        aoCriarSessao(resposta.redirecionarPara);
        return;
      }
      setErro(
        resposta.status === "EMAIL_NAO_VERIFICADO"
          ? "Confirme seu e-mail antes de entrar."
          : "E-mail ou senha incorretos.",
      );
    } catch {
      setErro("Não foi possível entrar agora. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={(evento) => void enviar(evento)} noValidate>
      <Campo
        id="entrar-email"
        name="email"
        type="email"
        autoComplete="email"
        rotulo="E-mail"
        obrigatorio
        value={email}
        onChange={(evento) => setEmail(evento.target.value)}
        desabilitado={enviando}
      />
      <Campo
        id="entrar-senha"
        name="senha"
        type="password"
        autoComplete="current-password"
        rotulo="Senha"
        obrigatorio
        value={senha}
        onChange={(evento) => setSenha(evento.target.value)}
        desabilitado={enviando}
      />
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      <Botao type="submit" carregando={enviando} rotuloDeEspera="Entrando…">
        Entrar
      </Botao>
    </form>
  );
}
