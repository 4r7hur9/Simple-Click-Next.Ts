import { Esqueleto } from "@simpleclick/ui";

/** O estado de espera da escolha da loja (P-011): a forma da lista. */
export default function CarregandoEscolhaDaLoja() {
  return (
    <main className="sc-conta">
      <div className="sc-conta__cartao">
        <div className="sc-conta__formulario">
          <div className="sc-conta__miolo sc-conta__espera">
            <Esqueleto linhas={3} rotulo="Carregando suas lojas…" />
          </div>
        </div>
      </div>
    </main>
  );
}
