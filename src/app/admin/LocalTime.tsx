"use client";

import { useEffect, useState } from "react";

// Timestamps in the ADMIN'S OWN browser timezone. Server components render with the
// container's clock (UTC), so `date.toLocaleString()` there showed operator-hostile
// times. SSR still emits the UTC text (layout stays stable), and the effect swaps in
// the browser-local formatting after hydration; suppressHydrationWarning covers the
// deliberate mismatch. Analytics buckets are NOT this: they stay in the tenant's
// timezone on purpose (a Manila cafe's busy hours are Manila hours).
export function LocalTime({ iso, mode = "datetime" }: { iso: string; mode?: "datetime" | "date" }) {
  // Same code both sides: Node formats in the container's zone, the browser in the
  // viewer's. The effect re-runs it client-side, which is the whole fix.
  const format = () => {
    const d = new Date(iso);
    if (mode === "date") return d.toLocaleDateString(undefined, { dateStyle: "medium" });
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  };
  const [text, setText] = useState(format);
  useEffect(() => setText(format()), [iso, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  );
}
