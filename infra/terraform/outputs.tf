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
