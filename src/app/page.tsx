"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuth } from "./contexts/AuthContext";

export default function HomePage() {
  const { user } = useAuth();

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] text-center p-4">
      <h1 className="text-4xl md:text-6xl font-bold tracking-tighter mb-4">
        Democratizing Access to AI
      </h1>
      <p className="max-w-[600px] text-muted-foreground md:text-xl mb-6">
        Join the peer-to-peer GPU network. Share your compute power or access large AI models affordably.
      </p>
      <div className="flex gap-4">
        <Link href={user ? "/chat" : "/auth"}>
          <Button size="lg">Start Chatting</Button>
        </Link>
      </div>
    </div>
  );
}