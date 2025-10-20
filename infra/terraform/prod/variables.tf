variable "environment" {
  description = "Deployment environment name (e.g. staging, prod)"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "availability_zones" {
  description = "List of availability zones to spread the workload"
  type        = list(string)
}

variable "vpc_cidr" {
  description = "CIDR range for the VPC"
  type        = string
  default     = "10.32.0.0/16"
}

variable "private_subnets" {
  description = "Private subnets for application workloads"
  type        = list(string)
}

variable "public_subnets" {
  description = "Public subnets for ingress controllers"
  type        = list(string)
}

variable "eks_version" {
  description = "Desired Kubernetes control plane version"
  type        = string
  default     = "1.30"
}

variable "eks_instance_type" {
  description = "Instance type for EKS managed node group"
  type        = string
  default     = "m6i.large"
}

variable "rds_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.m6g.large"
}

variable "rds_engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "16.3"
}

variable "rds_allocated_storage" {
  description = "Allocated storage in GB for RDS"
  type        = number
  default     = 100
}

variable "rds_db_name" {
  description = "Database name"
  type        = string
  default     = "forte"
}

variable "rds_username" {
  description = "Database master username"
  type        = string
}

variable "rds_password" {
  description = "Database master password"
  type        = string
  sensitive   = true
}

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.r6g.large"
}

variable "root_domain" {
  description = "Root domain for public endpoints"
  type        = string
}

variable "dns_zone_id" {
  description = "Hosted zone ID in Route53"
  type        = string
}

variable "api_ingress_hostname" {
  description = "Hostname of the ingress controller serving the API"
  type        = string
}

variable "web_ingress_hostname" {
  description = "Hostname of the ingress controller serving the web app"
  type        = string
}

variable "tags" {
  description = "Common tags applied to AWS resources"
  type        = map(string)
  default     = {}
}
