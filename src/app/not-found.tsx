import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="gate">
      <h1 className="display title-xl">
        Lost in the <span className="red">fog</span>
      </h1>
      <p>There is nothing here.</p>
      <Link className="btn" href="/">
        BACK TO TOWN
      </Link>
    </main>
  );
}
