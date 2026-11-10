import { useState } from 'react';

import './ReviewQA.css';

interface ReviewQAProps {
  targetName: string;
  onAsk: (question: string) => Promise<string>;
}

export default function ReviewQA({ targetName, onAsk }: ReviewQAProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuestion = question.trim();

    if (!trimmedQuestion || loading) return;

    setLoading(true);
    setAnswer('');
    setError('');

    try {
      const response = await onAsk(trimmedQuestion);
      setAnswer(response);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to answer your question. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel review-qa">
      <p className="eyebrow">REVIEW INTELLIGENCE</p>
      <h2>Ask ReviewLens</h2>
      <p className="muted">Ask a question about reviews for {targetName}.</p>

      <form
        className="review-qa-form"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <label htmlFor="review-question">Your question</label>
        <textarea
          id="review-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="What do customers complain about most?"
          disabled={loading}
          required
        />

        <button
          className="button primary"
          type="submit"
          disabled={loading || !question.trim()}
        >
          {loading ? 'Analyzing reviews…' : 'Ask ReviewLens'}
        </button>
      </form>

      {loading && (
        <p role="status" className="review-qa-loading">
          Analyzing your reviews…
        </p>
      )}

      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}

      {answer && (
        <div className="review-qa-response" aria-label="ReviewLens answer">
          <h3>ReviewLens Response</h3>
          <p>{answer}</p>
        </div>
      )}
    </section>
  );
}
