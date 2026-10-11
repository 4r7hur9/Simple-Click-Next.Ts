import { InicioDoPainel } from "../../../features/dashboard/InicioDoPainel.tsx";
import { exigirLojaDaPagina } from "../../../server/loja-da-pagina.ts";

export const metadata = {
  title: "Painel | SimpleClick",
  description:
    "O resumo de hoje da sua loja: quanto vendeu, comparado com ontem, e os atalhos para cuidar da loja.",
};

/** O início do painel, com os atalhos da loja da sessão (T-803, T-115). */
export default async function PaginaInicialDoPainel() {
  const { loja } = await exigirLojaDaPagina();
  return <InicioDoPainel apelidoDaLoja={loja.apelido} />;
}
