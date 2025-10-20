terraform {
  required_version = ">= 1.5.0"
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
  backend "local" {}
}

provider "docker" {}

resource "docker_network" "forte_dev" {
  name = "forte-dev"
}

resource "docker_volume" "postgres_data" {
  name = "forte-dev-postgres"
}

resource "docker_volume" "redis_data" {
  name = "forte-dev-redis"
}

output "network" {
  value = docker_network.forte_dev.name
}
