/**
 * Registro de um acesso da administração a dado de loja (AC-118).
 *
 * Mora no núcleo porque dois módulos falam dele: `auth` decide o acesso e
 * produz o registro, `admin` o grava na trilha. Módulo não importa módulo
 * (fronteiras em .spec/design/arquitetura.md); os dois importam daqui.
 */
export interface RegistroDeAcessoAdministrativo {
  readonly lojaId: string;
  readonly atorId: string;
  readonly papelDoAtor: "ADMIN";
  readonly acao: "ADMIN_ACCESS";
  readonly entidade: string;
  readonly entidadeId: string | undefined;
  readonly ocorridoEm: Date;
}
