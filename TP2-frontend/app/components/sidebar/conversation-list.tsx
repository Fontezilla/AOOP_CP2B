import type { ChangeEvent, KeyboardEvent, RefObject } from "react";
import { Link } from "react-router";
import { ChevronDown, EllipsisVertical } from "lucide-react";
import type { Conversation } from "~/components/sidebar/types";

type SidebarConversationListProps = {
    contentVisibility: string;
    conversations: Conversation[];
    currentPathname: string;
    editingConversationId: string | null;
    editingTitle: string;
    isConversationsExpanded: boolean;
    isLoadingConversations: boolean;
    openConversationMenuId: string | null;
    renameInputRef: RefObject<HTMLInputElement | null>;
    onCancelRenameConversation: () => void;
    onEditingTitleChange: (value: string) => void;
    onSaveRenameConversation: (conversationId: string) => Promise<void>;
    onToggleConversationMenu: (conversationId: string, button: HTMLButtonElement) => void;
    onToggleConversationsExpanded: () => void;
};

export default function SidebarConversationList({
    contentVisibility,
    conversations,
    currentPathname,
    editingConversationId,
    editingTitle,
    isConversationsExpanded,
    isLoadingConversations,
    openConversationMenuId,
    renameInputRef,
    onCancelRenameConversation,
    onEditingTitleChange,
    onSaveRenameConversation,
    onToggleConversationMenu,
    onToggleConversationsExpanded,
}: SidebarConversationListProps) {
    function handleRenameKeyDown(
        event: KeyboardEvent<HTMLInputElement>,
        conversationId: string
    ) {
        if (event.key === "Enter") {
            event.preventDefault();
            void onSaveRenameConversation(conversationId);
        }

        if (event.key === "Escape") {
            event.preventDefault();
            onCancelRenameConversation();
        }
    }

    function handleRenameChange(event: ChangeEvent<HTMLInputElement>) {
        onEditingTitleChange(event.target.value);
    }

    return (
        <div className={`transition-all duration-300 ease-out ${contentVisibility}`}>
            <button
                type="button"
                onClick={onToggleConversationsExpanded}
                aria-expanded={isConversationsExpanded}
                className="mb-2 mt-2 flex w-full items-center justify-start gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white transition hover:bg-white/10"
            >
                <span>Conversas</span>
                <ChevronDown
                    size={14}
                    className={`transition-transform duration-300 ${isConversationsExpanded ? "rotate-0" : "-rotate-90"}`}
                />
            </button>

            <div
                className={`grid transition-all duration-300 ease-out ${isConversationsExpanded
                    ? "grid-rows-[1fr] opacity-100"
                    : "grid-rows-[0fr] opacity-0"
                    }`}
            >
                <div className="space-y-2 overflow-hidden">
                    {isLoadingConversations && (
                        <p className="px-2 py-2 text-xs text-white/50">A carregar...</p>
                    )}

                    {!isLoadingConversations && conversations.length === 0 && (
                        <p className="px-2 py-2 text-xs text-white/50">Sem conversas ainda.</p>
                    )}

                    {conversations.map((conversation) => {
                        const path = `/chat/${conversation.id}`;
                        const isActive = currentPathname === path;

                        return (
                            <div
                                key={conversation.id}
                                className={`group relative flex items-center rounded-xl px-2 py-1 text-sm transition-all duration-200 ${isActive
                                    ? "bg-white/25 font-medium text-white shadow-sm ring-1 ring-white/20"
                                    : "text-white/80 hover:bg-white/15 hover:text-white"
                                    }`}
                            >
                                {editingConversationId === conversation.id ? (
                                    <div className="flex min-w-0 flex-1 items-center px-1 py-0.5">
                                        <input
                                            ref={renameInputRef}
                                            value={editingTitle}
                                            onChange={handleRenameChange}
                                            onKeyDown={(event) => handleRenameKeyDown(event, conversation.id)}
                                            className="h-7 min-w-0 flex-1 rounded-md border border-white/25 bg-black/15 px-2 text-sm text-white outline-none ring-0 placeholder:text-white/50 focus:border-white/40"
                                            maxLength={80}
                                        />
                                    </div>
                                ) : (
                                    <Link
                                        to={path}
                                        className="block min-w-0 flex-1 px-2 py-0.5"
                                        title={conversation.title}
                                    >
                                        <span className="block truncate">{conversation.title}</span>
                                    </Link>
                                )}

                                <div data-conversation-menu-root="true">
                                    <button
                                        type="button"
                                        onClick={(event) => onToggleConversationMenu(conversation.id, event.currentTarget)}
                                        aria-expanded={openConversationMenuId === conversation.id}
                                        aria-haspopup="menu"
                                        className={`inline-flex items-center justify-center self-center rounded-md p-1 text-white/80 transition hover:bg-white/15 hover:text-white ${editingConversationId === conversation.id
                                            ? "pointer-events-none opacity-0"
                                            : openConversationMenuId === conversation.id
                                                ? "opacity-100"
                                                : "opacity-0 group-hover:opacity-100 focus:opacity-100"
                                            }`}
                                        aria-label="Opcoes da conversa"
                                    >
                                        <EllipsisVertical size={16} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
