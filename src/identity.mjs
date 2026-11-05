// E-posta kimliği için saf yardımcılar (tarayıcıya bağımlı değil).
import { domainToASCII } from 'node:url';

// Posta kutusu kimliği için kaba anahtar: trim, NFC, alan adı punycode + küçük harf, yerel kısım küçük harf.
// Not: RFC 5321'e göre yerel kısım büyük/küçük harfe duyarlı olabilir; pratikte sağlayıcıların çoğu değildir.
export function mailboxKey(s) {
  const t = s.trim().normalize('NFC');
  const at = t.lastIndexOf('@');
  if (at < 0) return t.toLowerCase();
  const domain = t.slice(at + 1).toLowerCase();
  return t.slice(0, at).toLowerCase() + '@' + (domainToASCII(domain) || domain);
}

// Bir çiftin sonuçlarından işaret listesi üretir.
export function identityFlags(pair, a, b) {
  const flags = [];
  for (const [k, x] of [['a', a], ['b', b]])
    if (x.stored !== undefined && x.stored !== x.email.trim()) flags.push(`${k}-mutated`);
  if (a.outcome === 'accepted' && b.outcome === 'accepted') {
    const same = mailboxKey(a.stored ?? a.email) === mailboxKey(b.stored ?? b.email);
    if (pair.sameMailbox) flags.push('duplicate-account-same-mailbox');
    else if (same) flags.push('two-accounts-same-stored-address');
  }
  if (a.outcome === 'accepted' && b.outcome === 'rejected' && !pair.sameMailbox) flags.push('b-rejected');
  return flags;
}

export const isDuplicateFlag = (f) => f.startsWith('duplicate') || f.startsWith('two-accounts');
