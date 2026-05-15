import type { ReactNode } from "react";

import { Footer } from "@/components/footer";
import { Nav } from "@/components/nav";
import { getCurrentUser } from "@/lib/auth/session";

export async function AppShell({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-screen flex-col bg-white text-radar-ink">
      <Nav isSignedIn={Boolean(user)} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
      <Footer />
    </div>
  );
}
