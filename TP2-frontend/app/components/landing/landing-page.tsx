import { Link } from "react-router";
import LandingFooter from "~/components/landing/landing-footer";

export default function LandingPage() {
    return (
        <div className="relative isolate flex min-h-screen w-full flex-col overflow-x-hidden bg-gray-900">
            <img
                alt=""
                src="/backgroundSignIn.png"
                className="absolute inset-0 h-full w-full object-cover object-right md:object-center"
            />

            <div className="absolute inset-0 bg-black/45" />

            <div className="relative z-10 ml-20 mt-20 grow">
                <div className="mx-auto max-w-2xl lg:mx-0">
                    <div className="flex items-center">
                        <img className="h-60 w-60" src="/logo.png" alt="Logo" />
                        <h2 className="text-6xl font-bold text-[#A68A56]">AutoMatch</h2>
                    </div>

                    <div className="mt-5 rounded-[25px] border-2 border-[#8C7343] bg-[#ffffff92] p-6 text-center shadow-md">
                        <h3 className="text-2xl font-bold text-[#8C7343]">Encontre o seu Match</h3>
                        <p className="mt-2 text-lg text-gray-700">
                            Descubra o carro perfeito para ti com AutoMatch!
                        </p>

                        <div className="mt-6 flex justify-center gap-x-4">
                            <Link
                                to="/signin"
                                className="w-50 justify-center rounded-[80px] bg-[#A68A56] px-3 py-1.5 text-center text-sm/6 font-semibold text-white shadow-xs hover:bg-[#8A6B3C] focus-visible:outline-2 focus-visible:outline-offset-2"
                            >
                                Sign in
                            </Link>

                            <Link
                                to="/signup"
                                className="w-50 justify-center rounded-[80px] border border-[#8C7343] px-3 py-1.5 text-center text-sm/6 font-semibold text-[#8C7343] shadow-xs hover:bg-[#70562829] focus-visible:outline-2 focus-visible:outline-offset-2"
                            >
                                Sign up
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            <LandingFooter />
        </div>
    );
}
