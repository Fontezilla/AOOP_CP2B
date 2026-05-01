import { redirect } from "react-router";

const ACCESS_TOKEN_KEY = "access_token";

export function setClientAuth(accessToken: string, maxAgeInSeconds = 60 * 60 * 24 * 7) {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);

    document.cookie = `${ACCESS_TOKEN_KEY}=${encodeURIComponent(accessToken)}; Path=/; Max-Age=${maxAgeInSeconds}; SameSite=Lax`;
}

export function clearClientAuth() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");

    document.cookie = `${ACCESS_TOKEN_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function getCookieValue(cookieHeader: string | null, name: string) {
    if (!cookieHeader) return null;

    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escapedName}=([^;]+)`));

    if (!match) return null;

    return decodeURIComponent(match[1]);
}

export function isRequestAuthenticated(request: Request) {
    const token = getCookieValue(request.headers.get("Cookie"), ACCESS_TOKEN_KEY);
    return Boolean(token);
}

export function requireAuth(request: Request) {
    if (!isRequestAuthenticated(request)) {
        throw redirect("/signin");
    }
}

export function getAuthToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function handleUnauthorizedResponse(response: Response) {
    if (response.status !== 401) {
        return false;
    }

    clearClientAuth();

    if (typeof window !== "undefined") {
        window.location.href = "/signin";
    }

    return true;
}
