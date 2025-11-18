# QA-Portal

This is a web portal displaying CloudStack health checks and other quality metrics.

## Features

### CloudStack PR Health Dashboard

- **Active Health Check Runs**: Automatically displays all open PRs with `[HEALTH]` in the title
- **PR Search**: Search for any PR by number or GitHub URL
- **Smoketest Results**: Displays smoketest results from BlueOrangutan bot comments
- **Approvals**: Shows approval counts (approved, commented, changes requested)
- **Code Coverage**: Integration with CodeCov (coming soon)
- **Logs Access**: Direct links to test logs

### Upgrade Tests

- **Filter Tests**: Filter by version (from/to), distro, hypervisor, and status
- **Statistics Dashboard**: View total tests, pass/fail counts, and latest test date
- **Results Table**: Detailed view of all test results with duration and links
- **Logs & Artifacts**: Direct access to test logs and artifacts
- **Real-time Data**: Displays current running and pending tests

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

## Troubleshooting

### Rate Limiting

If you see rate limiting errors, add a GitHub token to your `.env` file. Without authentication, GitHub limits API requests to 60 per hour.

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
