/**
 * Estado "carregando" que o P-011 exige de toda tela. Fica anunciado por
 * `role="status"` para que o leitor de tela avise a espera sem roubar o foco.
 */
export default function Carregando() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto flex min-h-dvh max-w-2xl items-center justify-center p-6"
    >
      Carregando…
    </div>
  );
}
