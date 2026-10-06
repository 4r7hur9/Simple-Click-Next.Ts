import { AtivacaoDoAplicativo } from "./AtivacaoDoAplicativo.tsx";

export const metadata = {
  title: "Configurar aplicativo autenticador | SimpleClick",
};

/** Tela de ativação do aplicativo autenticador (AC-121, AC-123). */
export default function PaginaDoAplicativoAutenticador() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-semibold">
        Proteger a conta com aplicativo
      </h1>
      <p className="mt-3 text-[var(--cor-tinta-suave)]">
        Com o aplicativo autenticador, o login pede o código que aparece no seu
        celular. Invadir o seu e-mail deixa de bastar para entrar na conta.
      </p>
      <AtivacaoDoAplicativo />
    </main>
  );
}
