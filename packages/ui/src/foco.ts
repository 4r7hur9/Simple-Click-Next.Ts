/**
 * Guarda o elemento que abriu uma superfície modal e devolve o foco a ele ao
 * fechar. O elemento pode desaparecer enquanto o modal está aberto; nesse
 * caso, a restauração é uma operação segura e sem efeito.
 */
export function guardarFoco(): () => void {
  const elemento =
    typeof document === "undefined" || document.activeElement === null
      ? null
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

  return () => {
    if (elemento === null || !elemento.isConnected) return;
    elemento.focus({ preventScroll: true });
  };
}

/** Devolve o foco a um elemento conhecido, sem rolar a página. */
export function devolverFoco(elemento: HTMLElement | null): void {
  if (elemento === null || !elemento.isConnected) return;
  elemento.focus({ preventScroll: true });
}
