"use client";

import { useEffect } from "react";
import { useAuth } from "./contexts/AuthContext";
import { useRouter } from "next/navigation";

export default function withAuth(Component: React.ComponentType<any>) {
  return function AuthenticatedComponent(props: any) {
    const { user } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (!user) {
        router.push("/auth");
      }
    }, [user, router]);

    if (!user) {
      return null; // or a loading spinner
    }

    return <Component {...props} />;
  };
}