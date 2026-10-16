import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="card p-8 text-center max-w-md">
        <h1 className="text-6xl font-bold text-primary mb-4">404</h1>
        <h2 className="text-xl font-semibold text-white mb-2">Page Not Found</h2>
        <p className="text-text-secondary mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link href="/dashboard" className="btn-primary px-8 py-3 inline-block">
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
