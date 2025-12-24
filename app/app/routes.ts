import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
  route("pending", "routes/pending.tsx"),
  route("accept-invite", "routes/accept-invite.tsx"),
  route("auth/google/callback", "routes/auth.google.callback.tsx"),
  layout("routes/dashboard.tsx", [
    index("routes/dashboard._index.tsx"),
    route("events", "routes/dashboard.events.tsx"),
    route("rsvp", "routes/dashboard.rsvp.tsx"),
    route("restaurants", "routes/dashboard.restaurants.tsx"),
    route("dates", "routes/dashboard.dates.tsx"),
    route("members", "routes/dashboard.members.tsx"),
    layout("admin", [
      index("routes/dashboard.admin._index.tsx"),
      route("events", "routes/dashboard.admin.events.tsx"),
      route("members", "routes/dashboard.admin.members.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
