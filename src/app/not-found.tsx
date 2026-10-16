import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <p className="text-6xl font-bold text-indigo-600">404</p>
      <h1 className="mt-3 text-xl font-semibold">Page not found</h1>
      <p className="mt-1 text-sm text-slate-500">The page or record you are looking for does not exist.</p>
      <Link href="/" className="mt-6 text-sm font-medium text-indigo-600 hover:underline">
        ← Back to home
      </Link>
    </div>
  );
}
