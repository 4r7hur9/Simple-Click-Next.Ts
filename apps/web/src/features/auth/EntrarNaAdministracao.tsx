"use client";

/**
 * O formulário da entrada da administração (card #11).
 *
 * É o `LoginForm` de sempre, falando com a mesma ponte (`enviarLogin`): as
 * mensagens de erro são as do login comum e nunca dizem se o e-mail tem
 * conta. O que muda é o depois:
 *
 * - segundo fator: a verificação da própria administração, levando o destino;
 * - sessão criada: volta para `/admin/entrar` e pede ao servidor para decidir
 *   de novo (`router.refresh`). É a página do servidor, pelo grant ao vivo,
 *   que leva o administrador ao `/admin` ou mostra a tela sem acesso. O
 *   `redirecionarPara` da ponte não é usado aqui.
 */
import { Aviso } from "@simpleclick/ui";
import { useRouter } from "next/navigation";

import { comDestino } from "../../lib/destino-seguro.ts";
import { LoginForm } from "./LoginForm.tsx";
import { enviarLogin } from "./acesso-na-ponte.ts";

export interface EntrarNaAdministracaoProps {
  /** O `proximo` já conferido pelo servidor (só caminho do `/admin`). */
  readonly destino?: string | undefined;
  /** A API não respondeu ao conferir a sessão aberta. */
  readonly indisponivel: boolean;
}

export function EntrarNaAdministracao({
  destino,
  indisponivel,
}: EntrarNaAdministracaoProps) {
  const roteador = useRouter();

  return (
    <>
      {indisponivel ? (
        <Aviso
          tom="atencao"
          titulo="Não conseguimos confirmar o seu acesso agora"
        >
          Entre de novo com o seu e-mail e a sua senha. Se continuar, tente
          daqui a alguns minutos.
        </Aviso>
      ) : null}
      <LoginForm
        prefixo="admin-entrar"
        aoEntrar={enviarLogin}
        aoPedirSegundoFator={(desafioId, canal) =>
          roteador.push(
            comDestino(
              `/admin/entrar/verificacao?desafio=${encodeURIComponent(desafioId)}&canal=${canal}`,
              destino,
            ),
          )
        }
        aoCriarSessao={() => {
          roteador.replace(comDestino("/admin/entrar", destino));
          roteador.refresh();
        }}
      />
    </>
  );
}
