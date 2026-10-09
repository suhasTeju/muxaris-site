"use client";

import { useEffect, useRef, useState } from "react";

/** The email's own HTML in an iframe, grown to its content height once it has loaded. */
export function EmailFrame({ html, title }: { html: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(760);
  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const fit = () => {
      const doc = frame.contentDocument;
      // The root element's box, not scrollHeight, which never drops below the frame's own height.
      if (doc?.body) setHeight(Math.ceil(doc.documentElement.getBoundingClientRect().height));
    };
    // A srcdoc frame can finish loading before hydration attaches a listener.
    if (frame.contentDocument?.readyState === "complete") fit();
    frame.addEventListener("load", fit);
    return () => frame.removeEventListener("load", fit);
  }, [html]);
  return (
    <iframe
      ref={ref}
      title={title}
      srcDoc={html}
      className="block w-full border-0"
      style={{ height }}
    />
  );
}
