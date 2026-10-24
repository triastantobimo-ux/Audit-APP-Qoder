import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getPageAuth } from "@/server/auth";

export default async function LoginPage() {
  const auth = await getPageAuth();

  if (auth) {
    redirect("/dashboard");
  }

  return <LoginForm />;
}
