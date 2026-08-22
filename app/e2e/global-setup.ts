import { executeLocalD1File } from "./d1";

export default function globalSetup() {
  executeLocalD1File(new URL("../../schema.sql", import.meta.url));
  executeLocalD1File(new URL("./fixtures/seed.sql", import.meta.url));
}
