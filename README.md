# Three-Tier Application: Jenkins + Docker + Kubernetes + AWS

A complete reference deployment: React frontend (presentation), Node/Express API
(application), PostgreSQL (data), containerized with Docker, orchestrated with
Kubernetes on AWS EKS, provisioned with Terraform, and deployed via a Jenkins
CI/CD pipeline.

## Project structure

```
three-tier-app/
├── frontend/           # React (Vite) + Nginx
│   ├── src/App.jsx
│   ├── src/main.jsx
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   ├── Dockerfile
│   └── nginx.conf
├── backend/            # Node/Express API
│   ├── src/index.js
│   ├── package.json
│   ├── Dockerfile
│   └── init.sql
├── k8s/                 # Kubernetes manifests
│   ├── 00-namespace.yaml
│   ├── 01-config-secret.yaml
│   ├── 02-database-statefulset.yaml   # dev/local only — use RDS in prod
│   ├── 03-backend-deployment.yaml
│   ├── 04-frontend-deployment.yaml
│   ├── 05-ingress.yaml
│   └── 06-network-policy.yaml
├── jenkins/
│   └── Jenkinsfile
├── terraform/            # AWS infra: VPC, EKS, RDS, ECR
│   ├── main.tf
│   ├── vpc.tf
│   ├── eks.tf
│   ├── rds.tf
│   └── ecr.tf
└── docker-compose.yml   # local dev, no k8s needed
```

## Step-by-step: how to actually deploy this

### Step 0 — Prerequisites
- AWS account + AWS CLI configured (`aws configure`)
- `kubectl`, `terraform`, `docker`, `eksctl` installed locally
- A Jenkins server (EC2 instance, or run Jenkins itself in a container/pod) with:
  the AWS CLI, Docker, kubectl, and Trivy installed on its agents
- An IAM user/role for Jenkins with permissions for ECR push, EKS describe, and
  `eks:UpdateKubeconfig`

### Step 1 — Test locally with docker-compose
```bash
cd three-tier-app
docker-compose up --build
# frontend: http://localhost:8080
# backend:  http://localhost:4000/api/items
```
This proves the app works before any cloud infra is involved.

### Step 2 — Provision AWS infrastructure with Terraform
```bash
cd terraform
terraform init
terraform plan -var="db_password=<STRONG_PASSWORD>"
terraform apply -var="db_password=<STRONG_PASSWORD>"
```
This creates:
- A VPC with public, private, and database subnets across 2 AZs
- An EKS cluster with a managed node group
- An RDS PostgreSQL instance (private, only reachable from EKS nodes)
- Two ECR repositories (frontend, backend)

Note the Terraform outputs — you'll need the RDS endpoint and ECR repo URIs.

### Step 3 — Connect kubectl to the new cluster
```bash
aws eks update-kubeconfig --name three-tier-cluster --region ap-south-1
kubectl get nodes
```

### Step 4 — Install the AWS Load Balancer Controller (for Ingress)
```bash
helm repo add eks https://aws.github.io/eks-charts
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=three-tier-cluster \
  --set serviceAccount.create=true
```

### Step 5 — Update manifests with real values
In `k8s/01-config-secret.yaml`, set `DB_HOST` to your RDS endpoint (from
Terraform output) instead of `postgres-service`, and remove the StatefulSet
(`02-database-statefulset.yaml`) if using RDS in production.
Replace `<ECR_REPO_URI>` and `<ACM_CERT_ARN>` placeholders in the backend,
frontend, and ingress manifests.

### Step 6 — First manual deploy (before Jenkins takes over)
```bash
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-config-secret.yaml
kubectl apply -f k8s/02-database-statefulset.yaml   # skip if using RDS
kubectl apply -f k8s/03-backend-deployment.yaml
kubectl apply -f k8s/04-frontend-deployment.yaml
kubectl apply -f k8s/05-ingress.yaml
kubectl apply -f k8s/06-network-policy.yaml
kubectl get ingress -n three-tier-app   # grab the ALB DNS name
```

### Step 7 — Set up Jenkins
1. Install plugins: Pipeline, Docker Pipeline, AWS Credentials, Amazon ECR.
2. Add AWS credentials in Jenkins (Credentials ID: `aws-jenkins-creds`).
3. Create a new Pipeline job pointing at your Git repo, using
   `jenkins/Jenkinsfile` as the pipeline script path.
4. Add a webhook in your Git provider (GitHub/GitLab) so pushes trigger builds.
5. Edit the `Jenkinsfile` environment block: set your real
   `AWS_ACCOUNT_ID`, region, and cluster name.

### Step 8 — Push code and watch it deploy
```bash
git add .
git commit -m "initial three-tier app"
git push origin main
```
Jenkins will: checkout → test backend → build frontend → build Docker images →
scan images with Trivy → push to ECR → update the EKS deployments → verify
rollout → auto-rollback on failure.

### Step 9 — Verify
```bash
kubectl get pods -n three-tier-app
kubectl logs -f deployment/backend -n three-tier-app
curl http://<ALB_DNS_NAME>/api/items
```

## Key design decisions worth understanding

- **Data tier uses RDS in production**, not a Kubernetes StatefulSet — backups,
  patching, and failover are handled by AWS instead of you.
- **Secrets** are shown here as plain Kubernetes Secrets for simplicity; replace
  with AWS Secrets Manager + External Secrets Operator before going to production.
- **NetworkPolicy** ensures only the backend pods can reach Postgres on port
  5432 — the frontend cannot talk to the database directly.
- **HPA** scales backend pods 2→10 based on CPU; pair with Cluster Autoscaler
  or Karpenter so nodes scale too, or pods will stay `Pending`.
- **Multi-stage Docker builds** keep runtime images small and free of build
  tooling/source maps.
- **Image scanning (Trivy)** runs in CI before every push — the pipeline fails
  the build on HIGH/CRITICAL vulnerabilities.
- **Automatic rollback**: if `rollout status` doesn't succeed within its
  timeout, the Jenkins `post { failure }` block runs `rollout undo`.

## Local development without any AWS costs
Use `docker-compose up` for iterating on the app, or `minikube`/`kind` plus the
`k8s/` manifests (skip Ingress + RDS-specific config, use the StatefulSet) to
test Kubernetes behavior without touching AWS at all.
