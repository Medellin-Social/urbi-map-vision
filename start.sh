#!/usr/bin/env bash
# Urbidata — arranca postgres (docker) + backend (FastAPI) + frontend (Vite)
# Uso: ./start.sh
# Detener: Ctrl+C  (mata todos los procesos)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/.logs"
mkdir -p "$LOG_DIR"

# Cargar variables de entorno desde .env (sin sobreescribir las ya exportadas)
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.env"
  set +a
fi

BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

cleanup() {
  echo ""
  echo "Deteniendo servicios..."
  kill "$BACKEND_PID" "$FRONTEND_PID" "$TAIL_PID" 2>/dev/null || true
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  echo "Listo."
  exit 0
}
trap cleanup SIGINT SIGTERM

cd "$SCRIPT_DIR"

# ── 1. PostgreSQL (Docker, puerto 5433) ──────────────────────────────────────
POSTGRES_CONTAINER="urbidata-postgres"
if ! docker inspect "$POSTGRES_CONTAINER" --format '{{.State.Status}}' 2>/dev/null | grep -q "running"; then
  echo "Iniciando postgres (docker)..."
  docker start "$POSTGRES_CONTAINER" 2>/dev/null \
    || docker compose up -d postgres 2>/dev/null
  echo -n "Esperando postgres"
  for i in $(seq 1 20); do
    if PGPASSWORD=urbidata007 psql "postgresql://urbidata:urbidata007@localhost:5433/urbidata" \
         -c "SELECT 1" -q >/dev/null 2>&1; then
      echo " OK"
      break
    fi
    echo -n "."
    sleep 1
  done
else
  echo "Postgres ya está corriendo."
fi

# ── 2. Backend (FastAPI + uvicorn) ────────────────────────────────────────────
# Resolve uvicorn: prefer ~/.local/bin (pip install --user) then system PATH
UVICORN=$(command -v uvicorn 2>/dev/null \
  || echo "$HOME/.local/bin/uvicorn")

echo "Iniciando backend  → http://localhost:8001"
: > "$BACKEND_LOG"
"$UVICORN" api.main:app --host 0.0.0.0 --port 8001 \
  > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

# Esperar a que el backend levante
echo -n "Esperando backend"
for i in $(seq 1 20); do
  if curl -sf http://localhost:8001/docs >/dev/null 2>&1; then
    echo " OK"
    break
  fi
  echo -n "."
  sleep 1
done

# ── 3. Frontend (Vite) ───────────────────────────────────────────────────────
echo "Iniciando frontend → http://localhost:5173"
: > "$FRONTEND_LOG"
if [ ! -d node_modules ]; then
  echo "Instalando dependencias del frontend..."
  npm install
fi
VITE_API_URL=http://localhost:8001/api/v1 npm run dev -- --host --port 5173 \
  > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

sleep 3
# Detectar puerto real en caso de colisión
FRONTEND_URL=$(grep -oP 'Local:\s+\Khttp://localhost:[0-9]+' "$FRONTEND_LOG" 2>/dev/null | head -1 || echo "http://localhost:5173")

echo ""
echo "────────────────────────────────────────────────────"
echo "  Backend PID  : $BACKEND_PID"
echo "  Frontend PID : $FRONTEND_PID"
echo ""
echo "  API          : http://localhost:8001/api/v1"
echo "  API docs     : http://localhost:8001/docs"
echo "  Mapa         : $FRONTEND_URL"
echo "────────────────────────────────────────────────────"
echo "Logs: .logs/backend.log | .logs/frontend.log"
echo "Ctrl+C para detener todo."
echo ""

# Tail ambos logs intercalados
tail -f "$BACKEND_LOG" "$FRONTEND_LOG" &
TAIL_PID=$!

# Morir si cualquier proceso hijo muere
wait "$BACKEND_PID" "$FRONTEND_PID"
kill "$TAIL_PID" 2>/dev/null || true
cleanup
