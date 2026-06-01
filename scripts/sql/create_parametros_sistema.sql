-- Runtime-editable financial parameters. Update without redeployment:
-- UPDATE raw.parametros_sistema SET valor = '4250', updated_at = NOW() WHERE nombre = 'USD_TO_COP';
CREATE TABLE IF NOT EXISTS raw.parametros_sistema (
    nombre      VARCHAR PRIMARY KEY,
    valor       VARCHAR NOT NULL,
    fuente      VARCHAR,
    updated_at  TIMESTAMP DEFAULT NOW()
);

INSERT INTO raw.parametros_sistema (nombre, valor, fuente) VALUES
    ('USD_TO_COP',     '4100', 'manual_inicial'),
    ('VAR_ANUAL_DANE', '10.1', 'manual_inicial')
ON CONFLICT (nombre) DO NOTHING;

-- Keep VAR_ANUAL_DANE in sync with raw.ipvn_dane (run after each DANE update):
-- UPDATE raw.parametros_sistema
-- SET valor = (SELECT variacion_anual::text FROM raw.ipvn_dane ORDER BY año DESC, periodo DESC LIMIT 1),
--     fuente = 'raw.ipvn_dane', updated_at = NOW()
-- WHERE nombre = 'VAR_ANUAL_DANE';
