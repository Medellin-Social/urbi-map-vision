// Fase 2 del E2E: el usuario SUSCRITO (pro) abre el listing del realtor, ve su
// scope y AGENDA UNA VISITA por el modal real. Debe aterrizar en el realtor dueño.
// Uso: node scripts/qa/e2e_visit.mjs --base <url> --email <buyer> --pass <pw> --listing <intId>
import { chromium } from "playwright";

function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; }
const BASE = arg("base", "https://web-medellin-social-dev.up.railway.app").replace(/\/$/, "");
const EMAIL = arg("email", "");
const PASS = arg("pass", "");
const LISTING = arg("listing", "1387164741");
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const SD = "/tmp/claude-1000/-home-edwlearn-urbi-map-vision/aeb7b0d8-5daf-4d5e-a581-6dc019c6b1da/scratchpad";

const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: "es-CO", userAgent: UA, viewport: { width: 1280, height: 1500 } });
await ctx.addInitScript(() => localStorage.setItem("medellin-social.lang", "es"));
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
page.on("request", (r) => { if (/visita/i.test(r.url())) console.log("REQ:", r.method(), r.url().replace(/https?:\/\/[^/]+/, "")); });
page.on("response", (r) => { if (/visita/i.test(r.url())) console.log("RESP:", r.status(), r.request().method(), r.url().replace(/https?:\/\/[^/]+/, "")); });
page.on("requestfailed", (r) => { if (/visita/i.test(r.url())) console.log("REQFAIL:", r.url().replace(/https?:\/\/[^/]+/, ""), "→", r.failure()?.errorText); });
const shot = (n) => page.screenshot({ path: `${SD}/visit_${n}.png` }).catch(() => {});
// OJO: NO usar Escape — cierra el drawer que abre el deep-link. Solo cerrar el modal de bienvenida por su botón.
const dismiss = async () => { const c = page.getByRole("button", { name: /Explorar la comunidad|Saltar recorrido/i }).first(); if (await c.count()) await c.click({ force: true }).catch(() => {}); await page.waitForTimeout(400); };

try {
  // login buyer
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').last().fill(EMAIL);
  const pw = page.locator('input[type="password"]').first(); await pw.fill(PASS);
  await Promise.all([page.waitForResponse((r) => r.url().includes("/auth/login"), { timeout: 10000 }).catch(() => null), pw.press("Enter")]);
  await page.waitForTimeout(1500);
  console.log("buyer login:", await page.evaluate(() => !!localStorage.getItem("medellin-social.user")));
  console.log("plan:", await page.evaluate(() => { try { return JSON.parse(localStorage.getItem("medellin-social.user")).plan; } catch { return "?"; } }));

  // abrir el listing del realtor por deep-link (el mapa nunca queda "idle" → domcontentloaded)
  await page.goto(`${BASE}/map?listing=${LISTING}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000); await dismiss(); await page.waitForTimeout(2500);
  await shot("1map");
  // El deep-link debe abrir el drawer del listing directamente. Si abre un popup mini, expandir.
  let agendar = page.getByRole("button", { name: /Agendar visita/i }).first();
  if (!(await agendar.count())) {
    // tal vez abrió el popup mini → clic en "ver detalle/inmueble" para el drawer completo
    const verMas = page.getByRole("button", { name: /ver (más|detalle|inmueble)|detalle completo|más info/i }).first();
    if (await verMas.count()) { await verMas.click({ force: true }); await page.waitForTimeout(2000); agendar = page.getByRole("button", { name: /Agendar visita/i }).first(); }
  }
  await shot("1c_drawer");
  const body = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
  console.log("scope (pro) visible — yield/rentab/mercado:", /yield|rentabilidad|rendimiento|precio justo|mercado|valorizaci/.test(body));
  if (!(await agendar.count())) { console.log("NO hay botón Agendar visita"); await shot("1x_nobtn"); throw new Error("sin botón"); }
  await agendar.scrollIntoViewIfNeeded().catch(() => {});
  await agendar.click({ force: true });
  await page.waitForTimeout(1500); await shot("2modal");

  // día HOY ya viene seleccionado. Falta: HORA (select tras "Elige una hora") + TELÉFONO.
  const horaSel = page.locator('xpath=//*[contains(text(),"Elige una hora")]/following::select[1]');
  const nopt = await horaSel.locator("option").count().catch(() => 0);
  console.log("hora options:", nopt);
  if (nopt > 1) await horaSel.selectOption({ index: 1 }).catch((e) => console.log("hora fail", String(e).slice(0, 60)));
  else { // sin slots: avanzar día hasta que haya horas
    for (const d of ["26", "27", "28"]) {
      await page.getByText(new RegExp(`^${d}$`)).first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(800);
      if (await horaSel.locator("option").count() > 1) { await horaSel.selectOption({ index: 1 }).catch(() => {}); break; }
    }
  }
  const tel = page.getByPlaceholder(/300 000 0000/i).first();
  if (await tel.count()) await tel.fill("3009990000").catch(() => {});
  await page.waitForTimeout(500); await shot("2filled");

  // Solicitar visita
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/visitas") && r.request().method() === "POST", { timeout: 15000 }).catch(() => null),
    (async () => { const b = page.getByRole("button", { name: /Solicitar visita/i }).first(); await b.scrollIntoViewIfNeeded().catch(() => {}); await b.click({ force: true }).catch(() => {}); })(),
  ]);
  await page.waitForTimeout(1500); await shot("3done");
  console.log("SOLICITAR status:", resp ? resp.status() : "sin resp");
  const after = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
  console.log("confirmación visible:", /enviad|solicitud|recibim|te contact|gracias/.test(after));
} finally {
  await browser.close();
}
