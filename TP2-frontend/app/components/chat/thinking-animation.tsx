import { useEffect, useRef } from "react";
import carLoadingAnimation from "~/assets/carr.json";

export default function ThinkingAnimation() {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let animation: { destroy: () => void } | null = null;
        let isMounted = true;

        void import("lottie-web").then((module) => {
            const lottie = "default" in module ? module.default : module;

            if (!isMounted || !containerRef.current) {
                return;
            }

            animation = lottie.loadAnimation({
                container: containerRef.current,
                renderer: "svg",
                loop: true,
                autoplay: true,
                animationData: carLoadingAnimation,
            });
        });

        return () => {
            isMounted = false;
            animation?.destroy();
        };
    }, []);

    return <div ref={containerRef} className="h-full w-full shrink-0" aria-hidden="true" />;
}
