import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <main className="grid min-h-screen place-items-center p-8">
      <section className="text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-amber-700">
          Manylatte
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Frontend is running.
        </h1>
      </section>
    </main>
  );
}
