import React, { useEffect, useId, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Mermaid is large, so it is loaded only when a story actually has a ```mermaid block.
let mermaidPromise = null;
function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((mod) => mod.default);
  }
  return mermaidPromise;
}

function prefersDark() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function MermaidDiagram({ source }) {
  const id = "mermaid-" + useId().replace(/:/g, "");
  const ref = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadMermaid()
      .then(async (mermaid) => {
        // securityLevel "strict" (the default) keeps HTML in labels sanitized.
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          // Natural size + horizontal scroll, so wide left-to-right diagrams stay legible.
          flowchart: { useMaxWidth: false, nodeSpacing: 25, rankSpacing: 35, padding: 8 },
          theme: prefersDark() ? "dark" : "default",
        });
        const { svg } = await mermaid.render(id, source);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      })
      .catch((err) => {
        if (!cancelled) setError(String(err && err.message ? err.message : err));
      });
    return () => {
      cancelled = true;
    };
  }, [source, id]);

  if (error) {
    return (
      <div className="mermaid-error">
        <p>Could not render this Mermaid diagram: {error}</p>
        <pre>
          <code>{source}</code>
        </pre>
      </div>
    );
  }
  return <div className="mermaid-diagram" ref={ref} />;
}

// A fenced block tagged `mermaid` becomes a rendered diagram; every other block is left alone.
function Pre({ children, ...props }) {
  const child = React.Children.toArray(children)[0];
  const className = (child && child.props && child.props.className) || "";
  if (/\blanguage-mermaid\b/.test(className)) {
    const source = String(child.props.children).replace(/\n$/, "");
    return <MermaidDiagram source={source} />;
  }
  return <pre {...props}>{children}</pre>;
}

export default function Markdown({ children }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: Pre }}>
      {children}
    </ReactMarkdown>
  );
}
