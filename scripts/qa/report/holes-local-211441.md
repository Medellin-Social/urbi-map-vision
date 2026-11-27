# Reporte QA del flujo realtor — local-211441

**Target:** http://localhost:5173 · API http://localhost:8011/api/v1
**Resumen:** 🔴 0 blocker · 🟠 6 major · 🟡 5 minor · 🟢 27 ok

## Hallazgos (peor primero)

- 🟠 **[A·guards] /realtor/dashboard** — HUECO: /realtor/dashboard accesible SIN sesión (quedó en /realtor/dashboard, sin user) — guard no redirige
- 🟠 **[A·guards] /agentes/registro** — HUECO: /agentes/registro accesible SIN sesión (quedó en /agentes/registro, sin user) — guard no redirige
- 🟠 **[A·guards] /perfil** — HUECO: /perfil accesible SIN sesión (quedó en /perfil, sin user) — guard no redirige
- 🟠 **[A·onboarding] login sin verificar** — HUECO: cuenta SIN verificar correo entra igual (REQUIRE_EMAIL_VERIFICATION=false) — la 'verificación' no es compuerta real
- 🟠 **[A·onboarding] pageerror** — Error: Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a 
- 🟠 **[B·flujo] pageerror** — Error: Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a 
- 🟡 **[B·flujo] sección Bandeja y agenda** — no se encontró el nav de la sección
- 🟡 **[B·flujo] sección Mis listings** — no se encontró el nav de la sección
- 🟡 **[B·flujo] sección Herramientas** — no se encontró el nav de la sección
- 🟡 **[B·flujo] sección Resultados** — no se encontró el nav de la sección
- 🟡 **[B·flujo] editor ficha** — sin botón Editar (¿sin listings propios?)

## Pasos OK

- 🟢 [A·onboarding] registro — 201 cuenta creada (sin sesión, debe verificar correo)
- 🟢 [A·onboarding] agentes/registro — usuario normal llega al form de registro de agente (/agentes/registro)
- 🟢 [B·flujo] login — login 200 como realtor activo
- 🟢 [B·flujo] dashboard — dashboard cargó
- 🟢 [B·flujo] visitas — agenda renderiza
- 🟢 [B·flujo] herramientas — herramientas renderiza
- 🟢 [C·api] token — login API 200
- 🟢 [C·api] /realtor/me — 401 sin token (gate OK)
- 🟢 [C·api] /realtor/listings — 401 sin token (gate OK)
- 🟢 [C·api] /realtor/agenda — 401 sin token (gate OK)
- 🟢 [C·api] /realtor/desempeno — 401 sin token (gate OK)
- 🟢 [C·api] /realtor/embudo — 401 sin token (gate OK)
- 🟢 [C·api] /realtor/pool — 401 sin token (gate OK)
- 🟢 [C·api] /realtor/asignados — 401 sin token (gate OK)
- 🟢 [C·api] /realtor/comparables — 401 sin token (gate OK)
- 🟢 [C·api] /realtor/disponibilidad — 401 sin token (gate OK)
- 🟢 [C·api] /realtor/me — 200 con token
- 🟢 [C·api] /realtor/listings — 200 con token
- 🟢 [C·api] /realtor/agenda — 200 con token
- 🟢 [C·api] /realtor/desempeno — 200 con token
- 🟢 [C·api] /realtor/embudo — 200 con token
- 🟢 [C·api] /realtor/pool — 200 con token
- 🟢 [C·api] /realtor/asignados — 200 con token
- 🟢 [C·api] /realtor/comparables — 200 con token
- 🟢 [C·api] /realtor/disponibilidad — 200 con token
- 🟢 [C·api] comparables — sin leak de matrícula/agente/dirección
- 🟢 [C·api] POST /visitas — 422 valida body vacío
