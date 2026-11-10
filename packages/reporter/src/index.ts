// @human-data-lab/reporter — inert JSON → yerel HTML (§29).
// Kurallar: tüm veri escape edilir; script yok; uzak font/CDN/analytics yok (CSP ile de engellenir);
// renk yanında her durumda metin etiketi; uzun metin kısaltılınca tam değer <details> ile erişilebilir.
import { writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT_MEANING, codePoints, escaped, firstObservedDivergence, measures, truncateForDisplay } from '../../core/src/index.ts';
import type { AssertionResult, Finding, Observation, TrialResult } from '../../core/src/index.ts';
import { readRun } from '../../store/src/index.ts';
import type { LoadedRun } from '../../store/src/index.ts';

/** HTML metin/öznitelik kaçışı. Rapor girdisindeki <script> yalnız metindir (C08). */
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"'`]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' })[c]!);

const STATUS_LABEL: Record<string, [string, string]> = {
  passed: ['GEÇTİ', 'ok'], failed: ['İHLAL', 'bad'], 'not-run': ['ÇALIŞMADI', 'warn'], indeterminate: ['BELİRSİZ', 'warn'],
  accepted: ['KABUL', 'neutral'], rejected: ['RED', 'neutral'], completed: ['TAMAMLANDI', 'neutral'], error: ['YÜRÜTME HATASI', 'warn'], cancelled: ['İPTAL', 'warn'],
  verified: ['TEMİZLENDİ', 'ok'], pending: ['TEMİZLİK BEKLİYOR', 'bad'], 'not-needed': ['GEREKMEDİ', 'neutral'],
  stable: ['KARARLI', 'neutral'], unstable: ['KARARSIZ', 'warn'], inconclusive: ['SONUÇSUZ', 'warn'], 'not-checked': ['TEKRAR YOK', 'neutral'],
  observed: ['GÖZLENDİ', 'neutral'], 'not-observed': ['GÖZLENMEDİ', 'warn'], 'not-supported': ['DESTEKLENMİYOR', 'neutral'],
};
const pill = (status: string) => {
  const [label, tone] = STATUS_LABEL[status] ?? [status.toUpperCase(), 'neutral'];
  return `<span class="pill ${tone}">${esc(label)}<span class="sr"> (${esc(status)})</span></span>`;
};
// cleanup "failed" ile assertion "failed" farklı etiket taşır
const cleanupPill = (s: string) => (s === 'failed' ? `<span class="pill bad">TEMİZLİK BAŞARISIZ</span>` : pill(s));

function valueBlock(v: string | undefined, label: string) {
  if (v === undefined) return `<p class="muted">${esc(label)}: değer yok</p>`;
  const t = truncateForDisplay(v, 80);
  const m = measures(v);
  return `<div class="val">
    <div class="kv"><span class="k">ham</span><code class="raw">${esc(t.text)}</code>${t.truncated ? '<span class="tag">kısaltıldı — kontrol tam değerde yapıldı</span>' : ''}</div>
    <div class="kv"><span class="k">kaçışlı</span><code>${esc(escaped(v))}</code></div>
    <details><summary>kod noktaları ve ölçüler</summary>
      <p class="mono small">${esc(codePoints(v).join(' '))}</p>
      <p class="small">${m.graphemes} grafem · ${m.codePoints} kod noktası · ${m.utf16CodeUnits} UTF-16 birimi · ${m.utf8Bytes} UTF-8 baytı</p>
      ${t.truncated ? `<p class="small">Tam ham değer:</p><code class="raw block">${esc(v)}</code>` : ''}
    </details>
  </div>`;
}

function stagesTable(obs: TrialResult['observations'], assertion?: AssertionResult) {
  const rows = (['authored', 'injected', 'submitted', 'readback'] as const).map((b) => {
    const o = obs[b] as Observation | undefined;
    const isBoundary = assertion?.boundary?.includes(b);
    const name = { authored: 'tasarlanan (authored)', injected: 'alana yazılan (injected)', submitted: 'gönderilen (submitted)', readback: 'yeniden okunan (readback)' }[b];
    return `<tr${isBoundary ? ' class="boundary"' : ''}><th scope="row">${esc(name)}${isBoundary ? ' <span class="tag">karşılaştırma sınırı</span>' : ''}</th>
      <td>${pill(o?.status ?? 'not-observed')}${o?.source ? ` <span class="muted small">${esc(o.source)}</span>` : ''}${o?.note ? `<div class="small muted">${esc(o.note)}</div>` : ''}</td>
      <td>${o && typeof o.value === 'string' ? valueBlock(o.value, b) : '<span class="muted">—</span>'}</td></tr>`;
  });
  return `<table class="stages"><thead><tr><th scope="col">Aşama</th><th scope="col">Gözlem</th><th scope="col">Değer</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

function divergence(obs: TrialResult['observations']) {
  // Aynı mantık çekirdekte (core/evaluate.ts); rapor ikinci bir oracle yazmaz.
  const d = firstObservedDivergence(obs);
  const un = d.unobserved.length ? ` Gözlenmeyen: ${esc(d.unobserved.join(', '))}.` : '';
  if (d.at) return `İlk gözlenen sapma: <strong>${esc(d.at)}</strong> (önceki gözlem: ${esc(d.from)}).${un} Bu bir kök neden iddiası değildir.`;
  return `Gözlenen sınırlarda sapma yok.${un}`;
}

function findingSection(f: Finding, run: LoadedRun) {
  const attempts = run.attempts.filter((a) => f.original.attemptIds.includes(a.identity.attemptId));
  const first = attempts[0];
  const failed = first?.assertions.find((a) => a.required && a.status === 'failed');
  const shrinkTrials = run.attempts.filter((a) => a.fixtureId === f.fixtureId && a.identity.candidateId !== 'original');
  const relRepro = `repro/${f.id}.spec.ts`;
  const evidence = attempts.flatMap((a) => ((run.observations[a.identity.attemptId] as { evidence?: string[] })?.evidence ?? []));
  return `<section class="finding" id="${esc(f.id)}" aria-labelledby="${esc(f.id)}-h">
  <h3 id="${esc(f.id)}-h">${esc(f.id)} · <span class="mono">${esc(f.fixtureId)}</span> ${f.syntheticDemo ? '<span class="pill demo">SENTETİK DEMO — kasıtlı hata</span>' : ''}</h3>
  <dl class="grid">
    <div><dt>Kural</dt><dd class="mono">${esc(f.signature.ruleId)}</dd></div>
    <div><dt>Sınır</dt><dd class="mono">${esc(f.signature.boundary.join(' → '))}</dd></div>
    <div><dt>Uygulama kararı</dt><dd>${pill(f.signature.applicationOutcome)}</dd></div>
    <div><dt>Fark sınıfı</dt><dd class="mono">${esc(f.signature.differenceClass)}</dd></div>
    <div><dt>Tekrar</dt><dd>${pill(f.reproducibility)} ${f.attemptsReproduced}/${f.attemptsObserved} bağımsız denemede aynı imza</dd></div>
    <div><dt>Adapter / alan</dt><dd class="mono">${esc(f.signature.adapterId)} / ${esc(f.signature.fieldId)}</dd></div>
  </dl>
  ${first ? `<p>${divergence(first.observations)}</p>${stagesTable(first.observations, failed)}` : '<p class="warn-text">Orijinal deneme kaydı bulunamadı.</p>'}
  <h4>Orijinal ve küçültülmüş örnek</h4>
  <div class="two"><div><p class="small muted">orijinal</p>${valueBlock(f.original.value, 'orijinal')}</div>
  <div><p class="small muted">son doğrulanmış aday (${esc(f.shrink?.status ?? 'not-attempted')})</p>${valueBlock(f.shrink?.best.value ?? f.original.value, 'aday')}</div></div>
  <p class="small">${esc(f.shrink?.note ?? '')} ${f.shrink ? `(${f.shrink.trialsUsed} küçültme denemesi, ${Math.round((f.shrink.elapsedMs ?? 0) / 1000)} sn)` : ''}</p>
  <h4>Bütün tekrarlar</h4>
  <table><thead><tr><th scope="col">Deneme</th><th scope="col">Yürütme</th><th scope="col">Uygulama</th><th scope="col">Korunma</th><th scope="col">Temizlik</th></tr></thead><tbody>
  ${attempts.map((a) => `<tr><td class="mono"><a href="#${esc(a.identity.attemptId)}">${esc(a.identity.attemptId)}</a></td><td>${pill(a.execution)}</td><td>${pill(a.applicationOutcome)}</td><td>${a.assertions.filter((x) => x.id !== 'acceptance').map((x) => pill(x.status)).join(' ')}</td><td>${cleanupPill(a.cleanup)}</td></tr>`).join('')}
  </tbody></table>
  ${shrinkTrials.length ? `<details><summary>Küçültme denemeleri (${shrinkTrials.length})</summary><ul class="small">${shrinkTrials.map((a) => `<li class="mono"><a href="#${esc(a.identity.attemptId)}">${esc(a.identity.attemptId)}</a> ${esc(a.identity.candidateId)} “${esc(escaped(a.observations.authored?.value ?? ''))}” — ${a.assertions.map((x) => esc(`${x.id}:${x.status}`)).join(' ')}</li>`).join('')}</ul></details>` : ''}
  <h4>Tekrar üretim</h4>
  <p>Regresyon dosyası: <a href="${esc(relRepro)}" class="mono">${esc(relRepro)}</a>. Replay aynı uygulama ortamını ve adapter'ı gerektirir; bu dosya tek başına hatayı her bilgisayarda çalıştırmaz.</p>
  <pre class="cmd">hdl replay ${esc(run.root)} --finding ${esc(f.id)}</pre>
  ${evidence.length ? `<h4>Kanıt</h4><p>${evidence.map((e) => `<a href="${esc(e)}">${esc(e)}</a>`).join(' · ')} <span class="small muted">Ekran görüntüsü bağlamdır; dizgi eşitliğinin hakemi değildir.</span></p>` : ''}
</section>`;
}

function attemptRow(a: TrialResult) {
  const pres = a.assertions.filter((x) => x.id !== 'acceptance');
  const acc = a.assertions.find((x) => x.id === 'acceptance');
  return `<tr id="${esc(a.identity.attemptId)}">
  <td class="mono">${esc(a.identity.attemptId)}<div class="small muted">${esc(a.identity.candidateId)}</div></td>
  <td class="mono small">${esc(a.fixtureId)}</td>
  <td>${pill(a.execution)}</td>
  <td>${pill(a.applicationOutcome)}<div class="small muted">beklenen: ${esc(a.expectation)} → ${acc ? pill(acc.status) : ''}</div></td>
  <td>${pres.map((x) => `${pill(x.status)} <span class="small mono">${esc(x.rule)}${x.required ? '' : ' (opsiyonel)'}</span>${x.reason ? `<div class="small muted">${esc(x.reason)}</div>` : ''}${x.status === 'passed' && x.rawEqual === false ? '<div class="small">ham fark var (yalnız eşdeğerlik geçti)</div>' : ''}`).join('<br>')}</td>
  <td>${cleanupPill(a.cleanup)}</td>
  <td><details><summary>ayrıntı</summary>${stagesTable(a.observations)}
    ${a.errors.length ? `<ul class="small">${a.errors.map((e) => `<li><strong>${esc(e.class)}</strong> / ${esc(e.phase)}: ${esc(e.message)}</li>`).join('')}</ul>` : ''}
    ${a.readbackSamples?.length ? `<p class="small">readback örnekleri: ${a.readbackSamples.map((s) => esc(escaped(s.value ?? '∅'))).join(' · ')}</p>` : ''}
    <p class="small muted">${a.events.map((e) => esc(`${e.phase}:${e.event}`)).join(' → ')}</p>
  </details></td></tr>`;
}

export function renderReport(run: LoadedRun): string {
  const m = run.manifest;
  const s = m?.summary;
  const complete = run.complete;
  const findings = [...run.findings].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  const pv = m?.provenance;
  const rules = ((run.contract as { contract?: { preservation?: Array<{ id: string; rule: string; required: boolean }> } })?.contract?.preservation ?? []).map((p) => `${p.id}=${p.rule}${p.required ? '' : ' (tanısal)'}`).join(' · ');
  const contractId = (run.contract as { contract?: { id?: string } })?.contract?.id ?? '?';
  const card = (n: number | string, label: string, tone = '') => `<div class="card ${tone}"><div class="n">${esc(n)}</div><div class="l">${esc(label)}</div></div>`;

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%3E%3Cpath%20d%3D%22M33%2014H22a10%2010%200%200%200-10%2010v52a10%2010%200%200%200%2010%2010h11M67%2014h11a10%2010%200%200%201%2010%2010v52a10%2010%200%200%201-10%2010H67%22%20fill%3D%22none%22%20stroke%3D%22%23202A27%22%20stroke-width%3D%2210%22%20stroke-linecap%3D%22round%22%2F%3E%3Crect%20x%3D%2243%22%20y%3D%2244%22%20width%3D%2214%22%20height%3D%2236%22%20rx%3D%227%22%20fill%3D%22%23202A27%22%2F%3E%3Ccircle%20cx%3D%2250%22%20cy%3D%2229%22%20r%3D%229%22%20fill%3D%22%23D7502B%22%2F%3E%3C%2Fsvg%3E">
<title>Human Data Lab — ${esc(contractId)} — ${esc(m?.runId ?? 'tamamlanmamış koşu')}</title>
<style>
/* Human Data Lab marka paleti (docs/brand). --accent metin için koyu turuncu: #D7502B kırık beyazda küçük metinde WCAG AA altında kalır. */
:root{--paper:#F6F3EB;--ink:#202A27;--muted:#65706B;--line:#D9DAD1;--sage:#EDEDE3;--dot:#D7502B;--accent:#B24526;--ok:#47705C;--okbg:#E6EEE8;--bad:#B14535;--badbg:#F7E6E1;--warn:#7A5A1E;--warnbg:#F6EEDB;--card:#FFFFFF}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 "Segoe UI",ui-sans-serif,system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif}
main{max-width:1180px;margin:0 auto;padding:32px 24px 80px}
h1,h2,h3,h4{font-family:Georgia,"Iowan Old Style","Times New Roman",serif;font-weight:700;line-height:1.2}
h1{font-size:2.4rem;margin:.2em 0 .1em}h2{font-size:1.6rem;margin-top:2.2em;border-top:2px solid var(--line);padding-top:.6em}h3{font-size:1.3rem}h4{font-size:1.05rem;margin-bottom:.4em}
.eyebrow{letter-spacing:.14em;text-transform:uppercase;font-size:.78rem;color:var(--accent);font-weight:700}
.mono,code,pre{font-family:Consolas,ui-monospace,SFMono-Regular,Menlo,"Liberation Mono",monospace}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:6px}.brand svg{width:30px;height:30px}
h1 .dot{color:var(--dot)}
code{background:var(--sage);padding:.1em .35em;border-radius:4px;white-space:pre-wrap;word-break:break-all}
code.block{display:block;padding:.6em}
pre.cmd{background:var(--ink);color:#fafaf9;padding:.8em 1em;border-radius:8px;overflow:auto}
.small{font-size:.86rem}.muted{color:var(--muted)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:18px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.card .n{font:700 1.9rem/1 Georgia,"Iowan Old Style",serif}.card .l{font-size:.85rem;color:var(--muted);margin-top:6px}
.card.bad{border-color:var(--bad);background:var(--badbg)}.card.warn{border-color:var(--warn);background:var(--warnbg)}.card.ok{border-color:var(--ok);background:var(--okbg)}
.pill{display:inline-block;font-size:.72rem;font-weight:700;letter-spacing:.06em;padding:.18em .6em;border-radius:999px;border:1.5px solid currentColor;white-space:nowrap}
.pill.ok{color:var(--ok);background:var(--okbg)}.pill.bad{color:var(--bad);background:var(--badbg)}.pill.warn{color:var(--warn);background:var(--warnbg)}.pill.neutral{color:var(--muted);background:var(--sage)}.pill.demo{color:var(--accent);background:#FBEDE6}
.banner{border:2px solid var(--bad);background:var(--badbg);border-radius:12px;padding:14px 18px;margin:18px 0}
.banner.demo{border-color:var(--dot);background:#FBEDE6}
table{width:100%;border-collapse:collapse;margin:10px 0;background:var(--card)}
th,td{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--line)}
thead th{font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
tr.boundary th{border-left:4px solid var(--dot)}
.tag{display:inline-block;font-size:.72rem;color:var(--accent);margin-left:.4em}
.finding{background:var(--card);border:1px solid var(--line);border-left:6px solid var(--bad);border-radius:12px;padding:6px 22px 18px;margin:20px 0}
dl.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px 18px}
dl.grid dt{font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}dl.grid dd{margin:2px 0 0}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:760px){.two{grid-template-columns:1fr}}
.kv{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;margin:2px 0}.kv .k{font-size:.72rem;color:var(--muted);min-width:4.5em;text-transform:uppercase;letter-spacing:.08em}
details summary{cursor:pointer;color:var(--accent)}
a{color:var(--accent)}
a:focus-visible,summary:focus-visible{outline:3px solid var(--accent);outline-offset:2px;border-radius:3px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.skip{position:absolute;left:-999px}.skip:focus{left:12px;top:12px;background:var(--ink);color:#fff;padding:8px 12px;border-radius:6px}
footer{margin-top:60px;font-size:.82rem;color:var(--muted);border-top:1px solid var(--line);padding-top:14px}
</style>
</head>
<body>
<a class="skip" href="#ozet">Özete atla</a>
<main>
<header>
  <div class="brand"><svg viewBox="0 0 100 100" aria-hidden="true"><path d="M33 14H22a10 10 0 0 0-10 10v52a10 10 0 0 0 10 10h11M67 14h11a10 10 0 0 1 10 10v52a10 10 0 0 1-10 10H67" fill="none" stroke="#202A27" stroke-width="10" stroke-linecap="round"/><rect x="43" y="44" width="14" height="36" rx="7" fill="#202A27"/><circle cx="50" cy="29" r="9" fill="#D7502B"/></svg><div class="eyebrow">Human Data Lab · yerel rapor</div></div>
  <h1>Kaydedildi<span class="dot">.</span> Peki korundu mu?</h1>
  <p class="mono small">${esc(contractId)} / ${esc(pv?.browser.name ?? 'chromium')} ${esc(pv?.browser.version ?? '')} / ${esc(rules)} / corpus ${esc(pv?.corpus.id ?? '?')}@${esc(pv?.corpus.version ?? '?')} (${esc(pv?.corpus.set ?? '?')}) / koşu ${esc(m?.runId ?? '?')}</p>
</header>
${!complete ? `<div class="banner" role="alert"><strong>Bu koşu tamamlanmış değil.</strong> Başarılı bitiş veya "tüm kontroller geçti" sonucu gösterilemez.
  <ul>${(run.problems.length ? run.problems : m?.problems ?? []).map((p) => `<li>${esc(p)}</li>`).join('')}${(m?.problems ?? []).filter((p) => !run.problems.includes(p)).map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
${m?.syntheticDemo ? `<div class="banner demo"><strong>Sentetik demo.</strong> Bu koşudaki hatalar demo uygulamasına bilerek eklenmiştir; dış projede doğrulanmış bulgu değildir.</div>` : ''}
${m?.replayOf ? `<div class="banner demo"><strong>Replay</strong> — kaynak koşu ${esc(m.replayOf.runId)}, bulgu ${esc(m.replayOf.findingId)}.${m.replayOf.mismatches.length ? ` Uyuşmazlıklar: ${m.replayOf.mismatches.map(esc).join('; ')}. Bu koşu "orijinal sürüm yeniden üretildi" diye okunmamalıdır.` : ' Sözleşme, adapter ve hedef bilgisi kaynak koşuyla eşleşiyor.'}</div>` : ''}

<section id="ozet" aria-labelledby="ozet-h">
<h2 id="ozet-h">Kapsam ve gerekli kontroller</h2>
${s ? `<div class="cards">
  ${card(s.selected, 'fixture seçildi')}${card(s.applicable, 'sözleşmeye uygun')}${card(s.executed, 'yürütüldü')}${card(s.preservationChecked, 'korunma kontrolü gerçekten çalıştı')}
</div>
<div class="cards">
  ${card(s.requiredFailed, 'required ihlal', s.requiredFailed ? 'bad' : 'ok')}${card(s.requiredNotRun, 'çalışmayan / belirsiz required', s.requiredNotRun ? 'warn' : '')}
  ${card(s.accepted, 'kabul')}${card(s.rejected, 'red')}${card(s.indeterminate, 'kabul/red belirsiz', s.indeterminate ? 'warn' : '')}${card(s.executionErrors, 'yürütme hatası', s.executionErrors ? 'warn' : '')}
  ${card(`${s.cleanup.verified}/${Object.values(s.cleanup).reduce((a, b) => a + b, 0)}`, 'temizlik doğrulandı (tüm denemeler)', s.cleanup.failed + s.cleanup.pending ? 'bad' : '')}
  ${card(s.findings, 'bulgu')}
</div>
<p><strong>Çıkış kodu ${esc(m?.exitCode ?? '?')}</strong> — ${esc(m?.exitCode === undefined ? 'bilinmiyor' : EXIT_MEANING[m.exitCode])}. "${s.selected} deneme" sayısı uygulamanın her durumda doğru olduğunu göstermez; yürütülen örneklerin kapsamını anlatır.</p>` : '<p>Özet yok: koşu preflight aşamasında durmuş olabilir.</p>'}
${s?.outOfScope.length ? `<details><summary>Kapsam dışı ${s.outOfScope.length} fixture (raporun yeşil kısmına katılmaz)</summary><ul class="small">${s.outOfScope.map((o) => `<li class="mono">${esc(o.fixtureId)} — ${esc(o.reason)}</li>`).join('')}</ul></details>` : ''}
</section>

<section aria-labelledby="bulgu-h">
<h2 id="bulgu-h">Bulgular (${findings.length})</h2>
${findings.length ? findings.map((f) => findingSection(f, run)).join('') : '<p>Bu koşuda required ihlal bulgusu yok.</p>'}
</section>

<section aria-labelledby="deneme-h">
<h2 id="deneme-h">Bütün denemeler (${run.attempts.length})</h2>
<p class="small muted">Tekrar ve küçültme denemeleri dahil; hiçbiri seçilerek gizlenmez. Sıra: ${esc((pv?.order ?? []).join(', '))}</p>
<table><thead><tr><th scope="col">Deneme</th><th scope="col">Fixture</th><th scope="col">Yürütme</th><th scope="col">Uygulama</th><th scope="col">Korunma</th><th scope="col">Temizlik</th><th scope="col">Ayrıntı</th></tr></thead>
<tbody>${run.attempts.map(attemptRow).join('')}</tbody></table>
</section>

<section aria-labelledby="koken-h">
<h2 id="koken-h">Tekrar üretim bağlamı</h2>
<table><tbody>
<tr><th scope="row">Araç</th><td class="mono">${esc(pv?.tool.name)} ${esc(pv?.tool.version)}</td></tr>
<tr><th scope="row">Adapter</th><td class="mono">${esc(pv?.adapter.id)} ${esc(pv?.adapter.version)}</td></tr>
<tr><th scope="row">Hedef</th><td class="mono">${esc(pv?.target.name)} · ${esc(pv?.target.baseURL)} · build ${esc(pv?.target.build ?? 'bilinmiyor')}</td></tr>
<tr><th scope="row">Corpus</th><td class="mono">${esc(pv?.corpus.id)}@${esc(pv?.corpus.version)} set=${esc(pv?.corpus.set)} ${esc(pv?.corpus.digest)}</td></tr>
<tr><th scope="row">Sözleşme / akış digest</th><td class="mono small">${esc(pv?.contractDigest)}<br>${esc(pv?.flowDigest)}</td></tr>
<tr><th scope="row">Browser / runtime</th><td class="mono small">${esc(pv?.browser.name)} ${esc(pv?.browser.version)} · ${esc(JSON.stringify(pv?.runtime ?? {}))}</td></tr>
<tr><th scope="row">Bütçeler</th><td class="mono small">${esc(JSON.stringify(pv?.budgets ?? {}))}</td></tr>
<tr><th scope="row">İzinli originler</th><td class="mono small">${esc((pv?.allowedOrigins ?? []).join(', '))}</td></tr>
</tbody></table>
<p class="small muted">Digest'ler aynı baytları doğrulamaya yardımcı olur; raporun doğru üretildiğini, yayıncının kimliğini veya uygulama sonucunun doğruluğunu kanıtlamaz.</p>
</section>
<footer>Human Data Lab ${esc(pv?.tool.version ?? '')} · Bu sayfa script çalıştırmaz ve dış kaynak yüklemez. Artifact bir çalışma dosyasıdır: paylaşmadan önce içeriği gözden geçirin (<span class="mono">hdl export</span> yalnız allowlist dosyalarını kopyalar).</footer>
</main>
</body>
</html>
`;
}

export function renderReportFile(runDir: string): string {
  const run = readRun(runDir);
  const html = renderReport(run);
  const target = join(run.root, 'report.html');
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, html, 'utf8');
  renameSync(tmp, target);
  return target;
}
