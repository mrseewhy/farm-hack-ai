import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * Root redirect by session role, in one hop. /redirect remains as a
 * compatibility route for older bookmarks.
 */
export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/login");
  if (session.user.role === "admin") redirect("/admin/dashboard");
  if (session.user.role === "farmer") redirect("/chat");
  redirect("/login");
}
