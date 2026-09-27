import { Esqueleto } from "@simpleclick/ui";

/** O estado de espera da lista (P-011): a forma do que vai chegar. */
export default function CarregandoMeusPedidos() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-[-0.03em]">
        Meus pedidos
      </h1>
      <div className="mt-8">
        <Esqueleto linhas={4} rotulo="Carregando seus pedidos…" />
      </div>
    </main>
  );
}
