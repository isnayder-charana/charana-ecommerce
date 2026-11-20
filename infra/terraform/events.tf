# --- Paso 31: el bus de eventos y las colas de los workers ---------------------
#
#   API ─▶ DynamoDB (pedido + OUTBOX) ─stream─▶ Lambda outbox-relay
#                                                   │ PutEvents
#                                                   ▼
#                                     EventBridge (bus "charanatech")
#                           regla por worker │                │
#                                            ▼                ▼
#                        SQS charanatech-notifications   SQS charanatech-fulfillment
#                                 │ (3 intentos → DLQ)        │ (espera 15 s, 3 intentos → DLQ)
#                                 ▼                           ▼
#                        Lambda notifications        Lambda fulfillment ─▶ API
#
# Son los MISMOS nombres y reglas que crea LocalStack en tu PC
# (infra/local/localstack/01-create-resources.sh).

locals {
  order_events_source = "charanatech.orders"

  # Qué eventos recibe cada worker y cómo es su cola.
  worker_queues = {
    notifications = {
      events        = ["OrderPaid", "OrderShipped", "OrderDelivered", "OrderCancelled"]
      delay_seconds = 0
    }
    fulfillment = {
      events = ["OrderPaid", "OrderShipped"]
      # El "tiempo en el almacén" y "en camino" del envío simulado (paso 25).
      delay_seconds = var.fulfillment_delay_seconds
    }
  }
}

# El bus propio de la tienda (no usamos el bus "default" de la cuenta).
resource "aws_cloudwatch_event_bus" "orders" {
  name = "charanatech"
}

# Cola de fallidos (DLQ): lo que no se pudo procesar en 3 intentos queda aquí
# 14 días para investigarlo, en vez de reintentarse para siempre.
resource "aws_sqs_queue" "worker_dlq" {
  for_each = local.worker_queues

  name                      = "charanatech-${each.key}-dlq"
  message_retention_seconds = 1209600 # 14 días, el máximo
  sqs_managed_sse_enabled   = true    # cifrado en reposo, sin costo
}

resource "aws_sqs_queue" "worker" {
  for_each = local.worker_queues

  name          = "charanatech-${each.key}"
  delay_seconds = each.value.delay_seconds
  # Mientras la Lambda procesa un mensaje, SQS lo esconde este tiempo. AWS
  # recomienda 6 veces el timeout de la Lambda (30 s) para que no se reparta dos veces.
  visibility_timeout_seconds = 180
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.worker_dlq[each.key].arn
    maxReceiveCount     = 3
  })
}

# Regla: "los eventos de pedidos de estos tipos van a esta cola".
resource "aws_cloudwatch_event_rule" "worker" {
  for_each = local.worker_queues

  name           = "charanatech-orders-to-${each.key}"
  description    = "Eventos de pedidos que procesa el worker ${each.key}"
  event_bus_name = aws_cloudwatch_event_bus.orders.name

  event_pattern = jsonencode({
    source        = [local.order_events_source]
    "detail-type" = each.value.events
  })
}

resource "aws_cloudwatch_event_target" "worker" {
  for_each = local.worker_queues

  rule           = aws_cloudwatch_event_rule.worker[each.key].name
  event_bus_name = aws_cloudwatch_event_bus.orders.name
  target_id      = each.key
  arn            = aws_sqs_queue.worker[each.key].arn
}

# En AWS, una cola no acepta mensajes de nadie hasta que su política lo dice.
# Esta deja entrar a EventBridge, y SOLO desde la regla de este worker.
data "aws_iam_policy_document" "worker_queue" {
  for_each = local.worker_queues

  statement {
    sid       = "AllowEventBridgeRule"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.worker[each.key].arn]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_cloudwatch_event_rule.worker[each.key].arn]
    }
  }
}

resource "aws_sqs_queue_policy" "worker" {
  for_each = local.worker_queues

  queue_url = aws_sqs_queue.worker[each.key].id
  policy    = data.aws_iam_policy_document.worker_queue[each.key].json
}
