import type { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

vi.mock('@clerk/clerk-react', () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  SignedIn: () => null,
  SignedOut: ({ children }: { children: ReactNode }) => <>{children}</>,
  SignInButton: ({ children }: { children?: ReactNode }) => (
    <>{children ?? <button>Sign in</button>}</>
  ),
  UserButton: () => null,
}));

describe('App', () => {
  it('shows a sign-in button when signed out', () => {
    render(<App />);
    expect(
      screen.getByRole('button', { name: /sign in/i }),
    ).toBeInTheDocument();
  });
});
