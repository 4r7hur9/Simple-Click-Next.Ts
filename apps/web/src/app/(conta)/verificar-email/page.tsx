import type { Metadata } from "next";
import { Aviso, Botao, Sucesso } from "@simpleclick/ui";

import { CascaDaConta } from "../../../features/auth/CascaDaConta.tsx";

export const metadata: Metadata = {
  title: "Confirmar e-mail | SimpleClick",
};

interface PropriedadesDaPagina {
  readonly searchParams: Promise<{
    readonly estado?: string;
    readonly token?: string;
  }>;
}

/** Formulário que envia o token do link para a ponte do site. */
function FormularioDoLink({
  acao,
  token,
  rotulo,
}: {
  readonly acao: string;
  readonly token: string;
  readonly rotulo: string;
}) {
  return (
    <form action={acao} method="post" className="sc-conta__form">
      <input name="token" type="hidden" value={token} />
      <Botao className="sc-conta__botao" type="submit">
        {rotulo}
      </Botao>
    </form>
  );
}

/**
 * Confirmação de e-mail pelo link (AC-103, AC-104, T-113).
 *
 * Abrir o link NÃO consome nada: a pessoa confirma com um botão. Leitores de
 * e-mail que visitam os links sozinhos não gastam o link de ninguém. Funciona
 * sem script: o formulário vai para a ponte do site, que volta com o estado.
 */
export default async function PaginaDeVerificacaoDeEmail({
  searchParams,
}: PropriedadesDaPagina) {
  const { estado, token } = await searchParams;
  const comToken = token !== undefined && token !== "";

  let conteudo;
  if (estado === "verificado") {
    conteudo = (
      <Sucesso
        titulo="E-mail verificado."
        descricao="Seu e-mail foi confirmado. Agora você já pode entrar na sua conta."
        acao={<a href="/entrar">Entrar</a>}
      />
    );
  } else if (estado === "reenviado") {
    conteudo = (
      <Sucesso
        titulo="Enviamos um link novo."
        descricao="Confira sua caixa de entrada. O link anterior não vale mais."
      />
    );
  } else if (estado === "expirado" || estado === "limite") {
    conteudo = (
      <>
        <Aviso tom="atencao" titulo="Este link expirou">
          {estado === "limite"
            ? "Você já pediu vários links nesta última hora. Aguarde um pouco e peça de novo."
            : "Por segurança, links de confirmação têm prazo. Podemos enviar um novo para o mesmo endereço."}
        </Aviso>
        {comToken ? (
          <FormularioDoLink
            acao="/api/auth/verificar-email/reenviar"
            token={token}
            rotulo="Reenviar e-mail de verificação"
          />
        ) : null}
      </>
    );
  } else if (estado === "invalido") {
    conteudo = (
      <Aviso tom="erro" titulo="Link inválido">
        Este link não vale mais ou já foi usado. Se a conta já foi confirmada, é
        só entrar.
      </Aviso>
    );
  } else if (estado === "indisponivel" || estado === "erro") {
    conteudo = (
      <Aviso tom="erro" titulo="Não foi possível confirmar agora">
        O serviço está indisponível no momento. Tente novamente mais tarde.
      </Aviso>
    );
  } else if (comToken) {
    conteudo = (
      <FormularioDoLink
        acao="/api/auth/verificar-email"
        token={token}
        rotulo="Confirmar meu e-mail"
      />
    );
  } else {
    conteudo = (
      <Aviso tom="atencao">
        Abra esta tela pelo link que enviamos ao seu e-mail.
      </Aviso>
    );
  }

  return (
    <CascaDaConta
      identificadorDoTitulo="verificar-email-titulo"
      titulo="Confirme seu e-mail."
      descricao="A confirmação garante que ninguém use o seu endereço sem você saber."
      etiqueta="Conta"
    >
      <div aria-live="polite">{conteudo}</div>
    </CascaDaConta>
  );
}
