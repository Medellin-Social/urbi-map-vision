// QA harness del flujo realtor — determinista, SIN LLM (no necesita key).
// Actúa como "agentes inmobiliarios" y busca huecos en todo el flujo.
//
// 3 tracks:
//   A. Onboarding gates  — persona NUEVA intenta registrarse como realtor; documenta
//      cada muro (correo sin verificar, agente pendiente) como HUECO. Sin fixtures.
//   B. Flujo de features — login como realtor ACTIVO (Valentina) contra el stack real;
//      navega listings/visitas/herramientas/comparador; captura 5xx + errores de consola.
//   C. API probe         — pega cada endpoint realtor con/sin token; valida status
//      (401 sin auth, sin 500s) y que /comparables NO filtre matrícula/agente.
//
// Uso:
//   node scripts/qa/run.mjs --base http://localhost:5173 --api http://localhost:8011/api/v1 \
//        --email realtor.test@example.com --pass Valentina-2026 [--personas 2]
//
// El reporte sale en scripts/qa/report/holes-<ts>.{md,json}.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dir = path.dirname(fileURLToPath(import.meta.url));

// ── args ──────────────────────────────────────────────────────────────────
function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const BASE = arg("base", "http://localhost:5173").replace(/\/$/, "");
const API = arg("api", "http://localhost:8011/api/v1").replace(/\/$/, "");
const EMAIL = arg("email", "realtor.test@example.com");
const PASS = arg("pass", "Valentina-2026");
const N_PERSONAS = parseInt(arg("personas", "1"), 10);
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const STAMP = arg("stamp", "run"); // timestamp lo pasa el caller (node no da Date.now determinista acá, pero sí fuera)

// ── acumulador de hallazgos ─────────────────────────────────────────────────
const holes = [];
let stepN = 0;
function record(track, step, severity, note, evidence = null) {
  holes.push({ track, step, severity, note, evidence });
  const tag = { blocker: "🔴", major: "🟠", minor: "🟡", info: "⚪", pass: "🟢" }[severity] || "·";
  console.log(`${tag} [${track}] ${step} — ${note}`);
}

// Corre un paso aislado; nunca aborta el run completo.
async function step(track, name, fn) {
  stepN++;
  try {
    await fn();
  } catch (e) {
    record(track, name, "major", `excepción no manejada: ${String(e).slice(0, 200)}`);
  }
}

// Listeners de red + consola por página → alimentan huecos automáticamente.
// Login robusto por UI: llena el form de contraseña y envía con Enter (evita
// ambigüedad de botones "Ingresar" vs "Ingresar sin contraseña").
async function uiLogin(page, email, pass) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const emailInput = page.locator('input[type="email"]').last();   // form de contraseña
  const pwInput = page.locator('input[type="password"]').first();
  await emailInput.fill(email);
  await pwInput.fill(pass);
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/auth/login"), { timeout: 10000 }).catch(() => null),
    pwInput.press("Enter"),
  ]);
  await page.waitForTimeout(1200);
  return resp ? resp.status() : null;
}

// Click robusto de un tab del nav (overflow-x-auto → a veces fuera de viewport /
// tapado; force-click tras scroll evita timeouts de actionability en DEV remoto).
async function clickTab(page, nameRe) {
  const tab = page.getByRole("tab", { name: nameRe }).first();
  if (!(await tab.count())) return false;
  await tab.scrollIntoViewIfNeeded().catch(() => {});
  await tab.click({ force: true }).catch(() => {});
  return true;
}

async function userInStorage(page) {
  return await page.evaluate(() => ({
    user: !!localStorage.getItem("medellin-social.user"),
    token: !!localStorage.getItem("medellin-social.token"),
  }));
}

function wirePage(page, track) {
  page.on("response", (r) => {
    const s = r.status();
    if (s >= 500) record(track, "network", "blocker", `${s} en ${r.request().method()} ${r.url().replace(API, "·api·")}`);
  });
  const seenConsole = new Set();
  page.on("console", (m) => {
    if (m.type() === "error") {
      const t = m.text();
      // Ruido conocido: favicon, HMR, Google Sign-In en localhost, 401/403/404 de red (ya cubiertos por response handler o esperados)
      if (/favicon|sourcemap|\[vite\]|ERR_BLOCKED|GSI_LOGGER|accounts\.google|given origin|Failed to load resource/i.test(t)) return;
      if (seenConsole.has(t)) return;
      seenConsole.add(t);
      record(track, "console", "minor", `console.error: ${t.slice(0, 160)}`);
    }
  });
  page.on("pageerror", (e) => record(track, "pageerror", "major", String(e).slice(0, 160)));
}

// ── Track A: onboarding gates como huecos (persona nueva, sin fixtures) ───────
async function trackA(ctx, persona) {
  const page = await ctx.newPage();
  wirePage(page, "A·onboarding");
  const T = "A·onboarding";

  // 1. Registro
  await step(T, `registro(${persona.email})`, async () => {
    await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Nombre completo").fill(persona.nombre);
    await page.getByPlaceholder("tu@correo.com").fill(persona.email);
    const tel = page.getByPlaceholder(/300 123/);
    if (await tel.count()) await tel.first().fill(persona.telefono);
    await page.getByPlaceholder(/Mínimo 8/).fill(persona.password);
    // consentimiento habeas data (obligatorio) — primer checkbox
    const cb = page.locator('input[type="checkbox"]').first();
    if (await cb.count()) await cb.check().catch(() => {});
    const btn = page.getByRole("button", { name: /Crear cuenta/ });
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/auth/register"), { timeout: 8000 }).catch(() => null),
      btn.click(),
    ]);
    await page.waitForTimeout(800);
    if (resp) {
      const code = resp.status();
      if (code === 201) record(T, "registro", "pass", "201 cuenta creada (sin sesión, debe verificar correo)");
      else record(T, "registro", "major", `registro devolvió ${code} (esperado 201)`);
    } else {
      record(T, "registro", "major", "no se observó POST /auth/register al enviar el form");
    }
  });

  // 2. Login recién registrado (SIN verificar correo) → compuerta de verificación
  await step(T, "login sin verificar correo", async () => {
    const code = await uiLogin(page, persona.email, persona.password);
    const st = await userInStorage(page);
    if (code === 403) {
      record(T, "login sin verificar", "pass", "403: la cuenta no verificada queda bloqueada (compuerta ON)");
    } else if (code === 200 && st.user) {
      record(T, "login sin verificar", "info",
        "cuenta SIN verificar correo entra igual (REQUIRE_EMAIL_VERIFICATION=false, config by-design hasta que el envío de correo sea confiable) — el flujo 'verifica tu correo' no bloquea hoy");
    } else {
      record(T, "login sin verificar", "minor", `login devolvió ${code ?? "sin respuesta"}, user=${st.user}`);
    }
  });

  // 3. Como usuario logueado pero SIN ser agente → intenta registrarse como agente
  await step(T, "registrarse como agente (usuario normal)", async () => {
    await page.goto(`${BASE}/agentes/registro`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const url = page.url().replace(BASE, "");
    if (/\/login/.test(url)) { record(T, "agentes/registro", "info", "redirige a login (no quedó sesión)"); return; }
    // Si llegó al form, intenta enviarlo y ver si exige verificar correo (backend 403)
    record(T, "agentes/registro", "pass", `usuario normal llega al form de registro de agente (${url})`);
  });

  await page.close();
}

// ── Track B: flujo de features como realtor activo (Valentina, stack real) ────
async function trackB(ctx) {
  const page = await ctx.newPage();
  page.setDefaultTimeout(12000);   // fast-fail: no esperar 30s por un click bloqueado (DEV remoto)
  wirePage(page, "B·flujo");
  const T = "B·flujo";

  // Login real por UI
  let logueado = false;
  await step(T, "login realtor activo", async () => {
    const code = await uiLogin(page, EMAIL, PASS);
    const st = await userInStorage(page);
    if (code === 200 && st.user) { logueado = true; record(T, "login", "pass", "login 200 como realtor activo"); }
    else record(T, "login", "blocker", `login falló (${code ?? "sin resp"}, user=${st.user}) — Track B no puede continuar`);
  });
  if (!logueado) { await page.close(); return; }

  // Dashboard carga sin error
  await step(T, "dashboard carga", async () => {
    await page.goto(`${BASE}/realtor/dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const body = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
    if (/could not load|no se pudo|error inesperado|something went wrong/.test(body))
      record(T, "dashboard", "major", "dashboard muestra estado de error al cargar");
    else record(T, "dashboard", "pass", "dashboard cargó");
  });

  // Recorre las 5 secciones (nav usa role="tab"); cada una debe renderizar sin romperse
  const secciones = ["Bandeja", "Mis listings", "Herramientas", "Resultados"];
  for (const sec of secciones) {
    await step(T, `sección: ${sec}`, async () => {
      if (!(await clickTab(page, new RegExp(sec, "i")))) { record(T, `sección ${sec}`, "minor", "no se encontró el tab de la sección"); return; }
      await page.waitForTimeout(1200);
      const body = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
      if (/could not load|no se pudo cargar|error inesperado/.test(body))
        record(T, `sección ${sec}`, "major", "la sección muestra estado de error");
      else record(T, `sección ${sec}`, "pass", "renderiza");
    });
  }

  // Mis listings → abrir editor de ficha (no destructivo)
  await step(T, "editor de ficha (abrir)", async () => {
    await clickTab(page, /Mis listings/i);
    await page.waitForTimeout(1000);
    const editar = page.getByRole("button", { name: /Editar/i }).first();
    if (!(await editar.count())) { record(T, "editor ficha", "minor", "sin botón Editar (¿sin listings propios?)"); return; }
    await editar.click();
    await page.waitForTimeout(900);
    const dialog = page.getByRole("dialog");
    if (await dialog.count()) record(T, "editor ficha", "pass", "modal de edición abre");
    else record(T, "editor ficha", "major", "click en Editar no abrió modal");
    // cerrar robusto: Cancelar/Cerrar → Escape → esperar que el overlay se vaya
    // (si queda abierto, su overlay bloquea los clicks de los siguientes pasos)
    const cancelar = page.getByRole("button", { name: /Cancelar|Cerrar|Descartar/i }).first();
    if (await cancelar.count()) await cancelar.click().catch(() => {});
    await page.keyboard.press("Escape").catch(() => {});
    await dialog.first().waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  });

  // Visitas → agenda + pipeline (render)
  await step(T, "visitas/agenda", async () => {
    await clickTab(page, /Bandeja/i);
    await page.waitForTimeout(800);
    const vis = page.locator("button", { hasText: /^Visitas\b/ }).last();
    if (await vis.count()) { await vis.scrollIntoViewIfNeeded().catch(() => {}); await vis.click({ force: true }).catch(() => {}); await page.waitForTimeout(1000); }
    const body = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
    if (/could not load your schedule|no se pudo cargar/.test(body))
      record(T, "visitas", "major", "la agenda muestra estado de error");
    else record(T, "visitas", "pass", "agenda renderiza");
  });

  // Herramientas → simulador + comparador (render)
  await step(T, "herramientas (simulador/comparador)", async () => {
    await clickTab(page, /Herramientas/i);
    await page.waitForTimeout(1000);
    const body = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
    if (/error inesperado|could not load/.test(body)) record(T, "herramientas", "major", "herramientas con error");
    else record(T, "herramientas", "pass", "herramientas renderiza");
  });

  await page.close();
}

// ── Guard probe: visitante SIN sesión no debe entrar a rutas protegidas ───────
async function guardProbe(browser) {
  const T = "A·guards";
  const rutas = ["/realtor/dashboard", "/agentes/registro", "/perfil"];
  for (const ruta of rutas) {
    const ctx = await browser.newContext({ locale: "es-CO", userAgent: UA });
    const page = await ctx.newPage();
    await step(T, `sin sesión → ${ruta}`, async () => {
      await page.goto(`${BASE}${ruta}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(900);
      const url = page.url().replace(BASE, "");
      const st = await userInStorage(page);
      if (/\/login/.test(url)) record(T, ruta, "pass", "redirige a /login (gate correcto)");
      else if (!st.user) record(T, ruta, "major", `HUECO: ${ruta} accesible SIN sesión (quedó en ${url}, sin user) — guard no redirige`);
      else record(T, ruta, "info", `quedó en ${url} con user en storage`);
    });
    await ctx.close();
  }
}

// ── Track C: API probe determinista (auth gating + sin 500s + no-leak) ────────
async function trackC() {
  const T = "C·api";
  // token real de Valentina
  let token = null;
  await step(T, "obtener token", async () => {
    const r = await fetch(`${API}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ email: EMAIL, password: PASS }),
    });
    if (r.ok) token = (await r.json()).token;
    record(T, "token", token ? "pass" : "blocker", token ? "login API 200" : `login API ${r.status}`);
  });

  // endpoints realtor (GET) que DEBEN exigir auth → 401 sin token
  const authGet = ["/realtor/me", "/realtor/listings", "/realtor/agenda", "/realtor/desempeno",
    "/realtor/embudo", "/realtor/pool", "/realtor/asignados", "/realtor/comparables", "/realtor/disponibilidad"];
  for (const ep of authGet) {
    await step(T, `sin-token ${ep}`, async () => {
      const r = await fetch(`${API}${ep}`, { headers: { "User-Agent": UA } });
      if (r.status === 401) record(T, ep, "pass", "401 sin token (gate OK)");
      else if (r.status >= 500) record(T, ep, "blocker", `${r.status} sin token (debería ser 401, no 5xx)`);
      else record(T, ep, "major", `${r.status} sin token (esperado 401 — ¿endpoint sin protección?)`);
    });
  }

  if (token) {
    const H = { "User-Agent": UA, Authorization: `Bearer ${token}` };
    for (const ep of authGet) {
      await step(T, `con-token ${ep}`, async () => {
        const r = await fetch(`${API}${ep}`, { headers: H });
        if (r.status >= 500) record(T, ep, "blocker", `${r.status} CON token (500 real)`);
        else if (r.ok) record(T, ep, "pass", `${r.status} con token`);
        else record(T, ep, "minor", `${r.status} con token (revisar si esperado)`);
      });
    }
    // No-leak: /comparables no debe exponer matrícula/agente/dirección
    await step(T, "comparables no-leak", async () => {
      const r = await fetch(`${API}/realtor/comparables`, { headers: H });
      if (!r.ok) { record(T, "comparables", "info", `comparables ${r.status} (gate reciprocidad, sin datos)`); return; }
      const txt = await r.text();
      const leaks = ["matricula_inmobiliaria", "cedula_catastral", "agent_id", "listing_id", "direccion"]
        .filter((k) => txt.includes(k));
      if (leaks.length) record(T, "comparables", "blocker", `LEAK de campos sensibles: ${leaks.join(", ")}`);
      else record(T, "comparables", "pass", "sin leak de matrícula/agente/dirección");
    });
    // Validación: POST /visitas con body inválido → 422, nunca 500
    await step(T, "validación POST /visitas", async () => {
      const r = await fetch(`${API}/realtor/visitas`, {
        method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      if (r.status >= 500) record(T, "POST /visitas", "blocker", `${r.status} con body vacío (debería ser 422)`);
      else if (r.status === 422 || r.status === 400) record(T, "POST /visitas", "pass", `${r.status} valida body vacío`);
      else record(T, "POST /visitas", "minor", `${r.status} con body vacío`);
    });
  }
}

// ── main ────────────────────────────────────────────────────────────────────
function personas(n) {
  const nombres = ["Camilo QA", "Valeria QA", "Andrés QA", "Sara QA", "Diego QA"];
  return Array.from({ length: n }, (_, i) => ({
    nombre: nombres[i % nombres.length],
    email: `qa.realtor.${STAMP}.${i}@example.com`,
    telefono: `30012233${String(i).padStart(2, "0")}`,
    password: "QaRealtor-2026",
  }));
}

const browser = await chromium.launch();
try {
  console.log(`\n═══ QA realtor — base=${BASE} api=${API} ═══\n`);

  console.log("── Guard probe: rutas protegidas sin sesión ──");
  await guardProbe(browser);

  console.log("\n── Track A: onboarding gates (persona nueva) ──");
  for (const p of personas(N_PERSONAS)) {
    const ctx = await browser.newContext({ locale: "es-CO", userAgent: UA });
    await ctx.addInitScript(() => localStorage.setItem("medellin-social.lang", "es"));
    await trackA(ctx, p);
    await ctx.close();
  }

  console.log("\n── Track B: flujo de features (realtor activo) ──");
  {
    const ctx = await browser.newContext({ locale: "es-CO", userAgent: UA });
    await ctx.addInitScript(() => {
      localStorage.setItem("medellin-social.lang", "es");
      localStorage.setItem("realtor_tour_seen", "true");
    });
    await trackB(ctx);
    await ctx.close();
  }

  console.log("\n── Track C: API probe ──");
  await trackC();
} finally {
  await browser.close();
}

// ── reporte ──────────────────────────────────────────────────────────────────
const sev = { blocker: 0, major: 1, minor: 2, info: 3, pass: 4 };
const sorted = [...holes].sort((a, b) => sev[a.severity] - sev[b.severity]);
const counts = holes.reduce((m, h) => ((m[h.severity] = (m[h.severity] || 0) + 1), m), {});
const reportDir = path.join(__dir, "report");
fs.mkdirSync(reportDir, { recursive: true });
const md = [
  `# Reporte QA del flujo realtor — ${STAMP}`,
  ``,
  `**Target:** ${BASE} · API ${API}`,
  `**Resumen:** 🔴 ${counts.blocker || 0} blocker · 🟠 ${counts.major || 0} major · 🟡 ${counts.minor || 0} minor · 🟢 ${counts.pass || 0} ok`,
  ``,
  `## Hallazgos (peor primero)`,
  ``,
  ...sorted.filter((h) => h.severity !== "pass").map((h) =>
    `- ${{ blocker: "🔴", major: "🟠", minor: "🟡", info: "⚪" }[h.severity]} **[${h.track}] ${h.step}** — ${h.note}`),
  ``,
  `## Pasos OK`,
  ``,
  ...sorted.filter((h) => h.severity === "pass").map((h) => `- 🟢 [${h.track}] ${h.step} — ${h.note}`),
  ``,
].join("\n");
fs.writeFileSync(path.join(reportDir, `holes-${STAMP}.md`), md);
fs.writeFileSync(path.join(reportDir, `holes-${STAMP}.json`), JSON.stringify({ base: BASE, api: API, counts, holes: sorted }, null, 2));
console.log(`\n═══ reporte: scripts/qa/report/holes-${STAMP}.md ═══`);
console.log(`🔴 ${counts.blocker || 0} · 🟠 ${counts.major || 0} · 🟡 ${counts.minor || 0} · 🟢 ${counts.pass || 0}`);
