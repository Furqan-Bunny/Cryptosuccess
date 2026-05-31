'use client';

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="card p-8 text-center max-w-md">
        <h1 className="text-3xl font-bold text-white mb-4">Oops!</h1>
        <p className="text-text-secondary mb-6">
          {error.message || 'An unexpected error occurred'}
        </p>
        <button onClick={reset} className="btn-primary px-8 py-3">
          Try Again
        </button>
      </div>
    </div>
  );
}
