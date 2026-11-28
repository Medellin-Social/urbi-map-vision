#!/bin/sh
# Testea el webhook GHL "pago aprobado" → atribución automática, para CADA versión
# de realtor. Sin admin. Idempotente por pago_ref.
#
# Correr (el secret vive en el env de Social-api):
#   railway run -e "Medellin social DEV" -s Social-api -- sh scripts/qa/test_ghl_pagos.sh \
#     <api_url> <agent_email> <listing_url_uuid>
#
# Verificación de la atribución: aparte, vía postgis (ver el bloque que imprime al final).
set -e
API="${1:-https://social-api-medellin-social-dev.up.railway.app/api/v1}"
EMAIL="${2:-qa.auto.230228@example.com}"
LISTING="${3}"
SEC="$GHL_WEBHOOK_SECRET"
[ -z "$SEC" ] && { echo "FALTA GHL_WEBHOOK_SECRET en el env"; exit 1; }
TS=$(date +%s)
post() { curl -s -X POST "$API/webhook/ghl" -H "x-webhook-secret: $SEC" -H 'Content-Type: application/json' -d "$1" -w " [%{http_code}]\n"; }

echo "== GHL pago→atribución (agent=$EMAIL) =="
echo -n "registro:      "; post "{\"object_type\":\"agent_program\",\"producto\":\"registro\",\"agent_email\":\"$EMAIL\",\"pago_ref\":\"qa-reg-$TS\"}"
echo -n "cert_cuota:    "; post "{\"object_type\":\"agent_program\",\"producto\":\"cert_cuota\",\"agent_email\":\"$EMAIL\",\"pago_ref\":\"qa-cuo-$TS\"}"
echo -n "cert_mensual:  "; post "{\"object_type\":\"agent_program\",\"producto\":\"cert_mensual\",\"agent_email\":\"$EMAIL\",\"pago_ref\":\"qa-cm-$TS\"}"
[ -n "$LISTING" ] && { echo -n "anuncio:       "; post "{\"object_type\":\"agent_program\",\"producto\":\"anuncio\",\"agent_email\":\"$EMAIL\",\"pago_ref\":\"qa-an-$TS\",\"listing_url\":\"$LISTING\"}"; }
echo -n "realtor_slot:  "; post "{\"object_type\":\"realtor_slot\",\"agent_email\":\"$EMAIL\",\"zona_nivel\":\"barrio\",\"zona_codigo\":\"242\",\"meses\":2,\"pago_ref\":\"qa-slot-$TS\"}"
# zona patrocinada exclusiva (rutea leads). ZONA debe estar LIBRE o da 409.
echo -n "sponsorship:   "; post "{\"object_type\":\"sponsorship\",\"agent_email\":\"$EMAIL\",\"zona_nivel\":\"barrio\",\"zona_codigo\":\"242\",\"meses\":3,\"pago_ref\":\"qa-spons-$TS\"}"
# idempotencia: reenvío de cert_mensual con el MISMO ref → no duplica
echo -n "idempotencia:  "; post "{\"object_type\":\"agent_program\",\"producto\":\"cert_mensual\",\"agent_email\":\"$EMAIL\",\"pago_ref\":\"qa-cm-$TS\"}"
echo "pago_refs: qa-*-$TS"
