import { Pencil, Trash2 } from "lucide-react";
import type { DropdownPos } from "~/components/sidebar/types";

const DROPDOWN_WIDTH = 160;

type SidebarConversationMenuProps = {
    dropdownPos: DropdownPos | null;
    openConversationMenuId: string | null;
    onDeleteConversation: (conversationId: string) => Promise<void>;
    onStartRenameConversation: (conversationId: string) => void;
};

export default function SidebarConversationMenu({
    dropdownPos,
    openConversationMenuId,
    onDeleteConversation,
    onStartRenameConversation,
}: SidebarConversationMenuProps) {
    if (!openConversationMenuId || !dropdownPos) {
        return null;
    }

    return (
        <div
            data-conversation-dropdown="true"
            style={{
                position: "fixed",
                top: dropdownPos.top,
                left: dropdownPos.left,
                width: DROPDOWN_WIDTH,
                zIndex: 9999,
            }}
        >
            <div className="rounded-lg border-2 border-[#333b4598] bg-white p-1 shadow-xl ring-1 ring-black/10">
                <button
                    type="button"
                    onClick={() => onStartRenameConversation(openConversationMenuId)}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-gray-700 transition hover:bg-[#92743b]/30"
                >
                    <Pencil size={14} />
                    <span>Renomear</span>
                </button>
                <button
                    type="button"
                    onClick={() => void onDeleteConversation(openConversationMenuId)}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-red-500 transition hover:bg-red-300/30"
                >
                    <Trash2 size={14} />
                    <span>Eliminar</span>
                </button>
            </div>
        </div>
    );
}
