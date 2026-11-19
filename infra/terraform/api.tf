# --- Paso 30: la API de NestJS en Lambda, detrás de API Gateway ---------------
#
#   navegador / Stripe ──HTTPS──▶ API Gateway (HTTP API) ──▶ Lambda (imagen Docker)
#                                                              │  Lambda Web Adapter
#                                                              ▼
#                                                  NestJS escuchando en :8080
#
# La imagen es la misma API que corres en tu PC. El Lambda Web Adapter (una
# "extensión" dentro de la imagen) convierte cada invocación de Lambda en una
# petición HTTP normal a NestJS, así que el código no sabe que está en Lambda.

locals {
  api_name = "charanatech-api"
}

# --- Permisos: qué puede hacer la Lambda ---------------------------------------

# El "rol" es la identidad de la Lambda. Esta política dice quién puede usarlo:
# solo el servicio Lambda.
resource "aws_iam_role" "api" {
  name = local.api_name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Mínimo privilegio: solo lo que la API usa, y solo sobre SUS recursos.
data "aws_iam_policy_document" "api" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.api.arn}:*"]
  }

  # Leer los secretos al arrancar. SecureString usa la llave de AWS "aws/ssm",
  # cuya política ya permite descifrar a quien llega a través de SSM: no hace
  # falta un permiso de KMS aparte.
  statement {
    sid       = "ReadSecrets"
    actions   = ["ssm:GetParametersByPath"]
    resources = ["arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.ssm_prefix}"]
  }

  # Carrito y pedidos. Sin Scan ni DeleteTable: la API nunca los usa.
  statement {
    sid = "CartAndOrders"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:ConditionCheckItem",
      "dynamodb:Query",
      "dynamodb:BatchWriteItem",
    ]
    resources = [
      aws_dynamodb_table.main.arn,
      "${aws_dynamodb_table.main.arn}/index/*",
    ]
  }
}

resource "aws_iam_role_policy" "api" {
  name   = local.api_name
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

# --- Logs ----------------------------------------------------------------------
# Lo creamos nosotros (y no Lambda solo) para fijar cuánto tiempo se guardan:
# por defecto CloudWatch guarda los logs para siempre, y eso cuesta.
resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.api_name}"
  retention_in_days = 14
}

# --- La función ----------------------------------------------------------------

resource "aws_lambda_function" "api" {
  function_name = local.api_name
  role          = aws_iam_role.api.arn

  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.api.repository_url}:${coalesce(var.api_image_tag, "sin-imagen")}"
  architectures = ["x86_64"] # la imagen se construye con --platform linux/amd64

  memory_size = 1024 # más memoria = más CPU: NestJS arranca más rápido
  timeout     = 29   # API Gateway corta a los 30 s; la Lambda termina antes

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.api.name
  }

  environment {
    variables = {
      NODE_ENV = "production"

      # main.ts lee todos los secretos de esta ruta de SSM antes de arrancar
      # NestJS (DATABASE_URL, INTERNAL_API_KEY, STRIPE_SECRET_KEY,
      # STRIPE_WEBHOOK_SECRET). Ningún secreto queda escrito en la Lambda.
      SSM_PARAMETERS_PATH = local.ssm_prefix

      COGNITO_USER_POOL_ID = aws_cognito_user_pool.store.id
      COGNITO_CLIENT_ID    = aws_cognito_user_pool_client.store.id
      DYNAMODB_TABLE       = aws_dynamodb_table.main.name

      STORE_URL    = var.store_urls[0]
      CORS_ORIGINS = join(",", var.store_urls)

      # El relé del outbox NO corre dentro de la API en Lambda: una Lambda se
      # congela entre peticiones y el temporizador no avanzaría. En el paso 31
      # lo reemplaza el stream de DynamoDB.
      OUTBOX_RELAY_INTERVAL_MS = "0"
    }
  }

  lifecycle {
    precondition {
      condition     = var.api_image_tag != null
      error_message = "Falta api_image_tag en terraform.tfvars: la etiqueta de la imagen que subiste a ECR (paso 30, sección 5)."
    }
  }

  depends_on = [aws_iam_role_policy.api]
}

# --- API Gateway (HTTP API) ----------------------------------------------------
# La puerta pública. "HTTP API" es la versión simple y barata de API Gateway
# (~70 % más barata que "REST API"). Le pasa TODAS las rutas a la Lambda: el
# enrutamiento lo sigue haciendo NestJS. CORS también lo resuelve NestJS.

resource "aws_apigatewayv2_api" "api" {
  name          = local.api_name
  protocol_type = "HTTP"
  description   = "API de CharanaTech (NestJS en Lambda)"
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

# "$default" = cualquier método y cualquier ruta.
resource "aws_apigatewayv2_route" "api" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_stage" "api" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true

  # Freno de mano: la URL es pública, así que limitamos cuántas peticiones por
  # segundo llegan a la Lambda. Protege tus créditos si alguien la bombardea.
  default_route_settings {
    throttling_rate_limit  = 20
    throttling_burst_limit = 40
  }
}

# Sin esto, API Gateway no tiene permiso para invocar la Lambda.
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
