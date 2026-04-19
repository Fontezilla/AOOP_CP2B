import { type MetaArgs } from "react-router";
import type { Route } from "./+types/chat";
import ChatView from "~/components/chat/chat-view";
import { useChat } from "~/hooks/use-chat";
import { requireAuth } from "~/utils/auth";

export function meta({ }: MetaArgs) {
    return [{ title: "AutoMatch" }];
}

export function loader({ request }: Route.LoaderArgs) {
    requireAuth(request);
    return null;
}

export default function Chat() {
    const chat = useChat();

    return <ChatView {...chat} />;
}
