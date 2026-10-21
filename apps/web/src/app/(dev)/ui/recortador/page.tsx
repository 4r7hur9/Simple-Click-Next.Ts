import { PreviaDoRecortador } from "./PreviaDoRecortador.tsx";

/**
 * Página `/ui/recortador`: a janela de recorte de imagem (card #82) com todos
 * os espaços da tabela de dimensões, para conferir sem entrar no painel nem
 * enviar nada. O arquivo recortado aparece na própria página.
 */
export default function RecortadorDeImagemNaVitrine() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Recorte de imagem</h1>
      <p className="text-sm text-[var(--cor-tinta-suave)]">
        Escolha o espaço e uma foto. Nada é enviado: o resultado (WebP, nas
        dimensões do espaço) aparece abaixo.
      </p>
      <PreviaDoRecortador />
    </main>
  );
}
