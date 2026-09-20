import { defineConfig } from "@playwright/test";

import configuracao from "./playwright.config.ts";

export default defineConfig(configuracao, {
  use: {
    channel: "chrome",
  },
});
