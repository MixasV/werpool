terraform {
  required_version = ">= 1.5.0"

  backend "s3" {}

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

module "network" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.1"

  name = "${var.environment}-forte-vpc"

  cidr = var.vpc_cidr

  azs             = var.availability_zones
  private_subnets = var.private_subnets
  public_subnets  = var.public_subnets

  enable_nat_gateway = true
  single_nat_gateway = true

  tags = merge(var.tags, {
    "Environment" = var.environment
    "Component"   = "network"
  })
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.8"

  cluster_name    = "${var.environment}-forte-eks"
  cluster_version = var.eks_version

  vpc_id                   = module.network.vpc_id
  subnet_ids               = module.network.private_subnets
  cluster_endpoint_public_access  = true
  cluster_endpoint_private_access = true

  manage_aws_auth_configmap = true

  cluster_tags = merge(var.tags, {
    "Environment" = var.environment
    "Component"   = "eks"
  })

  eks_managed_node_groups = {
    default = {
      desired_size = 3
      max_size     = 6
      min_size     = 3

      instance_types = [var.eks_instance_type]
      capacity_type  = "ON_DEMAND"

      disk_size = 50
      labels = {
        workload = "forte-api"
      }
      tags = merge(var.tags, {
        "Environment" = var.environment
        "Component"   = "node-group"
      })
    }
  }
}

module "rds" {
  source  = "terraform-aws-modules/rds/aws"
  version = "~> 6.5"

  identifier = "${var.environment}-forte-postgres"

  engine            = "postgres"
  engine_version    = var.rds_engine_version
  instance_class    = var.rds_instance_class
  allocated_storage = var.rds_allocated_storage

  db_name  = var.rds_db_name
  username = var.rds_username
  password = var.rds_password

  vpc_security_group_ids = [aws_security_group.db.id]
  subnet_ids             = module.network.private_subnets

  backup_retention_period = 7
  skip_final_snapshot      = false

  tags = merge(var.tags, {
    "Environment" = var.environment
    "Component"   = "postgres"
  })
}

resource "aws_security_group" "db" {
  name        = "${var.environment}-forte-db"
  description = "Database access for Forte API"
  vpc_id      = module.network.vpc_id

  ingress {
    description = "EKS nodes"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    security_groups = [module.eks.node_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    "Environment" = var.environment
    "Component"   = "security"
  })
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.environment}-forte-redis"
  subnet_ids = module.network.private_subnets
}

resource "aws_security_group" "redis" {
  name        = "${var.environment}-forte-redis"
  description = "Redis access for Forte API"
  vpc_id      = module.network.vpc_id

  ingress {
    description = "EKS nodes"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    security_groups = [module.eks.node_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    "Environment" = var.environment
    "Component"   = "security"
  })
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id          = "${var.environment}-forte-redis"
  description                   = "Redis for Forte Markets"
  node_type                     = var.redis_node_type
  number_cache_clusters         = 2
  automatic_failover_enabled    = true
  multi_az_enabled              = true
  port                          = 6379
  parameter_group_name          = "default.redis7.cluster.on"
  subnet_group_name             = aws_elasticache_subnet_group.redis.name
  security_group_ids            = [aws_security_group.redis.id]
  at_rest_encryption_enabled    = true
  transit_encryption_enabled    = true

  tags = merge(var.tags, {
    "Environment" = var.environment
    "Component"   = "redis"
  })
}

locals {
  public_dns_name = "${var.environment}-forte.${var.root_domain}"
}

resource "aws_route53_record" "api" {
  zone_id = var.dns_zone_id
  name    = "api.${locals.public_dns_name}"
  type    = "CNAME"
  ttl     = 60
  records = [var.api_ingress_hostname]
}

resource "aws_route53_record" "web" {
  zone_id = var.dns_zone_id
  name    = locals.public_dns_name
  type    = "CNAME"
  ttl     = 60
  records = [var.web_ingress_hostname]
}

output "cluster_id" {
  value       = module.eks.cluster_id
  description = "EKS cluster identifier"
}

output "rds_endpoint" {
  value       = module.rds.db_instance_endpoint
  description = "PostgreSQL endpoint"
}

output "redis_endpoint" {
  value       = aws_elasticache_replication_group.redis.configuration_endpoint_address
  description = "Redis configuration endpoint"
}

output "public_domain" {
  value       = locals.public_dns_name
  description = "Base domain for Forte Markets"
}
