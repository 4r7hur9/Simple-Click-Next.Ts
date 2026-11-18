/**
 * O destino depois de entrar mora em `lib/destino-seguro.ts` (a regra de
 * fronteira só deixa o servidor importar de `lib/`). Este arquivo mantém o
 * caminho antigo funcionando para quem já importa daqui.
 */
export {
  comDestino,
  destinoDosParametros,
  destinoSeguro,
} from "../../lib/destino-seguro.ts";
