import SidebarView from "~/components/sidebar/sidebar-view";
import { useSidebar } from "~/hooks/use-sidebar";

export default function Sidebar() {
    const sidebar = useSidebar();

    return <SidebarView {...sidebar} />;
}
