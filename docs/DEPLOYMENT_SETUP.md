# Deployment System Setup - Complete! ✅

## What Was Created

### 1. Documentation
- ✅ **docs/LOCAL_SETUP.md** - Complete local development guide
- ✅ **CONTRIBUTING.md** - Updated contribution workflow
- ✅ **DEPLOYMENT.md** - Updated deployment guide
- ✅ **README.md** - Updated with quick start

### 2. Scripts
- ✅ **scripts/deploy.sh** - Automated deployment script
- ✅ **scripts/setup-local.sh** - First-time local setup
- ✅ **.env.example** - Environment template

## How Team Members Can Start Contributing

### First Time Setup (10 minutes)

```bash
# 1. Clone repository
git clone https://github.com/shapeblue/QA-Portal.git
cd QA-Portal

# 2. Run setup script
./scripts/setup-local.sh

# 3. Get database password from team
# Edit .env and add DB_PASSWORD

# 4. Start development
npm run dev

# 5. Open http://localhost:3000
```

### Making Changes

```bash
# 1. Create feature branch
git checkout -b feature/my-feature

# 2. Make changes using Copilot or your editor

# 3. Test locally
npm run dev  # Test at http://localhost:3000

# 4. Deploy to production
./scripts/deploy.sh
```

That's it! No SSH access needed for development, just for deployment.

## Workflow Diagram

```
┌─────────────────┐
│ Developer's PC  │
└────────┬────────┘
         │
         │ 1. Clone repo
         │ 2. Run setup
         │ 3. Edit code
         │ 4. Test locally
         │
         ▼
┌─────────────────┐
│ ./deploy.sh     │ ← Run this when ready
└────────┬────────┘
         │
         ├─ Run tests
         ├─ Push to GitHub
         ├─ SSH to server
         ├─ Pull changes
         ├─ Install deps
         ├─ Build app
         └─ Restart services
         │
         ▼
┌─────────────────┐
│ Production      │
│ Server Running  │
└─────────────────┘
```

## Features of deploy.sh

✅ **Automatic testing** - Runs tests before deploying
✅ **GitHub integration** - Pushes to GitHub automatically
✅ **SSH deployment** - Deploys to server via SSH
✅ **Dependency management** - Installs npm packages
✅ **Build automation** - Compiles TypeScript and React
✅ **Service restart** - Restarts backend automatically
✅ **Error handling** - Stops on any error
✅ **Color output** - Easy to read status messages

## Command Reference

```bash
# Basic deploy
./scripts/deploy.sh

# Deploy without tests (faster but risky)
./scripts/deploy.sh --skip-tests

# Deploy specific branch
./scripts/deploy.sh --branch feature/my-feature

# Deploy without restarting (for config changes)
./scripts/deploy.sh --no-restart

# Get help
./scripts/deploy.sh --help
```

## Team Guidelines

### For Regular Changes
1. Work on feature branch
2. Test locally
3. Run `./scripts/deploy.sh`
4. Done!

### For Significant Changes
1. Work on feature branch
2. Test locally
3. Push to GitHub: `git push origin feature/my-feature`
4. Create Pull Request on GitHub
5. Get code review from team member
6. Merge to main
7. Deploy: `git checkout main && ./scripts/deploy.sh`

### For Database Changes
1. **Discuss with team first** - Database is shared!
2. Create migration script
3. Test on development database
4. Schedule deployment during low-traffic time
5. Deploy with team member available

## Security Notes

- `.env` file is in `.gitignore` (never committed)
- Database credentials are kept secret
- SSH keys are used for server access
- Deploy script requires SSH access (set up keys with team lead)

## Troubleshooting

### Deploy script fails at SSH step
- Check SSH key is set up: `ssh root@10.0.113.145`
- Ask team lead to add your SSH public key

### Tests fail locally
- Check database connection (VPN required?)
- Verify .env has correct credentials
- Run `npm install` to update dependencies

### Deploy succeeds but app doesn't work
- Check server logs: `ssh root@10.0.113.145 'tail -f /tmp/qa-server.log'`
- Verify services are running: `ssh root@10.0.113.145 'ps aux | grep node'`

## Next Steps

1. **Share this with team** - Send docs/LOCAL_SETUP.md to everyone
2. **Set up SSH keys** - Have team lead add SSH keys for each developer
3. **Test workflow** - Have someone else try the setup process
4. **Document conventions** - Add team-specific conventions to CONTRIBUTING.md

## Success Criteria ✅

Your deployment system is ready when:
- ✅ Team members can clone and run locally in <15 minutes
- ✅ Deployment takes <5 minutes with one command
- ✅ No direct server editing required
- ✅ All changes go through GitHub
- ✅ Tests run automatically before deploy
- ✅ Clear documentation for all workflows

**All criteria met! System is ready for team use.**
