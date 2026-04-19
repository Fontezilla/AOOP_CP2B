import AddIcon from "@mui/icons-material/Add";
import { PanelLeftClose } from "lucide-react";
import type { RefObject } from "react";
import SidebarConversationList from "~/components/sidebar/conversation-list";
import SidebarConversationMenu from "~/components/sidebar/conversation-menu";
import SidebarProfileSection from "~/components/sidebar/profile-section";
import type { Conversation, DropdownPos } from "~/components/sidebar/types";

type SidebarViewProps = {
    contentVisibility: string;
    conversations: Conversation[];
    currentPathname: string;
    displayName: string;
    dropdownPos: DropdownPos | null;
    editingConversationId: string | null;
    editingTitle: string;
    initials: string;
    isConversationsExpanded: boolean;
    isLoadingConversations: boolean;
    isOpen: boolean;
    isProfileMenuOpen: boolean;
    openConversationMenuId: string | null;
    profileMenuRef: RefObject<HTMLDivElement | null>;
    renameInputRef: RefObject<HTMLInputElement | null>;
    onCancelRenameConversation: () => void;
    onCloseSidebar: () => void;
    onDeleteConversation: (conversationId: string) => Promise<void>;
    onEditingTitleChange: (value: string) => void;
    onLogout: () => void;
    onNewConversation: () => void;
    onOpenSidebar: () => void;
    onSaveRenameConversation: (conversationId: string) => Promise<void>;
    onStartRenameConversation: (conversationId: string) => void;
    onToggleConversationMenu: (conversationId: string, button: HTMLButtonElement) => void;
    onToggleConversationsExpanded: () => void;
    onToggleProfileMenu: () => void;
};

export default function SidebarView({
    contentVisibility,
    conversations,
    currentPathname,
    displayName,
    dropdownPos,
    editingConversationId,
    editingTitle,
    initials,
    isConversationsExpanded,
    isLoadingConversations,
    isOpen,
    isProfileMenuOpen,
    openConversationMenuId,
    profileMenuRef,
    renameInputRef,
    onCancelRenameConversation,
    onCloseSidebar,
    onDeleteConversation,
    onEditingTitleChange,
    onLogout,
    onNewConversation,
    onOpenSidebar,
    onSaveRenameConversation,
    onStartRenameConversation,
    onToggleConversationMenu,
    onToggleConversationsExpanded,
    onToggleProfileMenu,
}: SidebarViewProps) {
    return (
        <>
            <SidebarConversationMenu
                dropdownPos={dropdownPos}
                openConversationMenuId={openConversationMenuId}
                onDeleteConversation={onDeleteConversation}
                onStartRenameConversation={onStartRenameConversation}
            />

            <aside
                className={`${isOpen ? "w-72" : "w-20"} sticky top-0 h-screen shrink-0 border-r border-amber-950/20 bg-[#333b45b7] text-white shadow-xl transition-[width,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${isOpen
                    ? "shadow-2xl shadow-amber-950/20"
                    : "shadow-lg shadow-amber-950/10"
                    }`}
            >
                <div className="flex h-full flex-col">
                    <div className={`flex items-center ${isOpen ? "justify-between" : "justify-center"} px-3 py-4`}>
                        {isOpen ? (
                            <>
                                <img
                                    className="ml-1 h-12 w-12 rounded-lg object-cover transition-transform duration-500 ease-out hover:scale-[1.03]"
                                    src="/logo.png"
                                    alt="Logo"
                                />
                                <button
                                    type="button"
                                    onClick={onCloseSidebar}
                                    className="mr-2 rounded-xl p-2 text-white transition-all duration-300 hover:rotate-[-8deg] hover:bg-white/15"
                                    aria-label="Fechar sidebar"
                                >
                                    <PanelLeftClose size={20} className="transition-transform duration-300" />
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                onClick={onOpenSidebar}
                                className="rounded-xl p-1 text-white transition-all duration-300 hover:scale-105 hover:bg-white/15"
                                aria-label="Abrir sidebar"
                            >
                                <img
                                    className="h-12 w-12 rounded-lg object-cover transition-transform duration-300 hover:rotate-3"
                                    src="/logo.png"
                                    alt="Logo"
                                />
                            </button>
                        )}
                    </div>

                    <div className="px-3">
                        <button
                            type="button"
                            onClick={onNewConversation}
                            className={`flex w-full items-center justify-center rounded-xl border border-white/15 bg-white/10 py-3 text-sm font-medium text-amber-50 transition-all duration-300 hover:bg-white/20 ${isOpen ? "gap-3 px-4" : "px-2"}`}
                        >
                            <AddIcon fontSize="small" />
                            <span
                                className={`overflow-hidden whitespace-nowrap transition-all duration-300 ease-out ${isOpen
                                    ? "max-w-35 translate-x-0 opacity-100"
                                    : "max-w-0 -translate-x-1 opacity-0"
                                    }`}
                            >
                                Nova conversa
                            </span>
                        </button>
                    </div>

                    <div className="mt-4 flex-1 overflow-y-auto px-3 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        <SidebarConversationList
                            contentVisibility={contentVisibility}
                            conversations={conversations}
                            currentPathname={currentPathname}
                            editingConversationId={editingConversationId}
                            editingTitle={editingTitle}
                            isConversationsExpanded={isConversationsExpanded}
                            isLoadingConversations={isLoadingConversations}
                            openConversationMenuId={openConversationMenuId}
                            renameInputRef={renameInputRef}
                            onCancelRenameConversation={onCancelRenameConversation}
                            onEditingTitleChange={onEditingTitleChange}
                            onSaveRenameConversation={onSaveRenameConversation}
                            onToggleConversationMenu={onToggleConversationMenu}
                            onToggleConversationsExpanded={onToggleConversationsExpanded}
                        />
                    </div>

                    <SidebarProfileSection
                        displayName={displayName}
                        initials={initials}
                        isOpen={isOpen}
                        isProfileMenuOpen={isProfileMenuOpen}
                        profileMenuRef={profileMenuRef}
                        onLogout={onLogout}
                        onToggleProfileMenu={onToggleProfileMenu}
                    />
                </div>
            </aside>
        </>
    );
}
