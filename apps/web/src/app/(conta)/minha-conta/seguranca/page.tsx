import {
  Aviso,
  Botao,
  Cartao,
  IconeAlerta,
  IconeConfirmar,
  IconeSair,
} from "@simpleclick/ui";

import { PaginaDaConta } from "../../../../features/conta/PaginaDaConta.tsx";

import {
  encerrarTodasAsSessoes,
  sairDaConta,
} from "../../../../server/actions/auth.ts";

export const metadata = {
  title: "Segurança da conta | SimpleClick",
};

/**
 * Ações separadas para a pessoa não encerrar todos os dispositivos por engano.
 * Formulários funcionam sem JavaScript e enviam a ação ao servidor, que nunca
 * expõe o cookie de renovação ao código do navegador (P-008).
 */
export default async function PaginaDeSeguranca({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  return (
    <PaginaDaConta
      atual="seguranca"
      titulo="Segurança"
      descricao="Controle onde sua conta permanece conectada."
    >
      {estado === "erro" ? (
        <Aviso tom="erro">
          Não foi possível encerrar a sessão. Tente novamente.
        </Aviso>
      ) : null}

      <div className="sc-minha-conta__blocos">
        <Cartao
          nivelDoTitulo={2}
          icone={<IconeConfirmar />}
          titulo="Segundo fator"
          descricao="Com o aplicativo autenticador, entrar pede também o código do seu celular. Para lojistas e administração, é a proteção mais forte."
        >
          <p className="sc-minha-conta__acao">
            <a
              className="sc-botao sc-botao--secundaria"
              href="/minha-conta/seguranca/aplicativo"
            >
              Configurar aplicativo autenticador
            </a>
          </p>
        </Cartao>

        <Cartao
          nivelDoTitulo={2}
          icone={<IconeSair />}
          titulo="Sair deste dispositivo"
          descricao="Encerra somente a sessão usada neste navegador."
        >
          <form action={sairDaConta} className="sc-minha-conta__acao">
            <Botao type="submit" variante="secundaria" icone={<IconeSair />}>
              Sair
            </Botao>
          </form>
        </Cartao>

        <Cartao
          nivelDoTitulo={2}
          icone={<IconeAlerta />}
          titulo="Encerrar todas as sessões"
          descricao="Desconecta sua conta de todos os dispositivos. Para voltar, será preciso entrar novamente em cada um deles."
        >
          <form
            action={encerrarTodasAsSessoes}
            className="sc-minha-conta__acao"
          >
            <Botao type="submit" variante="perigo">
              Encerrar todas as sessões
            </Botao>
          </form>
        </Cartao>
      </div>
    </PaginaDaConta>
  );
}
