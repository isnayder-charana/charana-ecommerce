# Paso 16 (fase 2): "Continuar con Google"

## Qué hicimos

Cognito ahora acepta cuentas de Google, además de correo y contraseña. Para eso:

1. Creaste en **Google Cloud** un cliente OAuth (un "permiso" para que tu app pida datos de una cuenta de Google).
2. Registramos a Google como **proveedor de identidad** en el User Pool, con Terraform.

```
infra/terraform/
├─ google.tf                  # NUEVO: Google como proveedor de identidad
├─ variables.tf               # + google_client_id y google_client_secret
├─ cognito.tf                 # el cliente de la tienda ahora acepta "Google"
├─ terraform.tfvars.example   # plantilla (sí va al repo)
└─ terraform.tfvars           # TUS valores reales (NO va al repo)
```

## Cómo funciona: OAuth 2.0 y OpenID Connect

Cognito hace de **intermediario**. La tienda nunca habla con Google directamente:

```
Tienda ──► Cognito ──► Google: "¿quién eres?"
                         │  la persona elige su cuenta y acepta
Tienda ◄── Cognito ◄─────┘  Google devuelve nombre y correo
   (tokens de Cognito, los mismos de siempre)
```

- **OAuth 2.0** es el protocolo para que una app pida permiso a otra en nombre de una persona, **sin ver su contraseña**. La contraseña de Google solo se escribe en google.com.
- **OpenID Connect (OIDC)** es una capa sobre OAuth que agrega "quién es la persona": el **ID token** con su id, nombre y correo.
- **Proveedor federado:** otra empresa (Google) confirma la identidad y Cognito confía en ella.

La gran ventaja es que **la API no cambia nada**. Sin importar si la persona entró con correo o con Google, recibe un access token de Cognito y lo verifica igual que en el paso 15.

### ¿Qué es la "redirect URI"?

Cuando la persona acepta en Google, Google la devuelve a una dirección. Si cualquiera pudiera elegir esa dirección, un atacante podría pedir que lo devuelvan a **su** sitio con el código de acceso. Por eso Google solo acepta las URIs que registraste:

```
https://charanatech-<tu cuenta>.auth.us-east-2.amazoncognito.com/oauth2/idpresponse
```

Es la dirección de **Cognito**, no la de la tienda: Google le entrega la respuesta a Cognito, y Cognito (con su propia lista, del paso 15) devuelve a la persona a la tienda.

## Por qué el secreto va en `terraform.tfvars`

El **client secret** prueba ante Google que quien pide es Cognito. Con él, alguien podría hacerse pasar por tu app.

- Nunca va en el código: `google.tf` solo dice `var.google_client_secret`.
- El valor real va en `terraform.tfvars`, que está en `.gitignore` (lo agregamos en el paso 15).
- `sensitive = true` hace que Terraform lo oculte en el `plan` y en la consola.
- En el repo sí va `terraform.tfvars.example`, con valores de ejemplo, para que cualquiera sepa qué llenar.

Fíjate que este secreto **sí** puede existir, a diferencia del cliente de la tienda del paso 15: lo guarda Cognito, en un servidor, no el navegador.

## Qué datos copiamos de Google (`attribute_mapping`)

| En Cognito | Viene de Google | Para qué |
| --- | --- | --- |
| `username` | `sub` | Id único y permanente de la cuenta de Google |
| `email` | `email` | El correo |
| `email_verified` | `email_verified` | Google ya verificó el correo: no hace falta enviar código |
| `name` | `name` | El nombre para el menú de la cuenta (paso 17) |

En la consola de Cognito, estos usuarios aparecen con un nombre que empieza por `Google_` y sigue con un número largo.

## Cómo ejecutarlo (en tu PC)

**1. Crea tu archivo de variables.** En `infra/terraform`, copia la plantilla:

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
```

Abre `terraform.tfvars` y pega tu Client ID y tu Client secret de Google.

**2. Aplica:**

```bash
aws login --profile charanatech   # si la sesión ya venció
terraform plan
terraform apply
```

El plan debe decir **`1 to add, 1 to change, 0 to destroy`**: agrega el proveedor Google y cambia el cliente de la tienda para que lo acepte. En el plan, el secreto aparece como `(sensitive value)`.

## Probarlo (sin la tienda todavía)

La página de inicio de sesión llega en el paso 17, pero ya puedes probar el viaje completo. Abre esta dirección en el navegador, con tus valores de `terraform output`:

```
https://<login_domain>/oauth2/authorize?identity_provider=Google&client_id=<client_id>&response_type=code&scope=openid+email+profile&redirect_uri=http://localhost:3001/auth/callback
```

1. Te lleva a Google: elige tu cuenta y acepta.
2. Vuelve a `http://localhost:3001/auth/callback?code=...`. La tienda todavía muestra "no encontrado" porque esa página llega en el paso 17. Lo importante es el **`code=`** en la dirección: Cognito aceptó a Google.
3. En la consola de AWS, en **Cognito → User pools → charanatech-store → Users**, aparece tu usuario `Google_...` con tu correo.

Ese `code` es de un solo uso y vence en minutos. En el paso 17, Amplify lo cambia por los tokens usando **PKCE**.

## La app de Google está en modo "Testing"

Para **publicar** la app en Google Cloud (Audience → Publish app), Google pide la dirección pública de la página de inicio y de la política de privacidad. La tienda todavía solo existe en `localhost`, así que por ahora queda en **Testing**: solo pueden entrar los correos agregados en **Test users** (máximo 100). En la fase 4, con la tienda en Vercel, agregamos una página `/privacidad`, completamos **Branding** y la publicamos.

## Algo a tener en cuenta

Si alguien se registra con correo y contraseña y después entra con Google usando **el mismo correo**, Cognito crea **dos usuarios distintos**. Unirlos requiere una función Lambda que se ejecuta antes del registro, y queda como mejora para después. Para un portafolio es suficiente.

## Lo que aprendiste

- **OAuth 2.0** (permiso sin compartir la contraseña) y **OpenID Connect** (quién es la persona).
- **Proveedor federado:** Cognito confía en Google y entrega sus propios tokens, así que la API no cambia.
- **Redirect URIs registradas:** solo se devuelve a la persona a direcciones conocidas.
- **Los secretos no van en el código:** variables `sensitive` + `terraform.tfvars` en `.gitignore` + un `.example` en el repo.

**Siguiente paso (17):** la página `/entrar` en la tienda, con Amplify: correo y contraseña, registro con código y el botón "Continuar con Google".
