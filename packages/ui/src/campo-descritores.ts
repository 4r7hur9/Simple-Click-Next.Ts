/**
 * Os `id` das mensagens que descrevem o controle, na ordem de leitura.
 *
 * Exportado para quem troca o controle por `controle` (o campo de senha, por
 * exemplo) ligar as mesmas mensagens que o `input` padrão ligaria.
 */
export function descritoresDoCampo(
  id: string,
  {
    info = false,
    dica,
    erro,
    sucesso,
    carregando = false,
  }: {
    /** Há um "i" (Info) com o mesmo `id` do campo. */
    info?: boolean | undefined;
    dica?: string | undefined;
    erro?: string | undefined;
    sucesso?: string | undefined;
    carregando?: boolean | undefined;
  },
): string[] {
  return [
    info && `${id}-info`,
    dica !== undefined && `${id}-dica`,
    erro !== undefined && `${id}-erro`,
    erro === undefined && sucesso !== undefined && `${id}-sucesso`,
    carregando && `${id}-espera`,
  ].filter((valor): valor is string => typeof valor === "string");
}
