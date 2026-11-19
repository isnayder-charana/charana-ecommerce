# Versiones fijas: Terraform y el proveedor de AWS no cambian solos entre
# una ejecución y otra. `.terraform.lock.hcl` (se crea con `terraform init`)
# guarda además las huellas de los binarios descargados: súbelo al repo.
terraform {
  required_version = "~> 1.17.1"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.72.0"
    }
  }

  # Paso 28: el estado vive en S3 (bucket creado por infra/terraform/bootstrap),
  # así tu PC y GitHub Actions trabajan sobre la misma "memoria".
  # `use_lockfile` crea un archivo .tflock junto al estado mientras alguien
  # hace plan/apply: si otro intenta a la vez, espera en vez de pisarlo.
  #
  # El nombre del bucket y el perfil no van aquí (los bloques backend no
  # aceptan variables): se pasan con `terraform init -backend-config=backend.hcl`.
  backend "s3" {
    key          = "charanatech/terraform.tfstate"
    region       = "us-east-2"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile

  # Todas las piezas que creemos llevan estas etiquetas: así se reconocen en la consola.
  default_tags {
    tags = {
      Project   = "charanatech"
      ManagedBy = "terraform"
    }
  }
}
