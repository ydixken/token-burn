# Krawall Deployment Guide

Complete guide for deploying Krawall to production environments.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Docker Deployment](#docker-deployment)
4. [Database Setup](#database-setup)
5. [SSL/TLS Configuration](#ssltls-configuration)
6. [Health Checks](#health-checks)
7. [Monitoring](#monitoring)
8. [Backup & Recovery](#backup--recovery)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

- **OS**: Linux (Ubuntu 22.04 LTS recommended)
- **CPU**: 4+ cores
- **RAM**: 8GB+ (16GB recommended)
- **Disk**: 50GB+ SSD
- **Network**: Static IP or domain name

### Software Requirements

- Docker 24.0+
- Docker Compose 2.20+
- Git
- OpenSSL (for SSL certificates)

### Installation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose-plugin

# Verify installations
docker --version
docker compose version
```

---

## Environment Variables

### Required Variables

Create `/opt/krawall/.env` with the following:

```bash
# Application
NODE_ENV=production
APP_PORT=3000
NEXTAUTH_URL=https://yourdomain.com
NEXTAUTH_SECRET=your-super-secret-key-here

# Database
POSTGRES_DB=krawall
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-strong-password
DATABASE_URL=postgresql://postgres:your-strong-password@postgres:5432/krawall

# Redis
REDIS_URL=redis://redis:6379

# Security
ENCRYPTION_KEY=your-64-character-hex-encryption-key

# Worker Configuration
WORKER_CONCURRENCY=3
METRICS_WORKER_CONCURRENCY=2

# Docker Registry (if using private registry)
REGISTRY_URL=registry.example.com
TAG=latest
```

### Generating Secrets

```bash
# Generate NEXTAUTH_SECRET
openssl rand -base64 32

# Generate ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Docker Deployment

### Clone Repository

```bash
cd /opt
sudo git clone https://github.com/yourusername/krawall.git
cd krawall
```

### Build Images

#### Option 1: Use Pre-built Images

```bash
# Pull from registry
docker compose -f infra/docker-compose.prod.yml pull
```

#### Option 2: Build Locally

```bash
# Build application
docker build -t krawall:latest -f docker/Dockerfile .

# Build worker
docker build -t krawall-worker:latest -f docker/Dockerfile.worker .
```

### Start Services

```bash
# Start all services
docker compose -f infra/docker-compose.prod.yml up -d

# Check status
docker compose -f infra/docker-compose.prod.yml ps

# View logs
docker compose -f infra/docker-compose.prod.yml logs -f
```

### Verify Deployment

```bash
# Health check
curl http://localhost:3000/api/health

# Expected response
{"status":"ok","timestamp":"2026-01-26T20:00:00.000Z","version":"1.0.0"}
```

---

## Database Setup

### Run Migrations

```bash
# Enter app container
docker compose -f infra/docker-compose.prod.yml exec app sh

# Run migrations
pnpm prisma migrate deploy

# (Optional) Seed initial data
pnpm prisma db seed
```

### Database Backup

```bash
# Backup database
docker compose -f infra/docker-compose.prod.yml exec postgres \
  pg_dump -U postgres krawall > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore from backup
cat backup_20260126_200000.sql | \
  docker compose -f infra/docker-compose.prod.yml exec -T postgres \
  psql -U postgres krawall
```

---

## SSL/TLS Configuration

### Using Let's Encrypt (Recommended)

```bash
# Install Certbot
sudo apt install certbot

# Generate certificate
sudo certbot certonly --standalone -d yourdomain.com

# Copy certificates
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem \
  /opt/krawall/docker/ssl/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem \
  /opt/krawall/docker/ssl/key.pem

# Set permissions
sudo chmod 644 /opt/krawall/docker/ssl/cert.pem
sudo chmod 600 /opt/krawall/docker/ssl/key.pem
```

### Auto-Renewal

```bash
# Add renewal hook
sudo bash -c 'cat > /etc/letsencrypt/renewal-hooks/deploy/krawall.sh << EOF
#!/bin/bash
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem /opt/krawall/docker/ssl/cert.pem
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem /opt/krawall/docker/ssl/key.pem
docker compose -f /opt/krawall/infra/docker-compose.prod.yml restart nginx
EOF'

sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/krawall.sh

# Test renewal
sudo certbot renew --dry-run
```

---

## Health Checks

### Application Health

```bash
# API health
curl https://yourdomain.com/api/health

# Database connectivity
docker compose -f infra/docker-compose.prod.yml exec postgres \
  pg_isready -U postgres -d krawall

# Redis connectivity
docker compose -f infra/docker-compose.prod.yml exec redis redis-cli ping
```

### Automated Monitoring

Create `/opt/krawall/healthcheck.sh`:

```bash
#!/bin/bash
set -e

# Check API
if ! curl -sf https://yourdomain.com/api/health > /dev/null; then
  echo "ERROR: API health check failed"
  exit 1
fi

# Check worker queue
QUEUE_SIZE=$(docker compose -f /opt/krawall/infra/docker-compose.prod.yml \
  exec -T redis redis-cli LLEN bull:session-execution:wait)

if [ "$QUEUE_SIZE" -gt 1000 ]; then
  echo "WARNING: Queue size is $QUEUE_SIZE"
fi

echo "OK: All health checks passed"
```

Add to crontab:
```bash
*/5 * * * * /opt/krawall/healthcheck.sh >> /var/log/krawall-health.log 2>&1
```

---

## Monitoring

### Log Management

```bash
# View application logs
docker compose -f infra/docker-compose.prod.yml logs -f app

# View worker logs
docker compose -f infra/docker-compose.prod.yml logs -f worker

# View all logs with timestamps
docker compose -f infra/docker-compose.prod.yml logs -f --timestamps

# Export logs
docker compose -f infra/docker-compose.prod.yml logs --no-color > logs_$(date +%Y%m%d).txt
```

### Resource Monitoring

```bash
# Container stats
docker stats

# Disk usage
df -h /opt/krawall
du -sh /opt/krawall/logs/

# Database size
docker compose -f infra/docker-compose.prod.yml exec postgres \
  psql -U postgres -d krawall -c "SELECT pg_size_pretty(pg_database_size('krawall'));"
```

### Log Rotation

Create `/etc/logrotate.d/krawall`:

```
/opt/krawall/logs/*.jsonl {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0644 root root
    sharedscripts
    postrotate
        docker compose -f /opt/krawall/infra/docker-compose.prod.yml restart app
    endscript
}
```

---

## Backup & Recovery

### Automated Backups

Create `/opt/krawall/backup.sh`:

```bash
#!/bin/bash
set -e

BACKUP_DIR="/opt/backups/krawall"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
docker compose -f /opt/krawall/infra/docker-compose.prod.yml exec -T postgres \
  pg_dump -U postgres krawall | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Backup logs
tar -czf $BACKUP_DIR/logs_$DATE.tar.gz /opt/krawall/logs/

# Keep only last 7 days
find $BACKUP_DIR -name "*.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

Schedule daily backups:
```bash
0 2 * * * /opt/krawall/backup.sh >> /var/log/krawall-backup.log 2>&1
```

### Disaster Recovery

```bash
# Stop services
docker compose -f infra/docker-compose.prod.yml down

# Restore database
gunzip < /opt/backups/krawall/db_20260126_020000.sql.gz | \
  docker compose -f infra/docker-compose.prod.yml exec -T postgres \
  psql -U postgres krawall

# Restore logs
tar -xzf /opt/backups/krawall/logs_20260126_020000.tar.gz -C /

# Restart services
docker compose -f infra/docker-compose.prod.yml up -d
```

---

## Troubleshooting

### Common Issues

#### 1. Application Won't Start

```bash
# Check logs
docker compose -f infra/docker-compose.prod.yml logs app

# Common fixes:
# - Verify DATABASE_URL is correct
# - Check if ports are available: sudo lsof -i :3000
# - Ensure .env file exists and has correct values
```

#### 2. Database Connection Errors

```bash
# Check PostgreSQL status
docker compose -f infra/docker-compose.prod.yml ps postgres

# Test connection
docker compose -f infra/docker-compose.prod.yml exec postgres \
  psql -U postgres -d krawall -c "SELECT 1;"

# Restart database
docker compose -f infra/docker-compose.prod.yml restart postgres
```

#### 3. Worker Not Processing Jobs

```bash
# Check worker logs
docker compose -f infra/docker-compose.prod.yml logs worker

# Check Redis queue
docker compose -f infra/docker-compose.prod.yml exec redis redis-cli

# Inside redis-cli:
LLEN bull:session-execution:wait
LLEN bull:session-execution:active
LLEN bull:session-execution:failed

# Restart worker
docker compose -f infra/docker-compose.prod.yml restart worker
```

#### 4. High Memory Usage

```bash
# Check resource usage
docker stats

# Reduce worker concurrency in .env
WORKER_CONCURRENCY=2

# Restart workers
docker compose -f infra/docker-compose.prod.yml restart worker
```

#### 5. SSL Certificate Errors

```bash
# Verify certificate files exist
ls -l /opt/krawall/docker/ssl/

# Check certificate validity
openssl x509 -in /opt/krawall/docker/ssl/cert.pem -text -noout

# Restart nginx
docker compose -f infra/docker-compose.prod.yml restart nginx
```

---

## Scaling

### Horizontal Scaling

#### Add More Workers

Edit `infra/docker-compose.prod.yml`:

```yaml
worker:
  deploy:
    replicas: 4  # Increase from 2 to 4
```

Then restart:
```bash
docker compose -f infra/docker-compose.prod.yml up -d --scale worker=4
```

#### Database Connection Pooling

In `.env`:
```bash
DATABASE_URL=postgresql://postgres:password@postgres:5432/krawall?connection_limit=20
```

### Vertical Scaling

Adjust resource limits in `docker-compose.prod.yml`:

```yaml
app:
  deploy:
    resources:
      limits:
        cpus: '4'  # Increase from 2
        memory: 4G # Increase from 2G
```

---

## Security Checklist

Before going live, ensure:

- [ ] All environment variables are set correctly
- [ ] ENCRYPTION_KEY is unique and secure (64 chars)
- [ ] Database password is strong
- [ ] SSL certificates are installed and valid
- [ ] Firewall rules allow only necessary ports (80, 443)
- [ ] SSH access is secured (key-based, no root login)
- [ ] Backups are configured and tested
- [ ] Monitoring/alerting is in place
- [ ] Log rotation is configured
- [ ] .env file permissions are 600

---

## Support

For issues or questions:
- GitHub Issues: https://github.com/yourusername/krawall/issues
- Documentation: https://github.com/yourusername/krawall/tree/main/docs

---

## Maintenance Schedule

Recommended maintenance tasks:

- **Daily**: Check health endpoints, review error logs
- **Weekly**: Review resource usage, check backups, update dependencies
- **Monthly**: Renew SSL certificates (auto), review security advisories
- **Quarterly**: Performance optimization review, capacity planning
