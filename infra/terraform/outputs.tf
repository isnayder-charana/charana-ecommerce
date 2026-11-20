# Valores que van a los archivos .env (no son secretos: también viajan al navegador).

output "region" {
  value = var.aws_region
}

output "user_pool_id" {
  description = "COGNITO_USER_POOL_ID en apps/api/.env"
  value       = aws_cognito_user_pool.store.id
}

output "client_id" {
  description = "COGNITO_CLIENT_ID en apps/api/.env"
  value       = aws_cognito_user_pool_client.store.id
}

output "login_domain" {
  description = "Dominio de inicio de sesión (OAuth). Se usa en el paso 16 y 17."
  value       = "${aws_cognito_user_pool_domain.store.domain}.auth.${var.aws_region}.amazoncognito.com"
}

# --- Paso 29 --------------------------------------------------------------------

output "db_host" {
  description = "Dirección de MySQL en RDS (para conectarte con TLS)."
  value       = aws_db_instance.main.address
}

output "dynamodb_table" {
  description = "DYNAMODB_TABLE en AWS."
  value       = aws_dynamodb_table.main.name
}

output "dynamodb_stream_arn" {
  description = "Stream de la tabla (lo usará el relé del outbox en el paso 31)."
  value       = aws_dynamodb_table.main.stream_arn
}

output "ssm_parameters" {
  description = "Nombres de los secretos en SSM Parameter Store."
  value = [
    aws_ssm_parameter.database_url.name,
    aws_ssm_parameter.internal_api_key.name,
    aws_ssm_parameter.stripe_secret_key.name,
    aws_ssm_parameter.stripe_webhook_secret.name,
  ]
}

# --- Paso 30 --------------------------------------------------------------------

output "api_url" {
  description = "URL pública de la API (NEXT_PUBLIC_API_URL de la tienda en el paso 34)."
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "stripe_webhook_url" {
  description = "La URL que pegas en Stripe al crear el webhook."
  value       = "${aws_apigatewayv2_api.api.api_endpoint}/api/payments/webhook"
}

output "ecr_repository_url" {
  description = "Adónde se sube la imagen de la API (docker push)."
  value       = aws_ecr_repository.api.repository_url
}

# --- Paso 31 --------------------------------------------------------------------

output "workers_ecr_repository_url" {
  description = "Adónde se sube la imagen de los workers."
  value       = aws_ecr_repository.workers.repository_url
}

output "event_bus" {
  description = "El bus de EventBridge de los pedidos."
  value       = aws_cloudwatch_event_bus.orders.name
}

output "dead_letter_queues" {
  description = "Colas de fallidos: si algo aparece aquí, un evento no se pudo procesar."
  value = concat(
    [for queue in aws_sqs_queue.worker_dlq : queue.name],
    [aws_sqs_queue.outbox_relay_dlq.name],
  )
}

# --- Paso 32 --------------------------------------------------------------------

output "alerts_topic" {
  description = "Tema SNS de las alarmas (debes confirmar la suscripción desde tu correo)."
  value       = aws_sns_topic.alerts.name
}

output "dlq_alarms" {
  description = "Una alarma de CloudWatch por cada DLQ."
  value       = [for alarm in aws_cloudwatch_metric_alarm.dlq : alarm.alarm_name]
}

# --- Paso 33 --------------------------------------------------------------------

output "product_images_url" {
  description = "PRODUCT_IMAGES_URL para `pnpm db:seed` contra RDS."
  value       = "https://${aws_cloudfront_distribution.images.domain_name}/products"
}

output "product_images_uploaded" {
  description = "Fotos que Terraform subió al bucket."
  value       = sort(keys(aws_s3_object.product_image))
}

# --- Paso 34 --------------------------------------------------------------------

output "vercel_environment" {
  description = "Variables de la tienda en Vercel: copia el texto y pégalo en Settings → Environment Variables."
  value       = <<-EOT
    NEXT_PUBLIC_API_URL=${aws_apigatewayv2_api.api.api_endpoint}/api
    NEXT_PUBLIC_AUTH_MODE=cognito
    NEXT_PUBLIC_COGNITO_USER_POOL_ID=${aws_cognito_user_pool.store.id}
    NEXT_PUBLIC_COGNITO_CLIENT_ID=${aws_cognito_user_pool_client.store.id}
    NEXT_PUBLIC_COGNITO_DOMAIN=${aws_cognito_user_pool_domain.store.domain}.auth.${var.aws_region}.amazoncognito.com
    ENABLE_EXPERIMENTAL_COREPACK=1
  EOT
}
