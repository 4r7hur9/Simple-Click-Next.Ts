"use client";

/**
 * Formulário de cadastro do cliente final (AC-100 a AC-102, T-113).
 *
 * Quatro estados: preenchendo, enviando (botão em espera), erro (motivo ao
 * lado do campo ou aviso geral) e sucesso (a mesma confirmação para e-mail
 * novo e já cadastrado). Os campos ficam como a pessoa digitou quando algo
 * é recusado — só a senha precisa ser trocada.
 */
import { useState, type FormEvent } from "react";
import { Aviso, Botao, Campo, Sucesso } from "@simpleclick/ui";

export interface DadosDoCadastroNaTela {
  readonly nome: string;
  readonly email: string;
  readonly telefone: string;
  readonly senha: string;
}

export type RespostaDoCadastroNaTela =
  | { readonly status: "CADASTRADO"; readonly mensagem: string }
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
}

/** Telefone como a API espera: só dígitos, com o código do país. */
function telefoneComPais(digitado: string): string {
  const digitos = digitado.replace(/\D/g, "");
  if (digitos === "") return "";
  return digitos.startsWith("55") && digitos.length >= 12
    ? `+${digitos}`
    : `+55${digitos}`;
}

export function CadastroForm({ aoCadastrar }: CadastroFormProps) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errosDosCampos, setErrosDosCampos] = useState<Record<string, string>>(
    {},
  );
  const [erroGeral, setErroGeral] = useState<string>();
  const [confirmacao, setConfirmacao] = useState<string>();

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErroGeral(undefined);
    setErrosDosCampos({});
    try {
      const resposta = await aoCadastrar({
        nome: nome.trim(),
        email: email.trim(),
        telefone: telefoneComPais(telefone),
        senha,
      });
      if (resposta.status === "CADASTRADO") {
        setConfirmacao(resposta.mensagem);
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
        titulo="Conta criada. Falta confirmar o e-mail."
        descricao={`${confirmacao} Depois de confirmar, você já pode entrar.`}
        acao={<a href="/entrar">Ir para o login</a>}
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
          id="cadastro-nome"
          name="nome"
          autoComplete="name"
          rotulo="Nome"
          obrigatorio
          value={nome}
          onChange={(evento) => setNome(evento.target.value)}
          erro={errosDosCampos["nome"]}
          desabilitado={enviando}
        />
        <Campo
          id="cadastro-email"
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
          id="cadastro-telefone"
          name="telefone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          rotulo="Celular com DDD"
          dica="Por exemplo: 11 91234-5678."
          obrigatorio
          value={telefone}
          onChange={(evento) => setTelefone(evento.target.value)}
          erro={errosDosCampos["telefone"]}
          desabilitado={enviando}
        />
        <Campo
          id="cadastro-senha"
          name="senha"
          type="password"
          autoComplete="new-password"
          rotulo="Senha"
          dica="Use 12 caracteres ou mais. Uma frase fácil de lembrar funciona bem."
          obrigatorio
          value={senha}
          onChange={(evento) => setSenha(evento.target.value)}
          erro={errosDosCampos["senha"]}
          desabilitado={enviando}
        />
      </div>
      {erroGeral ? <Aviso tom="erro">{erroGeral}</Aviso> : null}
      <Botao
        className="sc-conta__botao"
        type="submit"
        carregando={enviando}
        rotuloDeEspera="Criando conta…"
      >
        Criar conta
      </Botao>
    </form>
  );
}
