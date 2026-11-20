# --- Paso 32: alarmas de las colas de fallidos (DLQ) -------------------------
#
# Si un mensaje cae en una DLQ es porque falló varias veces: algo está roto.
# Una alarma de CloudWatch por DLQ lo detecta y avisa al tema SNS, que te manda
# un correo. En tu PC lo hacía DlqMonitor (paso 26); en AWS lo hace CloudWatch.
#
#   DLQ con mensajes ─▶ alarma (ALARM) ─▶ SNS charanatech-alerts ─▶ tu correo
#   DLQ vacía otra vez ─▶ alarma (OK)  ─▶ "resuelto"

resource "aws_sns_topic" "alerts" {
  name = "charanatech-alerts"
}

# AWS te manda un correo para confirmar la suscripción: hasta que abras el
# enlace, la suscripción queda "pendiente" y no recibes avisos.
resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

locals {
  dead_letter_queues = merge(
    { for name in keys(local.worker_queues) : name => "charanatech-${name}-dlq" },
    { "outbox-relay" = aws_sqs_queue.outbox_relay_dlq.name },
  )
}

resource "aws_cloudwatch_metric_alarm" "dlq" {
  for_each = local.dead_letter_queues

  alarm_name        = "charanatech-${each.key}-dlq"
  alarm_description = "Hay mensajes en ${each.value}: el worker ${each.key} falló varias veces. Revisa sus logs en CloudWatch (/aws/lambda/charanatech-${each.key})."

  namespace   = "AWS/SQS"
  metric_name = "ApproximateNumberOfMessagesVisible"
  dimensions = {
    QueueName = each.value
  }

  # SQS publica sus métricas cada 5 minutos: más rápido no se puede.
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  # Una cola sin actividad no publica datos: eso es "todo bien".
  treat_missing_data = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  depends_on = [aws_sqs_queue.worker_dlq]
}
