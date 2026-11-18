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
