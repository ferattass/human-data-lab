// MCP sunucusu (packages/mcp): protokol (initialize, tools/list, tools/call, resources, hata kodları), stdout'un yalnız
// protokol taşıması, hdl_run'ın --allow-run olmadan kapalı kalması ve --allow-run ile gerçek Chromium koşusu (demo uygulaması).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmp, withDemo } from './helpers.ts';
import { displayNameContract } from '../examples/profile-demo/contract.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const bin = join(root, 'bin', 'hdl.mjs');

type Msg = { id?: number | string | null; result?: any; error?: { code: number; message: string } };

/** Küçük stdio MCP istemcisi. Her stdout satırı JSON olmalı; olmayanlar `garbage` içinde toplanır. */
class Client {
  private seq = 0;
  private readonly waiters = new Map<number, (m: Msg) => void>();
  readonly stderr: string[] = [];
  readonly garbage: string[] = [];
  readonly unaddressed: Msg[] = [];
  readonly proc: ChildProcess;
  constructor(proc: ChildProcess) {
    this.proc = proc;
    createInterface({ input: proc.stdout! }).on('line', (l) => {
      if (!l.trim()) return;
      let m: Msg;
      try { m = JSON.parse(l); } catch { this.garbage.push(l); return; }
      const w = typeof m.id === 'number' ? this.waiters.get(m.id) : undefined;
      if (w) { this.waiters.delete(m.id as number); w(m); } else this.unaddressed.push(m);
    });
    createInterface({ input: proc.stderr! }).on('line', (l) => this.stderr.push(l));
  }
  static start(args: string[] = [], env: Record<string, string> = {}, cwd = root) {
    return new Client(spawn(process.execPath, [bin, 'mcp', ...args], { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } }));
  }
  request(method: string, params?: unknown, timeoutMs = 180_000): Promise<Msg> {
    const id = ++this.seq;
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.waiters.delete(id); rej(new Error(`zaman aşımı: ${method}\nstderr:\n${this.stderr.join('\n')}`)); }, timeoutMs);
      this.waiters.set(id, (m) => { clearTimeout(t); res(m); });
      this.proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  notify(method: string, params?: unknown) { this.proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'); }
  raw(line: string) { this.proc.stdin!.write(line + '\n'); }
  async call(name: string, args: unknown) {
    const m = await this.request('tools/call', { name, arguments: args });
    assert.ok(!m.error, `${name}: ${JSON.stringify(m.error)}`);
    return m.result;
  }
  async close() {
    this.proc.stdin!.end();
    await new Promise<void>((r) => { this.proc.once('exit', () => r()); setTimeout(() => { this.proc.kill(); r(); }, 10_000); });
    assert.deepEqual(this.garbage, [], 'stdout yalnız protokol mesajı taşımalı');
  }
}

const INIT = { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'hdl-test', version: '0' } };

test('MCP protokolü: initialize, tools/list, salt okunur araçlar, kaynaklar, hata kodları; hdl_run --allow-run olmadan kapalı', async () => {
  const c = Client.start();
  try {
    const init = (await c.request('initialize', INIT)).result;
    assert.equal(init.protocolVersion, '2025-06-18');
    assert.equal(init.serverInfo.name, 'human-data-lab');
    assert.match(init.serverInfo.version, /^\d+\.\d+\.\d+$/);
    assert.match(init.instructions, /hdl_run kapalı/);
    c.notify('notifications/initialized');
    assert.deepEqual((await c.request('ping')).result, {});

    // Bilinmeyen protokol sürümü istenirse sunucu desteklediği sürümü önerir.
    const old = (await c.request('initialize', { ...INIT, protocolVersion: '1999-01-01' })).result;
    assert.ok(old.protocolVersion.startsWith('20'));

    const tools = (await c.request('tools/list')).result.tools as Array<{ name: string; inputSchema: { type: string }; annotations: Record<string, boolean> }>;
    assert.deepEqual(tools.map((t) => t.name), ['hdl_describe_difference', 'hdl_list_fixtures', 'hdl_validate_contract', 'hdl_read_run', 'hdl_plan_export', 'hdl_run']);
    for (const t of tools) {
      assert.equal(t.inputSchema.type, 'object', t.name);
      assert.equal(t.annotations.readOnlyHint, t.name !== 'hdl_run', `${t.name} readOnlyHint`);
    }
    assert.equal(tools.find((t) => t.name === 'hdl_run')!.annotations.destructiveHint, true);

    // Oracle: tarayıcısız, çekirdekle aynı sonuç
    const d = (await c.call('hdl_describe_difference', { expected: 'İpek Çağlar', actual: 'Ipek Caglar' })).structuredContent;
    assert.equal(d.passed, false);
    assert.equal(d.differenceClass, 'marks-stripped');
    assert.equal(d.firstDifferenceAt, 0);
    assert.equal(d.expected.codePoints[0], 'U+0130');
    assert.match(d.text, /kural: text\.exact\.v1/);
    const nfc = (await c.call('hdl_describe_difference', { expected: 'José', actual: 'José', rule: 'text.nfc.v1' })).structuredContent;
    assert.equal(nfc.passed, true);
    assert.equal(nfc.rawEqual, false);
    assert.equal(nfc.differenceClass, 'normalization-form-changed');

    // Corpus
    const smoke = (await c.call('hdl_list_fixtures', { set: 'smoke' })).structuredContent;
    assert.equal(smoke.count, 24);
    assert.equal(smoke.corpus.id, 'human-text');
    const tri = (await c.call('hdl_list_fixtures', { set: 'full', family: 'tr-i' })).structuredContent;
    assert.ok(tri.count > 0 && tri.fixtures.every((f: { id: string }) => f.id.startsWith('tr-i.')));
    assert.ok(tri.fixtures.every((f: { escaped: string }) => /^[\x20-\x7e]*$/.test(f.escaped)), 'kaçışlı değer yalnız ASCII');
    const rtl = (await c.call('hdl_list_fixtures', { set: 'full', property: 'rtl' })).structuredContent;
    assert.ok(rtl.count > 0 && rtl.fixtures.every((f: { properties: string[] }) => f.properties.includes('rtl')));

    // Sözleşme doğrulama
    const ok = (await c.call('hdl_validate_contract', { contract: displayNameContract() })).structuredContent;
    assert.deepEqual(ok, { valid: true, issues: [] });
    const bad = (await c.call('hdl_validate_contract', {
      contract: { ...displayNameContract(), preservation: [{ id: 'x', rule: 'text.lowercase.v1', required: true, boundary: ['authored', 'readback'] }] },
    })).structuredContent;
    assert.equal(bad.valid, false);
    assert.match(bad.issues.map((i: { message: string }) => i.message).join(' '), /bilinmeyen karşılaştırıcı/);

    // Koşu kapısı: araç hatası (isError), protokol hatası değil
    const run = (await c.request('tools/call', { name: 'hdl_run', arguments: { configPath: 'x.ts' } })).result;
    assert.equal(run.isError, true);
    assert.match(run.content[0].text, /--allow-run/);

    // Parametre ve yöntem hataları JSON-RPC kodlarıyla
    assert.equal((await c.request('tools/call', { name: 'hdl_describe_difference', arguments: { expected: 1, actual: 'a' } })).error!.code, -32602);
    assert.equal((await c.request('tools/call', { name: 'hdl_nope', arguments: {} })).error!.code, -32602);
    assert.equal((await c.request('tools/call', { name: 'hdl_read_run', arguments: { runDir: join(root, 'yok-boyle-dizin') } })).error!.code, -32602);
    // Kök dışı yol (yol geçişi): var olan bir dizin bile olsa reddedilir; UNC ve corpus adı olarak yol da.
    const outside = await c.request('tools/call', { name: 'hdl_read_run', arguments: { runDir: tmp('hdl-outside-') } });
    assert.equal(outside.error!.code, -32602);
    assert.match(outside.error!.message, /kökünün dışında/);
    assert.equal((await c.request('tools/call', { name: 'hdl_plan_export', arguments: { runDir: join(root, '..') } })).error!.code, -32602);
    assert.equal((await c.request('tools/call', { name: 'hdl_read_run', arguments: { runDir: '\\\\server\\share\\run' } })).error!.code, -32602);
    assert.equal((await c.request('tools/call', { name: 'hdl_list_fixtures', arguments: { set: 'smoke', file: '../../../package' } })).error!.code, -32602);
    assert.equal((await c.request('nope/method')).error!.code, -32601);
    c.raw('{bozuk json');
    c.raw('{"jsonrpc":"2.0","id":"s1"}');
    assert.deepEqual((await c.request('prompts/list')).result, { prompts: [] });
    assert.ok(c.unaddressed.some((m) => m.id === null && m.error?.code === -32700), 'parse error -32700');
    assert.ok(c.unaddressed.some((m) => m.id === 's1' && m.error?.code === -32600), 'invalid request -32600');

    // Kaynaklar: şemalar ve ajan rehberi
    const res = (await c.request('resources/list')).result.resources as Array<{ uri: string; mimeType: string }>;
    for (const u of ['hdl://schema/fixture', 'hdl://schema/contract', 'hdl://schema/manifest', 'hdl://docs/agents', 'hdl://docs/contracts']) assert.ok(res.some((r) => r.uri === u), u);
    const read = (await c.request('resources/read', { uri: 'hdl://schema/fixture' })).result.contents[0];
    assert.equal(read.mimeType, 'application/schema+json');
    assert.equal(JSON.parse(read.text).title, 'Fixture');
    const agents = (await c.request('resources/read', { uri: 'hdl://docs/agents' })).result.contents[0];
    assert.match(agents.text, /hdl_run/);
    assert.equal((await c.request('resources/read', { uri: 'hdl://nope' })).error!.code, -32002);
  } finally { await c.close(); }
});

test('MCP --allow-run: hdl_run gerçek koşu yapar; hdl_read_run ve hdl_plan_export aynı koşuyu okur; günlük stderr\'e gider', async () => {
  await withDemo(['strip-marks'], async (d) => {
    const work = tmp('hdl-mcp-');
    const cfg = join(work, 'roundtrip.config.ts');
    const u = (p: string) => pathToFileURL(join(root, p)).href;
    writeFileSync(cfg, `import { defineConfig } from '${u('packages/playwright/src/index.ts')}';
import { profileDemoAdapter } from '${u('examples/profile-demo/adapter.ts')}';
import { displayNameContract } from '${u('examples/profile-demo/contract.ts')}';
const baseURL = process.env.HDL_TEST_URL!;
export default defineConfig({
  target: { name: 'profile-demo', baseURL }, allowedOrigins: [baseURL], syntheticDemo: true,
  adapter: profileDemoAdapter({ testToken: process.env.HDL_TEST_TOKEN!, user: process.env.HDL_TEST_USER!, password: process.env.HDL_TEST_PASSWORD! }),
  contract: displayNameContract(), corpus: { set: 'demo-a' }, artifactsDir: ${JSON.stringify(join(work, 'runs'))},
});
`);
    const c = Client.start(['--allow-run'], { HDL_TEST_URL: d.url, HDL_TEST_TOKEN: d.token, HDL_TEST_USER: d.credentials.user, HDL_TEST_PASSWORD: d.credentials.password }, work);
    try {
      const init = (await c.request('initialize', INIT)).result;
      assert.match(init.instructions, /hdl_run açık/);
      // --allow-run açıkken bile kök dışı yapılandırma dosyası çalıştırılmaz.
      const esc = (await c.request('tools/call', { name: 'hdl_run', arguments: { configPath: join(root, 'examples/profile-demo/roundtrip.config.ts') } })).error;
      assert.equal(esc?.code, -32602);
      c.notify('notifications/initialized');
      const r = (await c.call('hdl_run', { configPath: cfg, reproduce: false, shrink: false })).structuredContent;
      assert.equal(r.complete, true);
      assert.equal(r.exitCode, 1);
      assert.equal(r.exitMeaning, 'en az bir required assertion ihlali');
      assert.equal(r.syntheticDemo, true);
      assert.equal(r.attempts.length, 3);
      assert.deepEqual(r.findings.map((f: { fixtureId: string }) => f.fixtureId), ['tr-i.dotted-capital.002', 'combining.nfc-acute.001']);
      assert.ok(r.findings.every((f: { differenceClass: string; boundary: string }) => f.differenceClass === 'marks-stripped' && f.boundary === 'authored→readback'));
      assert.equal(r.findings[0].original.escaped, '\\u0130pek \\u00c7a\\u011flar');
      const first = r.attempts.find((a: { fixtureId: string }) => a.fixtureId === 'tr-i.dotted-capital.002');
      assert.equal(first.firstObservedDivergence.at, 'readback');
      assert.equal(first.cleanup, 'verified');
      assert.equal(d.stats.creates, 3, 'demo uygulamasında 3 kayıt yaratıldı');

      const rr = (await c.call('hdl_read_run', { runDir: r.runDir })).structuredContent;
      assert.equal(rr.runId, r.runId);
      assert.deepEqual(rr.findings.map((f: { id: string }) => f.id), r.findings.map((f: { id: string }) => f.id));

      const plan = (await c.call('hdl_plan_export', { runDir: r.runDir })).structuredContent;
      assert.ok(plan.included.includes('manifest.json') && plan.included.includes('report.html'));
      assert.ok(!plan.included.some((f: string) => f.startsWith('evidence/')), 'kanıt görselleri varsayılan dışarıda');

      assert.ok(c.stderr.some((l) => /exit 1/.test(l)), `koşu günlüğü stderr'e gitmeli:\n${c.stderr.join('\n')}`);
    } finally { await c.close(); }
  });
});
