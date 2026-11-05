// Demo uygulaması — benzersiz adlı sayfalar (wiki benzeri). Çakışma koşucusu için.
const base = process.env.BASE_URL ?? 'http://localhost:4310';

export default {
  name: 'demo-pages',
  async save(page, { name, body }) {
    await page.goto(`${base}/pages/edit?name=${encodeURIComponent(name)}`);
    await page.getByLabel('İçerik').fill(body);
    await Promise.all([page.waitForURL(/\/pages\/\d+$|\/pages$/), page.getByRole('button', { name: 'Kaydet' }).click()]);
    const m = page.url().match(/\/pages\/(\d+)$/);
    if (!m) return { rejected: (await page.getByRole('alert').textContent().catch(() => null)) ?? 'unknown' };
    return { recordId: m[1] };
  },
  async read(context, id) {
    const page = await context.newPage();
    await page.goto(`${base}/pages/${id}`);
    return { name: await page.getByTestId('page-name').textContent(), body: await page.getByTestId('page-body').textContent() };
  },
};
