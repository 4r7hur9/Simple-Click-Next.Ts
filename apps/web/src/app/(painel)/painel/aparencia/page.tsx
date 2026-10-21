import "@simpleclick/ui/styles/seletor-de-cor.css";

import { FormularioAparencia } from "../../../../features/config/FormularioAparencia.tsx";
import { exigirLojaDaPagina } from "../../../../server/loja-da-pagina.ts";
import { buscarVitrine } from "../../../../server/vitrine.ts";

export const metadata = { title: "Aparência da loja | SimpleClick" };

export default async function PaginaDeAparencia() {
  // O tipo de negócio escolhe a capa padrão que a prévia mostra sem foto.
  // Vitrine fora do ar não impede de editar: a prévia só usa o genérico.
  const { loja } = await exigirLojaDaPagina();
  const vitrine = await buscarVitrine(loja.apelido);
  const publica = vitrine.estado === "encontrada" ? vitrine.vitrine.loja : null;

  return (
    <main className="pt-8">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria)]">
        Personalização
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
        Aparência
      </h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-[var(--cor-tinta-suave)]">
        Cor de destaque, fotos, nome, descrição e WhatsApp da sua vitrine — com
        a prévia ao lado, antes de publicar.
      </p>
      <FormularioAparencia
        apelido={loja.apelido}
        rotuloDoCatalogo={publica?.rotulos.catalogo ?? "Cardápio"}
      />
    </main>
  );
}
