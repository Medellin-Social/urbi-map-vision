// Onboarding REAL por UI — el agente actúa como humano y RELLENA los formularios
// (nada de seed): /register → /login → /agentes/registro (3 pasos) → submit.
// Reporta hasta dónde llega un realtor nuevo llenando formularios y dónde se topa
// con un muro (verificación de correo, aprobación de admin, etc.).
//
// Uso: node scripts/qa/onboard.mjs --base <url> [--email x@y.com] [--nombre "X"] [--shots]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dir = path.dirname(fileURLToPath(import.meta.url));

function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; }
const has = (n) => process.argv.includes(`--${n}`);
const BASE = arg("base", "http://localhost:5173").replace(/\/$/, "");
const STAMP = arg("stamp", "onboard");
const EMAIL = arg("email", `qa.form.${STAMP}@example.com`);
const NOMBRE = arg("nombre", "QA Form Realtor");
const TEL = arg("tel", "3004445566");
const PASS = arg("pass", "QaForm-2026");
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const SHOTS = has("shots");
const shotDir = "/tmp/claude-1000/-home-edwlearn-urbi-map-vision/aeb7b0d8-5daf-4d5e-a581-6dc019c6b1da/scratchpad";

const log = [];
function rec(step, ok, note) { log.push({ step, ok, note }); console.log(`${ok ? "🟢" : "🟠"} ${step} — ${note}`); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: "es-CO", userAgent: UA, viewport: { width: 1180, height: 1500 } });
await ctx.addInitScript(() => localStorage.setItem("medellin-social.lang", "es"));
const page = await ctx.newPage();
const api = (p) => page.waitForResponse((r) => r.url().includes(p), { timeout: 12000 }).catch(() => null);
const shot = async (n) => { if (SHOTS) await page.screenshot({ path: `${shotDir}/onboard_${STAMP}_${n}.png` }).catch(() => {}); };

// El registro dispara un modal de bienvenida ("¡Ya eres parte de Medellín Social!")
// que tapa los forms siguientes. Un humano lo cierra; nosotros también.
async function dismissModals() {
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Escape").catch(() => {});
    const close = page.getByRole("button", { name: /Cerrar|Close|✕|×/i }).first();
    if (await close.count()) await close.click({ force: true }).catch(() => {});
    // botón de cerrar sin label accesible: el ✕ suele ser el primer button del dialog
    const dlgClose = page.locator('[role="dialog"] button, .modal button').first();
    if (await dlgClose.count()) await dlgClose.click({ force: true }).catch(() => {});
    await page.waitForTimeout(300);
    if (!(await page.getByText(/Ya eres parte de Medellín Social/i).count())) break;
  }
}

try {
  // ── 1. Crear cuenta (/register) ──
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("Nombre completo").fill(NOMBRE);
  await page.getByPlaceholder("tu@correo.com").fill(EMAIL);
  const tel = page.getByPlaceholder(/300 123/); if (await tel.count()) await tel.first().fill(TEL);
  await page.getByPlaceholder(/Mínimo 8/).fill(PASS);
  const cb = page.locator('input[type="checkbox"]').first(); if (await cb.count()) await cb.check().catch(() => {});
  const [rReg] = await Promise.all([api("/auth/register"), page.getByRole("button", { name: /Crear cuenta/ }).click()]);
  await page.waitForTimeout(1000); await shot("1register");
  rec("1. registro (form)", rReg?.status() === 201, `POST /auth/register → ${rReg?.status() ?? "sin resp"}`);

  // ── 2. Iniciar sesión (/login) ──
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').last().fill(EMAIL);
  const pw = page.locator('input[type="password"]').first(); await pw.fill(PASS);
  const [rLog] = await Promise.all([api("/auth/login"), pw.press("Enter")]);
  await page.waitForTimeout(1200);
  const logged = await page.evaluate(() => !!localStorage.getItem("medellin-social.user"));
  rec("2. login (form)", rLog?.status() === 200 && logged, `POST /auth/login → ${rLog?.status() ?? "sin resp"}, sesión=${logged}`);

  // ── 3. Registrarse como agente (/agentes/registro, 3 pasos) ──
  await page.goto(`${BASE}/agentes/registro`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await dismissModals();   // cerrar el modal de bienvenida que tapa el form
  if (/\/login/.test(page.url())) { rec("3. form agente", false, "redirigido a /login — no hay sesión para el registro de agente"); }
  else {
    // paso 0: nombre + teléfono (requeridos)
    const nombreIn = page.locator('input[autocomplete="name"]').first();
    const telIn = page.locator('input[type="tel"]').first();
    if (await nombreIn.count()) await nombreIn.fill(NOMBRE);
    if (await telIn.count()) await telIn.fill(TEL);
    await shot("3a_paso0");
    // avanzar pasos 0→1→2 con el botón data-testid, luego enviar
    const next = page.locator('[data-testid="registro-siguiente"]');
    let submitResp = null;
    for (let i = 0; i < 3; i++) {
      const isLast = i === 2;
      if (isLast) { [submitResp] = await Promise.all([api("/agente/registro"), next.click({ force: true }).catch(() => {})]); }
      else { await next.click({ force: true }).catch(() => {}); }
      await page.waitForTimeout(900);
    }
    await shot("3b_submit");
    const status = submitResp?.status() ?? null;
    const errBody = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
    const verifyWall = /verific.*correo|verify.*email|debes verificar/.test(errBody);
    if (status === 201 || status === 200) rec("3. form agente", true, `POST /agente/registro → ${status}: agente creado (estado pendiente, falta aprobación admin)`);
    else if (status === 403 && verifyWall) rec("3. form agente", false, "MURO: POST /agente/registro → 403 'verifica tu correo' — un realtor NO puede completar el onboarding por UI sin verificar email (y no hay link en el flujo)");
    else if (status === 403) rec("3. form agente", false, `MURO: POST /agente/registro → 403 (${errBody.slice(0, 80)})`);
    else rec("3. form agente", false, `POST /agente/registro → ${status ?? "sin resp"} (${errBody.slice(0, 80)})`);
  }

  // ── 4. ¿Llega al dashboard del realtor? ──
  await page.goto(`${BASE}/realtor/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const body = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
  const roto = /could not load|no se pudo|error inesperado/.test(body);
  rec("4. dashboard como nuevo", !roto, roto ? "dashboard en estado de error (no es agente activo)" : "dashboard renderiza (sin datos de agente aún)");
} finally {
  await browser.close();
}

fs.mkdirSync(path.join(__dir, "report"), { recursive: true });
fs.writeFileSync(path.join(__dir, "report", `onboard-${STAMP}.json`), JSON.stringify({ base: BASE, email: EMAIL, steps: log }, null, 2));
const walls = log.filter((l) => !l.ok);
console.log(`\n═══ onboarding por formulario: ${log.filter((l) => l.ok).length}/${log.length} pasos OK ═══`);
if (walls.length) console.log(`MURO en: ${walls.map((w) => w.step).join(", ")}`);
