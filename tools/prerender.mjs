#!/usr/bin/env node
// Пререндер для поисковиков и AI-краулеров (они не выполняют JS): берёт I18N, данные и LEGAL из index.html и пишет
// статичный текст в разметку. index.html — немецкая версия (правится на месте), en/index.html и ru/index.html,
// impressum/, datenschutz/, sitemap.xml и llms.txt генерируются целиком — руками их не править.
// Запуск после правки текстов, данных или LEGAL: node tools/prerender.mjs   (--check: только проверить, код 1 если устарело)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://profidev.de';
const LANGS = ['de', 'en', 'ru'];
const PATH = { de: '/', en: '/en/', ru: '/ru/' };
const LOCALE = { de: 'de_DE', en: 'en_US', ru: 'ru_RU' };
const NAME = 'Aleksei Chasovskoi', NAME_RU = 'Алексей Часовской';
const SAME_AS = ['https://www.linkedin.com/in/aleksei-chasovskoi/', 'https://t.me/a1exeych'];
const ADDRESS = { '@type': 'PostalAddress', addressLocality: 'Roth', postalCode: '91154', addressRegion: 'Bayern', addressCountry: 'DE' };
const CHECK = process.argv.includes('--check');

const src = readFileSync(join(ROOT, 'index.html'), 'utf8');
const between = (s, a, b) => {
  const i = s.indexOf(a), j = s.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error(`marker not found: ${i < 0 ? a : b}`);
  return s.slice(i, j);
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pad = n => String(n).padStart(2, '0');

/* ---------- data from index.html ---------- */
// the same code the page runs; DOM calls are stubbed (the JOBS block writes #tl, the language picker reads storage)
const D = new Function('document', 'location', 'localStorage', '$', '$$', 'esc', 'pad',
  between(src, '/* ================= I18N', '/* ================= GEAR GEOMETRY') +
  between(src, '/* ==== LEGAL ==== */', 'function openLegal') +
  '\nreturn { I18N, PROJECTS, CERTS, JOBS, KN_ORDER, KN_NODES, LEGAL };'
)({ documentElement: { lang: 'de' } }, { pathname: '/prerender' }, { getItem: () => null }, () => ({}), () => [], esc, pad);
const tr = (l, k) => D.I18N[l][k] ?? D.I18N.ru[k] ?? k;
const fmtDate = (s, l) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Intl.DateTimeFormat(l, d ? { day: 'numeric', month: 'long', year: 'numeric' } : { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, d || 1));
};
const nodeTitle = (l, n) => n.name ?? tr(l, 'kn.n.' + n.id);
const nodesOf = (l, cat) => D.KN_NODES.filter(n => n.cat === cat).sort((a, b) => (b.hub ? 1 : 0) - (a.hub ? 1 : 0));
const jobTitle = (l, j) => j.free ? tr(l, 'job.free') : j.name;
const jobRole = (l, j) => tr(l, j.free ? 'job.freeC' : `job.${j.key}.r`);
const jobDesc = (l, j) => tr(l, j.free ? 'job.freeD' : `job.${j.key}`);
const jobTags = (l, j) => j.tags.map(x => x[0] === '#' ? tr(l, 'job.t.' + x.slice(1)) : x);
const realProjects = D.PROJECTS.filter(p => p.key);
const projName = (l, p) => p.name || tr(l, `prj.${p.key}.t`);
const FAQ_N = Object.keys(D.I18N.de).filter(k => /^faq\.\d+\.q$/.test(k)).length;

/* ---------- static snapshots: the page script replaces them with the interactive versions ---------- */
const SNAP = {
  tl: l => `<ol class="pr-snap">${D.JOBS.map(j => `<li><h3>${esc(jobTitle(l, j))}</h3><p>${esc(jobRole(l, j))}${j.parent ? ' · ' + esc(j.parent) : ''}${j.from ? ' · ' + esc(j.from) : ''}</p>` +
    `<p>${esc(jobDesc(l, j))}</p><p>${esc(jobTags(l, j).join(', '))}</p></li>`).join('')}</ol>`,
  knList: l => D.KN_ORDER.map(c => `<section class="pr-snap"><h3>${esc(tr(l, 'kn.cat.' + c))}</h3><ul>${nodesOf(l, c).map(n => `<li>${esc(nodeTitle(l, n))}</li>`).join('')}</ul></section>`).join(''),
  certGal: l => `<ul class="pr-snap">${D.CERTS.map(c => `<li><h3>${esc(tr(l, 'cert.' + c.key))}</h3><p>${esc(c.org)} · ${esc(fmtDate(c.date, l))}${c.no ? ' · ID ' + esc(c.no) : ''}</p>` +
    `<p>${esc(tr(l, `cert.${c.key}.i`))}</p>${c.verify ? `<a href="${esc(c.verify)}">${esc(tr(l, 'cert.check'))}</a>` : ''}</li>`).join('')}</ul>`,
  carousel: l => realProjects.map(p => `<article class="pr-snap"><h3>${esc(projName(l, p))}</h3><p>${esc(tr(l, 'cat.' + p.cat))} · ${esc(p.tags.join(', '))}</p>` +
    `<p>${esc(tr(l, `prj.${p.key}.d`))}</p><p>${esc(tr(l, `prj.${p.key}.lead`))}</p>` +
    [0, 1, 2].map(k => `<h4>${esc(tr(l, 'pm.t' + k))}</h4><p>${esc(tr(l, `prj.${p.key}.p${k}`))}</p>`).join('') +
    (p.url ? `<a href="${esc(p.url)}">${esc(p.url)}</a>` : '') + '</article>').join(''),
};

function setBlock(html, name, content, anchorId) {
  const block = `<!-- prerender:${name} -->${content}<!-- /prerender:${name} -->`;
  const re = new RegExp(`<!-- prerender:${name} -->[\\s\\S]*?<!-- /prerender:${name} -->`);
  if (re.test(html)) return html.replace(re, () => block);
  if (!anchorId) throw new Error(`no marker prerender:${name}`);
  const i = html.indexOf(`id="${anchorId}"`), j = html.indexOf('>', i) + 1;
  if (i < 0) throw new Error(`no element #${anchorId}`);
  return html.slice(0, j) + block + html.slice(j);
}

/* ---------- head + JSON-LD ---------- */
function jsonLd(l) {
  const url = SITE + PATH[l], P = { '@id': SITE + '/#person' };
  const graph = [
    { '@type': 'WebSite', '@id': SITE + '/#website', url: SITE + '/', name: 'profidev.de', inLanguage: LANGS, publisher: P },
    { '@type': 'ProfilePage', '@id': url + '#webpage', url, name: tr(l, 'meta.title'), description: tr(l, 'meta.desc'), inLanguage: l,
      isPartOf: { '@id': SITE + '/#website' }, about: P, mainEntity: P, primaryImageOfPage: SITE + '/img/og.jpg' },
    { '@type': 'Person', '@id': SITE + '/#person', name: NAME, alternateName: NAME_RU, url: SITE + '/', image: SITE + '/img/photo.webp',
      jobTitle: tr(l, 'meta.job'), description: tr(l, 'meta.desc'), email: 'mailto:info@profidev.de', address: ADDRESS,
      worksFor: { '@id': SITE + '/#service' }, knowsLanguage: LANGS, sameAs: SAME_AS,
      knowsAbout: [...new Set(D.KN_ORDER.flatMap(c => nodesOf(l, c).filter(n => n.hub || n.name).map(n => nodeTitle(l, n))))],
      alumniOf: D.JOBS.filter(j => j.name).map(j => ({ '@type': 'Organization', name: j.name, ...(j.parent && { parentOrganization: { '@type': 'Organization', name: j.parent } }) })),
      hasCredential: D.CERTS.map(c => ({ '@type': 'EducationalOccupationalCredential', name: tr(l, 'cert.' + c.key), credentialCategory: 'certificate',
        recognizedBy: { '@type': 'Organization', name: c.org }, dateCreated: c.date, ...(c.no && { identifier: c.no }), ...(c.verify && { url: c.verify }) })) },
    { '@type': 'ProfessionalService', '@id': SITE + '/#service', name: 'profidev', url: SITE + '/', image: SITE + '/img/og.jpg',
      description: tr(l, 'meta.desc'), founder: P, email: 'info@profidev.de', address: ADDRESS, knowsLanguage: LANGS,
      areaServed: [{ '@type': 'City', name: 'Nürnberg' }, { '@type': 'State', name: 'Bayern' }, { '@type': 'Country', name: 'Deutschland' }],
      hasOfferCatalog: { '@type': 'OfferCatalog', name: tr(l, 'svc.title'),
        itemListElement: [0, 1, 2].map(k => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: tr(l, `svc.${k}.t`), description: tr(l, `svc.${k}.d`), provider: P } })) } },
    ...realProjects.map(p => ({ '@type': 'CreativeWork', '@id': SITE + '/#' + p.key, name: projName(l, p), description: tr(l, `prj.${p.key}.d`),
      creator: P, keywords: p.tags.join(', '), inLanguage: l, ...(p.shots && { image: `${SITE}/${p.shots[0].src}` }), ...(p.url && { url: p.url }) })),
    { '@type': 'FAQPage', '@id': url + '#faq', inLanguage: l, mainEntity: [...Array(FAQ_N).keys()].map(k => ({ '@type': 'Question', name: tr(l, `faq.${k}.q`),
      acceptedAnswer: { '@type': 'Answer', text: tr(l, `faq.${k}.a`) } })) },
  ];
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}
function head(l) {
  const url = SITE + PATH[l], title = tr(l, 'meta.title'), desc = tr(l, 'meta.desc'), img = SITE + '/img/og.jpg';
  return ['', `<title>${esc(title)}</title>`, `<meta name="description" content="${esc(desc)}">`, `<link rel="canonical" href="${url}">`,
    ...LANGS.map(x => `<link rel="alternate" hreflang="${x}" href="${SITE + PATH[x]}">`), `<link rel="alternate" hreflang="x-default" href="${SITE}/">`,
    '<!-- Open Graph / LinkedIn preview: img/og.jpg — screenshot of slide "about" (de), 1200×627 -->',
    '<meta property="og:type" content="website">', `<meta property="og:url" content="${url}">`, '<meta property="og:site_name" content="profidev.de">',
    `<meta property="og:locale" content="${LOCALE[l]}">`, ...LANGS.filter(x => x !== l).map(x => `<meta property="og:locale:alternate" content="${LOCALE[x]}">`),
    `<meta property="og:title" content="${esc(title)}">`, `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:image" content="${img}">`, '<meta property="og:image:type" content="image/jpeg">',
    '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="627">',
    `<meta property="og:image:alt" content="${esc(NAME + ' — ' + tr(l, 'meta.job'))}">`,
    '<meta name="twitter:card" content="summary_large_image">', `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`, `<meta name="twitter:image" content="${img}">`,
    `<script type="application/ld+json">${jsonLd(l)}</script>`, ''].join('\n');
}

/* ---------- page text ---------- */
const ATTR = { aria: 'aria-label', ph: 'placeholder', alt: 'alt' };
function fillText(part, l) {
  // leaf elements with data-i18n (form error hints stay empty: they are hidden until validation)
  part = part.replace(/(<([a-z][a-z0-9]*)\b[^>]*?\sdata-i18n="([^"]+)"[^>]*>)[^<]*(<\/\2>)/g,
    (m, open, tag, k, close) => open + (/Err$/.test(k) ? '' : esc(tr(l, k))) + close);
  // attributes from data-i18n-aria / -ph / -alt
  part = part.replace(/<[a-z][^>]*\sdata-i18n-(?:aria|ph|alt)="[^"]+"[^>]*>/g, tag => {
    for (const [x, attr] of Object.entries(ATTR)) {
      const k = tag.match(new RegExp(`\\sdata-i18n-${x}="([^"]+)"`))?.[1];
      if (!k) continue;
      tag = tag.replace(new RegExp(`\\s${attr}="[^"]*"`), '').replace(`data-i18n-${x}="${k}"`, `data-i18n-${x}="${k}" ${attr}="${esc(tr(l, k))}"`);
    }
    return tag;
  });
  return part
    .replace(/(id="navVal">)[^<]*/, `$1${esc(tr(l, 'nav.0'))}`)
    .replace(/(id="langVal">)[^<]*/, `$1${l.toUpperCase()}`)
    .replace(/(<b data-count="(\d+)">)[^<]*/g, '$1$2');
}
// asset paths in index.html are relative (img/…, fonts/…) so the file also opens via file://;
// pages one folder deeper (en/, ru/, impressum/, datenschutz/) get ../ in front
const upOne = html => html.replace(/(["'`(])(img|fonts)\//g, '$1../$2/')
  .replace(/href="(favicon\.ico|apple-touch-icon\.png)"/g, 'href="../$1"');
function page(l) {
  let html = src.replace(/<html lang="[^"]*">/, `<html lang="${l}">`);
  html = setBlock(html, 'head', head(l));
  for (const [id, fn] of Object.entries(SNAP)) html = setBlock(html, id, fn(l), id);
  const a = html.indexOf('<header class="nav">'), b = html.indexOf('</main>');
  if (a < 0 || b < 0) throw new Error('header/main not found');
  html = html.slice(0, a) + fillText(html.slice(a, b), l) + html.slice(b);
  return l === 'de' ? html : upOne(html);
}

/* ---------- Impressum / Datenschutz as real pages (German only) ---------- */
const BASE_CSS = between(src, '/* ==== FONTS', '/* ============ BACKGROUND');
const LG_CSS = src.match(/^\.lg[ -][^\n]*$/gm).join('\n');
function legalPage(k, slug) {
  const title = tr('de', 'lg.' + k);
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} – ${NAME}</title>
<meta name="description" content="${esc(title)} von profidev.de – ${NAME}, Softwareentwickler aus Nürnberg.">
<link rel="canonical" href="${SITE}/${slug}/">
<link rel="icon" href="../img/favicon.svg" type="image/svg+xml">
<link rel="icon" href="../favicon.ico" sizes="48x48">
<link rel="apple-touch-icon" href="../apple-touch-icon.png">
<style>
${upOne(BASE_CSS)}
body{height:auto;overflow:auto}
.lg-page{max-width:760px;margin:0 auto;padding:40px 20px 64px}
.lg-page h1{font-family:var(--f-display);font-weight:800;font-size:clamp(28px,5vw,40px);margin:18px 0 26px}
.back{color:var(--verd);font-family:var(--f-mono);font-size:13px;text-decoration:none}
.back:hover{text-decoration:underline}
${LG_CSS}
</style>
<script>try{var m=localStorage.getItem('pf-theme');if(m=='light'||m=='dark')document.documentElement.dataset.theme=m}catch(e){}</script>
</head>
<body>
<main class="lg-page">
<a class="back" href="/">← profidev.de</a>
<h1>${esc(title)}</h1>
<div class="lg">${D.LEGAL[k]}</div>
</main>
</body>
</html>
`;
}

/* ---------- sitemap.xml, llms.txt ---------- */
function sitemap() {
  const alt = LANGS.map(x => `    <xhtml:link rel="alternate" hreflang="${x}" href="${SITE + PATH[x]}"/>`).join('\n') +
    `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${LANGS.map(x => `  <url>\n    <loc>${SITE + PATH[x]}</loc>\n${alt}\n  </url>`).join('\n')}
  <url><loc>${SITE}/impressum/</loc></url>
  <url><loc>${SITE}/datenschutz/</loc></url>
</urlset>
`;
}
function llms() {
  const l = 'de', T = k => tr(l, k);
  return [`# ${NAME} – profidev.de`, '', `> ${T('meta.desc')}`, '', T('hero.lead'), '',
    `${T('meta.job')}, ${T('c.city')}. ${T('hero.c1')}, ${T('hero.c2').toLowerCase()}. Sprachen: Deutsch, Englisch, Russisch.`, '',
    `## ${T('svc.title')}`, ...[0, 1, 2].map(k => `- **${T(`svc.${k}.t`)}**: ${T(`svc.${k}.d`)}`), '',
    `## ${T('path.title')}`, ...D.JOBS.map(j => `- **${jobTitle(l, j)}**${j.parent ? ` (${j.parent})` : ''}, ab ${j.from}: ${jobRole(l, j)}. ${jobDesc(l, j)} Technologien: ${jobTags(l, j).join(', ')}.`), '',
    `## ${T('nav.4')}`, ...realProjects.map(p => `- **${projName(l, p)}**${p.url ? ` (${p.url})` : ''}: ${T(`prj.${p.key}.d`)} Stack: ${p.tags.join(', ')}.`), '',
    `## ${T('nav.3')}`, ...D.CERTS.map(c => `- ${T('cert.' + c.key)} – ${c.org}, ${fmtDate(c.date, l)}${c.verify ? ` – Prüfen: ${c.verify}` : ''}`), '',
    `## ${T('kn.title')}`, ...D.KN_ORDER.map(c => `- ${T('kn.cat.' + c)}: ${nodesOf(l, c).map(n => nodeTitle(l, n)).join(', ')}`), '',
    `## ${T('faq.title')}`, ...[...Array(FAQ_N).keys()].flatMap(k => [`### ${T(`faq.${k}.q`)}`, T(`faq.${k}.a`), '']),
    `## ${T('nav.5')}`, '- E-Mail: info@profidev.de', '- Telegram: https://t.me/a1exeych', `- LinkedIn: ${SAME_AS[0]}`, `- Ort: ${T('c.city')}, Deutschland`, '',
    '## Seiten', `- [Deutsch](${SITE}/)`, `- [English](${SITE}/en/)`, `- [Русский](${SITE}/ru/)`,
    `- [Impressum](${SITE}/impressum/)`, `- [Datenschutzerklärung](${SITE}/datenschutz/)`, ''].join('\n');
}

/* ---------- write ---------- */
const out = {
  'index.html': page('de'), 'en/index.html': page('en'), 'ru/index.html': page('ru'),
  'impressum/index.html': legalPage('imprint', 'impressum'), 'datenschutz/index.html': legalPage('privacy', 'datenschutz'),
  'sitemap.xml': sitemap(), 'llms.txt': llms(),
};
let stale = 0;
for (const [f, content] of Object.entries(out)) {
  const p = join(ROOT, f), old = existsSync(p) ? readFileSync(p, 'utf8') : null;
  if (old === content) continue;
  stale++;
  if (CHECK) { console.log('outdated:', f); continue; }
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  console.log('written:', f);
}
if (CHECK && stale) { console.error('run: node tools/prerender.mjs'); process.exit(1); }
if (!stale) console.log('up to date');
