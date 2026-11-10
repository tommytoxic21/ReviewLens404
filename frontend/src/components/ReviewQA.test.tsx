import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from '@testing-library/react';
import ReviewQA from './ReviewQA';

afterEach(() => {
  cleanup();
});

describe('ReviewQA', () => {
  it('displays the active AnalysisTarget name', () => {
    const onAsk = vi.fn();

    render(<ReviewQA targetName="Test Restaurant" onAsk={onAsk} />);

    expect(
      screen.getByText(/ask a question about reviews for Test Restaurant/i),
    ).toBeInTheDocument();
  });

  it('submits a question and displays the AI response', async () => {
    const onAsk = vi.fn().mockResolvedValue('Customers love the food.');

    render(<ReviewQA targetName="Test Restaurant" onAsk={onAsk} />);

    fireEvent.change(screen.getByLabelText(/your question/i), {
      target: { value: 'What do customers like?' },
    });

    fireEvent.click(screen.getByRole('button', { name: /ask reviewlens/i }));

    expect(onAsk).toHaveBeenCalledWith('What do customers like?');

    expect(
      await screen.findByText('Customers love the food.'),
    ).toBeInTheDocument();
  });

  it('prevents empty questions from being submitted', () => {
    const onAsk = vi.fn();

    render(<ReviewQA targetName="Test Restaurant" onAsk={onAsk} />);

    const button = screen.getByRole('button', { name: /ask reviewlens/i });

    expect(button).toBeDisabled();
    expect(onAsk).not.toHaveBeenCalled();
  });

  it('displays an error when the AI request fails', async () => {
    const onAsk = vi
      .fn()
      .mockRejectedValue(new Error('AI service unavailable'));

    render(<ReviewQA targetName="Test Restaurant" onAsk={onAsk} />);

    fireEvent.change(screen.getByLabelText(/your question/i), {
      target: { value: 'What are the common complaints?' },
    });

    fireEvent.click(screen.getByRole('button', { name: /ask reviewlens/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'AI service unavailable',
      );
    });
  });

  it('displays a loading state while waiting for the AI', async () => {
    let resolveAsk!: (value: string) => void;

    const onAsk = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveAsk = resolve;
        }),
    );

    render(<ReviewQA targetName="Test Restaurant" onAsk={onAsk} />);

    fireEvent.change(screen.getByLabelText(/your question/i), {
      target: { value: 'What do customers think?' },
    });

    fireEvent.click(screen.getByRole('button', { name: /ask reviewlens/i }));

    expect(screen.getByRole('status')).toHaveTextContent(
      'Analyzing your reviews',
    );

    expect(
      screen.getByRole('button', { name: /analyzing reviews/i }),
    ).toBeDisabled();

    await act(async () => {
      resolveAsk('Customers generally like the service.');
    });

    expect(
      await screen.findByText('Customers generally like the service.'),
    ).toBeInTheDocument();

    expect(
      screen.getByRole('button', { name: /ask reviewlens/i }),
    ).toBeEnabled();
  });
});
