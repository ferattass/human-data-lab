// Koşu yapılandırması (roundtrip.config.ts). Sırlar yapılandırmaya değil adapter'ın authenticate kancasına aittir.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Budgets, Fixture, FlowContract } from '../../core/src/index.ts';
import type { RoundtripAdapter } from './adapter.ts';

export interface RoundtripConfig {
  target: { name: string; baseURL: string };
  /** Gezinme, yönlendirme, fixture API, okuma ve cleanup yalnız bu originlere (§30). */
  allowedOrigins: string[];
  adapter: RoundtripAdapter;
  contract: FlowContract;
  corpus?: { set?: string; file?: string };
  budgets?: Partial<Omit<Budgets, 'workers'>>;
  artifactsDir?: string;
  /** Kasıtlı hata içeren demo koşusu mu? Rapor ve README bunu ayrı etiketler (§35). */
  syntheticDemo?: boolean;
  reproduce?: boolean;
  shrink?: boolean;
  headless?: boolean;
}

export const defineConfig = (c: RoundtripConfig) => c;

/**
 * Yapılandırma dosyasını import eder: bu, KOD ÇALIŞTIRMAK demektir (adapter yerel proje kodudur, §30).
 * Yalnız kullanıcının açıkça verdiği yol yüklenir; koşu artifact'ındaki yol asla kendiliğinden import edilmez.
 */
export async function loadConfigFile(p: string): Promise<RoundtripConfig> {
  const abs = resolve(p);
  if (!existsSync(abs)) throw new Error(`yapılandırma dosyası yok: ${p}`);
  // Sorgu eki: uzun ömürlü süreçte (MCP sunucusu) yapılandırma dosyası her çağrıda yeniden okunur. Onun import ettiği
  // modüller (adapter) ise ESM önbelleğinde kalır; adapter değiştiyse süreç yeniden başlatılmalı.
  const mod = (await import(`${pathToFileURL(abs).href}?t=${Date.now()}`)) as { default?: RoundtripConfig; config?: RoundtripConfig };
  const c = mod.default ?? mod.config;
  if (!c || typeof c !== 'object') throw new Error(`${p} default export olarak yapılandırma vermiyor (defineConfig)`);
  return c;
}

/** Replay/test için: corpus yerine somut fixture listesi. */
export interface FixtureOverride {
  fixture: Fixture;
  /** Somut değer; verilmezse fixture.value. Replay saklı değeri kullanır (C01). */
  value?: string;
  /** Saklı kabul beklentisi; verilmezse sözleşmeden çözülür. */
  expect?: 'must-accept' | 'must-reject';
  origin: 'replay' | 'inline';
}
export type { FlowContract };
