import { FormularioHorario } from "../../../../../features/config/FormularioHorario.tsx";

export const metadata = { title: "Horário da loja | SimpleClick" };

/** Horário, fechar agora e datas especiais (US-902, AC-921). */
export default function PaginaDeHorarios() {
  return (
    <section className="pt-8" aria-labelledby="titulo-horarios">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria)]">
        Configuração da loja
      </p>
      <h1
        id="titulo-horarios"
        className="mt-3 text-4xl font-semibold tracking-[-0.04em]"
      >
        Horário de funcionamento
      </h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-[var(--cor-tinta-suave)]">
        Diga quando a loja recebe pedidos. A vitrine mostra se está aberta e a
        próxima abertura, sempre no fuso da sua loja.
      </p>
      <FormularioHorario />
    </section>
  );
}
