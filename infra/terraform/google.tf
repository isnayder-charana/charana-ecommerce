# --- "Continuar con Google" -------------------------------------------------
# Cognito actúa como intermediario: la tienda solo habla con Cognito, Cognito
# habla con Google y al final entrega a la tienda los mismos tokens de siempre.

resource "aws_cognito_identity_provider" "google" {
  user_pool_id  = aws_cognito_user_pool.store.id
  provider_name = "Google" # nombre fijo que espera Cognito
  provider_type = "Google"

  provider_details = {
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "openid email profile" # solo nombre y correo
  }

  # Atributo de Cognito = dato que envía Google.
  attribute_mapping = {
    username       = "sub" # id único y permanente de la cuenta de Google
    email          = "email"
    email_verified = "email_verified"
    name           = "name"
  }
}
