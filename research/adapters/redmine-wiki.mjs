// Redmine: proje wiki sayfası (benzersiz başlık). Çakışma koşucusu için.
// Kaydetme sonrası Redmine /wiki/<GerçekBaşlık> adresine yönlendirir; recordId = o başlık (uygulamanın yazdığı sayfa).
const base = process.env.REDMINE_URL ?? 'http://localhost:8083';
const project = process.env.REDMINE_WIKI_PROJECT ?? `hdlwiki${Date.now().toString(36)}`;
let state;

export default {
  name: 'redmine-wiki',
  async newContext(browser) {
    if (!state) {
      const ctx = await browser.newContext();
      const p = await ctx.newPage();
      await p.goto(`${base}/login`);
      await p.fill('#username', 'admin');
      await p.fill('#password', 'admin12345');
      await Promise.all([p.waitForURL((u) => !u.pathname.includes('login')), p.click('#login-submit')]);
      // Deney projesi: env verilmediyse her koşuda yeni proje (wiki modülü varsayılan açık)
      if (!process.env.REDMINE_WIKI_PROJECT) {
        await p.goto(`${base}/projects/new`);
        await p.fill('#project_name', project);
        await p.fill('#project_identifier', project);
        await Promise.all([p.waitForLoadState('load'), p.locator('input[name="commit"]').first().click()]);
      }
      state = await ctx.storageState();
      await ctx.close();
    }
    return browser.newContext({ storageState: state });
  },
  async save(page, { name, body }) {
    await page.goto(`${base}/projects/${project}/wiki/${encodeURIComponent(name)}/edit`);
    await page.locator('#content_text').fill(body);
    await Promise.all([page.waitForLoadState('load'), page.locator('input[name="commit"]').first().click()]);
    const m = new URL(page.url()).pathname.match(new RegExp(`/projects/${project}/wiki/([^/]+)$`));
    if (!m) return { rejected: ((await page.locator('#errorExplanation').textContent().catch(() => '')) || page.url()).trim().replace(/\s+/g, ' ') };
    return { recordId: decodeURIComponent(m[1]) };
  },
  async read(context, id) {
    const page = await context.newPage();
    await page.goto(`${base}/projects/${project}/wiki/${encodeURIComponent(id)}`);
    // Sayfa adı: URL'deki kanonik başlık (Redmine boşluğu '_' yapar; burada boşluk yok).
    return { name: decodeURIComponent(new URL(page.url()).pathname.split('/').pop()), body: (await page.locator('.wiki.wiki-page').textContent()).trim() };
  },
};
