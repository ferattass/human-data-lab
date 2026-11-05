// @human-data-lab/corpus — sentetik fixture'lar + köken kaydı (§15, §16).
// Fixture uygulamanın kabul politikasını belirlemez; akış sözleşmesi bağlar.
import { readFileSync } from 'node:fs';
import { digestOf, validateCorpus } from '../../core/src/index.ts';
import type { Corpus, Fixture } from '../../core/src/index.ts';

export interface CorpusFile extends Corpus {
  sets: Record<string, string[]>;
}

export interface LoadedCorpus {
  id: string;
  version: string;
  set: string;
  /** Tüm corpus dosyasının digest'i: içerik değişirse değişir (§16). */
  digest: string;
  fixtures: Fixture[];
}

const DATA = new URL('../data/', import.meta.url);

export function readCorpusFile(name = 'human-text'): CorpusFile {
  const raw = JSON.parse(readFileSync(new URL(`${name}.json`, DATA), 'utf8'));
  validateCorpus(raw);
  const c = raw as CorpusFile;
  for (const [set, ids] of Object.entries(c.sets ?? {})) {
    const known = new Set(c.fixtures.map((f) => f.id));
    const missing = ids.filter((i) => !known.has(i));
    if (missing.length) throw new Error(`corpus set "${set}" bilinmeyen fixture içeriyor: ${missing.join(', ')}`);
  }
  return c;
}

/** set: 'smoke' (PR için küçük, deterministik) | 'full' | özel set adı. */
export function loadCorpus(set = 'smoke', file = 'human-text'): LoadedCorpus {
  const c = readCorpusFile(file);
  let fixtures: Fixture[];
  if (set === 'full') fixtures = c.fixtures;
  else {
    const ids = c.sets?.[set];
    if (!ids) throw new Error(`bilinmeyen corpus set: ${set} (mevcut: full, ${Object.keys(c.sets ?? {}).join(', ')})`);
    const byId = new Map(c.fixtures.map((f) => [f.id, f]));
    fixtures = ids.map((i) => byId.get(i)!);
  }
  return { id: c.id, version: c.version, set, digest: digestOf(c), fixtures };
}

export const corpusDataUrl = DATA;
