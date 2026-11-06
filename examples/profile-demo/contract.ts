// Profil "Görünen ad" alanı için akış sözleşmesi (§13). Beklentiyi uygulama sahibi açıkça seçer.
import type { FlowContract } from '../../packages/core/src/index.ts';

export const displayNameContract = (o: { control?: 'input-text' | 'textarea'; rule?: 'text.exact.v1' | 'text.nfc.v1' } = {}): FlowContract => ({
  schemaVersion: '0.1',
  id: 'profile.display-name',
  field: { id: 'display-name', control: o.control ?? 'input-text' },
  inputMethod: 'fill',
  // Teknik kontrol girdileri reddedilmeli; diğer her şey kabul edilmeli. Sıra önemlidir: ilk eşleşen bağlanır.
  expectations: [
    { properties: ['technical-control'], expect: 'must-reject' },
    { properties: '*', expect: 'must-accept' },
  ],
  preservation: [
    // Required: tasarlanan değerden bağımsız taze okumaya kadar. Başlangıç sessizce ileri taşınmaz (§20).
    { id: 'display-name-preserved', rule: o.rule ?? 'text.exact.v1', required: true, boundary: ['authored', 'readback'] },
    // NFC sözleşmesinde ham kod noktası farkı görünür kalsın; yalnız kullanıcı exact'i required seçerse CI'yı etkiler (§13).
    ...(o.rule === 'text.nfc.v1' ? [{ id: 'display-name-exact', rule: 'text.exact.v1' as const, required: false, boundary: ['authored', 'readback'] as ['authored', 'readback'] }] : []),
    // Tanısal: kayıp hangi aşamada başladı? CI sonucunu etkilemez.
    { id: 'input-preserved', rule: 'text.exact.v1', required: false, boundary: ['authored', 'injected'] },
    { id: 'submit-preserved', rule: 'text.exact.v1', required: false, boundary: ['injected', 'submitted'] },
  ],
  readback: { kind: 'first-independent-read' },
});
