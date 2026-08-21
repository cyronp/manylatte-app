import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <main className="flex flex-col justify-center items-center">
      <div>
        <h1 className='text-3xl font-bold'>ManyLatte</h1>
      </div>
    </main>
  );
}
