import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/")({ component: () => {
  const nav = useNavigate();
  useEffect(() => { nav({ to: "/dashboard" }); }, [nav]);
  return null;
}});
