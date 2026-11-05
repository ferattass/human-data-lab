// Bayt -> metin -> satırlar. Kodlama, uygulamanın beyan ettiği charset'ten alınır; tahmin edilmez.
export function decodeCsv(bytes, contentType = '') {
  const charset = (/charset=([^;]+)/i.exec(contentType)?.[1] ?? 'utf-8').trim().toLowerCase();
  const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const text = new TextDecoder(charset, { ignoreBOM: false }).decode(bytes);
  return { charset, hasBom, text };
}

// RFC 4180: tırnaklı alan, "" kaçışı, alan içinde satır sonu.
export function parseCsv(text, sep = ',') {
  const rows = []; let row = []; let field = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function cellFor(rows, { idColumn, valueColumn, id }) {
  const [header, ...data] = rows;
  const ic = header.findIndex((h) => h.trim() === idColumn);
  const vc = header.findIndex((h) => h.trim() === valueColumn);
  if (ic < 0 || vc < 0) throw new Error(`CSV başlığında kolon yok: ${idColumn}/${valueColumn} — ${header.join('|')}`);
  return data.find((r) => r[ic]?.replace(/^#/, '') === String(id))?.[vc];
}
