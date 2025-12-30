# Deployment Guide

This guide covers deploying the CloudStack PR Health Dashboard to production.

## ⚠️ Important: Multi-Instance Deployment

When deploying multiple instances of this application:

**✅ Safe to run on multiple instances:**
- Web application (API server) - read-only operations
- Connection pooling handles concurrent reads

**⚠️ Must run on ONLY ONE instance:**
- GitHub PR scraper (`scrape-github-prs.js`)
- Update PR states script (`update-pr-states.js`)
- Cleanup duplicates script (`cleanup-duplicates.js`)
- Flaky tests summary updater (`update-flaky-tests-summary.js`)
- All cron jobs related to scrapers

**Why?** These scripts perform database writes without distributed locking. Running them on multiple instances simultaneously will cause:
- Race conditions
- Duplicate data entries
- Database constraint violations

See [MULTI_INSTANCE_DB_CONSTRAINTS.md](MULTI_INSTANCE_DB_CONSTRAINTS.md) for detailed technical analysis.

## Deployment Options

### Option 1: Traditional Server Deployment

#### Prerequisites
- Node.js v16 or higher
- npm or yarn
- A server with public access (if you want external access)

#### Steps

1. **Clone the repository**:
   ```bash
   git clone https://github.com/shapeblue/QA-Portal.git
   cd QA-Portal
   ```

2. **Install dependencies**:
   ```bash
   npm install
   cd client && npm install && cd ..
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and set:
   ```
   GITHUB_TOKEN=your_github_token_here
   PORT=5000
   ```

4. **Build the application**:
   ```bash
   npm run build
   ```

5. **Install a process manager** (optional but recommended):
   ```bash
   npm install -g pm2
   ```

6. **Create a production start script** (`start-production.sh`):
   ```bash
   #!/bin/bash
   
   # Start the backend server
   cd /path/to/QA-Portal/server
   pm2 start dist/index.js --name qa-portal-api
   
   # Serve the frontend build
   pm2 serve /path/to/QA-Portal/client/build 3000 --name qa-portal-web --spa
   ```

7. **Start the application**:
   ```bash
   chmod +x start-production.sh
   ./start-production.sh
   ```

8. **Configure reverse proxy** (nginx example):
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       # Frontend
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }

       # Backend API
       location /api {
           proxy_pass http://localhost:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

### Option 2: Docker Deployment

#### Create Dockerfile for Backend

Create `server/Dockerfile`:
```dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY server/tsconfig.json ./
COPY server/src ./src

RUN npm run build

EXPOSE 5000

CMD ["node", "dist/index.js"]
```

#### Create Dockerfile for Frontend

Create `client/Dockerfile`:
```dockerfile
FROM node:16-alpine as build

WORKDIR /app

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

#### Create docker-compose.yml

```yaml
version: '3.8'

services:
  backend:
    build:
      context: .
      dockerfile: server/Dockerfile
    ports:
      - "5000:5000"
    environment:
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - PORT=5000
    restart: unless-stopped

  frontend:
    build:
      context: .
      dockerfile: client/Dockerfile
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: unless-stopped
```

#### Deploy with Docker Compose

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Option 3: Cloud Platform Deployment

#### Heroku

1. Create `Procfile`:
   ```
   web: cd server && npm start
   ```

2. Add build scripts to root `package.json`:
   ```json
   {
     "scripts": {
       "heroku-postbuild": "cd client && npm install && npm run build && cd ../server && npm install && tsc"
     }
   }
   ```

3. Deploy:
   ```bash
   heroku create your-app-name
   heroku config:set GITHUB_TOKEN=your_token
   git push heroku main
   ```

#### AWS / Azure / GCP

For cloud platforms, you can:
- Use their respective container services (ECS, AKS, Cloud Run)
- Use their static site hosting + serverless functions
- Use their VM instances with the traditional deployment method

## Environment Variables

Make sure to set these environment variables in production:

- `GITHUB_TOKEN`: Your GitHub personal access token
- `PORT`: Backend server port (default: 5000)
- `NODE_ENV`: Set to "production"

## Security Considerations

1. **Always use HTTPS in production**
2. **Secure your GitHub token**: Never commit it to version control
3. **Set up proper CORS**: Restrict origins in production
4. **Rate limiting**: Consider adding rate limiting to prevent abuse
5. **Monitoring**: Set up logging and monitoring for the API

## Monitoring and Maintenance

### Scraper Monitoring (Primary Instance Only)

Monitor scraper health on the instance running cron jobs:
```bash
# Check scraper status
./scripts/manage-scraper.sh status

# View scraper logs
./scripts/manage-scraper.sh logs

# View cleanup logs
tail -f /var/log/cleanup-duplicates.log
```

### Health Checks

The API provides a health check endpoint:
```bash
curl http://your-domain.com/api/health
```

### Logs

- Check backend logs: `pm2 logs qa-portal-api`
- Check frontend logs: `pm2 logs qa-portal-web`

### Updates

To update the application:
```bash
git pull
npm run build
pm2 restart all
```

## Troubleshooting

### Common Issues

1. **GitHub API Rate Limiting**:
   - Solution: Make sure `GITHUB_TOKEN` is set
   - Without token: 60 requests/hour
   - With token: 5000 requests/hour

2. **CORS Errors**:
   - Check that the backend CORS is configured correctly
   - Ensure the frontend API URL is correct

3. **Build Failures**:
   - Clear node_modules and rebuild:
     ```bash
     rm -rf node_modules client/node_modules
     npm install
     cd client && npm install
     npm run build
     ```

## Performance Optimization

1. **Caching**: Implement Redis or similar for caching GitHub API responses
2. **CDN**: Use a CDN for serving the frontend static files
3. **Compression**: Enable gzip compression in nginx
4. **Database**: For future enhancements, consider adding a database to cache results

## Scaling

### Horizontal Scaling

For high traffic scenarios, you can run multiple web app instances behind a load balancer:

**Architecture:**
```
Load Balancer
    ├── Instance 1 (Primary): Web App + Scrapers + Cron Jobs
    ├── Instance 2: Web App Only
    └── Instance 3: Web App Only
```

**Setup:**
1. Deploy web app to all instances
2. Set up scraper cron jobs on PRIMARY instance only
3. Configure load balancer to distribute web traffic
4. Monitor primary instance for scraper health

**Important:** Only ONE instance should run scraper scripts. Multiple instances running scrapers will cause data duplication and race conditions.

### Vertical Scaling

For single-instance deployments:
- Use load balancers for multiple backend instances
- Implement caching layers (Redis, Memcached)
- Use a CDN for static assets
- Consider implementing pagination for large PR lists
