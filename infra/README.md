# infra

- `terraform/`: infraestructura en AWS como código. Hoy crea el User Pool de Cognito (paso 15); en la fase 4 se suman Lambda, API Gateway, RDS, DynamoDB, S3 y CloudFront. Guía: [docs/pasos/15-terraform-cognito.md](../docs/pasos/15-terraform-cognito.md).
- `local/`: scripts que usan los contenedores de `compose.yaml` (raíz del repo) para desarrollo local.
