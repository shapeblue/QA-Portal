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

### Upgrade Tests (Coming Soon)

- Filter upgrade tests by version, distro, hypervisor, and status
- View test results matrix
- Trend visualization
- Download results in CSV/JSON format

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- GitHub Personal Access Token (optional, but recommended to avoid rate limits)

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
   cp .env.example .env
   ```
   
   Edit `.env` and add your GitHub token (optional but recommended):
   ```
   GITHUB_TOKEN=your_github_personal_access_token_here
   PORT=5000
   ```
   
   To create a GitHub token:
   - Go to https://github.com/settings/tokens
   - Click "Generate new token (classic)"
   - Select the `repo` scope
   - Copy the generated token

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
│   └── tsconfig.json
├── .env                 # Environment variables (not committed)
├── .env.example         # Environment template
└── package.json         # Root package.json
```

## Usage

### Viewing Health Check PRs

When you open the dashboard, it automatically loads all active health check PRs from the Apache CloudStack repository. These are PRs with `[HEALTH]` in the title.

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

- `GET /api/health-prs` - Get all open health check PRs
- `GET /api/pr/:number` - Get a specific PR by number
- `GET /api/health` - Health check endpoint

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GITHUB_TOKEN` | GitHub Personal Access Token | None (optional) |
| `PORT` | Backend server port | 5000 |

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
