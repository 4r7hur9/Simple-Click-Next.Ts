/**
 * Inicializa o registro local do portão sem depender de Bash.
 *
 * O `prepare` roda em Windows, Linux e macOS. No Windows, `bash` pode apontar
 * para um WSL não configurado mesmo quando o Git Bash está instalado; usar
 * Node aqui mantém a instalação portável e preserva a mesma regra do
 * `registrar-pulo.sh --iniciar`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function git(argumentos) {
  try {
    return execFileSync("git", argumentos, {
      cwd: resolve(import.meta.dirname, "..", ".."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const raiz = resolve(import.meta.dirname, "..", "..");
const gitDirDeclarado = git(["rev-parse", "--git-dir"]);

if (gitDirDeclarado !== "") {
  const gitDir = resolve(raiz, gitDirDeclarado);
  const registro =
    process.env.PORTAO_REGISTRO ?? resolve(gitDir, "portao-verificados");

  if (!existsSync(registro)) {
    const base = git(["rev-parse", "--verify", "--quiet", "@{upstream}"]);
    mkdirSync(dirname(registro), { recursive: true });
    const conteudo =
      base === ""
        ? ""
        : `${base} ${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")} ponto-de-partida\n`;
    writeFileSync(registro, conteudo, "utf8");
  }
}
