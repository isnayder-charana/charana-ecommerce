#!/bin/bash
# LocalStack ejecuta este script cuando arranca (carpeta /etc/localstack/init/ready.d).
# Crea los mismos recursos que en la fase 4 creará Terraform en AWS, con los mismos
# nombres, para que el código no note la diferencia entre tu PC y la nube.
set -euo pipefail

REGION="${AWS_DEFAULT_REGION:-us-east-2}"
# La cuenta "ficticia" del emulador (en LocalStack, 000000000000).
ACCOUNT=$(awslocal sts get-caller-identity --query Account --output text)
BUS="charanatech"
SOURCE="charanatech.orders" # quién publica: el módulo Orders de la API

queue_arn() { echo "arn:aws:sqs:${REGION}:${ACCOUNT}:$1"; }
queue_url() { awslocal sqs get-queue-url --queue-name "$1" --query QueueUrl --output text; }

# Una cola de trabajo con su cola de fallidos (DLQ). Después de 3 intentos fallidos,
# SQS mueve el mensaje a la DLQ en vez de reintentarlo para siempre.
# El segundo parámetro (opcional) es un retraso: cada mensaje nuevo queda oculto
# esos segundos antes de que el worker pueda leerlo.
create_queue_with_dlq() {
  local name="$1" delay="${2:-0}"
  awslocal sqs create-queue --queue-name "${name}-dlq" \
    --attributes MessageRetentionPeriod=1209600 >/dev/null # 14 días para investigar
  awslocal sqs create-queue --queue-name "$name" --attributes "{
    \"VisibilityTimeout\": \"30\",
    \"DelaySeconds\": \"${delay}\",
    \"RedrivePolicy\": \"{\\\"deadLetterTargetArn\\\":\\\"$(queue_arn "${name}-dlq")\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"
  }" >/dev/null
}

# Permiso para que EventBridge deje mensajes en la cola (en AWS es obligatorio;
# LocalStack no lo exige, pero lo dejamos igual que en producción).
allow_eventbridge() {
  local name="$1" rule_arn="$2"
  local policy
  policy=$(
    cat <<JSON
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"events.amazonaws.com"},"Action":"sqs:SendMessage","Resource":"$(queue_arn "$name")","Condition":{"ArnEquals":{"aws:SourceArn":"${rule_arn}"}}}]}
JSON
  )
  awslocal sqs set-queue-attributes --queue-url "$(queue_url "$name")" \
    --attributes "{\"Policy\": \"${policy//\"/\\\"}\"}"
}

# Regla: "los eventos que cumplan este patrón van a esta cola".
route() {
  local rule="$1" pattern="$2" queue="$3"
  local rule_arn
  rule_arn=$(awslocal events put-rule --name "$rule" --event-bus-name "$BUS" \
    --event-pattern "$pattern" --query RuleArn --output text)
  awslocal events put-targets --rule "$rule" --event-bus-name "$BUS" \
    --targets "Id=${queue},Arn=$(queue_arn "$queue")" >/dev/null
  allow_eventbridge "$queue" "$rule_arn"
}

# 1. El bus de eventos propio de la tienda (no usamos el bus "default" de AWS).
awslocal events create-event-bus --name "$BUS" >/dev/null

# 2. Colas de trabajo, cada una con su DLQ.
create_queue_with_dlq charanatech-notifications # correos al cliente (paso 24)
# Envío simulado (paso 25): el retraso es el "tiempo en el almacén" y "en camino".
create_queue_with_dlq charanatech-fulfillment "${FULFILLMENT_DELAY_SECONDS:-15}"
# Cola "espía": recibe TODOS los eventos para que puedas verlos. Solo existe en local.
awslocal sqs create-queue --queue-name charanatech-events-log \
  --attributes MessageRetentionPeriod=86400 >/dev/null

# 3. Reglas de enrutamiento: quién recibe cada evento.
route charanatech-orders-to-notifications \
  "{\"source\":[\"${SOURCE}\"],\"detail-type\":[\"OrderPaid\",\"OrderShipped\",\"OrderDelivered\",\"OrderCancelled\"]}" \
  charanatech-notifications
route charanatech-orders-to-fulfillment \
  "{\"source\":[\"${SOURCE}\"],\"detail-type\":[\"OrderPaid\",\"OrderShipped\"]}" \
  charanatech-fulfillment
route charanatech-orders-to-log \
  "{\"source\":[\"${SOURCE}\"]}" \
  charanatech-events-log

# 4. Tema SNS para avisar al administrador cuando algo falla (paso 26). Los workers
#    publican ahí cuando un mensaje cae en una DLQ. En AWS (fase 4) el suscriptor será
#    el correo del administrador; aquí, una cola "espía" donde puedes leer los avisos.
ALERTS_ARN=$(awslocal sns create-topic --name charanatech-alerts --query TopicArn --output text)
awslocal sqs create-queue --queue-name charanatech-alerts-log \
  --attributes MessageRetentionPeriod=86400 >/dev/null
# (En AWS la cola además necesita un permiso para que SNS le escriba; lo pondrá Terraform.)
awslocal sns subscribe --topic-arn "$ALERTS_ARN" --protocol sqs \
  --notification-endpoint "$(queue_arn charanatech-alerts-log)" >/dev/null

# 5. Imágenes de productos (fase 5) y remitente de correos (paso 24, SES v1).
awslocal s3 mb s3://charanatech-product-images >/dev/null
awslocal ses verify-email-identity --email-address no-reply@charanatech.local

echo "CharanaTech: recursos de LocalStack creados en ${REGION}"
