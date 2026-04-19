import { type MetaArgs } from "react-router";
import LandingPage from "~/components/landing/landing-page";

export function meta({ }: MetaArgs) {
    return [{ title: "AutoMatch" }];
}

export default function Landescape() {
    return <LandingPage />;
}
