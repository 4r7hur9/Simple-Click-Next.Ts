import type { Metadata } from "next";
import { Aviso, Botao, Campo } from "@simpleclick/ui";

import { CascaDaConta } from "../../../features/auth/CascaDaConta.tsx";

export const metadata: Metadata = {
  title: "Recuperar senha | SimpleClick",
};

/** O que a ponte do site devolveu no endereço, depois do envio. */
const AVISOS: Record<string, { tom: "sucesso" | "erro"; texto: string }> = {
  // AC-114: a mesma confirmação, exista ou não conta com o e-mail.
  enviado: {
    tom: "sucesso",
    texto:
      "Se existir uma conta para este e-mail, enviaremos as instruções para redefinir sua senha.",
  },
  invalido: { tom: "erro", texto: "Informe um e-mail válido." },
  indisponivel: {
    tom: "erro",
    texto:
      "O envio de e-mail está indisponível no momento. Tente novamente mais tarde.",
  },
  erro: {
    tom: "erro",
    texto: "Não foi possível enviar agora. Tente novamente.",
  },
};

/**
 * Pedido de recuperação de senha (AC-114, T-113). Funciona sem script: o
 * formulário vai para a ponte do site, que volta aqui com o estado.
 */
export default async function PaginaDeRecuperacaoDeSenha({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const aviso = estado === undefined ? undefined : AVISOS[estado];

  return (
    <CascaDaConta
      identificadorDoTitulo="recuperar-titulo"
      titulo="Esqueceu sua senha?"
      descricao="Informe seu e-mail e enviaremos as instruções para continuar."
      etiqueta="Recuperar acesso"
    >
      <div className="sc-conta__form">
        {aviso ? <Aviso tom={aviso.tom}>{aviso.texto}</Aviso> : null}
        <form
          action="/api/auth/recuperar-senha"
          method="post"
          className="sc-conta__form"
        >
          <div className="sc-conta__campos">
            <Campo
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              rotulo="E-mail"
              obrigatorio
              required
            />
          </div>
          <Botao className="sc-conta__botao" tamanho="grande" type="submit">
            Enviar instruções
          </Botao>
        </form>
      </div>
      <p className="sc-conta__rodape-formulario">
        Lembrou a senha? <a href="/entrar">Entrar</a>
      </p>
    </CascaDaConta>
  );
}
