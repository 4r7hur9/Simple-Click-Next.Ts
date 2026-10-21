/**
 * O cadastro da loja na administração (AC-207): dados, endereço na web, tipo
 * de negócio e exclusão. A ficha vem do provedor do layout.
 */
import { DadosDaLoja } from "../../../../../../features/admin/DadosDaLoja.tsx";

export const metadata = {
  title: "Cadastro da loja | Administração SimpleClick",
};

export default function PaginaDoCadastro() {
  return <DadosDaLoja />;
}
