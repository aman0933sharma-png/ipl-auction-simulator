import { createFileRoute } from "@tanstack/react-router";
import { AuctionDesk } from "@/components/auction-desk";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <AuctionDesk />;
}
