import { redirect } from "next/navigation";

/** `/admin` sozinho leva à lista de lojas. */
export default function PaginaInicialDaAdministracao() {
  redirect("/admin/lojas");
}
