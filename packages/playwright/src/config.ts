// Koşu yapılandırması (roundtrip.config.ts). Sırlar yapılandırmaya değil adapter'ın authenticate kancasına aittir.
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
