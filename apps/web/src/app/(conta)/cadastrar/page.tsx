"use client";

/**
 * Tela de cadastro do cliente final (AC-100 a AC-102, T-113).
 *
 * Fala com a API pela ponte do site (`/api/auth/cadastro`). A resposta é a
 * mesma para e-mail novo e já cadastrado; senha fraca volta com o motivo.
 */
import {
  CadastroForm,
  type DadosDoCadastroNaTela,
  type RespostaDoCadastroNaTela,
} from "../../../features/auth/CadastroForm.tsx";
import { CascaDaConta } from "../../../features/auth/CascaDaConta.tsx";

/** Envia o cadastro e traduz a resposta da ponte para a tela. */
async function cadastrar(
  dados: DadosDoCadastroNaTela,
): Promise<RespostaDoCadastroNaTela> {
  const resposta = await fetch("/api/auth/cadastro", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(dados),
  });
  const corpo = (await resposta.json()) as {
    readonly mensagem?: string;
    readonly erro?: string;
    readonly campos?: readonly { caminho: string; mensagem: string }[];
  };
  if (resposta.status === 201) {
    return { status: "CADASTRADO", mensagem: corpo.mensagem ?? "" };
  }
  if (resposta.status === 422) {
    return { status: "SENHA_FRACA", mensagem: corpo.mensagem ?? "" };
  }
  if (resposta.status === 400 && corpo.campos !== undefined) {
    return {
      status: "CAMPOS_INVALIDOS",
      campos: corpo.campos.map((item) => ({
        campo: item.caminho,
        mensagem: item.mensagem,
      })),
    };
  }
  return {
    status: "INDISPONIVEL",
    mensagem:
      corpo.mensagem ??
      "Não foi possível criar a conta agora. Tente novamente.",
  };
}

export default function PaginaDeCadastro() {
  return (
    <CascaDaConta
      identificadorDoTitulo="cadastro-titulo"
      titulo="Crie sua conta."
      descricao="Com conta, seus pedidos ficam salvos e você não digita seus dados a cada compra."
      etiqueta="Conta de cliente"
    >
      <CadastroForm aoCadastrar={cadastrar} />
      <p className="sc-conta__rodape-formulario">
        Já tem conta? <a href="/entrar">Entrar</a>
      </p>
    </CascaDaConta>
  );
}
