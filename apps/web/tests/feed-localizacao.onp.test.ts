/**
 * Card #106, T-10602: a localização do feed entra no servidor com pouca
 * precisão, valor fora da faixa cai e nada de coordenada vai para log.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { consultaDaApi, lerConsulta } from "../src/features/feed/consulta.ts";

describe("localização do feed", () => {
  it("[CA-18] @spec:AC-10618 arredonda a 3 casas mesmo com o endereço cheio de casas", () => {
    const c = lerConsulta("produtos", { lat: "-23.5505199", lng: "-46.6333094" });
    expect(c.lat).toBe(-23.551);
    expect(c.lng).toBe(-46.633);
    expect(consultaDaApi(c)).toContain("lat=-23.551");
  });

  it("[CA-18] @spec:AC-10618 coordenada fora da faixa é descartada", () => {
    const c = lerConsulta("produtos", { lat: "200", lng: "10" });
    expect(c.lat).toBeUndefined();
    expect(c.lng).toBeUndefined();
  });

  it("[CA-16] @spec:AC-10616 sem localização a ordem 'mais perto' vira relevância", () => {
    const c = lerConsulta("produtos", { ordem: "distancia" });
    expect(consultaDaApi(c)).toContain("ordem=relevancia");
    expect(consultaDaApi(c)).not.toContain("lat=");
  });

  it("[CA-18] @spec:AC-10618 nenhum código do feed grava coordenada em log", () => {
    const pasta = join(process.cwd(), "apps", "web", "src");
    const arquivos = [
      ...readdirSync(join(pasta, "features", "feed")).map((f) => join(pasta, "features", "feed", f)),
      join(pasta, "server", "feed.ts"),
    ].filter((f) => /\.tsx?$/.test(f));
    for (const arquivo of arquivos) {
      const texto = readFileSync(arquivo, "utf8");
      expect(texto, arquivo).not.toMatch(/console\.\w+\([^)]*\b(lat|lng)\b/);
    }
  });

  it("[CA-18] @spec:AC-10618 a tela explica a finalidade antes de pedir a permissão", () => {
    const barra = readFileSync(
      join(process.cwd(), "apps", "web", "src", "features", "feed", "BarraDoFeed.tsx"),
      "utf8",
    );
    expect(barra).toContain("Usamos sua localização só para");
  });
});
