# Documentos legales — Medellín Social

> ⚠️ **BORRADORES. NO publicar sin revisión de un abogado colombiano de protección de
> datos / consumo.** Estos documentos son un punto de partida profesional adaptado a la
> ley colombiana, pero contienen decisiones jurídicas (p. ej. alcance del derecho de
> retracto, scraping de datos de terceros, transferencias internacionales a GHL/Stripe)
> que un abogado debe validar antes de ir a producción. No constituyen asesoría legal.

## Qué hay aquí

| Archivo | Documento | Marco legal |
|---|---|---|
| [politica-tratamiento-datos-personales.md](politica-tratamiento-datos-personales.md) | Política de Tratamiento de Datos Personales | Ley 1581/2012, Decreto 1377/2013, Decreto 1074/2015 |
| [aviso-de-privacidad.md](aviso-de-privacidad.md) | Aviso de Privacidad (resumen en el punto de recolección) | Decreto 1377/2013 art. 14–16 |
| [autorizacion-tratamiento-datos.md](autorizacion-tratamiento-datos.md) | Autorización (texto del checkbox de consentimiento) | Ley 1581/2012 art. 9, Decreto 1377 art. 5–9 |
| [terminos-y-condiciones.md](terminos-y-condiciones.md) | Términos y Condiciones de Uso | Ley 1480/2011 (Estatuto del Consumidor), Ley 527/1999, Circular Única SIC |
| [politica-de-cookies.md](politica-de-cookies.md) | Política de Cookies | Ley 1581 + buenas prácticas |

## Cómo se construyeron

- **Estructura** tomada de plantillas open-source: [General-Legal/legal-templates](https://github.com/General-Legal/legal-templates) (CC0, redactadas por abogados — base de los T&C y Política de Datos), [remarkablemark/legal-templates](https://github.com/remarkablemark/legal-templates) (MIT) y [ryuno2525/privacy-policy-templates](https://github.com/ryuno2525/privacy-policy-templates) (MIT).
- **Contenido jurídico** reescrito para Colombia. Lo de GDPR/US (arbitraje vinculante, class-action waiver, "lawful basis", DPA) se **eliminó o reemplazó** por el régimen de Habeas Data (Ley 1581) y el Estatuto del Consumidor (Ley 1480). Ninguna plantilla de GitHub es colombiana.
- Modelo de la **SIC** (Cartilla de Formatos Modelo) como referencia de la estructura obligatoria del art. 13 Decreto 1377.

## Antes de publicar — checklist

- [ ] Llenar todos los `[[PLACEHOLDERS]]` (razón social, NIT, domicilio, correos, representante legal).
- [ ] Resolver cada `⚠️ REVISAR` marcado en los documentos.
- [ ] **Revisión por abogado colombiano.**
- [ ] **Registrar la(s) base(s) de datos en el RNBD** de la SIC si la empresa supera el umbral de activos (Decreto 090/2018: obligadas las sociedades con activos > 100.000 UVT; las personas naturales y PYMES por debajo del umbral están exceptuadas del registro, **pero igual deben cumplir la ley**). Confirmar umbral vigente con el abogado.
- [ ] Publicar los documentos en el sitio de forma **accesible, imprimible y descargable** (Ley 1480), en **castellano**.
- [ ] Incluir **enlace visible a la SIC** (`https://www.sic.gov.co`) en el pie del sitio / checkout.
- [ ] Conectar la **Autorización** al flujo real de registro/consentimiento (ya existe el consentimiento de tracking — migr 0121; alinear con esto).

## Estado de los datos de identificación

**Ya fijados** (nov-2026):
- Responsable / operador: **EASE Association**
- Dominio: **medellin.social**
- Correo de datos personales: **privacidad@medellin.social**
- Correo de PQRS / soporte: **soporte@medellin.social**

> ⚠️ Crear los buzones `privacidad@` y `soporte@` en el dominio antes de publicar.

**Pendientes por completar** (el abogado/contador los define):

```
EASE — razón social exacta + naturaleza jurídica (¿SAS, Corp, Inc., asociación?)
[[NIT]]           NIT con dígito de verificación (o Tax ID si la entidad es extranjera)
[[DOMICILIO]]     Dirección física
[[CIUDAD]]        Ciudad
[[REPRESENTANTE]] Nombre del representante legal
[[TELÉFONO]]      Teléfono de contacto
[[FECHA]]         Fecha de entrada en vigencia
```

> ⚠️ **Si EASE Association es una entidad extranjera (no colombiana)**, actuar como
> Responsable de datos de titulares en Colombia tiene implicaciones (representante/
> encargado local, régimen de transferencia internacional, registro RNBD). El abogado
> colombiano debe validarlo — puede ser necesario que el Responsable sea una entidad
> colombiana o designar un encargado en Colombia.

Fuentes de derecho citadas en los documentos:
[Ley 1581/2012](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981) ·
[Decreto 1377/2013](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=53646) ·
[Ley 1480/2011](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44306) ·
[SIC](https://www.sic.gov.co)
