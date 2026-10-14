import { redirect } from "next/navigation";

/** `/minha-conta` sozinho leva aos pedidos. */
export default function PaginaInicialDaConta() {
  redirect("/minha-conta/pedidos");
}
