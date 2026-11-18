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

  # Por ahora el estado (terraform.tfstate) vive en tu PC y está en .gitignore.
  # En la fase 4 lo movemos a S3 para que GitHub Actions también pueda usarlo.
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
