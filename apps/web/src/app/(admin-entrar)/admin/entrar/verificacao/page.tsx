/**
 * `/admin/entrar/verificacao` (card #11): o código do aplicativo (ou o de
 * recuperação) na entrada da administração, com o mesmo visual.
 *
 * Sem desafio no endereço (link copiado, aba reaberta) volta para
 * `/admin/entrar`, levando o destino. Depois do código, quem decide para
 * onde a pessoa vai é a página `/admin/entrar`, pelo grant ao vivo.
 */
import { redirect } from "next/navigation";

import { CascaDaAdministracao } from "../../../../../features/auth/CascaDaAdministracao.tsx";
import { VerificacaoDaAdministracao } from "../../../../../features/auth/VerificacaoDaAdministracao.tsx";
import {
  comDestino,
  destinoDosParametros,
} from "../../../../../lib/destino-seguro.ts";
import {
  destinoDaAdministracao,
  type ParametrosDoEndereco,
  parametrosDoEndereco,
} from "../../../../../server/entrada-da-administracao.ts";

/** Um identificador de desafio plausível (a API confere o resto). */
const DESAFIO = /^[\w-]{1,200}$/;

export default async function PaginaDeVerificacaoDaAdministracao({
  searchParams,
}: {
  searchParams: Promise<ParametrosDoEndereco>;
}) {
  const parametros = parametrosDoEndereco(await searchParams);
  const destino = destinoDaAdministracao(destinoDosParametros(parametros));
  const desafioId = parametros.get("desafio") ?? "";
  if (!DESAFIO.test(desafioId)) {
    redirect(comDestino("/admin/entrar", destino));
  }
  const canal = parametros.get("canal") === "TOTP" ? "TOTP" : "EMAIL";

  return (
    <CascaDaAdministracao
      identificadorDoTitulo="admin-verificacao-titulo"
      titulo="Confirme seu acesso."
      descricao="Última etapa para entrar na administração."
    >
      <VerificacaoDaAdministracao
        desafioId={desafioId}
        canal={canal}
        destino={destino}
      />
    </CascaDaAdministracao>
  );
}
