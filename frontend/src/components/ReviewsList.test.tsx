import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ReviewsList from './ReviewsList';
import type { Review } from '../targetsApi';

afterEach(() => cleanup());

const sampleReviews: Review[] = [
  {
    id: '1',
    reviewText: 'Great pizza and friendly staff.',
    rating: 5,
    reviewerName: 'Alex M.',
    reviewedAt: '2026-10-01',
    reviewUrl: 'https://maps.google.com/review/1',
  },
  {
    id: '2',
    reviewText: 'Long wait despite the good food.',
    rating: 2,
    reviewerName: 'Sam T.',
    reviewedAt: '2026-11-02',
    reviewUrl: null,
  },
  {
    id: '3',
    reviewText: 'Nice place for lunch.',
    rating: 4,
    reviewerName: null,
    reviewedAt: '2026-09-10',
    reviewUrl: null,
  },
];

describe('ReviewsList', () => {
  it('shows real imported reviews, star ratings, and dates', () => {
    render(<ReviewsList placeName="Joe's Pizza" reviews={sampleReviews} />);
    expect(
      screen.getByText('Great pizza and friendly staff.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Alex M.')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: '5 out of 5 stars' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Oct 1, 2026')).toBeInTheDocument();
  });

  it('shows the customer reviews heading and real review count', () => {
    render(<ReviewsList placeName="Joe's Pizza" reviews={sampleReviews} />);
    expect(
      screen.getByRole('heading', { name: 'Customer Reviews' }),
    ).toBeInTheDocument();
    expect(screen.getByText('3 reviews')).toBeInTheDocument();
  });

  it('filters reviews by star rating', () => {
    render(<ReviewsList placeName="Joe's Pizza" reviews={sampleReviews} />);
    fireEvent.change(screen.getByLabelText('Rating'), {
      target: { value: '2' },
    });
    expect(
      screen.getByText('Long wait despite the good food.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Great pizza and friendly staff.'),
    ).not.toBeInTheDocument();
  });

  it('sorts by highest rating when selected', () => {
    render(<ReviewsList placeName="Joe's Pizza" reviews={sampleReviews} />);
    fireEvent.change(screen.getByLabelText('Sort by'), {
      target: { value: 'highest' },
    });
    const entries = screen.getAllByRole('article');
    expect(entries[0]).toHaveTextContent('Great pizza and friendly staff.');
  });

  it('shows an informative empty state without reviews', () => {
    render(<ReviewsList placeName="Empty Place" reviews={[]} />);
    expect(screen.getByText('No reviews imported yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' &&
          element.textContent?.includes('Use Import Reviews above') === true,
      ),
    ).toBeInTheDocument();
  });

  it('reveals more reviews on demand', () => {
    const more = Array.from({ length: 10 }, (_, index): Review => ({
      id: String(index),
      reviewText: `Review ${index}`,
      rating: 5,
      reviewerName: null,
      reviewedAt: null,
      reviewUrl: null,
    }));
    render(<ReviewsList placeName="Big Place" reviews={more} />);
    expect(screen.queryByText('Review 9')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show more reviews' }));
    expect(screen.getByText('Review 9')).toBeInTheDocument();
  });
});
