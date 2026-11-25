/**
 * `/admin/entrar` (card #11): a entrada própria da administração.
 *
 * O servidor decide pelo grant ao vivo (`euDoPedidoAtual`, `GET /v1/eu`):
 * - administrador já logado vai para o `/admin` (ou para o `proximo` do
 *   próprio `/admin`);
 * - outra conta logada vê a mensagem neutra, sem nada da administração;
 * - sem sessão, o formulário de sempre (mesma ponte, mesmas mensagens).
 */
import { redirect } from "next/navigation";

import { CascaDaAdministracao } from "../../../../features/auth/CascaDaAdministracao.tsx";
import { EntrarNaAdministracao } from "../../../../features/auth/EntrarNaAdministracao.tsx";
import { SemAcessoAAdministracao } from "../../../../features/auth/SemAcessoAAdministracao.tsx";
import { destinoDosParametros } from "../../../../lib/destino-seguro.ts";
import { sairDaConta } from "../../../../server/actions/auth.ts";
import {
  decidirEntradaDaAdministracao,
  destinoDaAdministracao,
  type ParametrosDoEndereco,
  parametrosDoEndereco,
} from "../../../../server/entrada-da-administracao.ts";
import { euDoPedidoAtual } from "../../../../server/eu-do-pedido.ts";

export default async function PaginaDeEntrarNaAdministracao({
  searchParams,
}: {
  searchParams: Promise<ParametrosDoEndereco>;
}) {
  const proximo = destinoDosParametros(
    parametrosDoEndereco(await searchParams),
  );
  const decisao = decidirEntradaDaAdministracao(
    await euDoPedidoAtual(),
    proximo,
  );

  if (decisao.acao === "ir") redirect(decisao.destino);

  if (decisao.acao === "sem-acesso") {
    return (
      <CascaDaAdministracao
        identificadorDoTitulo="admin-entrar-titulo"
        titulo="Administração"
        descricao="Você já está conectado com outra conta."
      >
        <SemAcessoAAdministracao
          areaDoPapel={decisao.areaDoPapel}
          sair={sairDaConta}
        />
      </CascaDaAdministracao>
    );
  }

  return (
    <CascaDaAdministracao
      identificadorDoTitulo="admin-entrar-titulo"
      titulo="Entrar na administração"
      descricao="Use o e-mail e a senha da sua conta de administração."
    >
      <EntrarNaAdministracao
        destino={destinoDaAdministracao(proximo)}
        indisponivel={decisao.indisponivel}
      />
    </CascaDaAdministracao>
  );
}
