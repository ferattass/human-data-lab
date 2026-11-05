#!/usr/bin/env node
// Tur 3 bulgularının kendi kendine yeten tekrar üretimi (yerel Docker kurulumları ayaktayken).
//   node experiments/repro-round3.mjs wp       -> WordPress Hızlı Düzenle: adla etiket ataması yanlış etikete gider
//   node experiments/repro-round3.mjs redmine  -> Redmine wiki: "Cam" kaydı "Çam" sayfasının üzerine yazar
import { chromium } from '@playwright/test';

const which = process.argv[2] ?? 'all';
const tag = Date.now().toString(36);
const browser = await chromium.launch();

async function wp() {
  const base = process.env.WP_URL ?? 'http://localhost:8081';
  const pg = await browser.newPage();
  await pg.goto(`${base}/wp-login.php`);
  await pg.fill('#user_login', 'admin'); await pg.fill('#user_pass', 'admin12345');
  await Promise.all([pg.waitForURL(/wp-admin/), pg.click('#wp-submit')]);
  await pg.goto(`${base}/wp-admin/edit.php`);
  const api = (path, body) => pg.evaluate(async ([path, body]) => {
    // Düz kalıcı bağlantılarda /wp-json yönlendirilmez; rest_route her kurulumda çalışır.
    const r = await fetch(`/?rest_route=/wp/v2/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': window.wpApiSettings?.nonce ?? (await (await fetch('/wp-admin/admin-ajax.php?action=rest-nonce')).text()) }, body: JSON.stringify(body) });
    return r.json();
  }, [path, body]);
  // Her iki etiket de ayrı ayrı var; kullanıcı ikincisini adıyla yazar.
  const cases = [['Şiş', 'Sis'], ['año', 'ano'], ['Kül', 'Kul']];
  for (const [a, b] of cases) {
    const ta = await api('tags', { name: `${a}-${tag}` });
    const tb = b === 'Kul' ? null : await api('tags', { name: `${b}-${tag}` }); // Kul: hiç yok, yeni oluşmalı
    const post = await api('posts', { title: `hdl ${b} ${tag}`, status: 'publish' });
    await pg.goto(`${base}/wp-admin/edit.php`);
    const row = pg.locator(`#post-${post.id}`);
    await row.hover(); await row.locator('button.editinline').click();
    await pg.locator(`#edit-${post.id} textarea[name="tax_input[post_tag]"]`).fill(`${b}-${tag}`);
    await Promise.all([pg.waitForResponse((r) => r.url().includes('admin-ajax.php')), pg.locator(`#edit-${post.id} button.save`).click()]);
    await pg.goto(`${base}/wp-admin/edit.php`);
    const shown = (await pg.locator(`#post-${post.id} td.tags`).textContent()).trim();
    const ok = shown === `${b}-${tag}`;
    console.log(`${ok ? 'OK  ' : 'HATA'} WP Hızlı Düzenle: girilen "${b}-${tag}" -> "${shown}" (mevcut: ${ta.name}${tb ? ', ' + tb.name : ''})`);
  }
  await pg.close();
}

async function redmine() {
  const base = process.env.REDMINE_URL ?? 'http://localhost:8083';
  const pg = await browser.newPage();
  await pg.goto(`${base}/login`);
  await pg.fill('#username', 'admin'); await pg.fill('#password', 'admin12345');
  await Promise.all([pg.waitForURL((u) => !u.pathname.includes('login')), pg.click('#login-submit')]);
  const ident = `hdlwiki${tag}`;
  await pg.goto(`${base}/projects/new`);
  await pg.fill('#project_name', ident); await pg.fill('#project_identifier', ident);
  await Promise.all([pg.waitForLoadState('load'), pg.locator('input[name="commit"]').first().click()]);
  const save = async (title, text) => {
    await pg.goto(`${base}/projects/${ident}/wiki/${encodeURIComponent(title)}/edit`);
    await pg.locator('#content_text').fill(text);
    await Promise.all([pg.waitForLoadState('load'), pg.locator('input[name="commit"]').first().click()]);
  };
  for (const [a, b] of [['Çam', 'Cam'], ['Şiş', 'Sis'], ['Straße', 'Strasse'], ['Kır', 'Kir']]) {
    await save(a, `${a} sayfası`);
    await save(b, `${b} sayfası`);
    await pg.goto(`${base}/projects/${ident}/wiki/${encodeURIComponent(a)}`);
    const content = (await pg.locator('.wiki.wiki-page').textContent()).trim();
    const ok = content === `${a} sayfası`;
    console.log(`${ok ? 'OK  ' : 'HATA'} Redmine wiki: "${b}" kaydedildikten sonra "${a}" içeriği = "${content}"`);
  }
  await pg.close();
}

if (which === 'wp' || which === 'all') await wp();
if (which === 'redmine' || which === 'all') await redmine();
await browser.close();
