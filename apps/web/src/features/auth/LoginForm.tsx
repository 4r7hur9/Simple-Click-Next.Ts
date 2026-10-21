"use client";

/**
 * Formulário de login (AC-105, AC-108, AC-119, AC-122, T-113).
 *
 * Quatro estados: preenchendo, enviando, erro (mensagem que não revela se
 * foi o e-mail ou a senha) e sucesso (a tela segue para o segundo fator ou
 * para a área da pessoa). Recebe a chamada por propriedade: não fala com a
 * API sozinho.
 */
import { useState, type FormEvent } from "react";
import {
  Aviso,
  Botao,
  Campo,
  CampoDeSenha,
  IconeConfirmar,
} from "@simpleclick/ui";

export type RespostaDoLoginNaTela =
  | {
      readonly status: "DESAFIO_DE_SEGUNDO_FATOR";
      readonly desafioId: string;
      readonly canal?: "EMAIL" | "TOTP";
    }
  | { readonly status: "SESSAO_CRIADA"; readonly redirecionarPara: string }
  | { readonly status: "CREDENCIAIS_INVALIDAS" | "EMAIL_NAO_VERIFICADO" }
  /** Administração sem aplicativo autenticador (AC-122). */
  | { readonly status: "CONFIGURACAO_OBRIGATORIA" }
  /** Limite de tentativas (AC-119, AC-120). */
  | { readonly status: "MUITAS_TENTATIVAS"; readonly esperaSegundos: number }
  | { readonly status: "INDISPONIVEL"; readonly mensagem: string };

/** O texto de cada recusa. Nunca diz se o e-mail tem conta. */
function mensagemDaRecusa(resposta: RespostaDoLoginNaTela): string {
  switch (resposta.status) {
    case "EMAIL_NAO_VERIFICADO":
      return "Confirme seu e-mail antes de entrar. O link está na sua caixa de entrada.";
    case "CONFIGURACAO_OBRIGATORIA":
      return "Esta conta só entra com aplicativo autenticador, e ele ainda não foi configurado. Fale com o suporte da plataforma.";
    case "MUITAS_TENTATIVAS":
      return `Muitas tentativas. Aguarde ${Math.ceil(resposta.esperaSegundos / 60)} minuto(s) e tente de novo.`;
    case "INDISPONIVEL":
      return resposta.mensagem;
    default:
      return "E-mail ou senha incorretos. Confira e tente de novo.";
  }
}

export interface LoginFormProps {
  readonly aoEntrar: (entrada: {
    readonly email: string;
    readonly senha: string;
  }) => Promise<RespostaDoLoginNaTela>;
  readonly aoPedirSegundoFator: (
    desafioId: string,
    canal: "EMAIL" | "TOTP",
  ) => void;
  readonly aoCriarSessao: (redirecionarPara: string) => void;
  /** Prefixo dos `id` dos campos (a janela da loja usa o seu). */
  readonly prefixo?: string;
}

export function LoginForm({
  aoEntrar,
  aoPedirSegundoFator,
  aoCriarSessao,
  prefixo = "entrar",
}: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(undefined);
    if (email.trim() === "" || senha === "") {
      setErro("Informe seu e-mail e sua senha.");
      return;
    }
    setEnviando(true);
    try {
      const resposta = await aoEntrar({ email: email.trim(), senha });
      if (resposta.status === "DESAFIO_DE_SEGUNDO_FATOR") {
        aoPedirSegundoFator(resposta.desafioId, resposta.canal ?? "EMAIL");
        return;
      }
      if (resposta.status === "SESSAO_CRIADA") {
        aoCriarSessao(resposta.redirecionarPara);
        return;
      }
      setErro(mensagemDaRecusa(resposta));
    } catch {
      setErro("Não foi possível entrar agora. Tente novamente.");
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
          id={`${prefixo}-email`}
          name="email"
          type="email"
          autoComplete="email"
          rotulo="E-mail"
          obrigatorio
          value={email}
          onChange={(evento) => setEmail(evento.target.value)}
          desabilitado={enviando}
        />
        <CampoDeSenha
          id={`${prefixo}-senha`}
          name="senha"
          autoComplete="current-password"
          rotulo="Senha"
          obrigatorio
          value={senha}
          onChange={(evento) => setSenha(evento.target.value)}
          desabilitado={enviando}
        />
      </div>
      <div className="sc-conta__linha-de-apoio">
        <span className="sc-conta__protegida">
          <IconeConfirmar />
          Área protegida
        </span>
        <a className="sc-conta__link" href="/recuperar-senha">
          Esqueci minha senha
        </a>
      </div>
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      <Botao
        className="sc-conta__botao"
        tamanho="grande"
        type="submit"
        carregando={enviando}
        rotuloDeEspera="Entrando…"
      >
        Entrar
      </Botao>
    </form>
  );
}
