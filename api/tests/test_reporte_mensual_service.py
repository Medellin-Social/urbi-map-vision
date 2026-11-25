from datetime import date

import api.services.reporte_mensual_service as svc


def test_periodo_anterior():
    assert svc.periodo_anterior(date(2026, 12, 1)) == (date(2026, 11, 1), date(2026, 12, 1))
    assert svc.periodo_anterior(date(2027, 1, 15)) == (date(2026, 12, 1), date(2027, 1, 1))


class Pool:
    def __init__(self, metricas, claim=True):
        self.metricas, self.claim, self.deleted = metricas, claim, 0

    async def fetch(self, sql, *a):
        return [{"id": "a1", "usuario_id": 1, "nombre": "Ana", "email": "a@x.co"}]

    async def fetchrow(self, sql, *a):
        return self.metricas

    async def fetchval(self, sql, *a):
        return "a1" if self.claim else None

    async def execute(self, sql, *a):
        self.deleted += 1


M = {"vistas_mapa": 5, "aperturas": 2, "visitas_recibidas": 1, "visitas_respondidas": 1, "visitas_realizadas": 0}
CERO = {k: 0 for k in M}


async def test_envia_con_actividad(monkeypatch):
    sent = []

    async def fake(to, subject, html):
        sent.append((to, html))
    import api.utils.email as em
    monkeypatch.setattr(em, "send_email", fake)
    r = await svc.enviar_reportes(Pool(M), date(2026, 12, 1))
    assert r == {"enviados": 1, "sin_actividad": 0, "fallaron": 0}
    assert "noviembre" in sent[0][1] and "100 %" in sent[0][1]


async def test_sin_actividad_no_envia():
    assert (await svc.enviar_reportes(Pool(CERO), date(2026, 12, 1)))["sin_actividad"] == 1


async def test_ya_enviado_no_repite(monkeypatch):
    r = await svc.enviar_reportes(Pool(M, claim=False), date(2026, 12, 1))
    assert r["enviados"] == 0


async def test_fallo_de_email_libera_el_claim(monkeypatch):
    async def boom(*a):
        raise RuntimeError("smtp")
    import api.utils.email as em
    monkeypatch.setattr(em, "send_email", boom)
    pool = Pool(M)
    r = await svc.enviar_reportes(pool, date(2026, 12, 1))
    assert r["fallaron"] == 1 and pool.deleted == 1
