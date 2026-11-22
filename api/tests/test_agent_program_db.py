"""Programa de agentes contra DB real (migración 0131). Corre con: pytest -m require_db"""
import asyncio
import os
import uuid

import asyncpg
import pytest

from api.services import agent_program_service as svc

pytestmark = [pytest.mark.require_db]


def run(c):
    return asyncio.run(c)


async def _with_agent(fn):
    pool = await asyncpg.create_pool(os.environ["DATABASE_URL"], min_size=1, max_size=2)
    email = f"test-prog-{uuid.uuid4().hex[:8]}@example.com"
    try:
        aid = await pool.fetchval(
            "INSERT INTO agent (email, nombre, telefono) VALUES ($1, 'Test Prog', '3000000000') RETURNING id::text",
            email)
        return await fn(pool, aid)
    finally:
        await pool.execute("DELETE FROM agent WHERE email = $1", email)
        await pool.close()


def test_registro_idempotente_por_pago_ref():
    async def fn(pool, aid):
        r1 = await svc.procesar_pago(pool, aid, "registro", "ref-reg-" + aid)
        r2 = await svc.procesar_pago(pool, aid, "registro", "ref-reg-" + aid)
        n = await pool.fetchval("SELECT count(*) FROM agent_program_pago WHERE agent_id = $1::uuid", aid)
        pagado = await pool.fetchval("SELECT registro_pagado_at IS NOT NULL FROM agent WHERE id = $1::uuid", aid)
        return r1["accion"], r2["accion"], n, pagado
    assert run(_with_agent(fn)) == ("aplicado", "duplicado", 1, True)


def test_pago_no_certifica_sin_evaluacion():
    async def fn(pool, aid):
        await svc.procesar_pago(pool, aid, "cert_cuota", f"c-{aid}")
        r = await svc.procesar_pago(pool, aid, "cert_mensual", f"m-{aid}")
        return r["certificado"]
    assert run(_with_agent(fn)) is False


def test_certificado_con_todo_y_vence_sin_plan():
    async def fn(pool, aid):
        await pool.execute(
            "INSERT INTO agent_certificacion (agent_id, anios_experiencia, n_transacciones, examen_estado, "
            "revision_estado) VALUES ($1::uuid, 5, 20, 'aprobado', 'aprobado')", aid)
        await svc.procesar_pago(pool, aid, "cert_cuota", f"c-{aid}")
        r = await svc.procesar_pago(pool, aid, "cert_mensual", f"m-{aid}")
        # plan vence → el cron baja la insignia
        await pool.execute("UPDATE agent SET cert_plan_vence = now() - interval '1 day' WHERE id = $1::uuid", aid)
        async with pool.acquire() as conn:
            await svc.vencer_planes(conn)
        despues = await pool.fetchval("SELECT certificado FROM agent WHERE id = $1::uuid", aid)
        return r["certificado"], despues
    assert run(_with_agent(fn)) == (True, False)


def test_cinco_incluidos_sexto_pide_pago():
    async def fn(pool, aid):
        for i in range(6):
            await pool.execute(
                "INSERT INTO listing_representacion (listing_url, agent_id, estado, created_at) "
                "VALUES ($1, $2::uuid, 'aprobado', now() + make_interval(secs => $3))",
                f"https://ej.test/{aid}/{i}", aid, i)
        await svc.procesar_pago(pool, aid, "cert_mensual", f"m-{aid}")
        cob = [r["cobertura"] for r in await pool.fetch(
            "SELECT cobertura FROM listing_representacion WHERE agent_id = $1::uuid ORDER BY created_at", aid)]
        await svc.procesar_pago(pool, aid, "anuncio", f"a-{aid}", listing_url=f"https://ej.test/{aid}/5")
        sexto = await pool.fetchval(
            "SELECT cobertura FROM listing_representacion WHERE listing_url = $1", f"https://ej.test/{aid}/5")
        await svc.procesar_pago(pool, aid, "cert_ilimitado", f"u-{aid}")
        todos = {r["cobertura"] for r in await pool.fetch(
            "SELECT cobertura FROM listing_representacion WHERE agent_id = $1::uuid", aid)}
        return cob, sexto, todos
    cob, sexto, todos = run(_with_agent(fn))
    assert cob == ["incluido"] * 5 + ["ninguna"]
    assert sexto == "pago"
    assert todos == {"ilimitado", "pago"}


def test_producto_invalido():
    with pytest.raises(svc.ProgramError):
        svc.validar_producto("gratis")
    with pytest.raises(svc.ProgramError):
        svc.validar_producto("anuncio")
