import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Aviso, Botao, Erro, Vazio } from "@simpleclick/ui";

import { CascaDaConta } from "../../../features/auth/CascaDaConta.tsx";
import { escolherLojaDoPainel } from "../../../server/actions/loja.ts";
import { lojaDoPedidoAtual } from "../../../server/loja-da-pagina.ts";

export const metadata: Metadata = {
  title: "Escolher a loja | SimpleClick",
  robots: { index: false, follow: false },
};

interface PropriedadesDaPagina {
  readonly searchParams: Promise<{ readonly estado?: string }>;
}

/**
 * Escolha da loja do painel (T-115, AC-136).
 *
 * Aparece para quem tem mais de uma loja e ainda não escolheu, para quem tinha
 * uma escolha que deixou de valer e para quem quer trocar. Cada loja é um
 * formulário com um botão: funciona sem script e pelo teclado, e a escolha vai
 * para a ação do servidor, que só aceita loja da própria sessão. Os estados:
 * lista, conta sem loja, API fora do ar e escolha recusada.
 */
export default async function PaginaDeEscolhaDaLoja({
  searchParams,
}: PropriedadesDaPagina) {
  const { estado } = await searchParams;
  const decisao = await lojaDoPedidoAtual();
  if (decisao.estado === "sem-sessao") redirect("/entrar");

  let conteudo;
  if (decisao.estado === "indisponivel") {
    conteudo = (
      <Erro
        titulo="Não foi possível carregar suas lojas"
        mensagem="O serviço não respondeu agora. Tente de novo em alguns segundos."
        acao={<a href="/escolher-loja">Tentar de novo</a>}
      />
    );
  } else if (decisao.estado === "sem-loja") {
    conteudo = (
      <Vazio
        titulo="Sua conta ainda não tem loja"
        descricao="O painel abre depois que a administração cria a loja e você aceita o convite que chega por e-mail."
        acao={<a href="/minha-conta/seguranca">Ir para a minha conta</a>}
      />
    );
  } else {
    const atual = decisao.estado === "pronta" ? decisao.loja.apelido : null;
    conteudo = (
      <>
        {estado === "recusada" ? (
          <Aviso tom="erro" titulo="Essa loja não está entre as suas">
            Escolha uma das lojas da lista.
          </Aviso>
        ) : null}
        {decisao.estado === "escolher" && decisao.escolhaInvalida ? (
          <Aviso tom="atencao" titulo="A loja escolhida antes não abre mais">
            Ela saiu da sua conta ou foi encerrada. Escolha de novo.
          </Aviso>
        ) : null}
        <ul className="sc-conta__campos" aria-label="Suas lojas">
          {decisao.lojas.map((loja) => (
            <li key={loja.apelido}>
              <form action={escolherLojaDoPainel} className="sc-conta__form">
                <input type="hidden" name="apelido" value={loja.apelido} />
                <Botao
                  className="sc-conta__botao"
                  type="submit"
                  variante={loja.apelido === atual ? "primaria" : "secundaria"}
                  aria-describedby={`loja-${loja.apelido}`}
                >
                  Abrir {loja.nome}
                </Botao>
                <p
                  id={`loja-${loja.apelido}`}
                  className="sc-conta__linha-de-apoio"
                >
                  /l/{loja.apelido}
                  {loja.situacao === "SUSPENDED" ? " · suspensa" : ""}
                  {loja.apelido === atual ? " · loja atual" : ""}
                </p>
              </form>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <CascaDaConta
      titulo="Escolha a loja"
      descricao="Sua conta cuida de mais de uma loja. Escolha com qual trabalhar agora; dá para trocar depois pelo painel."
      identificadorDoTitulo="titulo-escolher-loja"
    >
      {conteudo}
    </CascaDaConta>
  );
}
