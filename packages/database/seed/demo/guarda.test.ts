/**
 * A trava de produção do seed de demonstração (M-2 da revisão #149).
 *
 * O `demo` cria uma conta ADMINISTRADORA com senha pública (contas.ts). Só o
 * rótulo `NODE_ENV` não basta: quem esquece de defini-lo num servidor teria um
 * admin conhecido plantado lá. A guarda soma o destino (banco só local) e os
 * marcadores de hospedagem. Pura: não abre conexão.
 */
import { describe, expect, it } from "vitest";

import { ErroDeAmbienteDeProducao } from "../index.ts";
import { exigirDestinoLocalDaDemonstracao } from "./index.ts";

const LOCAL = "postgresql://migracao:trocar@localhost:5432/simpleclick_dev";

describe("guarda do seed de demonstração", () => {
  it("[M-2] aceita banco local sem marcador de hospedagem", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      expect(() =>
        exigirDestinoLocalDaDemonstracao(
          { NODE_ENV: "development" },
          `postgresql://u:s@${host}:5432/simpleclick_dev`,
        ),
      ).not.toThrow();
    }
  });

  it("[M-2] recusa NODE_ENV=production, como antes", () => {
    expect(() =>
      exigirDestinoLocalDaDemonstracao({ NODE_ENV: "production" }, LOCAL),
    ).toThrow(ErroDeAmbienteDeProducao);
  });

  it("[M-2] recusa banco remoto mesmo SEM NODE_ENV (o caso do rótulo esquecido)", () => {
    expect(() =>
      exigirDestinoLocalDaDemonstracao(
        {},
        "postgresql://u:s@db.exemplo.railway.internal:5432/railway",
      ),
    ).toThrow(/não é local/);
  });

  it("[M-2] recusa quando o processo roda num provedor de hospedagem", () => {
    for (const marcador of ["RAILWAY_ENVIRONMENT", "VERCEL", "RENDER"]) {
      expect(() =>
        exigirDestinoLocalDaDemonstracao({ [marcador]: "production" }, LOCAL),
      ).toThrow(new RegExp(marcador));
    }
  });

  it("[M-2] a recusa não repete a URL (que leva usuário e senha)", () => {
    const url = "postgresql://usuario:senha-secreta@10.0.0.9:5432/x";
    try {
      exigirDestinoLocalDaDemonstracao({}, url);
      expect.unreachable("deveria recusar");
    } catch (erro) {
      expect(String(erro)).not.toContain("senha-secreta");
    }
  });
});
