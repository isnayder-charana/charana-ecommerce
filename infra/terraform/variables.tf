variable "aws_region" {
  description = "Región de AWS. En tu cuenta (modo nuevo de AWS) es fija."
  type        = string
  default     = "us-east-2"
}

variable "aws_profile" {
  description = "Perfil de la AWS CLI con el que Terraform se conecta (el de `aws login --profile ...`)."
  type        = string
  default     = "charanatech"
}

variable "store_urls" {
  description = "Direcciones de la tienda. Cognito solo devuelve al usuario a estas URLs después de iniciar o cerrar sesión."
  type        = list(string)
  default     = ["http://localhost:3001"]

  validation {
    condition     = alltrue([for url in var.store_urls : can(regex("^https?://[^/]+$", url))])
    error_message = "Cada URL debe ser solo el origen, sin barra final ni ruta (por ejemplo http://localhost:3001)."
  }
}

# --- Google (paso 16) --------------------------------------------------------
# Los valores reales van en terraform.tfvars, que NO se sube al repo.

variable "google_client_id" {
  description = "Client ID del cliente OAuth de Google Cloud."
  type        = string
}

variable "google_client_secret" {
  description = "Client secret del cliente OAuth de Google Cloud."
  type        = string
  sensitive   = true # Terraform no lo muestra en el plan ni en la consola
}

# --- Paso 29: base de datos y secretos ----------------------------------------
# `ephemeral = true`: Terraform usa el valor durante plan/apply y no lo guarda
# en ningún lado (ni en el estado ni en el plan). Solo puede ir a argumentos
# "write-only" como `password_wo` o `value_wo`.

variable "db_allowed_cidrs" {
  description = "IPs que pueden conectarse a MySQL, en formato CIDR (tu IP pública con /32)."
  type        = list(string)

  validation {
    condition     = alltrue([for cidr in var.db_allowed_cidrs : can(cidrhost(cidr, 0))])
    error_message = "Cada valor debe ser un CIDR válido, por ejemplo 190.12.34.56/32."
  }
}

variable "secrets_version" {
  description = "Súbelo en 1 para volver a enviar a AWS los secretos de abajo (rotarlos)."
  type        = number
  default     = 2 # paso 30: DATABASE_URL ahora exige TLS con el certificado de RDS
}

variable "db_password" {
  description = "Contraseña del usuario charanatech de MySQL. Genérala con: openssl rand -hex 20 (40 caracteres; RDS acepta como máximo 41)"
  type        = string
  sensitive   = true
  ephemeral   = true
  default     = null

  validation {
    condition     = var.db_password == null || can(regex("^[A-Za-z0-9]{24,41}$", var.db_password))
    error_message = "Usa entre 24 y 41 letras o números (RDS no acepta más de 41, y sin símbolos porque van dentro de una URL)."
  }
}

variable "internal_api_key" {
  description = "La misma INTERNAL_API_KEY de apps/api/.env (mínimo 32 caracteres)."
  type        = string
  sensitive   = true
  ephemeral   = true
  default     = null
}

variable "stripe_secret_key" {
  description = "Clave secreta de Stripe en modo prueba (sk_test_...)."
  type        = string
  sensitive   = true
  ephemeral   = true
  default     = null

  validation {
    condition     = var.stripe_secret_key == null || startswith(coalesce(var.stripe_secret_key, "x"), "sk_test_")
    error_message = "Solo se aceptan claves de prueba (sk_test_...)."
  }
}

# --- Paso 30: la API en Lambda --------------------------------------------------

variable "stripe_webhook_secret" {
  description = "Secreto del webhook que creas en el Dashboard de Stripe para la URL de la API (whsec_...)."
  type        = string
  sensitive   = true
  ephemeral   = true
  default     = null

  validation {
    condition     = var.stripe_webhook_secret == null || can(regex("^whsec_[A-Za-z0-9]+$", coalesce(var.stripe_webhook_secret, "x")))
    error_message = "El secreto del webhook empieza con whsec_."
  }
}

variable "api_image_tag" {
  description = "Etiqueta de la PRIMERA imagen de la API en ECR (git rev-parse --short HEAD). Desde el paso 36, las siguientes las despliega GitHub Actions."
  type        = string
  default     = null
}

# --- Paso 31: eventos y workers --------------------------------------------------

variable "workers_image_tag" {
  description = "Etiqueta de la PRIMERA imagen de los workers en ECR (scripts/ecr-push.sh workers). Desde el paso 36, las siguientes las despliega GitHub Actions."
  type        = string
  default     = null
}

variable "fulfillment_delay_seconds" {
  description = "Segundos que cada pedido espera \"en el almacén\" y \"en camino\" (envío simulado)."
  type        = number
  default     = 15

  validation {
    condition     = var.fulfillment_delay_seconds >= 0 && var.fulfillment_delay_seconds <= 900
    error_message = "SQS acepta entre 0 y 900 segundos de retraso."
  }
}

# --- Paso 32: correos y alertas -------------------------------------------------
# Van en terraform.tfvars (que no se sube al repo): así tu correo no queda público.

variable "alert_email" {
  description = "Correo que recibe las alarmas de las DLQ (hay que confirmar la suscripción)."
  type        = string

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.alert_email))
    error_message = "alert_email debe ser un correo, por ejemplo tu-nombre@gmail.com."
  }
}

variable "ses_sender_email" {
  description = "Remitente de los correos de la tienda. SES manda un enlace para verificarlo."
  type        = string

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.ses_sender_email))
    error_message = "ses_sender_email debe ser un correo, por ejemplo tu-nombre@gmail.com."
  }
}

variable "ses_verified_recipients" {
  description = "Correos extra que pueden recibir mensajes mientras SES esté en sandbox (cada uno se verifica con un enlace)."
  type        = list(string)
  default     = []
}

# --- Paso 36: despliegue desde GitHub Actions ------------------------------------

variable "github_repository" {
  description = "Repositorio (dueño/nombre) cuyo workflow de despliegue puede asumir el rol de AWS."
  type        = string
  default     = "isnayder-charana/charana-ecommerce"
}
