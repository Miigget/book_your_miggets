import type { APIRoute } from "astro";

/** Old History URL — Dashboard Past tab is the personal archive now. */
export const GET: APIRoute = ({ redirect }) => redirect("/dashboard?tab=past");
