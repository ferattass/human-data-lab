// Adapter arayüzü (§18). Uygulamayı anlayan küçük ama dürüst bağlama katmanı.
import type { APIRequestContext, Browser, BrowserContext, Locator, Page } from '@playwright/test';
import type { Boundary, ControlType, InputMethod, Observation, OwnedFixture, TrialIdentity } from '../../core/src/index.ts';

export interface AdapterCapabilities {
  control: ControlType[];
  inputMethod: InputMethod[];
  /** Adapter'ın gerçekten gözleyebildiği sınırlar. 'submitted' yoksa raporda not-observed olur. */
  boundaries: Boundary[];
  freshReadSource: 'ui-detail' | 'api' | 'ui-edit-form';
  isolation: 'namespace' | 'tenant' | 'none';
  cleanup: 'verified-delete' | 'environment-reset' | 'none';
  readiness?: boolean;
}

export type CreateOutcome =
  | { kind: 'accepted'; recordId: string; submitted?: string; evidenceRef: string }
  | { kind: 'rejected'; reason: string; evidenceRef: string }
  | { kind: 'indeterminate'; reason: string };

export interface ReadObservation {
  status: 'observed' | 'not-observed';
  value?: string;
  source: string;
  /** Okunan kaydın uygulamadaki kimliği (B03: doğru kayıt okundu mu?). */
  recordIdSeen?: string;
  note?: string;
}

export type CleanupResult =
  | { status: 'verified'; detail?: string }
  | { status: 'pending'; detail: string }
  | { status: 'failed'; detail: string }
  | { status: 'not-needed'; detail?: string };

/** Sahiplik günlüğü: namespace rezervasyonu ilk mutasyondan ÖNCE yazılır (§19, B10). */
export interface AllocationLog {
  reserve(namespace: string): void;
  resource(namespace: string, resourceId: string, kind?: string): void;
  ref: string;
}

export interface TrialContext {
  identity: TrialIdentity;
  baseURL: string;
  signal: AbortSignal;
  /** Yeni, izole browser context'inde sayfa. Origin allowlist uygulanır. */
  newPage(): Promise<Page>;
  /** Origin allowlist uygulanmış HTTP istemcisi (fixture API, cleanup). */
  request(): Promise<APIRequestContext>;
  observe(boundary: Exclude<Boundary, 'authored'>, obs: Omit<Observation, 'boundary'>): void;
  allocations: AllocationLog;
  evidence(name: string, page: Page): Promise<string | undefined>;
  /** Tek eşleşme zorunlu; birden çok eşleşme rastgele ilki seçilmez (B04). */
  unique(locator: Locator, what: string): Promise<Locator>;
}

/** İptalden bağımsız temizlik bağlamı: ayrı, kısa bütçe ve signal (§22). */
export interface CleanupContext {
  identity: TrialIdentity;
  baseURL: string;
  signal: AbortSignal;
  request(): Promise<APIRequestContext>;
}

export interface RoundtripAdapter {
  id: string;
  version: string;
  capabilities: AdapterCapabilities;
  /** Koşu başında bir kez: ör. test kullanıcısı oturumu. Dönen storageState rapora/artifact'a YAZILMAZ (§30). */
  authenticate?(browser: Browser, baseURL: string): Promise<Awaited<ReturnType<BrowserContext['storageState']>> | undefined>;
  /** Artifact'a yazılmadan önce hata mesajlarından silinecek sır değerleri (test token, parola). */
  secrets?(): string[];
  /** Hedef uygulama sürümü/build kimliği; tekrar üretim bağlamı (§24). */
  targetBuild?(ctx: CleanupContext): Promise<string | undefined>;
  prepare(ctx: TrialContext): Promise<OwnedFixture>;
  create(ctx: TrialContext, own: OwnedFixture, value: string): Promise<CreateOutcome>;
  readFresh(ctx: TrialContext, own: OwnedFixture, recordId: string): Promise<ReadObservation>;
  /** Uygulamaya ait hazır olma sinyali (readiness-signal politikası için). */
  readiness?(ctx: TrialContext, own: OwnedFixture, recordId: string): Promise<boolean>;
  /** Yalnız sahipliği doğrulanmış kaynaklara dokunur; idempotent. */
  cleanup(ctx: CleanupContext, own: OwnedFixture): Promise<CleanupResult>;
}

export class AdapterError extends Error {
  readonly errorClass: 'adapter' | 'target' | 'observation' | 'configuration';
  constructor(message: string, errorClass: AdapterError['errorClass'] = 'adapter') {
    super(message);
    this.errorClass = errorClass;
  }
}

/** Origin allowlist ihlali: mutasyon durdurulur (B14). */
export class ScopeError extends Error {
  readonly errorClass = 'configuration';
}

export const defineAdapter = <A extends RoundtripAdapter>(a: A) => a;
