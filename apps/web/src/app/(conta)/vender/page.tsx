import { redirect } from "next/navigation";

/**
 * `/vender` era a explicação de como abrir loja pela administração. Agora o
 * lojista cadastra a própria loja em `/cadastrar?tipo=dono` (card #28); o
 * endereço antigo continua valendo e leva para lá.
 */
export default function PaginaDeVender(): never {
  redirect("/cadastrar?tipo=dono");
}
