data "aws_caller_identity" "current" {}

# --- User Pool: el "directorio" de usuarios de la tienda --------------------

resource "aws_cognito_user_pool" "store" {
  name = "charanatech-store"

  # El correo es el nombre de usuario, y Cognito lo verifica con un código.
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  username_configuration {
    case_sensitive = false # Ana@Correo.com y ana@correo.com son la misma persona
  }

  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  # Recuperar la contraseña solo con el correo verificado.
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Correos de Cognito (gratis, ~50 al día). En la fase 3 se puede cambiar a SES.
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Tu código de CharanaTech"
    email_message        = "Tu código de verificación es {####}"
  }

  # Evita borrar por accidente a todos los usuarios con un `terraform destroy`.
  # Para borrarlo de verdad, cambia esto a "INACTIVE" y aplica primero.
  deletion_protection = "ACTIVE"
}

# --- Grupo admin: la API lo lee del token (cognito:groups) -----------------

resource "aws_cognito_user_group" "admin" {
  user_pool_id = aws_cognito_user_pool.store.id
  name         = "admin"
  description  = "Administradores de la tienda (panel de admin, fase 5)."
}

# --- Dominio de inicio de sesión ------------------------------------------
# Lo usa el flujo OAuth (por ejemplo "Continuar con Google", paso 16).
# El prefijo debe ser único en todo AWS: le agregamos el número de tu cuenta.

resource "aws_cognito_user_pool_domain" "store" {
  user_pool_id = aws_cognito_user_pool.store.id
  domain       = "charanatech-${data.aws_caller_identity.current.account_id}"
}

# --- Cliente de la tienda (App Client) --------------------------------------

resource "aws_cognito_user_pool_client" "store" {
  name         = "charanatech-web"
  user_pool_id = aws_cognito_user_pool.store.id

  # Cliente PÚBLICO: corre en el navegador, donde cualquier secreto se puede leer.
  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",            # la tienda (Amplify): la contraseña nunca viaja tal cual
    "ALLOW_REFRESH_TOKEN_AUTH",       # renovar la sesión sin volver a escribir la contraseña
    "ALLOW_ADMIN_USER_PASSWORD_AUTH", # solo desde la terminal con credenciales de AWS (para probar)
  ]

  # Flujo OAuth "código + PKCE" para el inicio de sesión con Google.
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO", aws_cognito_identity_provider.google.provider_name]
  callback_urls                        = [for url in var.store_urls : "${url}/auth/callback"]
  logout_urls                          = [for url in var.store_urls : url]

  # Duración de los tokens.
  access_token_validity  = 60 # minutos
  id_token_validity      = 60 # minutos
  refresh_token_validity = 30 # días
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  # Si alguien prueba un correo que no existe, Cognito responde igual que con
  # una contraseña incorrecta: no revela qué correos están registrados.
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true
}
