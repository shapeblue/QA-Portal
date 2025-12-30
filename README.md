# QA-Portal

This is a web portal displaying CloudStack health checks and other quality metrics.

## 🚀 Quick Start

### For Contributors (Local Development)

**Note:** Scraper scripts run ONLY on production. Do not run them locally.

```bash
# 1. Clone the repository
git clone https://github.com/shapeblue/QA-Portal.git
cd QA-Portal

# 2. Run setup script
./scripts/setup-local.sh

# 3. Configure .env with database credentials

# 4. Start development (web app only)
npm run dev
```

See [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md) for detailed setup instructions.

### For Deployment

```bash
# Deploy your changes to production
./scripts/deploy.sh
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for deployment details.

## 📚 Documentation

- **[Local Setup Guide](docs/LOCAL_SETUP.md)** - Set up development environment
- **[Contributing Guide](CONTRIBUTING.md)** - How to contribute
- **[Deployment Guide](DEPLOYMENT.md)** - Deploy to production
- **[Multi-Instance Constraints](MULTI_INSTANCE_DB_CONSTRAINTS.md)** - Database constraints for multi-instance deployment
- **[Security Guide](SECURITY.md)** - Security best practices
- **[Flaky Tests System](FLAKY_TESTS_SUMMARY.md)** - Flaky tests feature documentation
- **[Duplicate Prevention](DUPLICATE_PREVENTION.md)** - Database deduplication system

## Features

### CloudStack PR Health Dashboard

- **Active Health Check Runs**: Automatically displays all open PRs with `[HEALTH]` in the title
- **PR Search**: Search for any PR by number or GitHub URL
- **Smoketest Results**: Displays smoketest results from BlueOrangutan bot comments
  - ✅ Download logs icon for each hypervisor test
  - ✅ Test execution timestamps
  - ✅ Expandable failure details with failed test names
- **Approvals**: Shows approval counts (approved, commented, changes requested)
- **Code Coverage**: Integration with CodeCov
- **Logs Access**: Direct links to test logs
- **Automated Data Collection**: GitHub PR scraper runs periodically via cron job

### GitHub PR Scraper (Production Only)

The portal includes an automated scraper that collects PR data from GitHub:
- **Code Coverage**: Codecov bot comments with coverage percentages
- **LGTM Approvals**: All PR reviews (APPROVED, CHANGES_REQUESTED, COMMENTED)
- **Smoketest Results**: Trillian test results per hypervisor
- **State Tracking**: Automatically updates when PRs are closed

⚠️ **Important**: Scraper scripts run ONLY on the production server. They must not be run on local development machines or multiple instances to avoid database write conflicts and data duplication.

See [scripts/README.md](./scripts/README.md) for scraper documentation.

### Upgrade Tests

- **Multiple View Modes**:
  - 🗺️ **Heatmap** (default): Visual success rate grid for upgrade paths
  - **All Upgrade Paths**: Accordion view with expandable test details
  - **Historical Runs**: Chronological table of all tests
- **Filter Tests**: Filter by version (from/to), distro, hypervisor, and status
- **Statistics Dashboard**: View total tests, pass/fail counts, and latest test date
- **Rich Test Details**:
  - Formatted OS names (e.g., "Ubuntu 22.04" instead of "u22")
  - Formatted hypervisor versions (e.g., "vSphere 7.0 U3" instead of "70u3")
  - Test data created indicator with checkbox
  - Expandable failure information showing failure stage
  - Duration and timestamps for each test
- **Logs & Artifacts**: Direct access to test logs, error logs, and upgrade matrix URLs
- **Real-time Data**: Displays current running and pending tests

## Security

🔒 **Security Features**:
- SQL injection prevention via parameterized queries
- XSS protection through React auto-escaping
- CORS properly configured
- Environment variables for secrets management
- Read-only database access recommended

See [SECURITY.md](./SECURITY.md) for detailed security information.

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- MySQL database (local or remote)
- VPN access to database server (if remote)

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/shapeblue/QA-Portal.git
   cd QA-Portal
   ```

2. Install dependencies:
   ```bash
   # Install root dependencies
   npm install
   
   # Install client dependencies
   cd client
   npm install
   cd ..
   ```

3. Configure environment variables:
   ```bash
   cd server
   cp .env.example .env
   ```
   
   Edit `server/.env` with your database credentials:
   ```
   PORT=5001
   DB_HOST=your_database_host
   DB_PORT=3306
   DB_NAME=cloudstack_tests
   DB_USER=your_db_user
   DB_PASSWORD=your_db_password
   ```
   
   **Note**: Never commit the `.env` file. It contains sensitive credentials.

4. Start the development servers:
   ```bash
   # Start both backend and frontend
   npm run dev
   
   # Or start them separately:
   # Terminal 1 - Backend server
   npm run server
   
   # Terminal 2 - Frontend client
   npm run client
   ```

5. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## Project Structure

```
QA-Portal/
├── client/              # React frontend
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── services/    # API services
│   │   ├── types/       # TypeScript types
│   │   └── App.tsx      # Main app component
│   └── package.json
├── server/              # Express backend
│   ├── src/
│   │   └── index.ts     # Server entry point
│   ├── .env             # Environment variables (not committed)
│   ├── .env.example     # Environment template
│   ├── .gitignore       # Git ignore rules
│   └── tsconfig.json
├── scripts/             # Automation scripts
│   ├── scrape-github-prs.js  # GitHub PR scraper
│   ├── scraper-cron.sh       # Cron job wrapper
│   ├── setup-cron.sh         # Cron setup script
│   ├── README.md             # Scraper documentation
│   └── QUICKSTART.md         # Quick start guide
└── package.json         # Root package.json
```

## Usage

### Viewing Health Check PRs

When you open the dashboard, it automatically loads all active health check PRs from the database. These are PRs labeled with `type:healthcheckrun` in the `pr_health_labels` table.

### Searching for a Specific PR

1. Enter a PR number (e.g., `11523`) or full GitHub URL in the search box
2. Click "Search"
3. View the PR details including smoketest results and approvals
4. Click "Back to Health Check PRs" to return to the main view

### Understanding the Results

- **Green badges**: Successful tests (>85% pass rate)
- **Red badges**: Failed tests (<85% pass rate)
- **Approvals**: Shows approved, commented, and changes requested counts
- **Logs**: Click the "View Logs" link to access full test logs

## Development

### Running Tests

```bash
cd client
npm test
```

### Building for Production

```bash
npm run build
```

This will:
1. Build the React frontend to `client/build/`
2. Compile the TypeScript backend to `server/dist/`

### Linting

The project uses ESLint (configured by Create React App):

```bash
cd client
npm run lint
```

## API Endpoints

The backend provides the following REST API endpoints:

#### Health Check PRs
- `GET /api/health-prs` - Get all health check PRs from database
- `GET /api/pr/:number` - Get a specific PR by number from database

#### Upgrade Tests
- `GET /api/upgrade-tests` - Get upgrade test results with optional filters
  - Query params: `fromVersion`, `toVersion`, `distro`, `hypervisor`, `status`
- `GET /api/upgrade-tests/filters` - Get available filter options (versions, distros, hypervisors)
- `GET /api/upgrade-tests/stats` - Get upgrade test statistics (total, passed, failed, running)

#### System
- `GET /api/health` - Health check endpoint

### Database Schema

The application uses the following MySQL tables:

- `pr_health_labels` - PR information and labels
- `pr_trillian_comments` - Smoke test results from Trillian bot
- `pr_codecov_comments` - Code coverage data from Codecov
- `upgrade_test_results` - Upgrade test results with the following key fields:
  - `upgrade_start_version`, `upgrade_target_version` - Version information
  - `management_server_os` - Operating system/distro
  - `hypervisor`, `hypervisor_version` - Hypervisor details
  - `overall_status` - Test status (PASS, FAIL, ERROR, SKIPPED, or NULL for in-progress)
  - `timestamp_start`, `timestamp_end`, `duration_seconds` - Timing information
  - `upgrade_console`, `error_log`, `upgrade_matrix_url` - Links to logs and resources

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Backend server port | 5001 | No |
| `DB_HOST` | MySQL database host | localhost | Yes |
| `DB_PORT` | MySQL database port | 3306 | Yes |
| `DB_NAME` | Database name | cloudstack_tests | Yes |
| `DB_USER` | Database username | results | Yes |
| `DB_PASSWORD` | Database password | - | Yes |
| `GITHUB_TOKEN` | GitHub API token (for scraper) | - | Recommended |

## Troubleshooting

### Database Connection Issues

If you cannot connect to the database:
- Verify VPN connection (if database is remote)
- Check database credentials in `.env`
- Ensure database server is running and accessible
- Verify firewall rules allow connection to database port

### Port Already in Use

If port 5000 or 3000 is already in use, you can change them:
- Backend: Edit `PORT` in `.env`
- Frontend: Set `PORT=3001` before running `npm run client`

### CORS Issues

If you encounter CORS issues, ensure the proxy is correctly configured in `client/package.json`:
```json
"proxy": "http://localhost:5000"
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

ISC
