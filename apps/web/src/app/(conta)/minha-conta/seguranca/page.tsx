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
export default function PaginaDeSeguranca() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <header>
        <h1 className="text-3xl font-semibold">Segurança</h1>
        <p className="mt-2 text-[var(--cor-tinta-suave)]">
          Controle onde sua conta permanece conectada.
        </p>
      </header>

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
