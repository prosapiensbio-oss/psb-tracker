import { createFileRoute } from "@tanstack/react-router";

import { PSBApp } from "../components/psb/App";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return <PSBApp />;
}
