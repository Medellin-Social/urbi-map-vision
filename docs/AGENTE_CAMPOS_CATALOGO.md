# Catálogo de campos — tabla `agentes` (Portal viejo)

> Insumo de diseño para crecer `agent` (UUID, 0045) / `agency` / satélite KYC.
> Snapshot del schema de `agentes` ANTES de borrarla. NO se migran datos (censo = sin datos reales).
> Fuente: `information_schema.columns` (local, schema idéntico a prod por migraciones 0005/0020/0035).
> 53 columnas. Fecha: 2026-07-12.

| # | Columna | Tipo | Nullable | Grupo | Destino en `agent` (0045) |
|---|---|---|---|---|---|
| 1 | id | integer | NO | id | → agent.id (UUID) |
| 2 | usuario_id | integer | YES | id | ✓ agent.usuario_id |
| 3 | telefono | varchar | YES | contacto | ✓ agent.telefono |
| 4 | whatsapp | varchar | YES | contacto | ✗ |
| 5 | email | varchar | YES | contacto | ✓ agent.email |
| 6 | licencia | varchar | YES | credencial | ✗ |
| 7 | bio | text | YES | perfil | ✗ |
| 8 | ciudad_id | integer | YES | ubicación | ✗ |
| 9 | idiomas | array | YES | perfil | ✗ |
| 10 | plan | varchar | YES | comercial | ✗ (plan vive en usuarios/suscripciones_usuario) |
| 11 | created_at | timestamp | YES | meta | ✓ |
| 12 | updated_at | timestamp | YES | meta | ✓ |
| 13 | nombre_completo | text | YES | identidad | ✓ agent.nombre |
| 14 | cedula_numero | text | YES | **KYC** | ✗ |
| 15 | cedula_foto_frente | text | YES | **KYC** | ✗ |
| 16 | cedula_foto_reverso | text | YES | **KYC** | ✗ |
| 17 | foto_perfil | text | YES | perfil | ✓ agent.foto_url |
| 18 | fecha_nacimiento | date | YES | KYC | ✗ |
| 19 | rut_documento | text | YES | **fiscal** | ✗ |
| 20 | tarjeta_profesional | text | YES | credencial | ✗ |
| 21 | inmobiliaria_nombre | text | YES | agencia | ~ → agency |
| 22 | inmobiliaria_nit | text | YES | agencia | ~ → agency |
| 23 | es_independiente | boolean | YES | agencia | ✗ |
| 24 | anos_experiencia | integer | YES | perfil | ✗ |
| 25 | transacciones_cerradas | integer | YES | perfil | ✗ |
| 26 | especialidad | array | YES | perfil | ✗ |
| 27 | tipo_inmueble | array | YES | perfil | ✗ |
| 28 | precio_rango_min | numeric | YES | perfil | ✗ |
| 29 | precio_rango_max | numeric | YES | perfil | ✗ |
| 30 | zonas_opera | array | YES | **operación** | ✗ (relevante asignador/sponsorship por zona) |
| 31 | telefono_verificado | boolean | YES | verificación | ✗ |
| 32 | email_verificado | boolean | YES | verificación | ✗ |
| 33 | linkedin | text | YES | marketing | ✗ |
| 34 | instagram | text | YES | marketing | ✗ |
| 35 | sitio_web | text | YES | marketing | ✗ |
| 36 | referencia_1_nombre | text | YES | **due diligence** | ✗ |
| 37 | referencia_1_telefono | text | YES | due diligence | ✗ |
| 38 | referencia_1_tipo | text | YES | due diligence | ✗ |
| 39 | referencia_2_nombre | text | YES | due diligence | ✗ |
| 40 | referencia_2_telefono | text | YES | due diligence | ✗ |
| 41 | referencia_2_tipo | text | YES | due diligence | ✗ |
| 42 | referencia_3_nombre | text | YES | due diligence | ✗ |
| 43 | referencia_3_telefono | text | YES | due diligence | ✗ |
| 44 | referencia_3_tipo | text | YES | due diligence | ✗ |
| 45 | acepta_terminos | boolean | YES | **legal** | ✗ |
| 46 | acepta_politica | boolean | YES | legal | ✗ |
| 47 | acepta_suspension | boolean | YES | legal | ✗ |
| 48 | firma_timestamp | timestamptz | YES | legal | ✗ |
| 49 | estado | text | YES | estado | ✓ agent.estado (enum) |
| 50 | motivo_rechazo | text | YES | estado | ≈ agent.motivo_estado |
| 51 | fecha_registro | timestamptz | YES | meta | ≈ created_at |
| 52 | fecha_aprobacion | timestamptz | YES | auditoría | ✗ |
| 53 | aprobado_por | text | YES | auditoría | ✗ |

## Bloques que `agent` NO cubre (a diseñar si se quieren conservar)
- **KYC** (14-16, 18): cédula número + fotos, nacimiento.
- **Fiscal/credencial** (6, 19, 20): licencia, RUT, tarjeta profesional.
- **Legal** (45-48): aceptaciones + firma_timestamp (evidencia de consentimiento).
- **Due diligence** (36-44): 9 campos de referencias → evaluar reuso de `due_diligence_item`.
- **Perfil/marketing** (7, 9, 24-29, 33-35): bio, idiomas, experiencia, especialidad, redes.
- **Operación** (30): `zonas_opera` → relevante para asignador/sponsorship por zona.
- **Agencia** (21-23): inmobiliaria → `agency`.
- **Auditoría** (52-53): aprobado_por, fecha_aprobacion.
