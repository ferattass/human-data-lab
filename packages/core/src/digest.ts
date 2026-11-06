// Kanonik JSON ve özetler (§24). Hash bütünlük yardımcısıdır; özgünlük veya doğruluk kanıtı değildir (§27).
import { createHash } from 'node:crypto';

export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson(o[k])).join(',') + '}';
}

export const sha256 = (data: string | Uint8Array) => 'sha256:' + createHash('sha256').update(data).digest('hex');
export const digestOf = (v: unknown) => sha256(canonicalJson(v));

/** normalize/segmenter davranışını etkileyen çalışma ortamı bilgisi (§14, §24). */
export function runtimeInfo() {
  return {
    node: process.versions.node,
    icu: process.versions.icu ?? null,
    unicode: process.versions.unicode ?? null,
    platform: `${process.platform}-${process.arch}`,
    locale: Intl.DateTimeFormat().resolvedOptions().locale,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
