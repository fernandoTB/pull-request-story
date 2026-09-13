import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import DiffBlock from "./DiffBlock.jsx";

export default function StepPanel({
  step,
  index,
  total,
  isReviewed,
  onToggleReviewed,
  onPrev,
  onNext,
}) {
  return (
    <article className="main" key={index}>
      <div className="step-heading">
        <span className="step-index-badge">
          Step {index + 1} / {total}
        </span>
        <h2>{step.name}</h2>
      </div>

      <div className="step-files">
        {step.files.map((f) => (
          <span className="file-chip" key={f}>
            {f}
          </span>
        ))}
      </div>

      <div className="step-description">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{step.description}</ReactMarkdown>
      </div>

      {step.story.map((item, i) =>
        item.type === "text" ? (
          <div className="story-item story-text" key={i}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
          </div>
        ) : (
          <div className="story-item" key={i}>
            <DiffBlock item={item} />
          </div>
        )
      )}

      <div className="toolbar">
        <button className="nav-btn" onClick={onPrev} disabled={index === 0}>
          ← Previous
        </button>
        <button className="nav-btn" onClick={onNext} disabled={index === total - 1}>
          Next →
        </button>
        <button
          className={`reviewed-toggle${isReviewed ? " active" : ""}`}
          onClick={onToggleReviewed}
        >
          {isReviewed ? "✓ Reviewed" : "Mark as reviewed"}
        </button>
      </div>
    </article>
  );
}
