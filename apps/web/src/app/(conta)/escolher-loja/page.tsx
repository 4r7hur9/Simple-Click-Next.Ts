import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Aviso, Erro, Vazio } from "@simpleclick/ui";

import { CascaDaConta } from "../../../features/auth/CascaDaConta.tsx";
import { CartaoDaLoja } from "../../../features/equipe/CartaoDaLoja.tsx";
import { resumosDasLojas } from "../../../server/resumo-das-lojas.ts";
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
 * Escolha da loja do painel (T-115, AC-136; cartões e nova loja: card #32).
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
        descricao="Abra a sua loja ou peça ao dono para adicionar você à equipe dele."
        acao={<Link href="/escolher-loja/nova">Abrir uma loja</Link>}
      />
    );
  } else {
    const atual = decisao.estado === "pronta" ? decisao.loja.apelido : null;
    const resumos = await resumosDasLojas(decisao.lojas, decisao.token);
    conteudo = (
      <div className="sc-conta__form">
        {estado === "aguardando" ? (
          <Aviso tom="atencao" titulo="Essa loja ainda não abre">
            Ela precisa ser aprovada pela administração primeiro.
          </Aviso>
        ) : null}
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
        <ul className="grid gap-4" aria-label="Suas lojas">
          {decisao.lojas.map((loja) => (
            <li key={loja.apelido}>
              <CartaoDaLoja
                loja={loja}
                resumo={resumos.get(loja.apelido)}
                atual={loja.apelido === atual}
                acao={escolherLojaDoPainel}
              />
            </li>
          ))}
        </ul>
        <Link
          className="sc-botao sc-botao--discreta"
          href="/escolher-loja/nova"
          data-nova-loja
        >
          Abrir outra loja
        </Link>
      </div>
    );
  }

  return (
    <CascaDaConta
      titulo="Escolha a loja"
      descricao="Sua conta cuida de mais de uma loja. Escolha com qual trabalhar agora; dá para trocar a qualquer momento pelo menu."
      identificadorDoTitulo="titulo-escolher-loja"
    >
      {conteudo}
    </CascaDaConta>
  );
}
