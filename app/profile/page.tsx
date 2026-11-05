import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ProfileScreen } from "@/components/app/profile-screen";

export default async function ProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return <ProfileScreen initialLanguage={session.user.preferredLanguage} />;
}
