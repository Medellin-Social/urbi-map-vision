# Prompt: Alcance Monetario — Medellín Social

> **Uso:** Pega este prompt en cualquier LLM (Claude, GPT-4, Gemini).
> Llena las secciones `[COMPLETAR]` con tus datos reales antes de enviarlo.

---

## PROMPT

Eres un analista financiero especializado en marketplaces inmobiliarios B2B.
Voy a darte los parámetros exactos de un negocio real y necesito que calcules
el alcance monetario completo — mercado local (Colombia) e internacional (LATAM/global).

---

### 1. DESCRIPCIÓN DEL NEGOCIO

**Medellín Social** es un MLS (Multiple Listing Service) gratuito para compradores
y arrendatarios de inmuebles en el Valle de Aburrá, Colombia.
La monetización es 100% B2B: agentes inmobiliarios y agencias pagan por exposición
y herramientas. Usuarios finales nunca pagan.

El producto es replicable ciudad por ciudad (modelo "Panama Social", "Bogotá Social", etc.).

---

### 2. STREAMS DE INGRESO — MERCADO LOCAL (Medellín)

#### 2a. Zona patrocinada — Agente de Comuna
- Precio: **[COMPLETAR: ej. $1,000 USD/mes]**
- Slots disponibles (Medellín): **21 comunas** (1 agente exclusivo por comuna)
- Slots adicionales (municipios del Valle de Aburrá): **9** (Bello, Envigado, Itagüí, La Estrella, Sabaneta, Caldas, Barbosa, Girardota, Copacabana)
- Total slots nivel comuna/municipio: **30**
- Beneficio para el agente: aparece como contacto #1 en TODOS los listings de esa comuna

#### 2b. Zona patrocinada — Agente de Barrio
- Precio: **[COMPLETAR: ej. $200 USD/mes]**
- Slots disponibles: **[COMPLETAR: ej. 606 barrios]** (1 agente exclusivo por barrio)
- Beneficio: aparece como contacto #2 en todos los listings del barrio

#### 2c. Listing Destacado (propietarios)
- Precio: **[COMPLETAR: ej. $1,000 USD — pago único por listing]**
- Incluye: análisis de precio (vende rápido/justo/máximo), analytics del listing,
  estimado de liquidez, posicionamiento para compradores USD
- Demanda estimada/mes: **[COMPLETAR]** listings destacados

#### 2d. Plan Agente (acceso a dashboard)
- Precio COP: **[COMPLETAR: ej. $199,000 COP/mes]**
- Precio USD: **[COMPLETAR: ej. $59 USD/mes]**
- Descripción: agente con herramientas avanzadas (analítica, publicar propiedades propias, badges)

---

### 3. ESTADO ACTUAL — AGENCIAS/AGENTES

#### Agencias activas hoy
- Número de agencias en plataforma: **[COMPLETAR]**
- Agentes individuales activos: **[COMPLETAR]**
- Agentes pagando zona patrocinada (comuna): **[COMPLETAR]**
- Agentes pagando zona patrocinada (barrio): **[COMPLETAR]**
- Agentes con plan Agente (dashboard): **[COMPLETAR]**

#### Proyección de crecimiento (próximos 12 meses)
Usa este modelo de escalado por trimestre:
- **Q1 (mes 1–3):** [COMPLETAR — ej. "arrancamos con X agencias, Y slots comuna, Z slots barrio"]
- **Q2 (mes 4–6):** [COMPLETAR]
- **Q3 (mes 7–9):** [COMPLETAR]
- **Q4 (mes 10–12):** [COMPLETAR]

Techo teórico local (Medellín):
- 100% ocupación comunas: 30 × $[precio_comuna] = $[calcular]/mes
- 100% ocupación barrios: 606 × $[precio_barrio] = $[calcular]/mes
- Total techo MRR Medellín: $[calcular]

---

### 4. MERCADO INTERNACIONAL

Modelo de expansión: misma plataforma, nueva ciudad = nueva instancia "Ciudad Social".

Ciudades objetivo fase 1 (similar tamaño/dinámica a Medellín):
| Ciudad | País | Barrios est. | Comunas/Zonas est. |
|--------|------|-------------|-------------------|
| Panamá | Panamá | ~150 | ~10 |
| Bogotá | Colombia | ~1,200 | ~20 |
| Cali | Colombia | ~340 | ~22 |
| Ciudad de México | México | ~1,800 | ~16 alcaldías |
| Lima | Perú | ~600 | ~43 distritos |
| [COMPLETAR otras] | | | |

Para cada ciudad, aplica los mismos precios (o ajuste de mercado si lo defines).

Techo teórico por ciudad (calcula para cada una):
- MRR comunas/zonas: N_zonas × $precio_comuna
- MRR barrios: N_barrios × $precio_barrio
- MRR total por ciudad: suma de streams

---

### 5. ANÁLISIS QUE NECESITO

Con toda la información anterior, dame:

#### A. Proyección financiera local (Medellín) — 12 meses
- MRR mes a mes (tabla)
- ARR al final de año 1
- % de ocupación de slots vs techo teórico
- Punto de equilibrio (cuántos agentes/agencias necesito para cubrir costos operativos de [COMPLETAR: ej. $5,000 USD/mes infra + equipo])

#### B. Potencial de mercado total (TAM/SAM/SOM)
- **TAM:** si todas las ciudades objetivo tuvieran 100% ocupación de slots
- **SAM:** mercado realísticamente alcanzable en 3 años con el modelo de expansión ciudad por ciudad
- **SOM:** lo que podemos capturar en año 1–2 dado el estado actual

#### C. Escenarios
Para Medellín, calcula 3 escenarios al mes 12:
- **Conservador:** [COMPLETAR — ej. 10% ocupación comunas, 5% barrios]
- **Base:** [COMPLETAR — ej. 40% comunas, 15% barrios]
- **Optimista:** [COMPLETAR — ej. 70% comunas, 30% barrios]

Para cada escenario: MRR, ARR, ingreso por stream.

#### D. Sensibilidad de precio
Si subimos el precio de zona comuna de $X a $Y, ¿cuántos agentes necesitamos
para igualar el MRR del escenario base con precio original?

#### E. Internacionalización — proyección a 3 años
- Año 1: solo Medellín
- Año 2: Medellín + [COMPLETAR ciudad 2]
- Año 3: +[COMPLETAR ciudades]
- ARR acumulado por año

#### F. Unit economics por agente
- LTV promedio estimado (asumiendo [COMPLETAR: ej. 18 meses de retención promedio])
- CAC objetivo para que LTV/CAC ≥ 3
- Payback period

---

### 6. SUPUESTOS QUE PUEDES USAR SI NO LOS ESPECIFICO

- Tasa de cambio USD/COP: **4,200**
- Churn mensual agentes de zona: **5%**
- Churn mensual plan Agente dashboard: **8%**
- Costo fijo mensual operación (infra Railway + equipo mínimo): **$5,000 USD/mes**
- Tiempo promedio para llenar un slot de zona desde lanzamiento en ciudad nueva: **6 meses**

---

### 7. FORMATO DE RESPUESTA

1. Tabla resumen ejecutivo (1 página): MRR actual → MRR año 1 → MRR año 3
2. Tabla detallada mes a mes (año 1)
3. TAM/SAM/SOM en USD
4. Los 3 escenarios comparados en tabla
5. Conclusión: ¿cuál es el camino crítico para llegar a $100k MRR? ¿qué palanca mueve más — precio, ocupación, o expansión?

Sé preciso con los números. Muestra las fórmulas. Señala qué supuestos son los más frágiles.
