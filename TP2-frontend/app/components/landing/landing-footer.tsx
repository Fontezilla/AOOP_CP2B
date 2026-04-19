import CopyrightFooter from "~/components/common/copyright-footer";

export default function LandingFooter() {
    return (
        <footer className="relative z-10 w-full bg-[#333b4598] px-6 py-4 text-white">
            <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
                <div className="flex items-center gap-2">
                    <CopyrightFooter />
                </div>

                <div className="flex gap-4">
                    <a
                        href="https://github.com/SimaoMendes30"
                        className="text-sm text-white"
                        target="_blank"
                        rel="noreferrer"
                    >
                        Simao Mendes
                    </a>
                    <p>|</p>
                    <a
                        href="https://github.com/Fontezilla"
                        className="text-sm text-white"
                        target="_blank"
                        rel="noreferrer"
                    >
                        Diogo Fontes
                    </a>
                </div>
            </div>
        </footer>
    );
}
