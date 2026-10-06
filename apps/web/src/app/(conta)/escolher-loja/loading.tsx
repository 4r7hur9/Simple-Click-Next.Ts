import { Esqueleto } from "@simpleclick/ui";

/** O estado de espera da escolha da loja (P-011): a forma da lista. */
export default function CarregandoEscolhaDaLoja() {
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <Esqueleto linhas={3} rotulo="Carregando suas lojas…" />
    </main>
  );
}
