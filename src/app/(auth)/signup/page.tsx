import { AuthForm } from "../AuthForm";

export default function SignupPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-12">
      <AuthForm mode="signup" />
    </main>
  );
}
