"use client";

/**
 * Formulário de criar conta (AC-100 a AC-102, T-113).
 *
 * A conta é de cliente e nasce pronta: nome, e-mail, WhatsApp e senha, sem
 * confirmar e-mail nem código. A ponte já devolve a sessão aberta, e quem
 * montou o formulário decide para onde a pessoa vai (`aoCriarConta`).
 *
 * Quatro estados: preenchendo, enviando (botão em espera), erro (motivo ao
 * lado do campo ou aviso geral) e sucesso. Os campos ficam como a pessoa
 * digitou quando algo é recusado — só o que deu errado precisa mudar.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { esquemaDaSenhaNova } from "@simpleclick/contracts";
import { Aviso, Botao, Campo, CampoDeSenha, Sucesso } from "@simpleclick/ui";

import { AceiteDosTermos } from "../legal/AceiteDosTermos.tsx";

export interface DadosDoCadastroNaTela {
  readonly nome: string;
  readonly email: string;
  readonly telefone: string;
  readonly senha: string;
  /** "Li e aceito os Termos de Uso e a Política de Privacidade" (card #79). */
  readonly aceitouTermos: boolean;
}

export type RespostaDoCadastroNaTela =
  /** Conta criada e sessão aberta: a pessoa já está logada. */
  | { readonly status: "SESSAO_CRIADA"; readonly redirecionarPara: string }
  /** Conta criada sem sessão (formato antigo da ponte). */
  | { readonly status: "CADASTRADO"; readonly mensagem: string }
  | { readonly status: "EMAIL_EM_USO"; readonly mensagem: string }
  | { readonly status: "SENHA_FRACA"; readonly mensagem: string }
  | {
      readonly status: "CAMPOS_INVALIDOS";
      readonly campos: readonly { campo: string; mensagem: string }[];
    }
  | { readonly status: "INDISPONIVEL"; readonly mensagem: string };

export interface CadastroFormProps {
  readonly aoCadastrar: (
    dados: DadosDoCadastroNaTela,
  ) => Promise<RespostaDoCadastroNaTela>;
  /** A conta foi criada e a sessão já está aberta. */
  readonly aoCriarConta?: (redirecionarPara: string) => void;
  /** Link "Entrar" mostrado quando o e-mail já tem conta. */
  readonly linkParaEntrar?: ReactNode;
  /** Prefixo dos `id` dos campos (a janela da loja usa o seu). */
  readonly prefixo?: string;
}

/** Telefone como a API espera: só dígitos, com o código do país. */
export function telefoneComPais(digitado: string): string {
  const digitos = digitado.replace(/\D/g, "");
  if (digitos === "") return "";
  return digitos.startsWith("55") && digitos.length >= 12
    ? `+${digitos}`
    : `+55${digitos}`;
}

/** O que dá para conferir antes de mandar: campo vazio, e-mail sem @ e senha curta (mesmo schema do contrato). */
export function conferirAntes(dados: DadosDoCadastroNaTela): Record<string, string> {
  const erros: Record<string, string> = {};
  if (dados.nome === "") erros["nome"] = "Informe seu nome.";
  if (dados.email === "") erros["email"] = "Informe seu e-mail.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) {
    erros["email"] = "Confira o e-mail: falta algo, como o @.";
  }
  const digitos = dados.telefone.replace(/\D/g, "");
  if (digitos === "") erros["telefone"] = "Informe seu WhatsApp com DDD.";
  else if (digitos.length < 12) {
    erros["telefone"] = "Confira o número: DDD e celular, como 11 91234-5678.";
  }
  const senha = esquemaDaSenhaNova.safeParse(dados.senha);
  if (!senha.success) {
    erros["senha"] = senha.error.issues[0]?.message ?? "Crie uma senha.";
  }
  if (!dados.aceitouTermos) {
    erros["aceitouTermos"] =
      "Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.";
  }
  return erros;
}

export function CadastroForm({
  aoCadastrar,
  aoCriarConta,
  linkParaEntrar,
  prefixo = "cadastro",
}: CadastroFormProps) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [aceitouTermos, setAceitouTermos] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errosDosCampos, setErrosDosCampos] = useState<Record<string, string>>(
    {},
  );
  const [erroGeral, setErroGeral] = useState<ReactNode>();
  const [confirmacao, setConfirmacao] = useState<string>();

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroGeral(undefined);
    const dados: DadosDoCadastroNaTela = {
      nome: nome.trim(),
      email: email.trim(),
      telefone: telefoneComPais(telefone),
      senha,
      aceitouTermos,
    };
    const errosAntes = conferirAntes(dados);
    setErrosDosCampos(errosAntes);
    if (Object.keys(errosAntes).length > 0) return;

    setEnviando(true);
    try {
      const resposta = await aoCadastrar(dados);
      if (resposta.status === "SESSAO_CRIADA") {
        aoCriarConta?.(resposta.redirecionarPara);
        return;
      }
      if (resposta.status === "CADASTRADO") {
        setConfirmacao(resposta.mensagem);
        return;
      }
      if (resposta.status === "EMAIL_EM_USO") {
        setErrosDosCampos({ email: resposta.mensagem });
        if (linkParaEntrar !== undefined) {
          setErroGeral(
            <>
              {resposta.mensagem} {linkParaEntrar}
            </>,
          );
        }
        return;
      }
      if (resposta.status === "SENHA_FRACA") {
        setErrosDosCampos({ senha: resposta.mensagem });
        return;
      }
      if (resposta.status === "CAMPOS_INVALIDOS") {
        setErrosDosCampos(
          Object.fromEntries(
            resposta.campos.map((item) => [item.campo, item.mensagem]),
          ),
        );
        return;
      }
      setErroGeral(resposta.mensagem);
    } catch {
      setErroGeral("Não foi possível criar a conta agora. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  if (confirmacao !== undefined) {
    return (
      <Sucesso
        titulo="Conta criada."
        descricao={confirmacao || "Agora é só entrar com seu e-mail e senha."}
        acao={
          <a className="sc-conta__link" href="/entrar">
            Entrar
          </a>
        }
      />
    );
  }

  return (
    <form
      className="sc-conta__form"
      onSubmit={(evento) => void enviar(evento)}
      noValidate
    >
      <div className="sc-conta__campos">
        <Campo
          id={`${prefixo}-nome`}
          name="nome"
          autoComplete="name"
          rotulo="Seu nome"
          obrigatorio
          value={nome}
          onChange={(evento) => setNome(evento.target.value)}
          erro={errosDosCampos["nome"]}
          desabilitado={enviando}
        />
        <Campo
          id={`${prefixo}-email`}
          name="email"
          type="email"
          autoComplete="email"
          rotulo="E-mail"
          obrigatorio
          value={email}
          onChange={(evento) => setEmail(evento.target.value)}
          erro={errosDosCampos["email"]}
          desabilitado={enviando}
        />
        <Campo
          id={`${prefixo}-telefone`}
          name="telefone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          rotulo="WhatsApp com DDD"
          dica="As lojas usam para falar sobre o seu pedido."
          placeholder="(85) 91234-5678"
          obrigatorio
          value={telefone}
          onChange={(evento) => setTelefone(evento.target.value)}
          erro={errosDosCampos["telefone"]}
          desabilitado={enviando}
        />
        <CampoDeSenha
          id={`${prefixo}-senha`}
          name="senha"
          autoComplete="new-password"
          mostrarForca
          rotulo="Senha"
          dica="Use 12 caracteres ou mais. Uma frase fácil de lembrar funciona bem."
          obrigatorio
          value={senha}
          onChange={(evento) => setSenha(evento.target.value)}
          erro={errosDosCampos["senha"]}
          desabilitado={enviando}
        />
        <AceiteDosTermos
          id={`${prefixo}-aceite`}
          marcado={aceitouTermos}
          aoMudar={setAceitouTermos}
          erro={errosDosCampos["aceitouTermos"]}
          desabilitado={enviando}
        />
      </div>
      {erroGeral ? <Aviso tom="erro">{erroGeral}</Aviso> : null}
      <Botao
        className="sc-conta__botao"
        tamanho="grande"
        type="submit"
        carregando={enviando}
        rotuloDeEspera="Criando conta…"
      >
        Criar conta
      </Botao>
    </form>
  );
}
