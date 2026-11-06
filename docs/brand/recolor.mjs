// README animasyonlarını marka paletine çevirir (docs/brand/README.md). Kullanım: node docs/brand/recolor.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const P = { paper: '#F6F3EB', ink: '#202A27', orange: '#D7502B', muted: '#65706B', line: '#D9DAD1', sage: '#EDEDE3', green: '#47705C', orangeDark: '#B24526', violation: '#B14535', white: '#FFFFFF' };
const SANS = `"Segoe UI",ui-sans-serif,-apple-system,Roboto,Helvetica,Arial,sans-serif`;
const MONO = `Consolas,ui-monospace,SFMono-Regular,Menlo,"Liberation Mono",monospace`;
const SERIF = `Georgia,"Iowan Old Style","Times New Roman",serif`;

// Açık zemin (kırık beyaz kağıt) — akış diyagramı
const light = {
  '#0b1220': P.paper, '#1f2a44': P.line, '#1e293b': P.line, '#334155': P.line,
  '#0f1a2e': P.white, '#132036': P.sage, '#2a1220': '#F7E6E1',
  '#f8fafc': P.ink, '#e2e8f0': P.ink, '#cbd5e1': P.ink, '#94a3b8': P.muted, '#64748b': P.muted,
  '#2dd4bf': P.green, '#60a5fa': P.green, '#fb7185': P.violation, '#fecdd3': P.violation,
};
// Mürekkep zemin — terminal
const dark = {
  '#0a0f1a': P.ink, '#111827': '#18201E', '#1f2a44': '#34403C',
  '#e2e8f0': P.paper, '#cbd5e1': P.sage, '#94a3b8': '#A7B0AA', '#64748b': '#8A938E',
  '#2dd4bf': '#9DBFA9', '#4ade80': '#9DBFA9', '#fbbf24': '#F2A07F', '#fb7185': '#F08A6C',
};

function recolor(file, map, { serifTitle = false } = {}) {
  let s = readFileSync(file, 'utf8');
  for (const [from, to] of Object.entries(map)) s = s.replace(new RegExp(from, 'gi'), to);
  s = s.replace(/ui-sans-serif,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif/g, SANS)
    .replace(/ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace/g, MONO);
  if (serifTitle) s = s.replace(/(<text x="48" y="54" class=")sans(")/, `$1serif$2`).replace('.mono{', `.serif{font-family:${SERIF}}\n    .mono{`);
  writeFileSync(file, s);
  console.log('renklendi', file);
}

recolor(new URL('../assets/pipeline.svg', import.meta.url), light, { serifTitle: true });
recolor(new URL('../assets/demo.svg', import.meta.url), dark);
