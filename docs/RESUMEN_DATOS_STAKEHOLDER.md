# Qué tan completa está nuestra inteligencia de datos

*Resumen ejecutivo — 24 de agosto de 2026*

## En una frase

Hemos construido una base de datos con información real de más de 600 barrios del Valle de Aburrá — precios, seguridad, movilidad, zonas verdes, y el catastro de más de un millón de predios. La mayor parte ya está funcionando y visible para el usuario. Una parte, ya pagada y calculada, estaba guardada sin usarse — la conectamos hoy.

## El panorama general

| Qué tenemos | Qué tan completo | ¿El usuario ya lo ve? |
|---|---|---|
| Seguridad por zona | 44% de los barrios — solo donde la Alcaldía publica el dato oficial (comunas de Medellín) | ⚠️ Sí, pero solo en esos barrios; en la propiedad es un dato exclusivo para agentes |
| Precios y avalúos catastrales | Más de 1.1 millones de predios | ✅ Sí, comparado contra el precio de venta |
| Zonas verdes / parques | Los 610 barrios | ✅ Sí |
| Sitios de interés (metro, colegios, universidades, gimnasios...) | Los 610 barrios | ✅ Sí |
| Tráfico y congestión vial | 95% de los barrios | ✅ **Recién conectado hoy** |
| Propiedades en venta/arriendo | Casi 100 mil propiedades de 6 fuentes distintas | ✅ Sí, es el corazón del mapa |
| Airbnb y renta de mediano plazo | Donde existe ese mercado | ✅ Sí, en el panel de inteligencia para agentes |
| Puntaje de oportunidad de inversión | Los 610 barrios | ✅ Sí, corto/mediano/largo plazo |
| Uso de suelo (qué tan residencial/comercial es cada zona) | Descargado y listo | ❌ Nunca se mostró |
| Historial de compraventas reales (SNR) | Casi 600 mil transacciones | ⚠️ Solo una fracción se usa |
| Fotos optimizadas de las propiedades | Sistema construido | ❌ Pendiente de activar |

## Lo que ya funciona de punta a punta

La columna vertebral del producto — **precios de mercado, seguridad, zonas verdes, sitios de interés y el catastro** — está completa y conectada desde la fuente de datos hasta lo que ve el usuario en el mapa, en el panel del barrio y en cada ficha de propiedad. Esto no es un prototipo: son datos oficiales (alcaldía, catastro, OpenStreetMap) actualizados y en uso todos los días.

Las seis fuentes de propiedades en venta/arriendo (los portales inmobiliarios más grandes del país, más nuestros propios listados) están unificadas en un solo feed que alimenta el mapa completo.

## El hallazgo principal: pagamos por un dato y no lo estábamos mostrando

Desde hace tiempo el sistema mide **congestión vehicular real** — con un servicio pago (HERE, un proveedor de datos de tráfico como los que usan Waze o Google Maps) — para el 95% de los barrios: qué tan trancado está cada zona, en qué horas, y cómo se compara con el resto de la ciudad. Ese dato se calculó, se guardó… y nunca llegó al usuario. Nadie lo veía.

Hoy lo conectamos. Ahora cuando alguien mira un barrio o una propiedad en el mapa, ve también qué tan pesado es el tráfico en esa zona y a qué horas — la misma información que antes existía solo en la base de datos, ahora visible en el producto. No hubo que pagar por datos nuevos: era inventario que ya teníamos pagado, esperando ser usado.

## Lo que sigue pendiente (oportunidades, no urgencias)

- **Uso de suelo (POT):** tenemos el dato de qué tan residencial, comercial o mixta es cada zona de Medellín — nunca se usó. Podría enriquecer el análisis de inversión.
- **Historial de compraventas reales:** casi 600 mil transacciones de propiedad real (no listados, ventas ya cerradas) — hoy solo aprovechamos una fracción para proyectar valorización. Hay mucho más detalle sin explotar.
- **Fotos optimizadas:** ya construimos el sistema para servir fotos más livianas y rápidas, falta terminar de activarlo — hoy las fotos siguen sirviéndose desde la fuente original.

Ninguno de estos tres es un problema — es trabajo ya adelantado (los datos están descargados y limpios) al que le falta el último paso de conectarlo al producto, igual que hicimos hoy con tráfico.

## Nota de alcance

Este resumen cubre las capas de "inteligencia urbana" (precios, seguridad, movilidad, catastro, etc.). No incluye las tablas internas de la aplicación (usuarios, agentes, suscripciones) — eso es infraestructura de producto, no datos de mercado.
