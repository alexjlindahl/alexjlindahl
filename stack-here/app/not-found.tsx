import Link from "next/link";

export default function NotFound() {
  return (
    <div className="pt-16">
      <h1 className="text-6xl font-black tracking-tighter">Nothing here.</h1>
      <p className="mt-4 text-lg text-black/70">That stack doesn't exist, or the link is wrong.</p>
      <Link href="/" className="mt-6 inline-block text-lg font-black underline underline-offset-4">
        Grade a stack
      </Link>
    </div>
  );
}
