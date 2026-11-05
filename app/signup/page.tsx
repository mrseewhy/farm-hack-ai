import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AuthScreen } from "@/components/app/auth-screen";
export default async function SignupPage() { const session = await auth.api.getSession({ headers: await headers() }); if (session) redirect(session.user.role === "admin" ? "/admin/dashboard" : "/chat"); return <AuthScreen mode="signup" />; }
