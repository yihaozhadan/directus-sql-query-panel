import { ParseSqlResults } from "./types";

export const parseResults: ParseSqlResults = (result: any) => {
  let items: Array<Record<string, any>> = [];
  let headers: Array<string> = [];
  items = result;
  if (items.length > 0) {
    headers = Object.keys(items[0]!);
  }

  return { items, headers };
}