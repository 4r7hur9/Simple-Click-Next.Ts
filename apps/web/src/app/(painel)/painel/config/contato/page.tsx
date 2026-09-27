import { EditorDeMensagem } from "../../../../../features/config/EditorDeMensagem.tsx";

export const metadata = { title: "Contato da loja | SimpleClick" };

export default function PaginaDeContato() {
  return (
    <main className="pt-8">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria)]">
        Configuração da loja
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
        Contato e mensagem
      </h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-[var(--cor-tinta-suave)]">
        Defina o WhatsApp que recebe os pedidos e a saudação que abre a
        mensagem.
      </p>
      <EditorDeMensagem
        apelidoDaLoja={
          process.env.NEXT_PUBLIC_DEV_STORE_SLUG ?? "pastelaria-da-vila"
        }
      />
    </main>
  );
}
