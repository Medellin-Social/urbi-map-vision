# Reporte QA del flujo realtor — local-211128

**Target:** http://localhost:5173 · API http://localhost:8011/api/v1
**Resumen:** 🔴 1 blocker · 🟠 2 major · 🟡 14 minor · 🟢 22 ok

## Hallazgos (peor primero)

- 🔴 **[B·flujo] login** — login falló (sin resp) — Track B no puede continuar
- 🟠 **[A·onboarding] login sin verificar** — login devolvió sin respuesta (esperado 403 o 200)
- 🟠 **[A·onboarding] /realtor/dashboard** — acceso sin redirección a /realtor/dashboard — ¿dashboard expuesto a no-agente?
- 🟡 **[A·onboarding] console** — console.error: Failed to load resource: the server responded with a status of 403 ()
- 🟡 **[A·onboarding] console** — console.error: [GSI_LOGGER]: The given origin is not allowed for the given client ID.
- 🟡 **[A·onboarding] console** — console.error: Failed to load resource: the server responded with a status of 403 ()
- 🟡 **[A·onboarding] console** — console.error: [GSI_LOGGER]: The given origin is not allowed for the given client ID.
- 🟡 **[A·onboarding] console** — console.error: Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟡 **[A·onboarding] console** — console.error: Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟡 **[A·onboarding] console** — console.error: Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟡 **[A·onboarding] console** — console.error: Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟡 **[A·onboarding] console** — console.error: Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟡 **[A·onboarding] console** — console.error: Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟡 **[A·onboarding] console** — console.error: Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟡 **[A·onboarding] console** — console.error: Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟡 **[B·flujo] console** — console.error: Failed to load resource: the server responded with a status of 403 ()
- 🟡 **[B·flujo] console** — console.error: [GSI_LOGGER]: The given origin is not allowed for the given client ID.
- ⚪ **[A·onboarding] /agentes/registro** — queda en /agentes/registro — revisar si debería exigir agente aprobado

## Pasos OK

- 🟢 [A·onboarding] registro — 201 cuenta creada (sin sesión, debe verificar correo)
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
