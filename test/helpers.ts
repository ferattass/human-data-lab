// Kabul testleri için ortak yardımcılar: demo sunucusu + gerçek Chromium + geçici koşu dizini.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { startDemo } from '../examples/profile-demo/server.ts';
import { profileDemoAdapter } from '../examples/profile-demo/adapter.ts';
import type { ProfileDemoAdapterOptions } from '../examples/profile-demo/adapter.ts';
import { displayNameContract } from '../examples/profile-demo/contract.ts';
import { runRoundtrip } from '../packages/playwright/src/index.ts';
import { SCHEMA_VERSION } from '../packages/core/src/index.ts';
import type { RoundtripConfig, RunOptions } from '../packages/playwright/src/index.ts';
import type { Budgets, Fixture } from '../packages/core/src/index.ts';
import { readCorpusFile } from '../packages/corpus/src/index.ts';

let shared: Browser | undefined;
export async function browser() { return (shared ??= await chromium.launch()); }
export async function closeBrowser() { await shared?.close(); shared = undefined; }

export const tmp = (p = 'hdl-test-') => mkdtempSync(join(tmpdir(), p));

const corpus = readCorpusFile();
export const fixture = (id: string): Fixture => {
  const f = corpus.fixtures.find((x) => x.id === id);
  if (!f) throw new Error(`fixture yok: ${id}`);
  return f;
};
export const inline = (id: string, value: string, properties = ['inline']): Fixture => ({
  schemaVersion: SCHEMA_VERSION, id, value, properties, applicableControls: ['input-text', 'textarea'], inputMethod: 'fill',
  defaultExpectation: 'unspecified', provenance: { kind: 'synthetic', license: 'Apache-2.0' },
});

export type Demo = Awaited<ReturnType<typeof startDemo>>;

export async function withDemo<T>(bugs: string[], fn: (d: Demo) => Promise<T>): Promise<T> {
  const d = await startDemo({ bugs });
  try { return await fn(d); } finally { await d.close(); }
}

export function config(d: Demo, o: { rule?: 'text.exact.v1' | 'text.nfc.v1'; adapter?: Partial<ProfileDemoAdapterOptions>; budgets?: Partial<Budgets>; contract?: RoundtripConfig['contract'] } = {}): RoundtripConfig {
  return {
    target: { name: 'profile-demo', baseURL: d.url },
    allowedOrigins: [d.url],
    adapter: profileDemoAdapter({ testToken: d.token, ...d.credentials, ...(o.adapter ?? {}) }),
    contract: o.contract ?? displayNameContract({ rule: o.rule }),
    syntheticDemo: true,
    budgets: { trialTimeoutMs: 15_000, ...(o.budgets ?? {}) },
  };
}

/** Somut fixture listesiyle koşu (corpus'tan bağımsız, hızlı). */
export async function run(cfg: RoundtripConfig, fixtures: Array<Fixture | { fixture: Fixture; value?: string }>, opts: Partial<RunOptions> = {}) {
  return runRoundtrip({
    config: cfg, browser: await browser(), artifactsDir: tmp(), reproduce: false, shrink: false,
    fixtures: fixtures.map((f) => ('fixture' in f ? { ...f, origin: 'inline' as const } : { fixture: f, origin: 'inline' as const })),
    ...opts,
  });
}
