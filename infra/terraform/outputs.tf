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
