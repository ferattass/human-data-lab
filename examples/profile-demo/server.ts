// Sentetik profil demo uygulaması (§35). Doğru mod + bilerek bozulmuş modlar. Gerçek kişi verisi yok.
//
// Hata modları (virgülle birleştirilebilir; hepsi SENTETİK DEMO olarak etiketlenir):
//   strip-marks            sunucu birleşik işaretleri atar (Demo A: "İpek Çağlar" → "Ipek Caglar")
//   drop-dotted-capital-i  sunucu U+0130'u siler ("İpek" → "pek")
//   nfc | nfkc             sunucu kaydetmeden önce normalleştirir (Demo B: nfc)
//   trim | nbsp-to-space   sunucu boşlukları dönüştürür
//   latin1                 Latin-1 dışını "?" yapar
//   flaky-strip            tek sıralı kayıtlarda (1., 3., …) işaret atar: ilk deneme bozulur, tekrar geçer (kararsız)
//   min-length:N           N kod noktasından kısa adı reddeder (422)
//   client-sanitize        tarayıcı JS'i yazarken Latin-1 dışını siler (authored → injected)
//   serializer             gönderimde JS değeri trim+NFKC yapar (injected → submitted)
//   toast-no-id            "Kaydedildi" toast'ı, ama yanıt kayıt kimliği içermez
//   stale-spa              sunucu işaret atar, sayfa ise yazılan değeri bellekten gösterir
//   drop-connection        kaydı oluşturur ve bağlantıyı yanıt vermeden keser
//   extra-post             aynı endpoint'e önce bir "analitik" POST gönderir
//   redirect-foreign       kayıttan sonra başka origin'e yönlendirir
//   ambiguous-label        "Görünen ad" etiketli iki alan
//   session-expire:N       oturum N detay sayfası görüntülemesinden sonra geçersiz olur (Demo C)
//   prepare-crash          namespace rezervasyonu kaynak yaratıp 500 döner
//   cleanup-fails          temizlik 500 döner
//   background-rewrite     temizlikten sonra arka plan işi kayıt yazar
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';

export interface DemoOptions {
  port?: number;
  bugs?: string[];
  testToken?: string;
  user?: string;
  password?: string;
  foreignOrigin?: string;
}

interface Rec { id: string; namespace: string; displayName: string }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const stripMarks = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
// Teknik kontrol girdileri: C0 kontrol karakterleri (sekme/satır sonu hariç) ve 200 kod noktası üstü.
const INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export async function startDemo(opts: DemoOptions = {}) {
  const bugs = new Set(opts.bugs ?? []);
  const token = opts.testToken ?? 'demo-test-token';
  const user = opts.user ?? 'demo';
  const password = opts.password ?? 'demo-password';
  const sessionLimit = Number([...bugs].find((b) => b.startsWith('session-expire:'))?.split(':')[1] ?? Infinity);
  const foreign = opts.foreignOrigin ?? 'http://foreign.example.test';
  const sessions = new Map<string, { creations: number; views: number }>();
  const namespaces = new Map<string, Set<string>>();
  const records = new Map<string, Rec>();
  let nextId = 1;
  let saveCount = 0;
  const stats = { creates: 0 };
  const build = `profile-demo@0.1.0${bugs.size ? '+' + [...bugs].sort().join('+') : ''}`;

  const store = (raw: string) => {
    let v = raw;
    saveCount++;
    if (bugs.has('trim')) v = v.trim();
    if (bugs.has('nbsp-to-space')) v = v.replace(/\u00a0/g, ' ');
    if (bugs.has('nfc')) v = v.normalize('NFC');
    if (bugs.has('nfkc')) v = v.normalize('NFKC');
    if (bugs.has('strip-marks') || bugs.has('stale-spa')) v = stripMarks(v);
    if (bugs.has('flaky-strip') && saveCount % 2 === 1) v = stripMarks(v);
    if (bugs.has('drop-dotted-capital-i')) v = v.replace(/\u0130/g, '');
    if (bugs.has('latin1')) v = [...v].map((c) => (c.codePointAt(0)! > 0xff ? '?' : c)).join('');
    return v;
  };
  const addRecord = (namespace: string, displayName: string) => {
    const id = String(nextId++);
    records.set(id, { id, namespace, displayName });
    namespaces.get(namespace)?.add(id);
    return id;
  };

  const page = (title: string, body: string) => `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font:16px system-ui;margin:40px;max-width:640px}label{display:block;margin:12px 0 4px}input,textarea{font:inherit;padding:6px;width:100%}[role=status]{color:#166534}[role=alert]{color:#991b1b}</style></head><body>${body}</body></html>`;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const send = (code: number, body: string, type = 'text/html; charset=utf-8', headers: Record<string, string> = {}) => {
      res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', ...headers });
      res.end(body);
    };
    const json = (code: number, obj: unknown) => send(code, JSON.stringify(obj), 'application/json; charset=utf-8');
    const body = async () => { let b = ''; for await (const c of req) b += c; return b; };
    const sid = /(?:^|;\s*)sid=([a-f0-9]+)/.exec(req.headers.cookie ?? '')?.[1];
    const session = sid ? sessions.get(sid) : undefined;
    const authed = !!session && session.views < sessionLimit;

    // ---- sağlık / build kimliği ----
    if (url.pathname === '/health') return json(200, { ok: true, build });

    // ---- oturum ----
    if (url.pathname === '/login' && req.method === 'GET')
      return send(200, page('Giriş', `<form method="post" action="/login"><label for="u">Kullanıcı</label><input id="u" name="user"><label for="p">Parola</label><input id="p" name="password" type="password"><button>Giriş</button></form>`));
    if (url.pathname === '/login' && req.method === 'POST') {
      const f = new URLSearchParams(await body());
      if (f.get('user') !== user || f.get('password') !== password) return send(401, page('Giriş', '<p role="alert">Hatalı giriş</p>'));
      const id = randomBytes(12).toString('hex');
      sessions.set(id, { creations: 0, views: 0 });
      return send(303, '', 'text/plain', { location: '/', 'set-cookie': `sid=${id}; Path=/; HttpOnly; SameSite=Lax` });
    }
    if (url.pathname === '/') return send(200, page('Demo', `<p>Sentetik profil demo uygulaması (${esc(build)}).</p>`));

    // ---- test fixture API: yalnız test token'ı ile (oturumdan bağımsız) ----
    if (url.pathname.startsWith('/__test/')) {
      if (req.headers['x-test-token'] !== token) return json(403, { error: 'test token gerekli' });
      if (url.pathname === '/__test/namespaces' && req.method === 'POST') {
        const { namespace } = JSON.parse((await body()) || '{}');
        if (!/^[a-z0-9-]{3,80}$/.test(namespace ?? '')) return json(400, { error: 'geçersiz namespace' });
        const existing = namespaces.get(namespace);
        if (existing && existing.size) return json(409, { error: 'namespace boş değil', resources: [...existing] });
        namespaces.set(namespace, existing ?? new Set());
        if (bugs.has('prepare-crash')) { addRecord(namespace, 'seed'); return json(500, { error: 'hazırlık yarıda çöktü' }); }
        return json(201, { namespace });
      }
      if (url.pathname === '/__test/records' && req.method === 'POST') {
        const { namespace, displayName } = JSON.parse(await body());
        if (!namespaces.has(namespace)) return json(400, { error: 'namespace yok' });
        return json(201, { id: addRecord(namespace, displayName) });
      }
      const m = url.pathname.match(/^\/__test\/namespaces\/([a-z0-9-]+)$/);
      if (m && req.method === 'GET') return json(200, { namespace: m[1], resources: [...(namespaces.get(m[1]) ?? [])] });
      if (m && req.method === 'DELETE') {
        if (bugs.has('cleanup-fails')) return json(500, { error: 'temizlik başarısız' });
        const set = namespaces.get(m[1]);
        const deleted = set ? [...set] : [];
        for (const id of deleted) records.delete(id);
        set?.clear();
        if (bugs.has('background-rewrite') && set) setTimeout(() => addRecord(m[1], 'arka plan işi'), 30);
        return json(200, { deleted: deleted.length });
      }
      return json(404, { error: 'yok' });
    }

    // ---- uygulama (oturum gerekli) ----
    if (url.pathname.startsWith('/api/')) { if (!authed) return json(401, { error: 'oturum yok' }); }
    else if (!authed && (url.pathname.startsWith('/profiles'))) return send(302, '', 'text/plain', { location: `/login?next=${encodeURIComponent(url.pathname)}` });

    if (url.pathname === '/profiles/new' && req.method === 'GET') {
      const ns = url.searchParams.get('ns') ?? '';
      const textarea = url.searchParams.get('control') === 'textarea';
      const field = textarea ? `<textarea id="displayName" name="displayName" rows="3"></textarea>` : `<input id="displayName" name="displayName" autocomplete="off">`;
      const dup = bugs.has('ambiguous-label') ? `<label for="displayName2">Görünen ad</label><input id="displayName2" name="displayName2">` : '';
      return send(200, page('Yeni profil', `<h1>Yeni profil</h1>
<form id="f"><input type="hidden" name="namespace" value="${esc(ns)}">
<label for="displayName">Görünen ad</label>${field}${dup}
<button type="submit">Kaydet</button></form><p role="status" id="toast"></p><p role="alert" id="err"></p>
<script>
const B = ${JSON.stringify([...bugs])};
const f = document.getElementById('f'), field = document.getElementById('displayName');
if (B.includes('client-sanitize')) field.addEventListener('input', () => { const v = field.value.replace(/[^\\u0000-\\u00ff]/g, ''); if (v !== field.value) field.value = v; });
f.addEventListener('submit', async (e) => {
  e.preventDefault();
  let displayName = field.value;
  if (B.includes('serializer')) displayName = displayName.trim().normalize('NFKC');
  if (B.includes('extra-post')) await fetch('/api/profiles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ beacon: true, namespace: 'analytics' }) });
  const r = await fetch('/api/profiles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ namespace: f.namespace.value, displayName }) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 422) { document.getElementById('err').textContent = j.error; return; }
  document.getElementById('toast').textContent = 'Kaydedildi';
  if (!j.id) return;
  if (B.includes('redirect-foreign')) { location.href = ${JSON.stringify(foreign)} + '/landing'; return; }
  if (B.includes('stale-spa')) {
    history.pushState({}, '', '/profiles/' + encodeURIComponent(j.id));
    const out = document.createElement('output');
    out.dataset.testid = 'display-name'; out.dataset.recordId = String(j.id); out.textContent = field.value; // bellekteki yazılan değer
    const p = document.createElement('p'); p.append('Görünen ad: ', out);
    const h = document.createElement('h1'); h.textContent = 'Profil';
    document.body.replaceChildren(h, p);
    return;
  }
  location.href = '/profiles/' + j.id + '?saved=1';
});
</script>`));
    }
    if (url.pathname === '/api/profiles' && req.method === 'POST') {
      let payload: { namespace?: string; displayName?: unknown; beacon?: boolean };
      try { payload = JSON.parse(await body()); } catch { return json(400, { error: 'JSON bekleniyor' }); }
      if (payload.beacon) return json(204, {});
      if (!payload.namespace || !namespaces.has(payload.namespace)) return json(400, { error: 'namespace rezerve edilmemiş' });
      const v = payload.displayName;
      if (typeof v !== 'string' || !v.trim()) return json(422, { error: 'Görünen ad boş olamaz' });
      if (INVALID.test(v)) return json(422, { error: 'Görünen ad kontrol karakteri içeremez' });
      if ([...v].length > 200) return json(422, { error: 'Görünen ad en fazla 200 karakter (kod noktası) olabilir' });
      const minLen = Number([...bugs].find((b) => b.startsWith('min-length:'))?.split(':')[1] ?? 0);
      if ([...v].length < minLen) return json(422, { error: `Görünen ad en az ${minLen} karakter olmalı` });
      stats.creates++;
      const id = addRecord(payload.namespace, store(v));
      session!.creations++;
      if (bugs.has('drop-connection')) { req.socket.destroy(); return; }
      if (bugs.has('toast-no-id')) return json(200, { ok: true });
      return json(201, { id });
    }
    const pm = url.pathname.match(/^\/(api\/)?profiles\/(\d+)(\/ready)?$/);
    if (pm && req.method === 'GET') {
      const r = records.get(pm[2]);
      if (!r) return pm[1] ? json(404, { error: 'yok' }) : send(404, page('Yok', '<p>Profil bulunamadı</p>'));
      if (pm[3]) return json(200, { ready: true });
      if (pm[1]) return json(200, { id: r.id, displayName: r.displayName });
      session!.views++;
      return send(200, page('Profil', `<h1>Profil</h1><p>Görünen ad: <output data-testid="display-name" data-record-id="${esc(r.id)}">${esc(r.displayName)}</output></p>${url.searchParams.get('saved') ? '<p role="status">Kaydedildi</p>' : ''}`));
    }
    send(404, page('Yok', 'bulunamadı'));
  });

  await new Promise<void>((r) => server.listen(opts.port ?? 0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    build,
    token,
    credentials: { user, password },
    state: { records, namespaces, sessions },
    /** Testler için: oluşturma sayısı ve canlı değiştirilebilir hata modu kümesi. */
    stats,
    bugs,
    close: () => new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}

// Doğrudan çalıştırma: node examples/profile-demo/server.ts [hata,modu] (PORT ortam değişkeni)
// Not: yol karşılaştırması URL kodlamasıyla yapılır; "Yayında" gibi ASCII dışı dizin adları ham argv ile eşleşmez.
if (process.argv[1] && import.meta.url === pathToFileURL(resolvePath(process.argv[1])).href) {
  const d = await startDemo({ port: Number(process.env.PORT ?? 4400), bugs: (process.argv[2] ?? process.env.DEMO_BUGS ?? '').split(',').filter(Boolean) });
  console.log(`profile-demo ${d.build} → ${d.url}  (kullanıcı: ${d.credentials.user})`);
}
