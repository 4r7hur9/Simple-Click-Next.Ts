import TotpForm from "../../../../../features/auth/TotpForm.tsx";

export const metadata = {
  title: "Configurar aplicativo autenticador | SimpleClick",
};

export default function PaginaDoAplicativoAutenticador() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-semibold">
        Proteger a conta com aplicativo
      </h1>
      <p className="mt-3 text-[var(--cor-tinta-suave)]">
        Escaneie o código no aplicativo autenticador e informe o código de seis
        dígitos para ativar esta proteção.
      </p>
      <TotpForm />
    </main>
  );
}
