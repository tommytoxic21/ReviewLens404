import { useMemo, useState } from 'react';
import type { Review } from '../targetsApi';
import './ReviewsList.css';

interface ReviewsListProps {
  placeName: string;
  reviews: Review[];
}

type SortOrder = 'newest' | 'oldest' | 'highest' | 'lowest';
const PAGE_SIZE = 8;

function reviewTimestamp(review: Review): number {
  const date = review.reviewedAt ?? review.createdAt;
  if (!date) return 0;
  const time = Date.parse(date);
  return Number.isFinite(time) ? time : 0;
}

function formatDate(date: string | null): string | null {
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function ReviewsList({ placeName, reviews }: ReviewsListProps) {
  const [rating, setRating] = useState('all');
  const [sort, setSort] = useState<SortOrder>('newest');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const items = reviews.filter(
      (review) =>
        rating === 'all' || Math.round(review.rating) === Number(rating),
    );
    return items.sort((left, right) => {
      switch (sort) {
        case 'highest':
          return (
            right.rating - left.rating ||
            reviewTimestamp(right) - reviewTimestamp(left)
          );
        case 'lowest':
          return (
            left.rating - right.rating ||
            reviewTimestamp(right) - reviewTimestamp(left)
          );
        case 'oldest':
          return reviewTimestamp(left) - reviewTimestamp(right);
        default:
          return reviewTimestamp(right) - reviewTimestamp(left);
      }
    });
  }, [reviews, rating, sort]);

  return (
    <section
      className="panel review-list"
      aria-label={`Imported reviews for ${placeName}`}
    >
      <header className="review-list__header">
        <div>
          <p className="eyebrow">IMPORTED FROM GOOGLE MAPS</p>
          <h2>Customer Reviews</h2>
          <p className="muted">
            Browse the real reviews imported for {placeName}. These are the
            evidence behind your AI answers.
          </p>
        </div>
        <span className="review-list__count">
          {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}
        </span>
      </header>

      {reviews.length === 0 ? (
        <div className="review-list__empty">
          <span className="review-list__empty-icon" aria-hidden="true">
            ☆
          </span>
          <h3>No reviews imported yet</h3>
          <p>
            Use <strong>Import Reviews</strong> above to bring in reviews for
            this place.
          </p>
        </div>
      ) : (
        <>
          <div className="review-list__filters">
            <div className="review-list__field">
              <label htmlFor="review-rating-filter">Rating</label>
              <select
                id="review-rating-filter"
                value={rating}
                onChange={(event) => {
                  setRating(event.target.value);
                  setVisibleCount(PAGE_SIZE);
                }}
              >
                <option value="all">All ratings</option>
                {[5, 4, 3, 2, 1].map((star) => (
                  <option key={star} value={star}>
                    {star} {star === 1 ? 'star' : 'stars'}
                  </option>
                ))}
              </select>
            </div>
            <div className="review-list__field">
              <label htmlFor="review-sort">Sort by</label>
              <select
                id="review-sort"
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as SortOrder);
                  setVisibleCount(PAGE_SIZE);
                }}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="highest">Highest rated</option>
                <option value="lowest">Lowest rated</option>
              </select>
            </div>
          </div>
          <p className="review-list__results" role="status">
            Showing {Math.min(visibleCount, filtered.length)} of{' '}
            {filtered.length} matching{' '}
            {filtered.length === 1 ? 'review' : 'reviews'}
          </p>
          {filtered.length === 0 ? (
            <div className="review-list__empty review-list__empty--compact">
              <h3>No reviews with this rating</h3>
              <p>Try a different rating filter.</p>
            </div>
          ) : (
            <div className="review-list__items">
              {filtered.slice(0, visibleCount).map((review) => {
                const shownDate =
                  formatDate(review.reviewedAt) ??
                  formatDate(review.createdAt ?? null);
                const rounded = Math.max(
                  0,
                  Math.min(5, Math.round(review.rating)),
                );
                return (
                  <article className="review-list__item" key={review.id}>
                    <div className="review-list__avatar" aria-hidden="true">
                      {(
                        review.reviewerName?.trim().charAt(0) || 'R'
                      ).toUpperCase()}
                    </div>
                    <div className="review-list__content">
                      <div className="review-list__byline">
                        <strong>
                          {review.reviewerName?.trim() ||
                            'Google Maps reviewer'}
                        </strong>
                        {shownDate && (
                          <time
                            dateTime={
                              review.reviewedAt ?? review.createdAt ?? ''
                            }
                          >
                            {shownDate}
                          </time>
                        )}
                      </div>
                      <div
                        className="review-list__stars"
                        aria-label={`${review.rating} out of 5 stars`}
                        role="img"
                      >
                        <span aria-hidden="true">
                          {'★'.repeat(rounded)}
                          {'☆'.repeat(5 - rounded)}
                        </span>
                        <span
                          className="review-list__rating-number"
                          aria-hidden="true"
                        >
                          {review.rating}/5
                        </span>
                      </div>
                      <p className="review-list__text">{review.reviewText}</p>
                      {review.reviewUrl &&
                        /^https:\/\//i.test(review.reviewUrl) && (
                          <a
                            className="review-list__source-link"
                            href={review.reviewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View original review{' '}
                            <span aria-hidden="true">↗</span>
                          </a>
                        )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {visibleCount < filtered.length && (
            <button
              className="button secondary review-list__more"
              type="button"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            >
              Show more reviews
            </button>
          )}
        </>
      )}
    </section>
  );
}
