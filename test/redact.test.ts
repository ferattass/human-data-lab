// redactMessage (§30): artifact'a yazılan her hata/ayrıntı mesajı buradan geçer. Sıra hatası token sızdırabilir; burada sabitlenir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactMessage } from '../packages/playwright/src/runner.ts';

test('redactMessage: Bearer/Basic token, cookie satırı, tek değerli başlıklar ve adapter sırları maskelenir; Call log atılır', () => {
  const token = 'eyJhbGciOiJIUzI1NiJ9.payload-part.signature_part';
  assert.equal(redactMessage(`Authorization: Bearer ${token}`), 'Authorization: Bearer [REDACTED]');
  assert.equal(redactMessage(`HTTP 401 with authorization=Bearer ${token} sent`), 'HTTP 401 with authorization=Bearer [REDACTED] sent');
  assert.equal(redactMessage('authorization: Basic dXNlcjpwYXNz'), 'authorization: Basic [REDACTED]');

  const cookie = redactMessage('cookie: sid=abc123; csrf=def456; theme=dark');
  assert.doesNotMatch(cookie, /abc123|def456/, 'cookie satırındaki ikinci ve sonraki değerler de maskelenir');
  assert.doesNotMatch(redactMessage('set-cookie: session=zzz999; Path=/; HttpOnly'), /zzz999/);

  assert.equal(redactMessage('x-test-token: demo-test-token-value'), 'x-test-token: [REDACTED]');
  assert.equal(redactMessage('"x-api-key": "k-123"'), '"x-api-key": "[REDACTED]"');
  assert.equal(redactMessage("proxy-authorization='Basic abc='"), "proxy-authorization='Basic [REDACTED]'");

  // Adapter'ın bildirdiği sır: nerede geçerse maskelenir; Playwright "Call log" bölümü atılır; varsayılan ilk satır.
  const e = new Error('namespace hazırlanamadı: HTTP 401 (token s3cr3t-token-1)\nCall log:\n  - x-test-token: s3cr3t-token-1\n  - GET /x');
  assert.equal(redactMessage(e, ['s3cr3t-token-1']), 'namespace hazırlanamadı: HTTP 401 (token [REDACTED])');
  assert.equal(redactMessage('ilk\nikinci'), 'ilk');
  assert.equal(redactMessage('ilk\nikinci', [], { multiline: true }), 'ilk\nikinci');
  assert.ok(redactMessage('x'.repeat(5000)).length <= 2000);
  assert.equal(redactMessage(undefined), '');
  assert.equal(redactMessage('temiz mesaj'), 'temiz mesaj');
});
