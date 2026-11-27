# QA del flujo realtor

Harness que actúa como agente(s) inmobiliario(s) y busca huecos en **todo** el flujo:
onboarding → guards → listings/visitas/herramientas/comparador → endpoints.

## 1. Backbone determinista (sin LLM, sin key) — `run.mjs`

Tres tracks + un guard probe:

| Track | Qué hace | Encuentra |
|---|---|---|
| **Guards** | rutas protegidas sin sesión | guards que no redirigen |
| **A · onboarding** | persona NUEVA se registra como realtor (sin fixtures) | compuertas donde el realtor nuevo se traba |
| **B · flujo** | realtor ACTIVO (Valentina) contra el stack real | 5xx, console errors, hydration, dead-ends en el flujo |
| **C · api** | cada endpoint con/sin token | 401 faltante, 500s, leaks en /comparables, validación |

```bash
# Local (necesita app 5173 + API 8011 arriba)
node scripts/qa/run.mjs --base http://localhost:5173 --api http://localhost:8011/api/v1 \
  --email realtor.test@example.com --pass Valentina-2026 --personas 3 --stamp "local-$(date +%H%M%S)"

# DEV (como usuario real — Track A crea cuentas reales en DEV)
node scripts/qa/run.mjs --base https://web-medellin-social-dev.up.railway.app \
  --api https://social-api-medellin-social-dev.up.railway.app/api/v1 \
  --email realtor.test@example.com --pass Valentina-2026 --personas 1 --stamp "dev-$(date +%H%M%S)"
```

Flags: `--personas N` (cuántos agentes nuevos simula el Track A), `--stamp` (nombre del reporte).
Reporte → `scripts/qa/report/holes-<stamp>.{md,json}`.

Requisitos: `npx playwright` (ya instalado, 1.49). Corre `node` desde la raíz del repo (playwright resuelve módulos desde ahí).

## 2. Exploración autónoma tipo-humano (necesita key LLM)

`run.mjs` es scripteado: cubre el flujo conocido. Para que un LLM maneje el browser
como humano y descubra huecos imprevistos, se enganchan **browser-use** y **Hercules**.
Ambos necesitan una API key (no incluida):

```bash
# 1. Pega tu key en .env (NO se commitea — está en .gitignore)
echo 'ANTHROPIC_API_KEY=sk-ant-...' >> .env     # o OPENAI_API_KEY=sk-...

# 2. Instala (pendiente de wiring — ver subagente realtor-qa)
pip install browser-use testzeus-hercules
playwright install chromium
```

- **browser-use** (Claude/GPT maneja el browser end-to-end): mejor para "actúa como un realtor humano".
- **Hercules** (QA-agent con plan + criterios de éxito): mejor para regresión con aserciones.

Sin key, el harness determinista corre igual y entrega los huecos reproducibles.

## 3. Como subagente Claude

`.claude/agents/realtor-qa.md` define un agente reusable que corre este harness,
verifica cada hallazgo, y reporta huecos agrupados por causa raíz. Invócalo con la
herramienta Agent (`subagent_type: realtor-qa`) o pídelo en lenguaje natural.
