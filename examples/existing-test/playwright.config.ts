// Mevcut bir Playwright projesine Human Data Lab eklemek: ayrı CLI, ayrı auth düzeni gerekmez (§28).
import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.HDL_EXAMPLE_PORT ?? 4410);

export default defineConfig({
  testDir: './tests',
  workers: 1, // veri izolasyonu kanıtlanmadan paralellik yok (§26)
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    command: `node ../profile-demo/server.ts`,
    env: { PORT: String(PORT), DEMO_BUGS: process.env.DEMO_BUGS ?? '' },
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: false,
  },
});
