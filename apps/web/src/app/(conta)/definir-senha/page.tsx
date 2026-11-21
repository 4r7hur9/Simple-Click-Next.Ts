import type { Metadata } from "next";
import { Aviso, Botao, CampoDeSenha, Sucesso } from "@simpleclick/ui";

import { cookies } from "next/headers";

import { COOKIE_DO_LINK_DE_SENHA } from "../../../server/formularios-de-acesso.ts";
import { LimparTokenDaBarra } from "../../../features/auth/LimparTokenDaBarra.tsx";
import { CascaDaConta } from "../../../features/auth/CascaDaConta.tsx";

export const metadata: Metadata = {
  title: "Definir nova senha | SimpleClick",
};

/** Avisos dos estados que a ponte do site devolve no endereço. */
const ERROS: Record<string, string> = {
  repeticao_diferente: "As duas senhas não são iguais. Digite de novo.",
  senha_fraca:
    "Use pelo menos 12 caracteres e evite senhas que aparecem em vazamentos conhecidos.",
  link_invalido: "Este link não vale mais. Peça um novo.",
  invalido: "Este link está incompleto. Abra de novo o link do e-mail.",
  indisponivel: "O serviço está indisponível no momento. Tente mais tarde.",
  erro: "Não foi possível salvar agora. Tente novamente.",
};

/**
 * Definir a senha pelo link do e-mail (T-113): recuperação (AC-115) e
 * primeiro acesso do dono pelo convite (AC-200). Funciona sem script: o
 * formulário vai para a ponte do site, que volta aqui com o estado.
 */
export default async function PaginaDeDefinicaoDeSenha({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; convite?: string; estado?: string }>;
}) {
  const { token: tokenDoEndereco, convite, estado } = await searchParams;
  // Sem token no endereço (volta de erro), o link vem do cookie curto.
  let token = tokenDoEndereco;
  if (token === undefined || token === "") {
    try {
      const guardado = (await cookies()).get(COOKIE_DO_LINK_DE_SENHA)?.value;
      if (guardado) token = guardado;
    } catch {
      // Fora de um pedido (prova isolada): sem cookie.
    }
  }
  const primeiroAcesso = convite === "true";
  const titulo = primeiroAcesso
    ? "Defina sua primeira senha"
    : "Defina uma nova senha";

  if (estado === "concluido") {
    return (
      <CascaDaConta
        identificadorDoTitulo="definir-senha-titulo"
        titulo={titulo}
        descricao="Pronto."
      >
        <Sucesso
          titulo={primeiroAcesso ? "Acesso liberado." : "Senha nova salva."}
          descricao={
            primeiroAcesso
              ? "Entre com o seu e-mail e a senha que você acabou de definir."
              : "Por segurança, encerramos as sessões abertas com a senha antiga."
          }
          acao={
            <a className="sc-conta__link" href="/entrar">
              Ir para o login
            </a>
          }
        />
      </CascaDaConta>
    );
  }

  const semLink = token === undefined || token === "";
  const erro = estado === undefined ? undefined : ERROS[estado];

  return (
    <CascaDaConta
      identificadorDoTitulo="definir-senha-titulo"
      titulo={titulo}
      descricao={
        primeiroAcesso
          ? "Confirme seu acesso à loja escolhendo uma senha forte."
          : "Escolha uma senha forte para voltar a acessar sua conta."
      }
      etiqueta={primeiroAcesso ? "Primeiro acesso" : "Recuperar acesso"}
    >
      <div className="sc-conta__form">
        {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
        {semLink ? (
          <Aviso tom="atencao" acao={<a href="/recuperar-senha">Pedir link</a>}>
            Abra esta tela pelo link que enviamos ao seu e-mail.
          </Aviso>
        ) : (
          <>
            <LimparTokenDaBarra />
            <form
              action="/api/auth/definir-senha"
              method="post"
              className="sc-conta__form"
            >
              <input name="token" type="hidden" value={token} />
              {primeiroAcesso ? (
                <input name="convite" type="hidden" value="true" />
              ) : null}
              <div className="sc-conta__campos">
                <CampoDeSenha
                  id="senha"
                  name="senha"
                  autoComplete="new-password"
                  mostrarForca
                  rotulo="Nova senha"
                  dica="Use 12 caracteres ou mais."
                  obrigatorio
                  required
                  minLength={12}
                />
                <CampoDeSenha
                  id="confirmacao"
                  name="confirmacao"
                  rotuloDoOlho="Mostrar confirmação"
                  autoComplete="new-password"
                  rotulo="Confirme a nova senha"
                  obrigatorio
                  required
                  minLength={12}
                />
              </div>
              <Botao className="sc-conta__botao" tamanho="grande" type="submit">
                Salvar nova senha
              </Botao>
            </form>
          </>
        )}
      </div>
    </CascaDaConta>
  );
}
