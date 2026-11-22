#!/usr/bin/env bash
# Prueba de humo contra producción: revisa en segundos que la tienda, la API,
# la base de datos y las fotos respondan. No compra nada ni cambia datos.
#
# Uso (desde la raíz del repo, en Git Bash):
#   scripts/smoke-prod.sh https://xxxx.execute-api.us-east-2.amazonaws.com https://charana-ecommerce.vercel.app
#
# O sin argumentos, desde infra/terraform ya inicializado:
#   API_URL=$(terraform -chdir=infra/terraform output -raw api_url) \
#   STORE_URL=https://charana-ecommerce.vercel.app scripts/smoke-prod.sh

set -uo pipefail

API_URL="${1:-${API_URL:-}}"
STORE_URL="${2:-${STORE_URL:-}}"

if [[ -z "$API_URL" || -z "$STORE_URL" ]]; then
  echo "Uso: $0 <API_URL> <STORE_URL>" >&2
  exit 2
fi

# Sin barra final, para no armar URLs con "//".
API_URL="${API_URL%/}"
STORE_URL="${STORE_URL%/}"

passed=0
failed=0
body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT

ok() {
  echo "  OK    $1"
  passed=$((passed + 1))
}

fail() {
  echo "  FALLA $1"
  [[ -n "${2:-}" ]] && echo "        $2"
  failed=$((failed + 1))
}

# Devuelve el código HTTP y deja el cuerpo en $body_file. Cada petición espera
# como mucho 30 s (lo mismo que API Gateway).
# Si no hay conexión, curl ya escribe 000.
http() {
  : >"$body_file"
  curl --silent --connect-timeout 10 --max-time 30 \
    --output "$body_file" --write-out '%{http_code}' "$@" 2>/dev/null
  return 0
}

echo "API:    $API_URL"
echo "Tienda: $STORE_URL"
echo

echo "API"
code=$(http "$API_URL/api/health")
if [[ "$code" == 200 ]]; then
  ok "la API responde (/api/health)"
else
  fail "la API no responde: HTTP $code" "Revisa los logs: aws logs tail /aws/lambda/charanatech-api --since 10m --profile charanatech"
fi

code=$(http "$API_URL/api/products")
total=$(grep -o '"total":[0-9]*' "$body_file" | head -1 | cut -d: -f2)
if [[ "$code" == 200 && "${total:-0}" -ge 1 ]]; then
  ok "el catálogo sale de MySQL ($total productos)"
else
  fail "el catálogo no responde: HTTP $code" "¿RDS está apagada? aws rds describe-db-instances --query 'DBInstances[].DBInstanceStatus' --profile charanatech"
fi

image_url=$(grep -o '"imageUrl":"[^"]*"' "$body_file" | head -1 | cut -d'"' -f4)
if [[ "$code" != 200 ]]; then
  fail "no reviso las fotos: el catálogo no respondió"
elif [[ -n "$image_url" ]]; then
  code=$(http --head "$image_url")
  if [[ "$code" == 200 ]]; then
    ok "las fotos llegan por CloudFront"
  else
    fail "la foto $image_url respondió HTTP $code"
  fi
else
  fail "ningún producto trae imageUrl" "¿Corriste el seed con PRODUCT_IMAGES_URL (paso 33)?"
fi

code=$(http "$API_URL/api/orders")
if [[ "$code" == 401 ]]; then
  ok "los pedidos piden iniciar sesión (401 sin token)"
else
  fail "GET /api/orders sin token respondió HTTP $code (esperaba 401)"
fi

allowed=$(curl --silent --connect-timeout 10 --max-time 30 --output /dev/null --dump-header - \
  --request OPTIONS "$API_URL/api/products" \
  --header "Origin: $STORE_URL" \
  --header 'Access-Control-Request-Method: GET' 2>/dev/null |
  grep -i '^access-control-allow-origin:' | cut -d' ' -f2 | tr -d '\r')
if [[ "$allowed" == "$STORE_URL" ]]; then
  ok "CORS acepta la tienda"
else
  fail "CORS no acepta $STORE_URL (respondió '${allowed:-nada}')" "Revisa store_urls en terraform.tfvars (paso 34)"
fi

echo
echo "Tienda"
code=$(http --location "$STORE_URL/")
if [[ "$code" == 200 ]] && grep -q 'CharanaTech' "$body_file"; then
  ok "la portada carga"
else
  fail "la portada respondió HTTP $code"
fi

code=$(http --location "$STORE_URL/privacidad")
if [[ "$code" == 200 ]]; then
  ok "la página de privacidad carga"
else
  fail "/privacidad respondió HTTP $code"
fi

echo
echo "$passed bien, $failed con fallas."
[[ "$failed" -eq 0 ]]
