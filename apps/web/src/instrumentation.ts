/**
 * Gancho de partida do Next: confere o ambiente do site antes de ele atender
 * (card #158). O processo que lança aqui sai com erro, o healthcheck da
 * hospedagem não passa e a versão nova nunca recebe tráfego.
 *
 * Fica de fora a construção (`next build`), que roda sem as variáveis de
 * execução, e o runtime de borda, que não tem acesso ao ambiente completo.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { exigirAmbienteDoSite } = await import("./server/ambiente-do-site");
  exigirAmbienteDoSite(process.env);
}
