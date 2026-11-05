// Redmine: Yeni iş > "Subject". Taze okuma: /issues/:id. Dışa aktarma: iş listesi > CSV (varsayılan seçenekler).
// Arama: iş listesinde "Subject contains" filtresi.
import { decodeCsv, parseCsv, cellFor } from '../src/csv.mjs';
import { readFileSync } from 'node:fs';
import redmineUser from './redmine-user.mjs';

const base = process.env.REDMINE_URL ?? 'http://localhost:8083';

export default {
  name: 'redmine-issue-subject',
  controlType: 'input-text',
  newContext: redmineUser.newContext,
  async create(page, value) {
    await page.goto(`${base}/projects/hdl/issues/new`);
    const field = page.locator('#issue_subject');
    await field.fill(value);
    const injected = await field.inputValue();
    await Promise.all([page.waitForLoadState('load'), page.locator('input[name="commit"]').first().click()]);
    const m = page.url().match(/\/issues\/(\d+)$/);
    if (!m) return { injected, rejected: ((await page.locator('#errorExplanation').textContent().catch(() => '')) || page.url()).trim().replace(/\s+/g, ' ') };
    return { injected, recordId: m[1] };
  },
  async readFresh(context, id) {
    const page = await context.newPage();
    await page.goto(`${base}/issues/${id}`);
    return page.locator('div.subject h3').textContent();
  },
  // Kullanıcının yaptığı gibi: iş listesi > "CSV" > diyalogda varsayılanlarla "Export".
  async exportValue(context, id) {
    const page = await context.newPage();
    await page.goto(`${base}/projects/hdl/issues?set_filter=1&f[]=status_id&op[status_id]=*&sort=id:desc`);
    await page.locator('a.csv').click();
    const form = page.locator('#csv-export-form');
    await form.waitFor();
    const encoding = await form.locator('[name="encoding"]').inputValue();
    const [resp, download] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('issues.csv')),
      page.waitForEvent('download'),
      form.locator('input[type="submit"]').click(),
    ]);
    const bytes = readFileSync(await download.path());
    const { charset, hasBom, text } = decodeCsv(bytes, resp.headers()['content-type']);
    const value = cellFor(parseCsv(text), { idColumn: '#', valueColumn: process.env.REDMINE_SUBJECT_COL ?? 'Subject', id });
    return { value, meta: { dialogEncoding: encoding, contentType: resp.headers()['content-type'], charset, hasBom } };
  },
  async search(context, query, id) {
    const page = await context.newPage();
    await page.goto(`${base}/projects/hdl/issues?set_filter=1&f[]=status_id&op[status_id]=*&f[]=subject&op[subject]=~&v[subject][]=${encodeURIComponent(query)}&per_page=100`);
    return { found: (await page.locator(`tr#issue-${id}`).count()) > 0 };
  },
};
