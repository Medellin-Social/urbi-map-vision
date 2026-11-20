"""Orden de aparición del directorio de realtors por zona — rotación ponderada
estable por sesión.

Cada zona (community) tiene hasta 20 posiciones. La posición 1 (primer suscriptor)
pesa más que la 2, y así hasta la 20, pero NINGUNA queda invisible (peso > 0). El
orden es una PERMUTACIÓN aleatoria ponderada (Efraimidis–Spirakis), no un pick del
tope ni un sort por peso:
    P(posición k queda arriba) = peso_k / Σ peso
Decrece con la posición y toda posición tiene prob > 0 en todo rango.

Semilla = session_id (string) directo. NO usar hash(session_id): el hash de str
en CPython está salado por PYTHONHASHSEED → cambia entre procesos/reinicios y
rompería la estabilidad entre workers. random.Random(str) sí es determinista
(doc CPython: str/bytes se convierten a int usando todos sus bits, sin salado).

El orden se computa server-side para que el dashboard y el tracking de impresiones
coincidan con lo que el usuario realmente vio.
"""
from __future__ import annotations

import random
from typing import Sequence, TypeVar

T = TypeVar("T")


def ordenar_por_rotacion(
    slots: Sequence[T],
    peso_de: "dict[int, float]",
    session_id: str,
    posicion_de=lambda s: s["posicion"],
) -> list[T]:
    """Permutación ponderada estable por sesión.

    `slots` DEBE venir en orden determinista (p.ej. ORDER BY posicion en el SQL)
    para que las extracciones del RNG mapeen igual en cada corrida.
    `peso_de`: {posicion -> peso}, viene de realtor_slot_config (editable).
    Mismo session_id + mismo set → mismo orden (reproducible, no cambia al recargar).
    """
    rng = random.Random(session_id)

    def key(s: T) -> float:
        u = rng.random()                       # (0,1]
        w = peso_de[posicion_de(s)]            # peso > 0 garantizado por CHECK
        return u ** (1.0 / w)                  # Efraimidis–Spirakis

    return sorted(slots, key=key, reverse=True)


if __name__ == "__main__":
    # Self-check: la lógica de money/visibilidad no puede romperse en silencio.
    N = 20
    slots = [{"posicion": p} for p in range(1, N + 1)]
    # pesos decrecientes (placeholder; los reales viven en DB y son editables)
    pesos = {p: float(N + 1 - p) for p in range(1, N + 1)}  # pos1=20 .. pos20=1

    # 1) Estabilidad: misma sesión → mismo orden.
    o1 = ordenar_por_rotacion(slots, pesos, "sess-abc")
    o2 = ordenar_por_rotacion(slots, pesos, "sess-abc")
    assert o1 == o2, "mismo session_id debe dar el MISMO orden"

    # 2) Sesiones distintas → al menos a veces distinto (hay rotación, no orden fijo).
    distintos = sum(
        ordenar_por_rotacion(slots, pesos, f"s{i}")[0]["posicion"] != 1
        for i in range(200)
    )
    assert distintos > 0, "debe rotar: la posición 1 no siempre arriba"

    # 3) Peso manda: pos1 queda arriba MÁS seguido que pos20.
    tope = {p: 0 for p in range(1, N + 1)}
    for i in range(20_000):
        tope[ordenar_por_rotacion(slots, pesos, f"seed-{i}")[0]["posicion"]] += 1
    assert tope[1] > tope[N], f"pos1 ({tope[1]}) debe superar pos20 ({tope[N]})"

    # 4) Nadie invisible: pos20 (peso mínimo) igual aparece arriba alguna vez.
    assert tope[N] > 0, "pos20 nunca quedó arriba → quedó invisible (mal)"

    print(f"OK  pos1 arriba {tope[1]}x · pos20 arriba {tope[N]}x · "
          f"ratio {tope[1]/max(tope[N],1):.1f}x (de 20k sesiones)")
