"""recompute analytics.barrios_cd.cd_comuna from a verified id->cd_comuna map, fix raw.barrios.comuna

Migration 0060 backfilled analytics.barrios_cd from raw.barrios.comuna (text),
which was itself corrupted on databases where barrios_cd was empty pre-0060
(e.g. prod). 0061 fixed the comuna text but derived it FROM the already-wrong
cd_comuna, leaving the underlying cd_comuna assignment wrong (self-consistent
but incorrect — e.g. barrio "BELEN" ended up under cd_comuna=12/LA AMERICA).

_BARRIO_CD below was derived by spatially joining each Medellín barrio's
centroid against raw.comunas (official commune polygons) on a known-good DB,
then hand-verified (0 mismatches vs. the reference DB's existing correct
values). Hardcoded here — rather than joining raw.comunas at migration time —
because raw.comunas is not created by any migration (loaded ad hoc on at
least one environment) and referencing it crashed this migration on deploy
where the table doesn't exist. The join against raw.barrios below only
touches barrio_ids that exist on the target DB, so this is safe to run
anywhere raw.barrios is seeded with the same ids.

Revision ID: 0062
Revises: 0061
"""
from alembic import op

revision = "0062"
down_revision = "0061"
branch_labels = None
depends_on = None

_COMUNAS = [
    (1,  "POPULAR"), (2,  "SANTA CRUZ"), (3,  "MANRIQUE"), (4,  "ARANJUEZ"),
    (5,  "CASTILLA"), (6,  "DOCE DE OCTUBRE"), (7,  "ROBLEDO"), (8,  "VILLA HERMOSA"),
    (9,  "BUENOS AIRES"), (10, "LA CANDELARIA"), (11, "LAURELES ESTADIO"),
    (12, "LA AMERICA"), (13, "SAN JAVIER"), (14, "EL POBLADO"), (15, "GUAYABAL"),
    (16, "BELEN"),
]

# (barrio_id, cd_comuna) — all 271 Medellín barrios, verified via spatial join.
_BARRIO_CD = [
    (1,5), (2,5), (3,5), (4,5), (5,6), (6,6), (7,6), (8,6), (9,6), (10,6),
    (11,5), (12,6), (13,6), (14,6), (15,5), (16,5), (17,5), (18,5), (19,5), (20,6),
    (21,5), (22,5), (23,5), (24,5), (25,6), (26,7), (27,7), (28,7), (29,7), (30,7),
    (31,5), (32,5), (33,5), (34,5), (35,5), (36,7), (37,7), (38,7), (39,7), (40,7),
    (41,7), (42,6), (43,7), (44,7), (45,7), (46,7), (47,7), (48,7), (49,7), (50,11),
    (51,11), (52,7), (53,11), (54,12), (55,13), (56,7), (57,13), (58,7), (59,7), (60,7),
    (61,7), (62,13), (63,7), (64,7), (65,12), (66,12), (67,11), (68,11), (69,11), (70,13),
    (71,13), (72,13), (73,13), (74,13), (75,12), (76,12), (77,11), (78,12), (79,12), (80,12),
    (81,12), (82,13), (83,13), (84,13), (85,13), (86,13), (87,13), (88,13), (89,12), (90,12),
    (91,12), (92,11), (93,12), (94,13), (95,13), (96,16), (97,16), (98,16), (99,16), (100,16),
    (101,16), (102,16), (103,15), (104,16), (105,16), (106,16), (107,16), (108,16), (109,16), (110,16),
    (111,16), (112,16), (113,15), (114,15), (115,15), (116,15), (117,2), (118,2), (119,2), (120,2),
    (121,2), (122,2), (123,1), (124,1), (125,1), (126,1), (127,1), (128,2), (129,2), (130,1),
    (131,1), (132,1), (133,1), (134,1), (135,1), (136,2), (137,2), (138,2), (139,1), (140,4),
    (141,4), (142,4), (143,3), (144,3), (145,3), (146,4), (147,4), (148,4), (149,4), (150,4),
    (151,4), (152,4), (153,3), (154,4), (155,3), (156,3), (157,4), (158,4), (159,3), (160,3),
    (161,3), (162,3), (163,3), (164,3), (165,3), (166,3), (167,3), (168,4), (169,4), (170,4),
    (171,4), (172,10), (173,10), (174,10), (175,10), (176,8), (177,8), (178,8), (179,8), (180,8),
    (181,10), (182,8), (183,3), (184,8), (185,10), (186,10), (187,10), (188,8), (189,8), (190,10),
    (191,10), (192,10), (193,10), (194,10), (195,10), (196,10), (197,10), (198,8), (199,8), (200,8),
    (201,8), (202,8), (203,8), (204,9), (205,9), (206,8), (207,9), (208,8), (209,8), (210,9),
    (211,9), (212,10), (213,9), (214,9), (215,9), (216,10), (217,9), (218,9), (219,9), (220,9),
    (221,9), (222,10), (223,10), (224,9), (225,9), (226,14), (227,14), (228,9), (229,9), (230,14),
    (231,14), (232,14), (233,14), (234,14), (235,14), (236,14), (237,14), (238,14), (239,14), (240,14),
    (241,14), (242,14), (243,14), (244,14), (245,14), (246,14), (247,14), (248,14), (249,14), (250,14),
    (251,5), (252,15), (253,11), (254,15), (255,11), (256,11), (257,16), (258,11), (259,15), (260,15),
    (261,16), (262,15), (263,15), (264,11), (265,16), (266,16), (267,16), (268,11), (269,11), (270,11),
    (271,11),
]


def upgrade() -> None:
    # 1) Recompute cd_comuna from the verified map. Joined against raw.barrios
    #    so ids absent on the target DB are silently skipped (no FK errors).
    values = ", ".join(f"({bid},{cd})" for bid, cd in _BARRIO_CD)
    op.execute(f"""
        INSERT INTO analytics.barrios_cd (barrio_id, cd_comuna)
        SELECT v.barrio_id, v.cd_comuna
        FROM (VALUES {values}) AS v(barrio_id, cd_comuna)
        JOIN raw.barrios b ON b.id = v.barrio_id
        ON CONFLICT (barrio_id) DO UPDATE SET cd_comuna = EXCLUDED.cd_comuna
    """)

    # 2) Re-sync raw.barrios.comuna display name from the corrected cd_comuna.
    comunas = ", ".join(f"({cd}, '{name}')" for cd, name in _COMUNAS)
    op.execute(f"""
        UPDATE raw.barrios b
        SET    comuna = c.nombre
        FROM   analytics.barrios_cd bc
        JOIN   (VALUES {comunas}) AS c(cd, nombre) ON c.cd = bc.cd_comuna
        WHERE  bc.barrio_id = b.id
          AND  (b.comuna IS DISTINCT FROM c.nombre)
          AND  b.municipio = 'MEDELLIN'
    """)


def downgrade() -> None:
    pass  # data-only fix; original values not stored
