import { useState } from 'react';
import './ReviewQA.css';

interface ReviewQAProps {
  targetName: string;
  onAsk: (question: string) => Promise<string>;
}

const suggestedQuestions = [
  'What do customers complain about most?',
  'What do customers like?',
  'How is the service?',
];

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
    <section className="panel review-qa" aria-labelledby="review-qa-title">
      <div className="review-qa-heading">
        <span className="review-qa-emblem" aria-hidden="true">
          ✦
        </span>
        <div>
          <p className="eyebrow">AI REVIEW INTELLIGENCE</p>
          <h2 id="review-qa-title">Ask ReviewLens</h2>
          <p className="muted">
            Ask a question about reviews for {targetName}.
          </p>
        </div>
      </div>

      <div className="review-qa-suggestions" aria-label="Suggested questions">
        {suggestedQuestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="review-qa-suggestion"
            onClick={() => setQuestion(suggestion)}
            disabled={loading}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <form
        className="review-qa-form"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <label htmlFor="review-question">Your question</label>
        <textarea
          id="review-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask anything about these imported reviews…"
          disabled={loading}
          rows={3}
          required
        />
        <div className="review-qa-form-footer">
          <p className="review-qa-note">
            Answers are based only on this place's imported reviews.
          </p>
          <button
            className="button primary"
            type="submit"
            disabled={loading || !question.trim()}
          >
            {loading ? 'Analyzing reviews…' : 'Ask ReviewLens'}
          </button>
        </div>
      </form>

      {loading && (
        <p role="status" className="review-qa-loading">
          <span className="review-qa-spinner" aria-hidden="true" />
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
          <div className="review-qa-response-heading">
            <span aria-hidden="true">✦</span>
            <h3>ReviewLens Response</h3>
          </div>
          <p>{answer}</p>
        </div>
      )}
    </section>
  );
}
