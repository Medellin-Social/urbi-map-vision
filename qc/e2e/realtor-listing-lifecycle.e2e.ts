import { test, expect, type Page } from "@playwright/test";

// Ciclo de vida del listing en "Mis listings" del Centro de agente, contra el
// mock stateful (VITE_REALTOR_USE_MOCK=true lo pone el webServer del config).
// Cubre: crear (entrada) → editar → pausar → reactivar → eliminar.
// Verifica el FLUJO DE UI, no el backend (las mutaciones pegan al mock).

const DASH = "/realtor/dashboard?section=listings";   // deep-link directo a Mis listings
const L1 = "Apartamento moderno en El Poblado";        // seed publicado (mock)

// Semilla de sesión: el beforeLoad del dashboard exige este user en localStorage,
// y saltamos los tours que taparían clicks.
async function seed(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("medellin-social.user", JSON.stringify({ id: "u-demo", nombre: "QC" }));
      localStorage.setItem("home_tour_seen", "true");
      localStorage.setItem("map_tour_seen", "true");
    } catch { /* storage bloqueado */ }
  });
}

/** Fila de un listing por su título (data-testid del ListingRow). */
const row = (page: Page, titulo: string) =>
  page.locator('[data-testid="listing-row"]').filter({ hasText: titulo });

/** Cuenta los errores de JS reales (no los 4xx/5xx: en mock no hay API). */
function watchJsErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return () => expect(errors, "errores de JS").toEqual([]);
}

test.describe("Centro de agente — render de las 5 secciones", () => {
  // Monta cada sección y sub-nav en runtime. tsc/build no detectan crashes de
  // render (map sobre undefined, null deref en los cuerpos recortados); esto sí.
  test("todas las secciones y sub-navs renderizan sin errores de JS", async ({ page }) => {
    const noJsErrors = watchJsErrors(page);
    await seed(page);
    await page.goto("/realtor/dashboard", { waitUntil: "domcontentloaded" });

    // Inicio (default): alertas + resumen.
    await expect(page.getByRole("tab", { name: "Inicio" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Cómo te está yendo")).toBeVisible();

    const go = async (tab: string) => {
      await page.getByRole("tab", { name: tab }).click();
      await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
    };

    // Sub-tabs por id (#subtab-*): el badge forma parte del accessible name, así que
    // no se puede matchear por texto exacto.
    const sub = async (id: string) => {
      await page.locator(`#subtab-${id}`).click();
      await expect(page.locator(`#subtab-${id}`)).toHaveAttribute("aria-selected", "true");
    };

    await go("Mis listings");
    await expect(page.getByRole("link", { name: /Crear listing/ })).toBeVisible();

    await go("Bandeja y agenda");
    for (const id of ["propietarios", "visitas", "interesados"]) await sub(id);

    await go("Mercado");
    for (const id of ["zonas", "inteligencia"]) await sub(id);

    await go("Herramientas");
    for (const id of ["simulador", "comparador", "servicios"]) await sub(id);

    noJsErrors();
  });

  test("deep-link ?tab=comparador abre Herramientas › Comparador", async ({ page }) => {
    const noJsErrors = watchJsErrors(page);
    await seed(page);
    await page.goto("/realtor/dashboard?tab=comparador", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("tab", { name: "Herramientas" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#subtab-comparador")).toHaveAttribute("aria-selected", "true");
    noJsErrors();
  });
});

test.describe("Ciclo de vida del listing (mock)", () => {
  test("crear→editar→pausar→reactivar→eliminar", async ({ page }, testInfo) => {
    const noJsErrors = watchJsErrors(page);
    await seed(page);

    const shot = async (name: string) => {
      const buf = await page.screenshot({ fullPage: true });
      await testInfo.attach(name, { body: buf, contentType: "image/png" });
    };

    await page.goto(DASH, { waitUntil: "domcontentloaded" });

    // Aterriza en Mis listings y hay filas.
    await expect(page.getByRole("tab", { name: "Mis listings" })).toHaveAttribute("aria-selected", "true");
    await expect(row(page, L1)).toBeVisible();
    await shot("01-mis-listings");

    // ── Crear: la entrada de creación apunta a /publicar (form multi-paso aparte). ──
    await expect(page.getByRole("link", { name: /Crear listing/ })).toHaveAttribute("href", "/publicar");

    // ── Métricas por listing visibles (aperturas / 30d / favoritos). ──
    await expect(row(page, L1).getByText("aperturas")).toBeVisible();
    await expect(row(page, L1).getByText("favoritos")).toBeVisible();

    // ── Editar: cambia el título y guarda. ──
    const nuevoTitulo = "Apartamento moderno El Poblado — REMODELADO";
    await row(page, L1).getByRole("button", { name: "Editar" }).click();
    const modal = page.getByRole("dialog", { name: /Editar ficha/ });
    await expect(modal).toBeVisible();
    await modal.getByPlaceholder(/Apartamento en El Poblado/).fill(nuevoTitulo);
    await modal.getByRole("button", { name: /Guardar/ }).click();
    await expect(modal).toBeHidden();
    await expect(row(page, nuevoTitulo)).toBeVisible();
    await shot("02-editado");

    // ── Pausar: publicado → pausado. ──
    const r = row(page, nuevoTitulo);
    await r.getByRole("button", { name: "Pausar" }).click();
    await expect(r.locator('[data-testid="listing-estado"]')).toHaveText("Pausado");
    await shot("03-pausado");

    // ── Reactivar: pausado → publicado. ──
    await r.getByRole("button", { name: "Reactivar" }).click();
    await expect(r.locator('[data-testid="listing-estado"]')).toHaveText("Publicado");
    await shot("04-reactivado");

    // ── Eliminar: confirm nativo → la fila desaparece (soft-delete en backend real). ──
    page.once("dialog", (d) => d.accept());
    await r.getByRole("button", { name: "Eliminar" }).click();
    await expect(row(page, nuevoTitulo)).toHaveCount(0);
    await shot("05-eliminado");

    noJsErrors();
  });
});
