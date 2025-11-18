import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Octokit } from '@octokit/rest';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Octokit (GitHub API client)
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

// Types
interface SmokeTestResult {
  hypervisor: string;
  passed: number;
  total: number;
  status: 'OK' | 'FAIL';
}

interface PRData {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  approvals: {
    approved: number;
    changesRequested: number;
    commented: number;
  };
  smokeTests: SmokeTestResult[];
  logsUrl?: string;
  codeCoverage?: {
    percentage: number;
    change: number;
    url: string;
  };
}

// Helper function to parse BlueOrangutan bot comments
function parseSmokeTestResults(comments: any[]): { tests: SmokeTestResult[], logsUrl?: string } {
  const tests: SmokeTestResult[] = [];
  let logsUrl: string | undefined;

  const blueOrangutanComments = comments.filter(
    (comment) => comment.user?.login === 'blueorangutan'
  );

  for (const comment of blueOrangutanComments) {
    const body = comment.body || '';
    
    // Look for logs URL
    const logsMatch = body.match(/https?:\/\/[^\s]+(?:logs?|artifacts?)[^\s]*/i);
    if (logsMatch && !logsUrl) {
      logsUrl = logsMatch[0];
    }

    // Parse test results - look for patterns like "KVM: 95/100" or "VMware: PASSED 88 of 100"
    const hypervisors = ['KVM', 'VMware', 'Xen', 'XenServer'];
    
    for (const hypervisor of hypervisors) {
      // Try various patterns
      const patterns = [
        new RegExp(`${hypervisor}[:\\s]+(?:OK|PASSED)?\\s*(\\d+)\\s*\\/\\s*(\\d+)`, 'i'),
        new RegExp(`${hypervisor}[:\\s]+(?:OK|PASSED)?\\s*(\\d+)\\s+of\\s+(\\d+)`, 'i'),
        new RegExp(`Smoketest${hypervisor}[:\\s]+(?:OK|PASSED)?\\s*(\\d+)\\s*\\/\\s*(\\d+)`, 'i'),
      ];

      for (const pattern of patterns) {
        const match = body.match(pattern);
        if (match) {
          const passed = parseInt(match[1]);
          const total = parseInt(match[2]);
          const status = passed >= total * 0.85 ? 'OK' : 'FAIL';
          
          tests.push({
            hypervisor,
            passed,
            total,
            status,
          });
          break;
        }
      }
    }
  }

  return { tests, logsUrl };
}

// Helper function to get PR approvals
function getApprovals(reviews: any[]) {
  const approvals = {
    approved: 0,
    changesRequested: 0,
    commented: 0,
  };

  // Get latest review from each user
  const latestReviews = new Map();
  for (const review of reviews) {
    const user = review.user?.login;
    if (user && (!latestReviews.has(user) || new Date(review.submitted_at) > new Date(latestReviews.get(user).submitted_at))) {
      latestReviews.set(user, review);
    }
  }

  // Count review states
  for (const review of latestReviews.values()) {
    if (review.state === 'APPROVED') {
      approvals.approved++;
    } else if (review.state === 'CHANGES_REQUESTED') {
      approvals.changesRequested++;
    } else if (review.state === 'COMMENTED') {
      approvals.commented++;
    }
  }

  return approvals;
}

// API Routes

// Get health check PRs (PRs with [HEALTH] in title)
app.get('/api/health-prs', async (req: Request, res: Response) => {
  try {
    const { data: pullRequests } = await octokit.pulls.list({
      owner: 'apache',
      repo: 'cloudstack',
      state: 'open',
      per_page: 100,
    });

    // Filter PRs with [HEALTH] in title
    const healthPRs = pullRequests.filter((pr) =>
      pr.title.toUpperCase().includes('[HEALTH]')
    );

    const prDataPromises = healthPRs.map(async (pr) => {
      // Get reviews
      const { data: reviews } = await octokit.pulls.listReviews({
        owner: 'apache',
        repo: 'cloudstack',
        pull_number: pr.number,
      });

      // Get comments
      const { data: comments } = await octokit.issues.listComments({
        owner: 'apache',
        repo: 'cloudstack',
        issue_number: pr.number,
      });

      const approvals = getApprovals(reviews);
      const { tests, logsUrl } = parseSmokeTestResults(comments);

      const prData: PRData = {
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        approvals,
        smokeTests: tests,
        logsUrl,
      };

      return prData;
    });

    const prData = await Promise.all(prDataPromises);

    res.json(prData);
  } catch (error: any) {
    console.error('Error fetching health PRs:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch health check PRs' });
  }
});

// Get specific PR by number
app.get('/api/pr/:number', async (req: Request, res: Response) => {
  try {
    const prNumber = parseInt(req.params.number);

    if (isNaN(prNumber)) {
      return res.status(400).json({ error: 'Invalid PR number' });
    }

    const { data: pr } = await octokit.pulls.get({
      owner: 'apache',
      repo: 'cloudstack',
      pull_number: prNumber,
    });

    // Get reviews
    const { data: reviews } = await octokit.pulls.listReviews({
      owner: 'apache',
      repo: 'cloudstack',
      pull_number: prNumber,
    });

    // Get comments
    const { data: comments } = await octokit.issues.listComments({
      owner: 'apache',
      repo: 'cloudstack',
      issue_number: prNumber,
    });

    const approvals = getApprovals(reviews);
    const { tests, logsUrl } = parseSmokeTestResults(comments);

    const prData: PRData = {
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      approvals,
      smokeTests: tests,
      logsUrl,
    };

    res.json(prData);
  } catch (error: any) {
    console.error('Error fetching PR:', error);
    if (error.status === 404) {
      return res.status(404).json({ error: 'PR not found' });
    }
    res.status(500).json({ error: error.message || 'Failed to fetch PR' });
  }
});

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
