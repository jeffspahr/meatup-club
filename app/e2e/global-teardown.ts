import { executeLocalD1File } from "./d1";

export default function globalTeardown() {
  executeLocalD1File(new URL("./fixtures/cleanup.sql", import.meta.url));
}
