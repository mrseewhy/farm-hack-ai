import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function FarmerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/login");
  }

  if (session.user.role !== "farmer") {
    if (session.user.role === "admin") {
      // /chat is a farmer route, so an admin sent there would be redirected
      // again by the proxy and loop. Send admins to their own workspace.
      redirect("/admin/dashboard");
    }
    // Unknown role — no valid destination, send to login
    redirect("/login");
  }

  return <>{children}</>;
}
