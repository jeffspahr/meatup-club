import { RouterContextProvider, createContext } from "react-router";
import type { CloudflareLoadContext } from "../env";

const cloudflareContext = createContext<CloudflareLoadContext>();

export function createLoadContext(
  cloudflare: CloudflareLoadContext
): RouterContextProvider {
  const context = new RouterContextProvider();
  context.set(cloudflareContext, cloudflare);
  return context;
}

export function getCloudflareContext(
  context: Readonly<RouterContextProvider>
): CloudflareLoadContext {
  return context.get(cloudflareContext);
}
