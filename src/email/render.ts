import { render } from "@react-email/render";
import type { ReactNode } from "react";

function normalizeEmailHtml(html: string): string {
  return html
    .replace(/^<!DOCTYPE[^>]*>/i, "<!DOCTYPE html>")
    .replace(/<!--\$-->|<!--\/\$-->|<!--html-->|<!--head-->|<!--body-->|<!-- -->/g, "");
}

export async function renderEmail(node: ReactNode): Promise<string> {
  return normalizeEmailHtml(await render(node));
}
