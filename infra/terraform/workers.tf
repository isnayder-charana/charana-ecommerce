# --- Paso 31: las Lambdas de los workers ---------------------------------------
# Las tres usan la MISMA imagen (apps/workers/Dockerfile). La variable WORKER,
# que pone el módulo, decide qué hace cada una.

locals {
  workers_image = "${aws_ecr_repository.workers.repository_url}:${coalesce(var.workers_image_tag, "sin-imagen")}"

  # Variables propias de cada worker de cola.
  worker_environment = {
    notifications = {
      DYNAMODB_TABLE = aws_dynamodb_table.main.name
      STORE_URL      = var.store_urls[0]
      # "log": el correo se anota en el log en vez de enviarse. En el paso 32,
      # con el remitente verificado en SES, pasa a "ses".
      EMAIL_DELIVERY = "log"
    }
    fulfillment = {
      DYNAMODB_TABLE = aws_dynamodb_table.main.name
      API_URL        = "${aws_apigatewayv2_api.api.api_endpoint}/api"
      # Para leer INTERNAL_API_KEY de SSM al arrancar (igual que la API).
      SSM_PARAMETERS_PATH = local.ssm_prefix
    }
  }

  table_arn = aws_dynamodb_table.main.arn
}

# --- Permisos de los workers de cola -------------------------------------------

data "aws_iam_policy_document" "queue_worker" {
  for_each = local.worker_queues

  # Leer y borrar mensajes de SU cola, nada más.
  statement {
    sid = "ReadOwnQueue"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:ChangeMessageVisibility",
    ]
    resources = [aws_sqs_queue.worker[each.key].arn]
  }

  # Anotar los eventos ya procesados (idempotencia, paso 23). La condición
  # LeadingKeys limita el acceso a SUS items: WORKER_EVENT#<worker>#...
  statement {
    sid       = "ProcessedEvents"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem"]
    resources = [local.table_arn]

    condition {
      test     = "ForAllValues:StringLike"
      variable = "dynamodb:LeadingKeys"
      values   = ["WORKER_EVENT#${each.key}#*"]
    }
  }

  # Solo fulfillment lee secretos (INTERNAL_API_KEY para llamar a la API).
  dynamic "statement" {
    for_each = contains(keys(local.worker_environment[each.key]), "SSM_PARAMETERS_PATH") ? [1] : []

    content {
      sid       = "ReadSecrets"
      actions   = ["ssm:GetParametersByPath"]
      resources = ["arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.ssm_prefix}"]
    }
  }
}

module "queue_worker" {
  source   = "./modules/worker-lambda"
  for_each = local.worker_queues

  name        = each.key
  image_uri   = local.workers_image
  environment = local.worker_environment[each.key]
  policy_json = data.aws_iam_policy_document.queue_worker[each.key].json
}

# Conecta cada cola con su Lambda: Lambda lee la cola y le pasa lotes de hasta 10.
resource "aws_lambda_event_source_mapping" "queue_worker" {
  for_each = local.worker_queues

  event_source_arn = aws_sqs_queue.worker[each.key].arn
  function_name    = module.queue_worker[each.key].function_name
  batch_size       = 10

  # El worker devuelve solo los mensajes que fallaron (batchItemFailures):
  # SQS borra los demás y reintenta únicamente esos.
  function_response_types = ["ReportBatchItemFailures"]

  # Como mucho 2 Lambdas leyendo a la vez: protege la API y los créditos.
  scaling_config {
    maximum_concurrency = 2
  }
}

# --- El relé del outbox ----------------------------------------------------------

# Si un evento no se puede publicar tras varios intentos, Lambda deja aquí la
# referencia. El item sigue en la tabla (no se borró), así que no se pierde.
resource "aws_sqs_queue" "outbox_relay_dlq" {
  name                      = "charanatech-outbox-relay-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}

data "aws_iam_policy_document" "outbox_relay" {
  statement {
    sid = "ReadStream"
    actions = [
      "dynamodb:DescribeStream",
      "dynamodb:GetRecords",
      "dynamodb:GetShardIterator",
      "dynamodb:ListStreams",
    ]
    resources = [aws_dynamodb_table.main.stream_arn]
  }

  # Borrar de la bandeja SOLO items OUTBOX ya publicados.
  statement {
    sid       = "CleanOutbox"
    actions   = ["dynamodb:DeleteItem"]
    resources = [local.table_arn]

    condition {
      test     = "ForAllValues:StringEquals"
      variable = "dynamodb:LeadingKeys"
      values   = ["OUTBOX"]
    }
  }

  statement {
    sid       = "PublishEvents"
    actions   = ["events:PutEvents"]
    resources = [aws_cloudwatch_event_bus.orders.arn]
  }

  statement {
    sid       = "OnFailureDestination"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.outbox_relay_dlq.arn]
  }
}

module "outbox_relay" {
  source = "./modules/worker-lambda"

  name      = "outbox-relay"
  image_uri = local.workers_image
  environment = {
    DYNAMODB_TABLE = aws_dynamodb_table.main.name
    EVENT_BUS_NAME = aws_cloudwatch_event_bus.orders.name
  }
  policy_json = data.aws_iam_policy_document.outbox_relay.json
}

# DynamoDB Streams → Lambda, solo para los items OUTBOX recién creados.
resource "aws_lambda_event_source_mapping" "outbox_relay" {
  event_source_arn  = aws_dynamodb_table.main.stream_arn
  function_name     = module.outbox_relay.function_name
  starting_position = "LATEST"
  batch_size        = 10

  # El filtro corre en AWS ANTES de invocar: cambios de pedidos, carritos y
  # borrados no despiertan la Lambda (ni cuestan).
  filter_criteria {
    filter {
      pattern = jsonencode({
        eventName = ["INSERT"]
        dynamodb  = { NewImage = { PK = { S = ["OUTBOX"] } } }
      })
    }
  }

  # El relé devuelve el primer registro que falló; Lambda reintenta desde ahí.
  function_response_types = ["ReportBatchItemFailures"]
  maximum_retry_attempts  = 5
  # Un evento que lleva 6 horas sin poder publicarse se manda a la DLQ.
  maximum_record_age_in_seconds = 21600

  destination_config {
    on_failure {
      destination_arn = aws_sqs_queue.outbox_relay_dlq.arn
    }
  }
}
