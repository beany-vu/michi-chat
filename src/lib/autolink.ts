// Autolink for bot answers. The model writes contact details as plain prose ("email
// mugshotcoffeeph@gmail.com or call +63 2 8570 3155, rates at https://..."), and
// react-markdown without plugins renders that as text. This remark plugin turns bare
// URLs, email addresses and phone numbers inside text nodes into link nodes, so the
// widget shows tappable mailto:, tel: and https: links. No new dependency: the mdast
// walk is a dozen lines and the shapes we touch are stable (text, link, children).

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

export interface Segment {
  type: "text" | "link";
  value: string;
  url?: string;
}

// URL | email | phone. Phones: an international form starting with "+" or a local form
// starting with "0", digits with spaces or dashes between; the digit count is checked
// afterwards so prices ("2,500" has a comma, never matches) and years never turn into
// tel: links, and two numbers next to each other cannot merge into one.
const PATTERN =
  /(https?:\/\/[^\s<>()]+|www\.[^\s<>()]+)|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|(\+\d[\d\s-]{7,16}\d|\b0\d[\d\s-]{7,14}\d)/g;
const TRAILING_PUNCTUATION = /[.,;:!?'")\]]+$/;
const MIN_PHONE_DIGITS = 9;
const MAX_PHONE_DIGITS = 13;

/** Split one run of text into plain and link segments. Exported for tests. */
export function segmentText(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(PATTERN)) {
    const [raw, url, email, phone] = match;
    const start = match.index ?? 0;
    let value = raw;
    let href: string | null = null;

    if (url) {
      value = raw.replace(TRAILING_PUNCTUATION, "");
      href = value.startsWith("www.") ? `https://${value}` : value;
    } else if (email) {
      value = raw.replace(TRAILING_PUNCTUATION, "");
      href = `mailto:${value}`;
    } else if (phone) {
      value = raw.trimEnd();
      const digits = value.replace(/\D/g, "").length;
      if (digits >= MIN_PHONE_DIGITS && digits <= MAX_PHONE_DIGITS) {
        href = `tel:${value.replace(/[\s-]/g, "")}`;
      }
    }

    if (!href) continue;
    if (start > last) out.push({ type: "text", value: text.slice(last, start) });
    out.push({ type: "link", value, url: href });
    last = start + value.length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

const SKIP = new Set(["link", "linkReference", "inlineCode", "code"]);

function walk(node: MdNode): void {
  if (!node.children) return;
  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && typeof child.value === "string") {
      for (const seg of segmentText(child.value)) {
        next.push(
          seg.type === "link"
            ? { type: "link", url: seg.url, children: [{ type: "text", value: seg.value }] }
            : { type: "text", value: seg.value },
        );
      }
    } else {
      if (!SKIP.has(child.type)) walk(child);
      next.push(child);
    }
  }
  node.children = next;
}

/** remark plugin: `remarkPlugins={[remarkAutolink]}`. */
export function remarkAutolink() {
  return (tree: MdNode) => {
    walk(tree);
  };
}

// react-markdown's default transform drops tel: (its safe list is http, https, mailto,
// irc, xmpp). Allow exactly what a cafe bot needs; everything else with a scheme
// (javascript:, data:, ...) is emptied, relative paths pass through unchanged.
const ALLOWED = /^(https?|mailto|tel):/i;
export function chatUrlTransform(url: string): string {
  if (ALLOWED.test(url)) return url;
  const colon = url.indexOf(":");
  const stop = url.search(/[/?#]/);
  const hasScheme = colon !== -1 && (stop === -1 || colon < stop);
  return hasScheme ? "" : url;
}
