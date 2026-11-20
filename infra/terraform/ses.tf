# --- Paso 32: correos con Amazon SES -----------------------------------------
#
# SES solo envía desde direcciones verificadas: al crear la identidad, AWS
# manda un correo con un enlace que tienes que abrir.
#
# Tu cuenta está en el "sandbox" de SES: además del remitente, cada
# DESTINATARIO tiene que estar verificado. A los demás, SES no les entrega y el
# worker lo anota en el log sin reintentar (apps/workers, SesEmailSender).

resource "aws_sesv2_email_identity" "sender" {
  email_identity = var.ses_sender_email
}

# Correos extra que pueden recibir mensajes de la tienda mientras estés en el
# sandbox (por ejemplo, otra cuenta tuya para probar compras).
resource "aws_sesv2_email_identity" "recipient" {
  for_each = toset([for email in var.ses_verified_recipients : email if email != var.ses_sender_email])

  email_identity = each.value
}
