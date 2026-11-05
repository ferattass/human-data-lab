// Demo uygulaması adapter'ı. Uygulamaya özgü bilgi yalnız burada.
const base = process.env.BASE_URL ?? 'http://localhost:4310';

export default {
  name: 'demo-app',
  controlType: 'input-text',
  async create(page, value) {
    await page.goto(`${base}/people/new`);
    const field = page.getByLabel('Görünen ad', { exact: true });
    await field.fill(value);
    const injected = await field.inputValue();
    await Promise.all([page.waitForURL(/\/people\/\d+$|\/people$/), page.getByRole('button', { name: 'Kaydet' }).click()]);
    const m = page.url().match(/\/people\/(\d+)$/);
    if (!m) return { injected, rejected: (await page.getByRole('alert').textContent().catch(() => null)) ?? 'unknown' };
    return { injected, recordId: m[1] };
  },
  async readFresh(context, id) {
    const page = await context.newPage();
    await page.goto(`${base}/people/${id}`);
    return page.getByTestId('name').textContent();
  },
};
