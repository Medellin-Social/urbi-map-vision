# Premortem Transcript · Urbidata Lanzamiento B2B
Fecha: 15 mayo 2026

---

## Contexto recopilado

**Qué:** Urbidata — motor de decisión inmobiliaria para el Valle de Aburrá (Medellín, Colombia). App web React + Mapbox mostrando por barrio: yields estimados, precios justos de mercado, índices de seguridad, oportunidades de inversión. Onboarding con presupuesto (COP), objetivo (airbnb / renta larga / valorización / mixto) y perfil de riesgo. Calculadora, comparador, perfiles adaptativos. Bilingüe. Desplegado en Railway.

**Para quién:** Objetivo inicial B2B — inmobiliarias, fondos de inversión, desarrolladores en Medellín.

**Criterio de éxito:** Firmar contratos B2B con al menos una inmobiliaria, fondo o desarrollador en los primeros 3-6 meses.

**Encuadre del premortem:** Han pasado 6 meses. Urbidata lanzó para B2B. Falló. No hubo contratos. Trabajamos hacia atrás para entender por qué.

---

## Razones de fallo (premortem en bruto)

1. Los datos (yields, precios, índices de seguridad) no resisten escrutinio de un comprador B2B serio
2. El ciclo de ventas B2B en real estate colombiano es más largo de lo que el fundador estimó; 6 meses desde cero no alcanza
3. El comprador B2B no siente el problema: inmobiliarias y fondos ya tienen redes informales y analistas propios
4. Sin moat de datos — cualquier pasante puede replicar la agregación
5. El producto es B2C, no B2B: falta API, white-label, multi-usuario, exports, reportes custom
6. Mercado de un solo metro (Valle de Aburrá) con TAM real demasiado estrecho para B2B serio
7. Exposición legal/reputacional: datos de "yields" e "índices de seguridad" sin fuentes auditables ni disclaimers
8. Gap de credibilidad: fondos y desarrolladores no confían en datos de inversión de una startup sin track record

---

## Análisis profundo por agente

### Modo de fallo 1: Datos no resisten due diligence B2B

**Historia del fallo:**
Valorar Inmobiliaria (fondo mediano, 40+ unidades en Laureles/El Poblado) pidió una demo en la semana 3. El mapa impresionó. El analista del fondo tomó notas y pidió metodología de los datos. El fundador envió explicación de las fuentes: scrapers de Finca Raíz y Metrocuadrado, datos del DANE de 2022, y reportes de policía procesados con NLP. Respuesta del analista tres días después: los yields no incorporaban vacancia real ni costos de administración. Los precios de Finca Raíz son de oferta, no de cierre. Los datos del DANE tenían dos años de antigüedad en un mercado que movió 12% en 18 meses. El índice de seguridad mezclaba denuncias formales con percepción ciudadana sin separar las capas. El fondo descartó el producto ese mismo día. Dos prospectos más hicieron due diligence similar. Uno comparó el "precio justo" de Urbidata para un apartamento en Sabaneta contra el precio real de cierre en sus registros: diferencia del 18%. Nadie firmó.

**Supuesto subyacente:** El fundador asumía que datos públicos procesados con buena UX equivalen a datos confiables para decisiones de inversión real.

**Señales de advertencia:**
- El primer prospecto B2B pide la metodología, no hace una segunda pregunta sobre features.
- Comparación manual de 3 propiedades conocidas vs. "precio justo" → error >10% mata el deal.

---

### Modo de fallo 2: Ciclo de ventas B2B más largo de lo esperado

**Historia del fallo:**
Enero: el fundador tiene el producto listo y empieza a pedir reuniones en frío. Algunas inmobiliarias responden. Febrero: primera reunión real en El Poblado. Les gusta el demo. "Volvamos a hablar." Anotado como pipeline caliente. Marzo-abril: loop de seguimientos. El ciclo interno requiere gerente comercial + gerente general + a veces el dueño. Nadie coincide disponible. Un fondo pide piloto gratuito de 60 días antes de hablar de contrato. El fundador acepta. Mayo: dos pilotos activos, cero pesos, runway consumiéndose. Junio: los pilotos terminan. Una firma necesita integración con su CRM. El fondo quiere ver cómo lo usan otros clientes primero. No hay otros clientes. Mes 6 sin contratos, con referencias prometidas pero condicionales. En este sector, una firma sin track record tarda 12-18 meses en cerrar su primer B2B, incluso con un producto bueno.

**Supuesto subyacente:** "Si el producto es valioso y lo demuestro, la decisión de compra seguirá la lógica del valor, no la lógica institucional del sector."

**Señales de advertencia:**
- En la primera reunión real, el interlocutor dice "hay que presentárselo al gerente" en vez de tomar una decisión o escalar proactivamente.
- El primer lead exige piloto gratuito antes de negociar precio.

---

### Modo de fallo 3: Comprador no siente el problema

**Historia del fallo:**
Los primeros dos meses fueron reuniones con inmobiliarias grandes. Respuesta: "muy interesante, nos llaman." Nadie firmó. El equipo lo interpretó como ciclo de venta largo. En el mes 3, un fondo pequeño hizo piloto. El analista senior dijo que los datos de yield "no coinciden con lo que ellos manejan" — sus propias bases, sus propios corredores, su inteligencia de calle acumulada en 15 años. Patrón claro en el mes 4: los compradores B2B reales no buscan un mapa bonito. Tienen WhatsApp groups con 40 corredores. Tienen analistas junior a $1.200 USD/mes haciendo exactamente lo mismo. El decisor — el socio o gerente de inversiones — usa almuerzo con el notario del barrio. Urbidata era solución en busca de dolor. Mes 6: sin contrato firmado, pivot a B2C que tampoco tiene tracción porque ese segmento no paga por datos en Colombia.

**Supuesto subyacente:** "Los compradores B2B toman decisiones basadas en datos estructurados y pagarían por acceso a esos datos si estuvieran bien presentados."

**Señales de advertencia:**
- Nadie pregunta el precio en las demos iniciales.
- Los prospectos describen su proceso actual sin mencionar ningún punto de dolor.

---

### Modo de fallo 4: Sin moat de datos — replicable

**Historia del fallo:**
Semana 8: reunión con fondo con tres proyectos activos en El Poblado. El demo funciona bien. El analista senior pregunta: "¿De dónde vienen los precios por metro cuadrado?" Respuesta: Finca Raíz, MetroCuadrado, catastro público. Silencio incómodo. "Eso ya lo scrapea nuestro pasante." Las siguientes cuatro reuniones siguieron el mismo patrón. Inmobiliarias medianas que usan Urbidata como validación de lo que ya saben. Desarrolladores que piden datos de escrituras históricas, rentabilidad real de arrendamiento, absorción por torre. Un competidor de Bogotá con acceso directo a notarías empieza a aparecer en las conversaciones. Mes 4: pipeline paralizado no por falta de interés sino por una objeción repetible sin respuesta. El producto era visualmente superior, pero en la sala de decisión B2B lo que importaba era la capa de datos propietarios que nadie puede replicar. Urbidata no la tenía.

**Supuesto subyacente:** "La capa de presentación y análisis crea valor diferencial suficiente para B2B, aun cuando los datos subyacentes son públicos y replicables."

**Señales de advertencia:**
- Ningún prospecto firmó NDA antes de preguntar por las fuentes de datos.
- Las demos generaban preguntas sobre datos que el sistema no puede responder (escrituras, absorción real), no sobre funcionalidades que faltaban.

---

### Modo de fallo 5: Producto B2C intentando vender B2B

**Historia del fallo:**
Primera reunión con Conconcreto. El director de inversiones ve el mapa: "qué bacano". Luego: "¿Puedo conectar esto a nuestro ERP?" No. "¿Puedo exportar todos los barrios con sus indicadores a Excel?" No directamente. "¿Puedo darle acceso a mis cinco analistas con perfiles separados?" No. La reunión termina en 40 minutos. "Lo vamos a evaluar internamente." No vuelven a escribir. El mismo patrón con tres fondos y dos inmobiliarias medianas. El producto entrega exploración personal, no herramienta de trabajo corporativo. Para resolverlo hacen falta 6 meses de desarrollo adicional: API documentada, roles de usuario, exportación estructurada, reportes parametrizables. El equipo no tiene ese tiempo porque necesita contratos para sobrevivir. El círculo se cierra.

**Supuesto subyacente:** "Si el dato es valioso para un individuo, una empresa pagará por dárselo a sus analistas sin necesitar infraestructura diferente."

**Señales de advertencia:**
- En conversaciones exploratorias con prospectos B2B, ninguno pregunta el precio antes de preguntar por integración o exportación.
- El roadmap no tiene API, multi-usuario ni exportación masiva en los primeros 3 meses, aunque el pitch menciona "solución para inmobiliarias".

---

### Modo de fallo 6: Mercado de un solo metro — TAM demasiado estrecho

**Historia del fallo:**
Los primeros contactos con inmobiliarias locales fueron educados pero sin contratos. Los agentes de Medellín ya saben qué barrios suben. Los tres fondos contactados operaban en Bogotá, CDMX y Panamá; el Valle de Aburrá era una línea en su pipeline, no un mercado prioritario. Pidieron cobertura de al menos cuatro ciudades colombianas antes de considerar una demo. Mes 4: pivot hacia desarrolladores VIS. Los medianos tienen relaciones directas con la Alcaldía y el DANE. Los grandes tienen equipos internos. Mes 6: 12 prospectos calificados, cero cierres. El TAM real, depurado de clientes que ya tienen el conocimiento gratis o que requieren escala geográfica, era de decenas de empresas, no de cientos.

**Supuesto subyacente:** "Concentración geográfica profunda compensa amplitud de mercado cuando el cliente B2B valora la granularidad local."

**Señales de advertencia:**
- En las primeras 5 llamadas de discovery, ningún prospecto pregunta el precio.
- Los fondos contactados en frío responden pidiendo cobertura multi-ciudad como condición previa a cualquier evaluación.

---

### Modo de fallo 7: Exposición legal bloquea cierre

**Historia del fallo:**
Grupo Cóndor (50+ agentes, portafolio institucional) llega hasta propuesta comercial en semana 8. El director de expansión adora el dashboard. Lleva la propuesta a su departamento legal para formalizar el contrato de datos. El abogado interno hace tres preguntas: ¿De dónde viene el índice de seguridad? ¿Qué metodología calcula el yield? ¿Qué pasa si un cliente toma una decisión de inversión basada en este dato y pierde dinero? Urbidata no tiene respuestas documentadas. No hay metodología publicada, no hay fuentes citadas, no hay disclaimer de liability visible. Concepto negativo en 48 horas. Deal muerto. Dos semanas después: mismo escenario con fondo de capital privado. Su compliance officer señala que en Colombia, los datos usados para decisiones de inversión inmobiliaria tienen implicaciones bajo la regulación de la SFC si se presentan sin advertencias adecuadas. Urbidata nunca había consultado a un abogado colombiano especializado en datos financieros.

**Supuesto subyacente:** "El producto vende a quienes toman decisiones, pero nunca se anticipó que esas personas tienen gatekeepers legales que bloquean antes de firmar."

**Señales de advertencia:**
- Ningún prospecto pregunta metodología en demos — no porque confíen, sino porque aún no han involucrado a su equipo legal.
- La plataforma no tiene página de metodología, TyC ni disclaimers de inversión en producción.

---

### Modo de fallo 8: Gap de credibilidad — sin track record

**Historia del fallo:**
Las primeras reuniones con fondos terminaron todas igual: "interesante, ¿con quién más trabajan?" No había respuesta. Los comerciales vendieron el producto visual y la tecnología. Los analistas de los fondos preguntaron por metodología de valoración, fuentes, backtests. No existían documentados. El ciclo se repitió 15 veces en 4 meses. Mes 3: un desarrollador mediano aceptó piloto no remunerado "para evaluar". Generó análisis, encontró discrepancias sin explicación metodológica, archivó el asunto sin reunión de cierre. Mes 5: ajuste hacia inmobiliarias más pequeñas. El precio no tenía sentido para operaciones que no justifican análisis sofisticado. Mes 6: sin contrato. La pregunta "¿con quién ya trabajan?" era una señal estructural, no un obstáculo táctico.

**Supuesto subyacente:** "Un producto visualmente convincente puede sustituir track record y metodología publicada en ventas B2B de alto riesgo."

**Señales de advertencia:**
- En las primeras 3 reuniones, todos los prospectos preguntan "¿con quién ya trabajan?" antes de preguntar el precio.
- Ningún prospecto solicita segunda reunión sin que el equipo inicie el follow-up.

---

## Síntesis

### Fallo Más Probable
El comprador B2B no siente el problema que Urbidata resuelve, combinado con que el producto es B2C (sin API, multi-usuario, ni exports). Inmobiliarias y fondos tienen redes informales y analistas propios. El primer prospecto serio preguntará "¿qué problema resuelve esto que yo no resuelvo ya?" y no habrá respuesta. La brecha entre el producto actual y lo que necesita un cliente empresarial es insalvable en 6 meses.

### Fallo Más Peligroso
Exposición legal por datos sin metodología documentada. Urbidata presenta yields, precios justos e índices de seguridad sin fuentes auditables, sin disclaimers, sin metodología pública. Si un cliente actúa sobre esos datos y pierde dinero, hay exposición bajo regulación colombiana (SFC) que puede matar la empresa, no solo el deal.

### El Supuesto Oculto
"Datos públicos bien presentados con buena UX = ventaja competitiva B2B." Este supuesto subyace a casi todos los modos de fallo: los datos son replicables, los compradores los validan contra sus propias fuentes, los abogados bloquean sin metodología documentada, y los competidores con acceso a notarías tienen moat real.

### Plan Revisado
1. **Antes de siguiente demo B2B:** Hacer 10 entrevistas de discovery con un analista de fondo o inmobiliaria mediana. Medir si mencionan un dolor espontáneamente. Si no — no hay mercado, no seguir.
2. **Esta semana:** Publicar metodología en /metodologia: fuentes exactas, frecuencia de actualización, margen de error declarado. Agregar TyC y disclaimer de inversión en todos los mapas y calculadoras.
3. **Antes de ir a mercado con datos:** Validar "precio justo" de Urbidata contra 5 transacciones reales de cierre conocidas. Si error >10%, no ir a mercado con ese dato.
4. **Primer cliente real:** No ir a fondos grandes. Encontrar un inversor individual activo (>$500M COP, sin analistas propios) y convertirlo en cliente pagado de referencia.
5. **Para B2B real:** Construir export CSV de barrios con todos los indicadores antes de la próxima ronda de demos empresariales.

### Pre-Launch Checklist
- [ ] 10 entrevistas de discovery con target B2B real — medir si mencionan dolor espontáneamente
- [ ] Publicar /metodologia: fuentes, frecuencia, márgenes de error, qué significa cada indicador
- [ ] Agregar TyC, disclaimer de inversión y atribución de fuentes antes de cualquier demo comercial
- [ ] Validar "precio justo" contra 5 transacciones de cierre reales. Error máximo: 10%
- [ ] Construir export CSV/Excel de indicadores por barrio antes de vender a empresas
- [ ] Preparar respuesta a "¿con quién ya trabajan?" con al menos 1 cliente de referencia pagado

---

*Premortem ejecutado: 15 mayo 2026 · 8 agentes en paralelo · método Gary Klein*
