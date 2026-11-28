# Reporte QA del flujo realtor — dev-clean-213934

**Target:** https://web-medellin-social-dev.up.railway.app · API https://social-api-medellin-social-dev.up.railway.app/api/v1
**Resumen:** 🔴 0 blocker · 🟠 5 major · 🟡 0 minor · 🟢 32 ok

## Hallazgos (peor primero)

- 🟠 **[A·guards] /realtor/dashboard** — HUECO: /realtor/dashboard accesible SIN sesión (quedó en /realtor/dashboard, sin user) — guard no redirige
- 🟠 **[A·guards] /agentes/registro** — HUECO: /agentes/registro accesible SIN sesión (quedó en /agentes/registro, sin user) — guard no redirige
- 🟠 **[A·guards] /perfil** — HUECO: /perfil accesible SIN sesión (quedó en /perfil, sin user) — guard no redirige
- 🟠 **[A·onboarding] pageerror** — Error: Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]= for the full message or use the non-minified dev environment for full e
- 🟠 **[B·flujo] pageerror** — Error: Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]= for the full message or use the non-minified dev environment for full e
- ⚪ **[A·onboarding] login sin verificar** — cuenta SIN verificar correo entra igual (REQUIRE_EMAIL_VERIFICATION=false, config by-design hasta que el envío de correo sea confiable) — el flujo 'verifica tu correo' no bloquea hoy

## Pasos OK

- 🟢 [A·onboarding] registro — 201 cuenta creada (sin sesión, debe verificar correo)
- 🟢 [A·onboarding] agentes/registro — usuario normal llega al form de registro de agente (/agentes/registro)
- 🟢 [B·flujo] login — login 200 como realtor activo
- 🟢 [B·flujo] dashboard — dashboard cargó
- 🟢 [B·flujo] sección Bandeja — renderiza
- 🟢 [B·flujo] sección Mis listings — renderiza
- 🟢 [B·flujo] sección Herramientas — renderiza
- 🟢 [B·flujo] sección Resultados — renderiza
- 🟢 [B·flujo] editor ficha — modal de edición abre
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
