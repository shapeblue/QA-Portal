# Local Development Setup

This guide helps you set up the QA Portal on your local machine for development.

## ⚠️ Important: Scraper Scripts Not For Local Use

**The GitHub PR scraper scripts run ONLY on the production server.** They perform database writes that must not be duplicated across multiple instances to avoid race conditions and data duplication.

**For local development:**
- ✅ Run the web application (read-only API)
- ❌ Do NOT run scraper cron jobs
- ❌ Do NOT run `scrape-github-prs.js` or related scripts

The database is already populated by the production scraper. Your local instance will display this data.

## Prerequisites

- Node.js 16+ and npm
- Git
- SSH access to the production server (for deployment)
- VPN access (if database is behind VPN)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/shapeblue/QA-Portal.git
cd QA-Portal
```

### 2. Run Setup Script

```bash
./scripts/setup-local.sh
```

This will install all dependencies automatically.

### 3. Configure Environment

The setup script creates a `.env` file. Edit it with your credentials:

```bash
nano .env  # or use your favorite editor
```

Add your database password and GitHub token:
```env
GITHUB_TOKEN=your_github_token_here
DB_PASSWORD=ask_your_team_lead
```

### 4. Start Development Servers

```bash
npm run dev
```

Open http://localhost:3000 in your browser!

## Making Changes

### 1. Create a Feature Branch

```bash
git checkout -b feature/my-awesome-feature
```

### 2. Edit Code

Use GitHub Copilot, VS Code, or any editor you prefer.

### 3. Test Locally

The dev server auto-reloads when you save files.

### 4. Deploy to Production

```bash
./scripts/deploy.sh
```

That's it! The script handles everything.

## Need Help?

- Read the full guide: [docs/LOCAL_SETUP.md](LOCAL_SETUP.md)
- Check [CONTRIBUTING.md](../CONTRIBUTING.md)
- Ask your team lead
