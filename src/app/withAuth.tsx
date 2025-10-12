"use client";

import { useEffect, ComponentType } from "react";
import { useAuth } from "./contexts/AuthContext";
import { useRouter } from "next/navigation";

// Use generics to properly type the component and its props
export default function withAuth<P extends object>(Component: ComponentType<P>) {
  return function AuthenticatedComponent(props: P) {
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