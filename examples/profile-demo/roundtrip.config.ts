// Örnek yapılandırma. Demo sunucusu ayrı çalışıyor olmalı:
//   node examples/profile-demo/server.ts            (doğru mod, :4400)
//   node examples/profile-demo/server.ts strip-marks (Demo A)
//   hdl run examples/profile-demo/roundtrip.config.ts --corpus smoke
import { defineConfig } from '../../packages/playwright/src/index.ts';
import { profileDemoAdapter } from './adapter.ts';
import { displayNameContract } from './contract.ts';

const baseURL = process.env.HDL_DEMO_URL ?? 'http://127.0.0.1:4400';

export default defineConfig({
  target: { name: 'profile-demo', baseURL },
  allowedOrigins: [baseURL],
  adapter: profileDemoAdapter({
    // Sırlar ortamdan; rapora yazılmaz.
    testToken: process.env.HDL_DEMO_TOKEN ?? 'demo-test-token',
    user: process.env.HDL_DEMO_USER ?? 'demo',
    password: process.env.HDL_DEMO_PASSWORD ?? 'demo-password',
  }),
  contract: displayNameContract({ rule: (process.env.HDL_RULE as 'text.exact.v1' | 'text.nfc.v1') ?? 'text.exact.v1' }),
  corpus: { set: 'smoke' },
  syntheticDemo: true,
  artifactsDir: 'runs',
});
