import { Link, type MetaArgs } from "react-router";
import AuthField from "~/components/auth/auth-field";
import AuthShell from "~/components/auth/auth-shell";
import { useSignupForm } from "~/hooks/use-signup-form";

export function meta({ }: MetaArgs) {
    return [{ title: "AutoMatch" }];
}

export default function Signup() {
    const signup = useSignupForm();

    return (
        <AuthShell title="Sign Up">
            <form onSubmit={signup.handleSubmit} className="space-y-6">
                <AuthField
                    id="nomeCompleto"
                    name="nomeCompleto"
                    type="text"
                    autoComplete="name"
                    label="Primeiro e ultimo nome"
                    value={signup.formData.nomeCompleto}
                    onChange={signup.handleChange}
                />

                <AuthField
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    label="Endereco de email"
                    value={signup.formData.email}
                    onChange={signup.handleChange}
                />

                <AuthField
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    label="Palavra-passe"
                    value={signup.formData.password}
                    onChange={signup.handleChange}
                />

                {signup.error && <p className="text-sm text-red-600">{signup.error}</p>}
                {signup.success && <p className="text-sm text-green-600">{signup.success}</p>}

                <div className="flex items-center justify-center">
                    <button
                        type="submit"
                        disabled={signup.loading}
                        className="w-50 justify-center rounded-[80px] bg-[#A68A56] px-3 py-1.5 text-center text-sm/6 font-semibold text-white shadow-xs hover:bg-[#8A6B3C] disabled:opacity-70"
                    >
                        {signup.loading ? "A criar..." : "Sign up"}
                    </button>
                </div>

                <div>
                    <p className="text-sm text-gray-500">
                        Ja tem uma conta?{" "}
                        <Link
                            to="/signin"
                            className="font-semibold text-[#A68A56] hover:text-[#8A6B3C]"
                        >
                            Sign in
                        </Link>
                    </p>
                </div>
            </form>
        </AuthShell>
    );
}
