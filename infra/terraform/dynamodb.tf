# --- Paso 29: DynamoDB (pedidos, outbox y eventos procesados) ----------------
# La MISMA definición que `pnpm db:tables` crea en DynamoDB Local
# (apps/api/src/shared/infrastructure/database/dynamodb.ts): una sola tabla
# con claves genéricas y un índice GSI1 para "los pedidos de un cliente".

resource "aws_dynamodb_table" "main" {
  name         = "charanatech"
  billing_mode = "PAY_PER_REQUEST" # se paga por petición: ~0 USD con poco tráfico
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    projection_type = "ALL"

    key_schema {
      attribute_name = "GSI1PK"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "GSI1SK"
      key_type       = "RANGE"
    }
  }

  # Los eventos procesados (webhooks de Stripe y workers) llevan `expiresAt`:
  # DynamoDB los borra solo cuando vence, sin código ni costo extra.
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  # Cada escritura queda en un "stream" durante 24 h. En el paso 31 una Lambda
  # lo lee para publicar los eventos del outbox en EventBridge.
  stream_enabled   = true
  stream_view_type = "NEW_IMAGE"

  # Restaurar la tabla a cualquier segundo de los últimos 35 días.
  point_in_time_recovery {
    enabled = true
  }

  deletion_protection_enabled = true
}
