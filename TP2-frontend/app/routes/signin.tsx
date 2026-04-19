import { Link, type MetaArgs } from "react-router";
import AuthField from "~/components/auth/auth-field";
import AuthShell from "~/components/auth/auth-shell";
import { useSigninForm } from "~/hooks/use-signin-form";

export function meta({ }: MetaArgs) {
    return [
        { title: "Login" },
        { name: "description", content: "Iniciar sessao no AutoMatch" },
    ];
}

export default function Signin() {
    const signin = useSigninForm();

    return (
        <AuthShell title="Sign In">
            <form onSubmit={signin.handleSubmit} className="space-y-6">
                <AuthField
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    label="Email address"
                    value={signin.formData.email}
                    onChange={signin.handleChange}
                />

                <AuthField
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    label="Password"
                    value={signin.formData.password}
                    onChange={signin.handleChange}
                />

                {signin.error && <p className="text-sm text-red-600">{signin.error}</p>}
                {signin.success && <p className="text-sm text-green-600">{signin.success}</p>}

                <div className="flex items-center justify-center">
                    <button
                        type="submit"
                        disabled={signin.loading}
                        className="w-50 justify-center rounded-[80px] bg-[#A68A56] px-3 py-1.5 text-center text-sm/6 font-semibold text-white shadow-xs hover:bg-[#8A6B3C] disabled:opacity-70"
                    >
                        {signin.loading ? "A entrar..." : "Sign in"}
                    </button>
                </div>

                <div>
                    <p className="text-sm text-gray-500">
                        Nao tem uma conta?{" "}
                        <Link
                            to="/signup"
                            className="font-semibold text-[#A68A56] hover:text-[#8A6B3C]"
                        >
                            Sign up
                        </Link>
                    </p>
                </div>
            </form>
        </AuthShell>
    );
}
