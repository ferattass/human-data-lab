// Sentetik demo uygulaması. Doğru modda metni aynen saklar.
// DEMO_BUGS=trim,strip-marks,latin1,utf8mb3,nfc,truncate50,collapse-space ile bilinen hata sınıfları eklenir.
// Sayfa (benzersiz ad) çakışması için: fold-lookup (aksan+büyüklük duyarsız arama, MySQL *_ai_ci gibi)
// veya slug-lookup (ad slug'a çevrilip aranır; aksan ve noktalama düşer).
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 4310);
const BUGS = new Set((process.env.DEMO_BUGS ?? '').split(',').filter(Boolean));
const people = new Map();
let nextId = 1;

const transforms = {
  trim: (s) => s.trim(),
  'collapse-space': (s) => s.replace(/\s+/g, ' '),
  nfc: (s) => s.normalize('NFC'),
  'strip-marks': (s) => s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC'),
  latin1: (s) => [...s].map((c) => (c.codePointAt(0) > 0xff ? '?' : c)).join(''),
  // MySQL utf8mb3 (strict olmayan mod): ilk 4 baytlık karakterde metni keser.
  utf8mb3: (s) => { const i = [...s].findIndex((c) => c.codePointAt(0) > 0xffff); return i < 0 ? s : [...s].slice(0, i).join(''); },
  truncate50: (s) => s.slice(0, 50),
};

function store(raw) {
  let v = raw;
  for (const name of Object.keys(transforms)) if (BUGS.has(name)) v = transforms[name](v);
  return v;
}

// Benzersiz adlı sayfalar: ad -> kayıt eşlemesi. Doğru modda ad aynen anahtar.
const pages = new Map(); // id -> { name, body }
let nextPageId = 1;
const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/ß/g, 'ss').toLowerCase();
const slug = (s) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pageKey = (name) => (BUGS.has('fold-lookup') ? fold(name) : BUGS.has('slug-lookup') ? slug(name) : name);
function findPage(name) {
  const k = pageKey(name);
  for (const [id, p] of pages) if (pageKey(p.name) === k) return id;
  return undefined;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const page = (title, body) =>
  `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const send = (code, html, headers = {}) => {
    res.writeHead(code, { 'content-type': 'text/html; charset=utf-8', ...headers });
    res.end(html);
  };

  if (req.method === 'GET' && url.pathname === '/people/new') {
    return send(200, page('Yeni kişi', `<form method="post" action="/people">
<label for="name">Görünen ad</label> <input id="name" name="name">
<button type="submit">Kaydet</button></form>`));
  }
  if (req.method === 'POST' && url.pathname === '/people') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const name = new URLSearchParams(body).get('name') ?? '';
    if (name.trim() === '') return send(422, page('Hata', '<p role="alert">Ad boş olamaz</p>'));
    const id = nextId++;
    people.set(id, store(name));
    return send(303, '', { location: `/people/${id}` });
  }
  if (req.method === 'GET' && url.pathname === '/pages/edit') {
    const name = url.searchParams.get('name') ?? '';
    const id = findPage(name);
    const cur = id ? pages.get(id) : { name, body: '' };
    return send(200, page('Sayfa düzenle', `<form method="post" action="/pages">
<input type="hidden" name="name" value="${esc(name)}"><h1>${esc(cur.name)}</h1>
<label for="body">İçerik</label> <textarea id="body" name="body">${esc(cur.body)}</textarea>
<button type="submit">Kaydet</button></form>`));
  }
  if (req.method === 'POST' && url.pathname === '/pages') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const f = new URLSearchParams(raw);
    const name = f.get('name') ?? '';
    if (name.trim() === '') return send(422, page('Hata', '<p role="alert">Ad boş olamaz</p>'));
    let id = findPage(name);
    if (id) pages.get(id).body = f.get('body') ?? ''; // mevcut kaydı güncelle (ad değişmez)
    else { id = nextPageId++; pages.set(id, { name, body: f.get('body') ?? '' }); }
    return send(303, '', { location: `/pages/${id}` });
  }
  const pm = url.pathname.match(/^\/pages\/(\d+)$/);
  if (req.method === 'GET' && pm && pages.has(Number(pm[1]))) {
    const p = pages.get(Number(pm[1]));
    return send(200, page('Sayfa', `<h1 data-testid="page-name">${esc(p.name)}</h1><div data-testid="page-body">${esc(p.body)}</div>`));
  }
  const m = url.pathname.match(/^\/people\/(\d+)$/);
  if (req.method === 'GET' && m && people.has(Number(m[1]))) {
    return send(200, page('Kişi', `<h1>Kişi</h1><p>Ad: <span data-testid="name">${esc(people.get(Number(m[1])))}</span></p><p role="status">Kaydedildi</p>`));
  }
  send(404, page('Yok', 'bulunamadı'));
}).listen(PORT, () => console.log(`demo :${PORT} bugs=[${[...BUGS].join(',')}]`));
