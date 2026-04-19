import { getCurrentYear } from "~/utils/index";

type CopyrightFooterProps = {
    className?: string;
};

export default function CopyrightFooter({ className = "" }: CopyrightFooterProps) {
    return (
        <footer className={className}>
            <p>@{getCurrentYear()} AutoMatch. Prova de Conceito!</p>
        </footer>
    );
}
