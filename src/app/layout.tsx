import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { AuthProvider } from "./contexts/AuthContext"; // <-- IMPORT IT HERE

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Torbiz AI",
  description: "Decentralized AI Inference",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <AuthProvider> {/* <-- WRAP WITH AUTHPROVIDER */}
          <Navbar />
          <main>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}