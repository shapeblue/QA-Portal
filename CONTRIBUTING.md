# Contributing to QA Portal

Thank you for your interest in contributing to the CloudStack QA Portal! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/QA-Portal.git`
3. Create a feature branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Test your changes thoroughly
6. Submit a pull request

## Development Setup

See [README.md](README.md) for detailed setup instructions.

Quick setup:
```bash
npm install
cd client && npm install && cd ..
npm run dev
```

## Code Style

### TypeScript/JavaScript

- Use TypeScript for type safety
- Follow existing code patterns
- Use meaningful variable and function names
- Add comments for complex logic
- Prefer const over let when possible

### React Components

- Use functional components with hooks
- Keep components small and focused
- Extract reusable logic into custom hooks
- Use proper TypeScript types/interfaces

### CSS

- Use semantic class names
- Follow existing styling patterns
- Ensure responsive design
- Test on different screen sizes

## Project Structure

```
QA-Portal/
├── client/              # React frontend
│   ├── src/
│   │   ├── components/  # Reusable React components
│   │   ├── services/    # API and business logic
│   │   ├── types/       # TypeScript type definitions
│   │   └── App.tsx      # Main application component
│   └── package.json
├── server/              # Express backend
│   ├── src/
│   │   └── index.ts     # Server entry point
│   └── tsconfig.json
└── package.json
```

## Adding New Features

### Frontend Components

1. Create component in `client/src/components/`
2. Create corresponding CSS file
3. Export component from the file
4. Import and use in parent components
5. Add TypeScript types for props

Example:
```typescript
// client/src/components/MyComponent.tsx
import React from 'react';
import './MyComponent.css';

interface MyComponentProps {
  title: string;
  onAction: () => void;
}

const MyComponent: React.FC<MyComponentProps> = ({ title, onAction }) => {
  return (
    <div className="my-component">
      <h2>{title}</h2>
      <button onClick={onAction}>Action</button>
    </div>
  );
};

export default MyComponent;
```

### Backend API Endpoints

1. Add endpoint in `server/src/index.ts`
2. Use proper HTTP methods (GET, POST, etc.)
3. Add error handling
4. Document the endpoint

Example:
```typescript
app.get('/api/my-endpoint', async (req: Request, res: Response) => {
  try {
    // Your logic here
    const data = await fetchData();
    res.json(data);
  } catch (error: any) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

## Testing

### Running Tests

```bash
cd client
npm test
```

### Writing Tests

- Write tests for new components
- Test edge cases and error conditions
- Aim for good test coverage

Example:
```typescript
import { render, screen } from '@testing-library/react';
import MyComponent from './MyComponent';

test('renders component with title', () => {
  render(<MyComponent title="Test Title" onAction={() => {}} />);
  const titleElement = screen.getByText(/Test Title/i);
  expect(titleElement).toBeInTheDocument();
});
```

## Building

### Development Build
```bash
npm run dev
```

### Production Build
```bash
npm run build
```

This builds both client and server:
- Client: `client/build/`
- Server: `server/dist/`

## Pull Request Process

1. **Update Documentation**: Update README.md if you change functionality
2. **Test Thoroughly**: Test your changes in development mode
3. **Build Successfully**: Ensure `npm run build` completes without errors
4. **Write Clear Commit Messages**: 
   ```
   feat: Add new feature
   fix: Fix specific bug
   docs: Update documentation
   style: Code style changes
   refactor: Code refactoring
   test: Add tests
   ```
5. **Create Pull Request**: 
   - Provide clear description of changes
   - Reference any related issues
   - Include screenshots for UI changes
6. **Address Review Comments**: Respond to feedback and make requested changes

## Commit Message Guidelines

We follow conventional commits:

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat: Add upgrade tests filtering
fix: Correct smoketest result parsing
docs: Update deployment guide
style: Format code according to ESLint
refactor: Simplify API service logic
test: Add tests for PRCard component
chore: Update dependencies
```

## Code Review

All submissions require review. We use GitHub pull requests for this purpose.

Reviewers will check:
- Code quality and style
- Test coverage
- Documentation updates
- Performance implications
- Security considerations

## Feature Requests and Bug Reports

### Reporting Bugs

When reporting bugs, please include:
- Steps to reproduce
- Expected behavior
- Actual behavior
- Screenshots (if applicable)
- Browser/environment details

### Requesting Features

When requesting features:
- Describe the use case
- Explain why it would be useful
- Provide examples if possible

## Questions?

If you have questions:
- Check existing issues and discussions
- Review the README and documentation
- Ask in a new issue or discussion

## License

By contributing to QA Portal, you agree that your contributions will be licensed under the ISC License.

---

Thank you for contributing to CloudStack QA Portal! 🎉
