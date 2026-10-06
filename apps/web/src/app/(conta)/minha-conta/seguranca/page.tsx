import { Aviso } from "@simpleclick/ui";

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
    <main className="mx-auto max-w-2xl px-4 py-10">
      <header>
        <h1 className="text-3xl font-semibold">Segurança</h1>
        <p className="mt-2 text-[var(--cor-tinta-suave)]">
          Controle onde sua conta permanece conectada.
        </p>
      </header>

      {estado === "erro" ? (
        <Aviso tom="erro" className="mt-6">
          Não foi possível encerrar a sessão. Tente novamente.
        </Aviso>
      ) : null}

      <section aria-labelledby="titulo-segundo-fator" className="mt-10">
        <h2 id="titulo-segundo-fator" className="text-xl font-semibold">
          Segundo fator
        </h2>
        <p className="mt-2 text-[var(--cor-tinta-suave)]">
          Com o aplicativo autenticador, entrar pede também o código do seu
          celular. Para lojistas e administração, é a proteção mais forte.
        </p>
        <a
          className="sc-botao sc-botao--secundario mt-4 inline-flex"
          href="/minha-conta/seguranca/aplicativo"
        >
          Configurar aplicativo autenticador
        </a>
      </section>

      <section aria-labelledby="titulo-sair" className="mt-10">
        <h2 id="titulo-sair" className="text-xl font-semibold">
          Sair deste dispositivo
        </h2>
        <p className="mt-2 text-[var(--cor-tinta-suave)]">
          Encerra somente a sessão usada neste navegador.
        </p>
        <form action={sairDaConta} className="mt-4">
          <button type="submit" className="sc-botao sc-botao--secundario">
            Sair
          </button>
        </form>
      </section>

      <section aria-labelledby="titulo-encerrar-todas" className="mt-10">
        <h2 id="titulo-encerrar-todas" className="text-xl font-semibold">
          Encerrar todas as sessões
        </h2>
        <p className="mt-2 text-[var(--cor-tinta-suave)]">
          Desconecta sua conta de todos os dispositivos. Para voltar, será
          preciso entrar novamente em cada um deles.
        </p>
        <form action={encerrarTodasAsSessoes} className="mt-4">
          <button type="submit" className="sc-botao sc-botao--perigo">
            Encerrar todas as sessões
          </button>
        </form>
      </section>
    </main>
  );
}
