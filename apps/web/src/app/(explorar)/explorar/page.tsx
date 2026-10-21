import { redirect } from "next/navigation";

/** `/explorar` sozinho leva à aba de produtos, a padrão. */
export default function PaginaInicialDoExplorar() {
  redirect("/explorar/produtos");
}
