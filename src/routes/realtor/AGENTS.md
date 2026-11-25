# AGENTS.md — El realtor manda

Todo lo que se construya en `src/routes/realtor/*` se diseña para **una sola
persona: el realtor**. No para el admin, no para el inversionista, no para
lucir métricas. Si un cambio no le hace la vida más fácil al realtor en su día
real, no va.

Antes de tocar este dashboard, lee esto y pregúntate: *"¿un agente ocupado,
en la calle, entre visitas, abriría esto y sabría qué hacer en 3 segundos?"*

---

## Quién es el realtor (persona objetivo)

- Agente inmobiliario independiente del Valle de Aburrá. **Vive de comisiones**
  por cierres — cada lead perdido es plata perdida.
- Paga $200/barrio–$1.000/comuna para ser **el agente patrocinado** de su zona.
  Esa plata le duele; quiere sentir que rinde.
- **Sin tiempo.** Trabaja desde el celular, parado en un andén, entre
  mostradas. No se sienta a "analizar un dashboard".
- **No es analista.** Piensa en *personas* (este comprador, este propietario,
  esta visita), no en gauges ni embudos ni percentiles.
- **Su mayor miedo:** que otro agente responda primero y le quite el cliente
  (speed-to-lead), quedar mal frente a un cliente, y pagar sin ver resultado.

## Qué quiere ver (y cuándo)

| Momento | Pregunta real del realtor | Lo que necesita en pantalla |
|---|---|---|
| **Cada día, al abrir** | "¿A quién le respondo YA? ¿Qué tengo hoy?" | Cola de acción: leads nuevos sin responder, visitas de hoy, listings que necesitan arreglo. Un toque para resolver. |
| **Durante el día** | "Llegó un lead, ¿lo tomo?" | Aceptar/responder en **un tap**, desde el celular. |
| **Semanal / fin de mes** | "¿Me está yendo bien? ¿Mi zona rinde?" | KPIs y ROI — pero esto es *reflexión periódica*, NO lo primero que ve a diario. |
| **Al renovar patrocinio** | "¿Vale la pena seguir pagando esta zona?" | Leads/ROI atados a la zona que paga, honestos. |

**Clave:** los KPIs (standing, tasa de aceptación, embudo, gauges) son para
decidir, no para la rutina. Nadie abre su herramienta de trabajo todos los días
para mirar un velocímetro. Abre para saber **a quién llamar**.

---

## Principios de diseño (caen de la persona)

1. **Acción antes que reflexión.** La pantalla de inicio ES la cola de "qué
   hago ahora", no un muro de métricas. Los gauges se bajan a una vista propia
   de Desempeño o a una tarjeta secundaria.
2. **Speed-to-lead es el producto.** Responder un lead nuevo = la acción más
   grande, más visible, más fácil de toda la app. Un tap.
3. **Mobile-first, pulgar-first.** Se usa en la calle. Botones grandes, poco
   scroll, nada que requiera dos manos ni zoom.
4. **Lenguaje llano, no de métrica.** "Ganancia anual" no "yield". "Qué tan
   segura es" no "score de criminalidad p50". Si tu mamá no lo entiende, se
   reescribe.
5. **Personas, no números.** Organizar por QUIÉN te busca (propietario /
   comprador / interesado), no por tipo de dato. (Bandeja ya lo hace — mantenerlo.)
6. **Todo número responde "¿y entonces qué hago?"** Un KPI sin acción es vanity.
   Si no lleva a un botón o a una decisión, se corta o se baja de nivel.
7. **No mostrar vacío.** Un grid lleno de "—" lee como producto a medio hacer y
   mata la confianza. Preferir "aún no" + la única acción que lo llena.
8. **Justificar el gasto, con honestidad.** Mostrar leads/tráfico/ROI atados a
   la zona pagada donde el dato exista. Nunca inflar; nunca dato público
   reskineado vendido como exclusivo.
9. **Intuitivo = nunca se pregunta "¿dónde está X?"** Menos tabs, nombres
   obvios, el camino más corto a la tarea. Si hay que explicarlo, está mal.

## Anti-patrones (no hacer)

- Abrir el dashboard con un muro de gauges/porcentajes.
- Métricas de analista (percentiles, deflactar con IPC, p50/p90) como protagonistas.
- Tabs o secciones que repiten el mismo dato en otro envoltorio.
- Dato gratis del mapa público presentado como beneficio pago.
- Celdas "—" por doquier en vez de un vacío honesto y accionable.
- Flujos de >2 taps para la acción diaria (responder un lead).

---

## Orden del nav (nov 2026) — acción-first, DECIDIDO

Orden vigente (y landing por defecto = el primero):

1. **Bandeja y agenda** ← landing. Quién te busca hoy: propietarios, visitas,
   interesados. El realtor aterriza en lo que debe responder.
2. **Mis listings**
3. **Herramientas** (simulador, comparador, servicios)
4. **Resultados** (ex-"Inicio") — KPIs/desempeño/ROI. Al final: consulta
   periódica (semanal/renovación), no rutina diaria.

Razón: el realtor abre a diario a RESPONDER, no a mirar velocímetros. Antes
Inicio era el landing y abría con un muro de 7 gauges → invertido.

Notas de implementación:
- id interno `"inicio"` se conserva (deep-links `?tab=resumen/desempeno` + render
  guard) aunque el label sea "Resultados". `useState<Section>("bandeja")` fija el
  landing.
- **Mercado:** oculto — era `_BARRIO_SQL` público reskineado, sin valor pago
  propio. El valor pago (leads/ROI/funnel de zona) vive en Resultados; ahí hay
  que reforzarlo, no en un tab de "datos".
- **Pendiente:** dentro de Resultados, "Qué hacer hoy" (`AlertasHoy`) sigue
  arriba del muro de gauges. Es dup suave del top de Bandeja; evaluar quitarlo o
  dejarlo como recap. Los gauges aún son el grueso de Resultados — ok para una
  vista periódica.

> Cuando cambie el orden o la info de valor, actualizar este bloque — es el
> estado de la discusión, no sólo principios abstractos.
