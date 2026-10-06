import { FormularioImpressao } from "../../../../../features/config/FormularioImpressao.tsx";

export const metadata = { title: "Impressão do cupom | SimpleClick" };

/**
 * Largura do papel e conteúdo do cupom (US-905: AC-919, AC-920), a chave da
 * impressão automática e o pareamento do agente (US-605: AC-622, AC-626).
 */
export default function PaginaDeImpressao() {
  return (
    <section className="pt-8" aria-labelledby="titulo-impressao">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria)]">
        Configuração da loja
      </p>
      <h1
        id="titulo-impressao"
        className="mt-3 text-4xl font-semibold tracking-[-0.04em]"
      >
        Impressão do cupom
      </h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-[var(--cor-tinta-suave)]">
        Escolha a largura do papel da sua impressora, o que sai no cupom e se
        ele sai sozinho, pelo agente de impressão.
      </p>
      <FormularioImpressao />
    </section>
  );
}
