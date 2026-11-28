# Tutorial detallado — Centro de agente (`/realtor/dashboard`)

Qué significa cada cosa del panel del realtor, cómo funciona por dentro y para
qué sirve. Escrito para dos lectores a la vez:

- **El realtor** (persona objetivo, ver [`src/routes/realtor/AGENTS.md`](../src/routes/realtor/AGENTS.md)):
  lee el *qué* y el *para qué* en lenguaje llano.
- **El equipo** que mantiene el panel: lee además el *cómo funciona* (reglas,
  SLAs, pesos, de dónde sale el dato, qué está vivo y qué está oculto).

Cada bloque sigue el mismo esquema: **Qué significa · Cómo funciona · Para qué.**

> Estado al escribir esto (nov 2026): el nav muestra **4 secciones**
> (Bandeja · Mis listings · Herramientas · Resultados). Hay componentes
> construidos pero **ocultos** hoy (sección *Mercado*) — ver [Apéndice A](#apéndice-a--construido-pero-oculto-hoy).

---

## 0. Cómo se entra y quién puede

### Qué significa
El Centro de agente es el panel privado del realtor. No es el mapa público ni el
panel de admin: es la herramienta de trabajo diaria de un agente que vive de
comisiones.

### Cómo funciona
- Ruta: `/realtor/dashboard`. `noindex` (no se indexa en buscadores).
- **Gate de sesión** (`beforeLoad`): si no hay usuario en `localStorage`
  (`medellin-social.user`), redirige a `/login`.
- **Gate de agente**: el panel llama a `useRealtorPerfil()` → `GET /realtor/me`.
  Si la cuenta existe pero **no tiene fila `agent`**, el backend responde 403 y la
  UI muestra una pantalla única *"Esta cuenta no es un agente"* con botón a `/map`
  — en vez de un panel vacío lleno de cajas de error (que se vería como "no carga
  nada").
- **Cuenta pendiente**: si el perfil existe pero `estado === "pendiente"`, aparece
  el aviso *"Cuenta pendiente de aprobación"* en la barra; el panel igual funciona.
- **Tour de bienvenida** (`RealtorTourModal`): la primera vez muestra un recorrido
  corto de 3 pasos (se guarda `realtor_tour_seen` en `localStorage`); se puede
  repetir con el botón de replay del header (evento `replay-tour`).

### Para qué
Que un agente entre directo a trabajar, y que una cuenta que *no* es agente
entienda en un vistazo por qué no ve nada, sin creer que la app está rota.

---

## 1. Navegación — las secciones

### Qué significa
La barra superior con las secciones del panel. El orden es **acción primero**:
el realtor abre a diario a *responder*, no a mirar métricas.

### Cómo funciona
Orden vigente (`SECTIONS`) y landing por defecto = la primera:

| # | Sección | Qué contiene |
|---|---|---|
| 1 | **Bandeja y agenda** *(landing)* | Quién te busca hoy: propietarios, visitas, interesados |
| 2 | **Mis listings** | Tu portafolio de inmuebles |
| 3 | **Herramientas** | Comparador, simulador, servicios/config |
| 4 | **Resultados** | KPIs, desempeño, alertas del día (consulta periódica) |

- **Badge** rojo en *Bandeja* = propietarios nuevos sin aceptar + visitas
  pendientes de confirmar. Es el único contador del nav; empuja a responder.
- **Accesibilidad**: es un `tablist` WAI-ARIA real — flechas ←/→ navegan,
  Home/End saltan al primero/último, `min-h-44px` de área táctil.
- **Deep-links**: `?section=` o `?tab=` seleccionan sección al cargar. Los `?tab=`
  viejos (del navbar/listing) se remapean: `inbox`/`agenda`→Bandeja,
  `simulador`/`comparador`/`config`→Herramientas, `resumen`/`desempeno`→Resultados.
- Internamente la sección "Resultados" conserva el id `"inicio"` (por los
  deep-links y el render guard), aunque el label diga "Resultados".
- **Barra apilada**: el navbar global (avatar, nombre, zona, idioma) va arriba; la
  barra de secciones se pega (`sticky`) debajo. No se duplica el perfil.

### Para qué
Menos tabs, nombres obvios, el camino más corto a la tarea. Que nadie se pregunte
*"¿dónde está X?"*.

---

## 2. Bandeja y agenda

Organizada por **quién te busca**, no por tipo de dato. Arriba, 4 KPIs que son
también atajos a cada sub-pestaña; cada uno lleva a la acción.

| KPI | Qué cuenta | Tono/urgencia |
|---|---|---|
| **Propietarios nuevos** | Leads asignados en estado `asignado` sin aceptar | brand; si 0, muestra "N en proceso" |
| **Visitas por confirmar** | Visitas `pendiente` | rojo si alguna venció su SLA, si no ámbar |
| **Visitas confirmadas** | Visitas `confirmada`; muestra la próxima fecha | info |
| **Interesados** | Personas que guardaron tus listings en favoritos | violeta |

### 2.1 Propietarios (captación de listings) — `InboxTab`

#### Qué significa
Propietarios de tu zona que quieren publicar su inmueble **contigo**. Es la
captación: de un lead a un aviso publicado.

#### Cómo funciona
Vista lista + detalle (maestro-detalle; en móvil se muestra uno a la vez).

- **De dónde salen los leads** (dos fuentes, se mezclan y ordenan):
  - *Asignados* (`useRealtorAsignados`): un dueño publicó en una zona que tú
    patrocinas → te llega a ti. Orden: nuevos primero, luego en proceso.
  - *Pool* (`useRealtorPool`): inmuebles en zona **sin** patrocinador. Pool abierto:
    *el primer agente que lo tome se lo queda*.
  - Orden global: `asignado` (0) → en proceso (1) → pool (2), y dentro, más reciente.
- **Filtros**: Todos · Nuevos · En proceso · Pool. Más buscador por barrio/owner.
- **El flujo de 3 pasos** (`LEAD_STEPS`): **Aceptar → Ficha → Publicar**. Cada fila
  dibuja una barrita de progreso; el detalle, un stepper. La función `leadEtapa`
  decide en qué paso está según el estado del asignado y del listing.
- **El "Siguiente paso"** del detalle es *una* acción grande y clara según el estado:
  - Pool → **Tomar inmueble** (antes que otro agente).
  - Nuevo → **Aceptar inmueble** (revela los datos del propietario).
  - Ficha incompleta → **Completar ficha** (abre el editor).
  - Listo → **Publicar listing** (aparece en el mapa al instante).
  - Publicado / En revisión → sin acción (solo estado).
- **Panel del inmueble**: precio esperado, operación, **comisión** que ofrece el
  dueño (% del precio si venta, del canon si arriendo), tipo/barrio/municipio y
  specs declaradas (área, hab, baños).
- **Declarado por el propietario**: escritura, predial al día, administración al
  día, sin hipoteca (Sí/No/Sin dato). En el pool estos datos están *bloqueados*
  hasta tomar el inmueble.

#### Para qué
Convertir un lead de tu zona pagada en un aviso publicado, en el menor número de
taps, sin perderlo contra otro agente.

#### Verificación de documentos (Due Diligence) — `DDChecklistSection`
- **Qué significa**: revisar punto por punto los papeles del inmueble con el
  propietario. **No bloquea publicar** (muchas veces no se tiene todo al inicio):
  es opcional y da el sello **«Verificada»**.
- **Cómo funciona**: cada ítem (escritura, predial, administración, hipoteca,
  propiedad horizontal, servicios, estado civil, persona jurídica) se marca
  **Verificado / Rechazado** y admite **adjuntar un archivo** (imagen/PDF). El
  archivo se guarda en la plataforma (bytea en DB); al abrirlo se descarga
  autenticado a una pestaña nueva. Con todo verificado → el listing recibe el sello.
- **Cross-check catastral** (`PlausibilidadBanner`): cruza el precio/m² declarado
  contra el avalúo catastral de la zona y marca *Consistente / Revisar / Sin datos*.
  Es una **señal de plausibilidad**, no una verificación de identidad.
- **Para qué**: ganar el sello de confianza y detectar precios fuera de rango antes
  de publicar.

### 2.2 Editor de ficha — `EditorFichaModal`

#### Qué significa
El formulario completo del aviso. Modal compartido: se abre tanto desde un lead
("Completar ficha") como desde *Mis listings* ("Editar").

#### Cómo funciona
Secciones: Datos del aviso · Características · Ficha detallada · Condiciones ·
Ubicación · Amenidades · Multimedia · Descripción · Fotos (+ DD si el listing vino
de un lead).

- **Guarda solo lo que cambió** (diff contra el valor original) → `PATCH` liviano.
- **Validación en el cliente** (`validarFicha`, espejo de `ListingPatchRequest`):
  avisa en línea en vez de un 422 genérico; `maxLength` cubre los textos.
- **Dinero** (`MoneyInput`): formatea miles es-CO en vivo, guarda dígitos crudos.
- **Conteos/estrato/enums** por chips (tap, no teclear); tocar el chip activo lo
  deselecciona.
- **Ficha rica** → columna `caracteristicas` (JSONB): año de construcción, área
  privada, piso, niveles, clósets, estado, orientación, vista. El backend las
  mergea (solo las llaves cambiadas).
- **Multimedia** (`EmbedInput`): valida host embebible en vivo (Matterport, Kuula,
  YouTube, Vimeo…); el backend re-valida y sanea al guardar.
- **Fotos**: se añaden a las existentes; la primera queda como portada.
- **A11y de modal** (`useModalA11y`): Esc cierra, foco atrapado (Tab cicla dentro),
  devuelve el foco al disparador al cerrar.
- *ponytail*: el pin (lat/lon) no se edita aquí — eso necesita el mapa de
  `/publicar`; aquí solo la dirección aproximada (texto).

#### Para qué
Que el aviso quede completo y confiable (más detalle = más confianza del comprador)
sin salir del panel.

### 2.3 Visitas — `AgendaTab`

#### Qué significa
La agenda de compradores que pidieron ver un inmueble, más el embudo de qué pasó
después de cada visita.

#### Cómo funciona
Tres bloques:

1. **Por confirmar** (`pendiente`): ordenadas por *vencidas primero → Pro → más
   antiguas*.
   - **SLA (speed-to-lead)**: Pro responde en **< 4 h**, el resto en **< 24 h**.
     Pasado ese tiempo la tarjeta se marca *vencida* (borde rojo + pill "Nh sin
     responder"). Lead **Pro** (listing destacado) lleva franja dorada y se prioriza.
   - Acción: fijar/ajustar la **fecha y hora acordada** y **Confirmar visita** (o
     Cancelar).
2. **Visitas confirmadas**: agrupadas por día (Hoy / Mañana / fecha), ordenadas por
   hora. Cada tarjeta muestra la ficha del inmueble (a dónde ir), contacto con
   `tel:`/`mailto:` de un tap, y la **calificación del lead** si existe (intención,
   presupuesto, plazo, crédito — del paso 2 estilo Zillow).
   - Resultado en **un tap**: *Hará oferta* · *Interesado* · *No le interesó* ·
     *No asistió*, con nota opcional.
3. **Historial** (realizada / cancelada / no asistió): con **pasos siguientes del
   embudo** según el resultado:
   - *Hará oferta* → **Reportar cierre** (si es listing propio no cerrado).
   - *Interesado* → **Pasó a oferta**.
   - **Agendar otra visita** / **Reagendar** (si no asistió).
   - **Marcar perdido**.

- **Registrar visita a mano** (`RegistrarVisitaModal`): para una visita agendada
  por fuera del mapa. Elige inmueble propio, comprador, fecha, estado
  (Agendada / Ya la hice) y, si ya se hizo, cómo terminó. Se marca "Manual".

#### Para qué
Responder rápido (el miedo #1 es que otro agente responda primero), tener la agenda
clara y mover cada comprador por el embudo hasta el cierre.

### 2.4 Interesados — `InteresadosTab`

- **Qué significa**: usuarios que guardaron tus inmuebles en **favoritos**.
  Compradores *tibios*.
- **Cómo funciona**: agrupados por listing (el más guardado arriba), con nombre,
  email, cuándo, y botón **Escribir** (`mailto:` con el asunto pre-lleno).
- **Para qué**: hacerles seguimiento y ofrecerles una visita antes de que se enfríen.

---

## 3. Mis listings — `ListingsTab`

### Qué significa
Tu portafolio: lo que está en el mapa, lo que estás preparando y lo que ya cerraste.

### Cómo funciona
- **KPIs del portafolio** (también atajos de filtro): Publicados · En preparación
  (ámbar; rojo si hay rechazados) · Aperturas 30 días · Favoritos.
- **Ciclo de vida** (`GRUPO_DE`): 
  - **Activos** = `publicado` + `pausado`.
  - **En preparación** = `borrador` + `en_revision` + `rechazado`.
  - **Cerrados** = `cerrado`.
- **Filtros/orden**: etapa, buscador por título/barrio, orden (recientes / más
  vistos 30d / mayor-menor precio). Paginación ligera de 12 cards con "Ver más"
  (un agente con 44 propios no renderiza 44 de una).
- **Cada card** (`ListingCard`): portada o ícono por tipo, estado (pill), badge
  **Propio** (lo creaste tú) vs **Asignado** (representas a un propietario),
  precio, specs, mini-panel de rendimiento (aperturas / 30d / favoritos), y el
  **próximo paso** sugerido (`proximoPasoListing`): "Rechazado: corrige y
  republica", "Sin foto de portada", etc.
- **Acciones por card**: Editar (abre el editor) · Pausar / Reactivar · **Marcar
  vendido** · Eliminar.
  - *Eliminar* es **soft-delete** (recuperable con soporte). Filo conocido: un
    `publicado` sigue vivo en el mapa público hasta el próximo refresh — la UI lo
    avisa.
- **Crear listing** → botón que va a `/publicar`.

### Para qué
Ver de un vistazo el estado de cada inmueble y saber qué hacer con cada uno, sin
celdas vacías ni métricas sin acción.

### 3.1 Reportar venta — `CerrarVendidoModal`

#### Qué significa
Marcar un inmueble como vendido/arrendado y reportar el cierre real.

#### Cómo funciona
- Campos: **Precio de cierre** (obligatorio), **Matrícula inmobiliaria/ORIP**
  (obligatoria, llave del registro), **Fecha de cierre** (opc.), **Cédula
  catastral** (opc.). Valida con `validarCierre` (espejo de `CerrarListingRequest`).
- **Calidad del reporte** (barra 0–100%): entre más campos, más verificable. La
  **cédula catastral** da el *boost* porque cruza con catastro → sube más el puntaje.
- Prellena matrícula/catastral si ya venían de `/publicar`.

#### Para qué
Reportar un cierre **desbloquea los comparables de cierre** (precios reales, no de
aviso) y **sube tu puntaje**. Es la contribución que alimenta el dato de todos.

---

## 4. Herramientas

Tres sub-pestañas: **Comparador · Simulador · Servicios**.

### 4.1 Comparador — `ComparadorTab`

- **Qué significa**: poner barrios o listings lado a lado para comparar.
- **Cómo funciona**: dos modos.
  - **Por barrio**: elige comuna → toca hasta **4 barrios** → tarjetas de métricas
    con barras, agrupadas en *💰 Rentabilidad & negocio* (yield, yield renta media,
    años de recupero, valorización anual, proyección 5 años, liquidez) y *📍 Precio &
    zona* (precio/m², arriendo, seguridad, zonas verdes, dist. metro, estrato). El
    mejor valor de cada métrica se marca ★. Filtra placeholders ("AREA EN
    DESARROLLO", "SIN NOMBRE").
    - **Renta corta / Airbnb (POT)**: tarjeta aparte con veredicto por barrio
      (*Permitido / No permitido / Sin dato*). El nuevo POT solo permite renta corta
      en predios de **alta/media mixtura**, no en todo el barrio → caveat: confirmar
      dirección + RNT + autorización de la copropiedad.
  - **Por listing**: *Mis listings* (solo publicados — son los que tienen métricas
    enriquecidas del mapa) o *Cualquier listing* (vía selección desde el mapa).
    Compara 2–5 con la misma tabla enriquecida de `/comparador`.
- **Para qué**: munición para asesorar a un inversionista o justificar un precio.

### 4.2 Simulador — `SimuladorTab`

- **Qué significa**: proyecta la rentabilidad de una inversión en un barrio para
  mostrársela al cliente.
- **Cómo funciona**: parámetros (comuna → barrio, presupuesto $200M–$1.000M,
  modalidad **Airbnb / Renta media / Renta larga**, horizonte fijo 5 años) → `POST`
  a la calculadora (`useSimular`). Devuelve:
  - KPIs: score de oportunidad, yield neto (y bruto), años de recupero,
    ingreso/mes, ganancia a 5 años.
  - **Gráfico** de proyección (valor del inmueble + ingresos acumulados).
  - **Flujo de caja** mensual: ingreso bruto → deducciones (vacancia, fee
    plataforma, retención, administración, mantenimiento, seguro, predial) →
    ingreso neto → (cuota crédito) → **flujo real**.
  - Si la modalidad es **Airbnb**, muestra la nota legal del POT (renta corta).
- **Para qué**: una proyección visual y creíble para cerrar una venta de inversión.

### 4.3 Servicios / Configuración — `ConfiguracionTab`

Tres sub-sub-pestañas:

1. **Perfil público** (`PerfilTab`): foto (se espeja a R2) + descripción (bio,
   máx 2.000 car.). Con vista previa de cómo te verán en el directorio `/agentes`.
   - *Para qué*: una foto clara + bio generan confianza; es tu cara pública.
2. **Horario de visitas** (`DisponibilidadTab`): por día de la semana, un switch +
   franja inicio/fin (slots de 30 min, 06:00–21:00). 
   - *Cómo funciona*: `GET/PUT /realtor/disponibilidad`. Los interesados **solo
     pueden agendar en estas horas**, y se restan automáticamente las ya reservadas.
   - *Para qué*: controlar cuándo te agendan, sin depender de Google Calendar.
3. **Zonas patrocinadas** (`ZonasCompraTab`): compra self-serve de zonas.
   - *Cómo funciona*: elige **nivel** (Comuna ~$1.000/mes · Barrio ~$200/mes) →
     **zona** (las ocupadas salen bloqueadas: *una zona = un solo patrocinador,
     exclusiva*) → **duración** (1/3/6/12 meses) → resumen con total → Comprar.
     Va a la pasarela (`checkout_url`) o, si no hay, al modo demo
     (`zonasConfirmarSimulado`). Un 409 = "esa zona ya tiene patrocinador".
   - *Para qué*: los inmuebles que se publiquen en tus zonas te llegan como
     *propietarios nuevos*. Es el motor del negocio del agente.

---

## 5. Resultados (ex-"Inicio") — `InicioSection`

> Es *consulta periódica* (semanal / al renovar patrocinio), **no** la rutina
> diaria. Por eso está al final del nav: nadie abre su herramienta de trabajo todos
> los días a mirar un velocímetro — la abre para saber a quién llamar (eso es Bandeja).

### 5.1 Qué hacer hoy — `AlertasHoy`

- **Qué significa**: alertas accionables del día, derivadas de datos ya cargados
  (sin backend extra).
- **Cómo funciona**: cuenta clientes nuevos sin responder, visitas por
  confirmar/atender hoy, borradores sin publicar, listings rechazados. Si no hay
  nada: *"Todo al día"*.
- *Nota*: es un dup suave del top de Bandeja; se mantiene como recap.

### 5.2 Resumen de desempeño — `ResumenTab`

#### Qué significa
Cómo te está yendo: tu puntaje y los números que lo mueven.

#### Cómo funciona — los indicadores
Fuente: `useDesempeno` + `useEmbudo`.

- **Standing** (gauge 0–100) + tu ranking (#posición de total).
- **Aceptación** (%) = de los leads asignados en 90 días, cuántos tomaste.
- **Respuesta** = mediana de horas hasta aceptar el cliente (+ grado de servicio).
- **Asistencia** (show rate %) = visitas que sí ocurrieron vs plantones.
- **Oferta / interés**, **Vistas** (30d), **Perdidas** (no tomados + plantones).

**Cómo se calcula el puntaje Standing** (panel "¿Cómo se calcula?",
espejo de `_puntaje_standing` en el backend):

| Driver | Peso | Ventana |
|---|---|---|
| Cierres reportados (con cédula catastral = verificables, suben más) | **35%** | últimos 12 meses |
| Velocidad de respuesta (< 4 h = máximo) | **35%** | últimos 90 días |
| Aceptación de leads | **30%** | últimos 90 días |

> La **asistencia a visitas NO penaliza** el puntaje — *un plantón es del
> comprador, no tuyo*. Se muestra solo como referencia. Necesitas un mínimo de
> actividad reciente para tener puntaje.

**Embudos** (ancho ∝ conteo, % = conversión etapa a etapa):
- *Resultados en tu zona pagada*: Llegaron → Tomados → Publicados → Cerrados, con
  costo por cliente, vistas e inmuebles nuevos del mes.
- *Interés real (30 días)*: Vistas en mapa → Abrieron detalle → Favoritos → Visitas
  pedidas.

#### Para qué
Decidir: ¿mi zona rinde?, ¿vale la pena renovar el patrocinio?, ¿en qué fallo
(respuesta lenta, no acepto leads)? Cada número premia **lo que el agente
controla**.

---

## Apéndice A — Construido pero oculto hoy (sección *Mercado*)

Estos componentes existen en el código pero **no son alcanzables desde el nav
actual**: `SECTIONS` no incluye `mercado`, el render no tiene caso
`section === "mercado"`, y los deep-links `resultados`/`inteligencia` caen en
*Resultados*. Se dejaron en el archivo por si se repurposean. Motivo (AGENTS.md):
eran `_BARRIO_SQL` público reskineado, **sin valor pago propio** — el valor pago
(leads/ROI/funnel de zona) vive en *Resultados*.

- **Zonas de interés** (`ResultadosTab`): tarjeta de tu zona pagada (costo por
  cliente, vistas, inmuebles nuevos), **Comparables de cierre** (precios reales,
  *gated*: se desbloquean al reportar N cierres), y una grid "Información del
  mercado" en lenguaje llano (venta, renta larga, Airbnb, seguridad, ubicación,
  valorización).
- **Inteligencia de barrio** (`InteligenciaTab`): score de inversión por horizonte
  (corto/mediano/largo), venta, renta larga, renta media, Airbnb, seguridad,
  conectividad, valorización — todo por zona patrocinada o barrio de tus listings.

Si se decide reactivar, agregar `mercado` a `SECTIONS` y un caso de render; el
`SubNav` (zonas/inteligencia) ya está cableado en `MercadoSection`.

## Apéndice B — Pendientes y notas

- **Tour desfasado**: `RealtorTourModal` todavía dice *"Las 5 secciones… Mercado…"*.
  El nav vivo son **4** (Mercado oculto). Actualizar el copy del paso 2 cuando se
  toque el tour.
- **Zonas = pasarela en modo demo**: la compra de zona usa `checkout_url` si existe,
  si no confirma simulado. El cobro real va por GHL (no construido aquí).
- **Orden de Resultados**: "Qué hacer hoy" sigue arriba del muro de gauges; es dup
  suave de Bandeja (evaluar quitarlo o dejarlo como recap).

## Apéndice C — Rutas hermanas de `/realtor/*`

- **`/realtor/agency-dashboard`** — panel del *dueño de una agencia* para gestionar
  a sus agentes (otro rol, no el agente individual).
- **`/realtor/accept-invite`** — pantalla para que un agente **acepte la invitación**
  de una agencia por email.

---

### Mapa rápido archivo → sección

| Archivo | Cubre |
|---|---|
| `dashboard.tsx` | Todo el panel (nav, Bandeja, Mis listings, Resultados, modales, Mercado oculto) |
| `ResumenTab.tsx` | Resumen de desempeño (gauges, standing, embudos) |
| `ComparadorTab.tsx` | Herramientas › Comparador |
| `SimuladorTab.tsx` | Herramientas › Simulador |
| `_kit.tsx` / `-ui.tsx` | Átomos de UI (Card, Gauge, KpiCard, Panel, tonos…) |
| `AGENTS.md` | Principios de diseño (el realtor manda) |
