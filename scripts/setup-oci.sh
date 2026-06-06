#!/bin/bash
set -euo pipefail

echo "=== aprenda-politica-workers: OCI Ubuntu 22.04 setup ==="

# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker

# Docker Compose plugin
sudo apt-get install -y docker-compose-plugin

# Clonar repo
REPO_URL="${1:-https://github.com/SEU_USUARIO/aprenda-politica-workers.git}"
git clone "$REPO_URL" ~/aprenda-politica-workers
cd ~/aprenda-politica-workers

echo ""
echo "=== Setup concluído! ==="
echo "Próximos passos:"
echo "  1. cd ~/aprenda-politica-workers"
echo "  2. cp .env.example .env && nano .env   # preencher credentials"
echo "  3. docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d"
echo "  4. docker compose logs -f              # verificar workers"
