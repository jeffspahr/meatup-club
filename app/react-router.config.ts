import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  serverBundles: ({ branch }) => {
    return branch.some((route) => route.id === "routes/_index") ? "index" : "default";
  },
  serverModuleFormat: "esm",
} satisfies Config;
