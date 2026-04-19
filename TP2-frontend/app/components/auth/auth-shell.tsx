import type { ReactNode } from "react";
import CopyrightFooter from "~/components/common/copyright-footer";

type AuthShellProps = {
    children: ReactNode;
    title: string;
};

export default function AuthShell({ children, title }: AuthShellProps) {
    return (
        <div className="relative flex min-h-screen items-center justify-center bg-[url('/backgroundSignIn.png')] bg-cover bg-center px-6 lg:px-8">
            <div className="absolute inset-0 bg-black opacity-60" />

            <div className="relative w-full max-w-[34.375rem]">
                <div className="rounded-[25px] border-[3px] border-[#8C7343] bg-white p-6 text-center shadow-md">
                    <div className="mb-8 flex items-center justify-center gap-1">
                        <img className="h-24 w-24" src="/logo.png" alt="Logo" />
                        <p className="text-2xl font-bold text-[#A68A56]">AutoMatch</p>
                    </div>

                    <div className="mt-10 rounded-[25px] border border-[#8C7343] bg-gray-100 p-6">
                        <p className="mb-5 text-2xl font-bold text-[#8C7343]">{title}</p>
                        {children}
                    </div>
                </div>
            </div>

            <CopyrightFooter className="absolute bottom-0 w-full py-4 text-center text-sm text-gray-200" />
        </div>
    );
}
