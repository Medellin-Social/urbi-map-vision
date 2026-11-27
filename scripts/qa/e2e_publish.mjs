// Fase 1 del E2E: el realtor (agente activo) PUBLICA un inmueble por el form real
// /publicar. Devuelve el id del listing (para que el comprador lo visite después).
// Uso: node scripts/qa/e2e_publish.mjs --base <url> --email <realtor> --pass <pw> [--shots]
import { chromium } from "playwright";
import fs from "node:fs";

function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; }
const has = (n) => process.argv.includes(`--${n}`);
const BASE = arg("base", "https://web-medellin-social-dev.up.railway.app").replace(/\/$/, "");
const EMAIL = arg("email", "qa.auto.230228@example.com");
const PASS = arg("pass", "QaAuto-2026");
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const SHOTS = has("shots");
const SD = "/tmp/claude-1000/-home-edwlearn-urbi-map-vision/aeb7b0d8-5daf-4d5e-a581-6dc019c6b1da/scratchpad";

const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: "es-CO", userAgent: UA, viewport: { width: 1180, height: 1600 } });
await ctx.addInitScript(() => localStorage.setItem("medellin-social.lang", "es"));
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
page.on("requestfailed", (r) => { if (r.url().includes("listings-propios")) console.log("REQFAIL:", r.request?.().method?.() || "", r.url(), "→", r.failure()?.errorText); });
page.on("response", (r) => { if (r.url().includes("listings-propios") && r.request().method() === "POST") console.log("RESP:", r.status(), r.url()); });
const shot = async (n) => { if (SHOTS) await page.screenshot({ path: `${SD}/pub_${n}.png` }).catch(() => {}); };
const dismiss = async () => { for (let i = 0; i < 2; i++) { await page.keyboard.press("Escape").catch(() => {}); const c = page.getByRole("button", { name: /Cerrar|Close|Explorar la comunidad/i }).first(); if (await c.count()) await c.click({ force: true }).catch(() => {}); await page.waitForTimeout(250); } };
const cont = async () => { const b = page.getByRole("button", { name: /^Continuar|Siguiente/i }).first(); await b.scrollIntoViewIfNeeded().catch(() => {}); await b.click({ force: true }).catch(() => {}); await page.waitForTimeout(900); };

try {
  // login
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').last().fill(EMAIL);
  const pw = page.locator('input[type="password"]').first(); await pw.fill(PASS);
  await Promise.all([page.waitForResponse((r) => r.url().includes("/auth/login"), { timeout: 10000 }).catch(() => null), pw.press("Enter")]);
  await page.waitForTimeout(1500);
  console.log("login ok:", await page.evaluate(() => !!localStorage.getItem("medellin-social.user")));

  await page.goto(`${BASE}/publicar`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500); await dismiss(); await shot("0land");

  // elegir "Soy agente verificado"
  const agente = page.getByRole("button", { name: /Soy agente verificado/i }).first();
  if (await agente.count()) { await agente.click({ force: true }); await page.waitForTimeout(1200); }
  await shot("1basic");

  // Paso 1: operación Venta, tipo Apartamento, precio
  await page.getByRole("button", { name: /^Venta$/ }).first().click({ force: true }).catch(() => {});
  await page.getByRole("button", { name: /^Apartamento$/ }).first().click({ force: true }).catch(() => {});
  // precio: primer input numérico vacío de la tarjeta (placeholder "0")
  const precio = page.locator('input[placeholder="0"]').first();
  if (await precio.count()) await precio.fill("480000000");
  await shot("1filled"); await cont();

  // Paso 2: Características — área + habitaciones + baños (requeridos por el guard)
  await shot("2carac");
  const nums = page.locator('input[placeholder="0"]');
  if (await nums.count()) await nums.nth(0).fill("72").catch(() => {});   // área
  // chips: primer botón con ese valor DESPUÉS del label del grupo
  await page.getByText(/^Habitaciones$/).first().locator("xpath=following::button[normalize-space()='3'][1]").click({ force: true }).catch(() => {});
  await page.getByText(/^Baños$/).first().locator("xpath=following::button[normalize-space()='2'][1]").click({ force: true }).catch(() => {});
  await page.waitForTimeout(400); await shot("2filled"); await cont();

  // Paso 3: Ubicación — municipio→comuna→barrio (cascada), dirección+geocode, descripción, foto
  await shot("3ubic");
  // cascada de selects: municipio=MEDELLIN → comuna=EL POBLADO → barrio (por texto, no índice)
  const selByText = async (sel, re, fallbackIdx) => {
    const opt = sel.locator("option", { hasText: re }).first();
    const val = (await opt.count()) ? await opt.getAttribute("value").catch(() => null) : null;
    if (val) await sel.selectOption(val).catch(() => {});
    else await sel.selectOption({ index: fallbackIdx }).catch(() => {});
  };
  await selByText(page.locator("select").first(), /medell/i, 1);
  await page.waitForTimeout(1400);
  const s2 = page.locator("select"); if (await s2.count() >= 2) { await selByText(s2.nth(1), /poblado/i, 1); await page.waitForTimeout(1400); }
  const s3 = page.locator("select"); if (await s3.count() >= 3) { await s3.nth(2).selectOption({ index: 1 }).catch(() => {}); await page.waitForTimeout(800); }
  const dir = page.getByPlaceholder(/Ej: Carrera 35|Carrera 35/i).first();
  if (await dir.count()) await dir.fill("Carrera 34 #7 Sur, El Poblado, Medellín");
  const ubicar = page.getByRole("button", { name: /Ubicar por dirección/i }).first();
  if (await ubicar.count()) { await ubicar.click({ force: true }); await page.waitForTimeout(2500); }
  // fallback: si no quedó pin, clic al centro del mapa para fijar lat/lon
  const mapa = page.locator(".mapboxgl-canvas, canvas").first();
  if (await mapa.count()) await mapa.click({ position: { x: 290, y: 150 } }).catch(() => {});
  await page.waitForTimeout(800);
  const desc = page.getByPlaceholder(/Describe las características/i).first();
  if (await desc.count()) await desc.fill("Apartamento remodelado en El Poblado, excelente ubicación cerca de parques, transporte y zonas comerciales. Ideal para vivir o invertir.");
  // foto REQUERIDA: sube una imagen real del repo al input file oculto
  const file = page.locator('input[type="file"]').first();
  if (await file.count()) { await file.setInputFiles("docs/dash.jpg").catch((e) => console.log("foto fail:", String(e).slice(0, 80))); await page.waitForTimeout(2500); }
  await page.waitForTimeout(500); await shot("3filled"); await cont();

  // Paso 4: Legal — marcar todas las declaraciones + aceptaciones
  await shot("4legal");
  const checks = page.locator('input[type="checkbox"]');
  const cc = await checks.count();
  for (let i = 0; i < cc; i++) { await checks.nth(i).check({ force: true }).catch(() => {}); }
  // algunas "declaraciones" son botones sí/no → clic en "Sí"
  const sis = page.getByRole("button", { name: /^S[íi]$/ });
  const sc = await sis.count();
  for (let i = 0; i < sc; i++) { await sis.nth(i).click({ force: true }).catch(() => {}); }
  await shot("4filled"); await cont();

  // Paso 5: Contacto — teléfono (requerido) + aceptaciones, luego Publicar
  await shot("5contact");
  const tel5 = page.getByPlaceholder(/\+57 300|300 000 0000/i).first();
  if (await tel5.count()) await tel5.fill("3001112233");
  const acc = page.locator('input[type="checkbox"]');
  const nacc = await acc.count();
  for (let i = 0; i < nacc; i++) await acc.nth(i).check({ force: true }).catch(() => {});
  await page.waitForTimeout(500); await shot("5filled");
  // capturar la respuesta del POST de publicación
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/listings-propios") && r.request().method() === "POST", { timeout: 20000 }).catch(() => null),
    (async () => { const b = page.getByRole("button", { name: /Publicar/i }).first(); await b.scrollIntoViewIfNeeded().catch(() => {}); await b.click({ force: true }).catch(() => {}); })(),
  ]);
  await page.waitForTimeout(2000); await shot("6done");
  let id = null, status = resp ? resp.status() : null;
  if (resp) { try { id = (await resp.json()).id; } catch { /* */ } }
  console.log(`PUBLISH status=${status} listing_id=${id}`);
  if (id) fs.writeFileSync(`${SD}/qa_listing_id.txt`, String(id));
  const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 200).replace(/\n+/g, " | ");
  console.log("pantalla final:", body);
} finally {
  await browser.close();
}
