"""Domain logic for zone sponsorships."""
from __future__ import annotations

from datetime import date
from typing import Any, Sequence
from uuid import UUID


def _vigentes(
    sponsorships: Sequence[Any],
    zona_nivel: str,
    zona_codigo: str,
    hoy: date | None = None,
) -> list[UUID]:
    """Pure filter: returns agency_ids from active sponsorships for a zone today.

    Ordenados por fecha_inicio ASC, agency_id — determinista y estable: el
    asignador (paso 5) toma [0] como el patrocinio más antiguo para el reparto.

    sponsorships: iterable of objects/namespaces with fields
        agency_id, zona_nivel, zona_codigo, estado, fecha_inicio, fecha_fin.
    """
    hoy = hoy or date.today()
    activos = [
        s
        for s in sponsorships
        if (
            str(s.zona_nivel) == zona_nivel
            and str(s.zona_codigo) == str(zona_codigo)
            and str(s.estado) == "activa"
            and s.fecha_inicio <= hoy <= s.fecha_fin
        )
    ]
    activos.sort(key=lambda s: (s.fecha_inicio, str(s.agency_id)))
    return [s.agency_id for s in activos]


async def patrocinadores_vigentes(
    zona_nivel: str,
    zona_codigo: str,
    pool: Any,
    hoy: date | None = None,
) -> list[str]:
    """Return agency_ids (as str) that actively sponsor a zone today.

    Uses the composite index (zona_nivel, zona_codigo, estado) + date range filter.
    """
    hoy = hoy or date.today()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT agency_id::text
            FROM sponsorship
            WHERE zona_nivel = $1::sponsorship_zona_nivel
              AND zona_codigo = $2
              AND estado      = 'activa'
              AND fecha_inicio <= $3
              AND fecha_fin    >= $3
            ORDER BY fecha_inicio ASC, agency_id
            """,
            zona_nivel,
            str(zona_codigo),
            hoy,
        )
    return [r["agency_id"] for r in rows]


async def zona_cubierta(
    pool: Any, barrio_id: Any, agent_id: Any | None = None, solo_asignable: bool = False
) -> bool:
    """¿Algún patrocinio vigente cubre este barrio? Cubre tanto patrocinio
    barrio-directo (zona_codigo = barrio_id) como comuna (zona_codigo = la comuna
    del barrio, vía analytics.barrios_cd — mismo join key que _ZONAS_SQL).

    - agent_id: restringe a las zonas de ESE agente → pool y `tomar` zona-locked
      (un realtor solo ve/toma su zona).
    - solo_asignable: exige que la agency patrocinadora tenga un agente ACTIVO
      (asignable). Lo usa owner /publicar para decidir borrador vs en_revision:
      si NINGÚN agente activo cubre la zona, nadie la revisaría → va a admin.
      Sin esto, una zona patrocinada pero con agente inactivo dejaría el listing
      atascado en borrador (nadie lo toma, admin no lo ve).
    - sin flags: ¿la zona tiene patrocinador vigente? (contrato activo).
    """
    # Los joins inyectan solo cláusulas constantes (sin input de usuario) → seguro.
    # $1 = barrio_id; $2 = agent_id (si aplica).
    if agent_id is not None:
        join = "JOIN agency_member am ON am.agency_id = s.agency_id AND am.agent_id = $2"
    elif solo_asignable:
        # agente 'activo' = ESTADOS_ASIGNABLES (único estado asignable hoy).
        join = ("JOIN agency_member am ON am.agency_id = s.agency_id "
                "JOIN agent a ON a.id = am.agent_id AND a.estado = 'activo'")
    else:
        join = ""
    sql = f"""
        SELECT EXISTS (
          SELECT 1 FROM sponsorship s
          {join}
          WHERE s.estado = 'activa'
            AND CURRENT_DATE BETWEEN s.fecha_inicio AND s.fecha_fin
            AND ( (s.zona_nivel = 'barrio' AND s.zona_codigo = $1)
               OR (s.zona_nivel = 'comuna' AND s.zona_codigo IN (
                     SELECT bc.cd_comuna::text FROM analytics.barrios_cd bc
                     WHERE bc.barrio_id::text = $1)) )
        )
    """
    args = [str(barrio_id)] + ([str(agent_id)] if agent_id is not None else [])
    async with pool.acquire() as conn:
        return bool(await conn.fetchval(sql, *args))
