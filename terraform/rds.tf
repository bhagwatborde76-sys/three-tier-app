resource "aws_db_subnet_group" "this" {
  name       = "three-tier-db-subnet-group"
  subnet_ids = module.vpc.database_subnets
}

resource "aws_security_group" "rds" {
  name   = "three-tier-rds-sg"
  vpc_id = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [module.eks.node_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "postgres" {
  identifier             = "three-tier-db"
  engine                 = "postgres"
  engine_version         = "16.3"
  instance_class         = "db.t3.micro"
  allocated_storage      = 20
  db_name                = "appdb"
  username               = "appuser"
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  multi_az               = false
  skip_final_snapshot    = true
  publicly_accessible    = false
}

output "rds_endpoint" {
  value = aws_db_instance.postgres.address
}
