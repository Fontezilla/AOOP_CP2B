import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
    index("routes/landescape.tsx"),
    route("signin", "routes/signin.tsx"),
    route("signup", "routes/signup.tsx"),
    route("chat/:id", "routes/chat.tsx"),
] satisfies RouteConfig;