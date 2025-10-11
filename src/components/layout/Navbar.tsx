import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Navbar() {
  return (
    <header className="px-4 lg:px-6 h-16 flex items-center border-b">
      <Link href="/" className="flex items-center justify-center">
        <span className="text-xl font-bold">Torbiz</span>
      </Link>
      <nav className="ml-auto flex items-center gap-4 sm:gap-6">
        <Link
          href="/#features"
          className="text-sm font-medium hover:underline underline-offset-4"
        >
          Features
        </Link>
        <Link
          href="/gpu"
          className="text-sm font-medium hover:underline underline-offset-4"
        >
          Share GPU
        </Link>
        <Link href="/auth">
          <Button>Login</Button>
        </Link>
      </nav>
    </header>
  );
}