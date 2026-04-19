import { useCallback, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { setClientAuth } from "~/utils/auth";
import { API_BASE } from "~/utils/api";

type SigninFormData = {
    email: string;
    password: string;
};

export function useSigninForm() {
    const navigate = useNavigate();

    const [formData, setFormData] = useState<SigninFormData>({
        email: "",
        password: "",
    });
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [loading, setLoading] = useState(false);

    const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        setFormData((prev) => ({
            ...prev,
            [event.target.name]: event.target.value,
        }));
    }, []);

    const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError("");
        setSuccess("");
        setLoading(true);

        try {
            const response = await fetch(`${API_BASE}/auth/signin`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    email: formData.email,
                    password: formData.password,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || "Nao foi possivel iniciar sessao.");
                return;
            }

            const tokenDuration =
                typeof data.session?.expires_in === "number"
                    ? data.session.expires_in
                    : undefined;

            setClientAuth(data.session.access_token, tokenDuration);
            localStorage.setItem("refresh_token", data.session.refresh_token);
            localStorage.setItem("user", JSON.stringify(data.user));

            setSuccess("Sessao iniciada com sucesso.");

            window.setTimeout(() => {
                navigate("/chat/new");
            }, 1000);
        } catch {
            setError("Erro ao ligar ao backend.");
        } finally {
            setLoading(false);
        }
    }, [formData.email, formData.password, navigate]);

    return {
        error,
        formData,
        handleChange,
        handleSubmit,
        loading,
        success,
    };
}
