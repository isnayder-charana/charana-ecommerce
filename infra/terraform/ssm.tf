# --- Paso 29: secretos en SSM Parameter Store --------------------------------
# Las Lambdas (paso 30) leerán estos valores al arrancar. SecureString los
# cifra con la llave de AWS de SSM (gratis). Usamos Parameter Store y no
# Secrets Manager porque los parámetros estándar no cuestan nada.
#
# `value_wo` (write-only): el secreto viaja a AWS pero NO queda en el estado
# de Terraform. Para cambiar uno: pon el valor nuevo en terraform.tfvars y
# sube `secrets_version`.

locals {
  ssm_prefix = "/charanatech/prod"
}

resource "aws_ssm_parameter" "database_url" {
  name        = "${local.ssm_prefix}/database-url"
  description = "DATABASE_URL de la API (MySQL en RDS)"
  type        = "SecureString"
  # sslcert: el certificado de RDS que viene dentro de la imagen Docker (paso 30).
  # sslaccept=strict: si el servidor no presenta un certificado firmado por esa
  # CA y con ese nombre, la API se niega a conectar.
  value_wo         = "mysql://${aws_db_instance.main.username}:${var.db_password}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}?sslcert=/app/certs/rds-ca.pem&sslaccept=strict"
  value_wo_version = var.secrets_version
}

resource "aws_ssm_parameter" "internal_api_key" {
  name             = "${local.ssm_prefix}/internal-api-key"
  description      = "INTERNAL_API_KEY compartida entre la API y los workers"
  type             = "SecureString"
  value_wo         = var.internal_api_key
  value_wo_version = var.secrets_version
}

resource "aws_ssm_parameter" "stripe_secret_key" {
  name             = "${local.ssm_prefix}/stripe-secret-key"
  description      = "STRIPE_SECRET_KEY (modo prueba, sk_test_...)"
  type             = "SecureString"
  value_wo         = var.stripe_secret_key
  value_wo_version = var.secrets_version
}

# Paso 30: el secreto con el que Stripe firma los avisos que manda a la API en
# AWS. Es distinto del de `stripe listen` en tu PC: cada endpoint tiene el suyo.
resource "aws_ssm_parameter" "stripe_webhook_secret" {
  name             = "${local.ssm_prefix}/stripe-webhook-secret"
  description      = "STRIPE_WEBHOOK_SECRET del endpoint de la API en AWS (whsec_...)"
  type             = "SecureString"
  value_wo         = var.stripe_webhook_secret
  value_wo_version = var.secrets_version
}
