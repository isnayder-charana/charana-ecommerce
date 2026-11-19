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
  default     = 1
}

variable "db_password" {
  description = "Contraseña del usuario charanatech de MySQL. Genérala con: openssl rand -hex 24"
  type        = string
  sensitive   = true
  ephemeral   = true
  default     = null

  validation {
    condition     = var.db_password == null || can(regex("^[A-Za-z0-9]{24,}$", var.db_password))
    error_message = "Usa al menos 24 letras o números (sin símbolos: van dentro de una URL)."
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
