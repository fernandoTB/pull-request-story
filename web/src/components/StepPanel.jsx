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
  viewedDiffs,
  onToggleDiffViewed,
  githubStatus,
  comments,
  onCommentPosted,
  onPrev,
  onNext,
}) {
  const diffCount = step.story.filter((item) => item.type === "diff").length;
  const viewedCount = step.story.filter(
    (item, i) => item.type === "diff" && viewedDiffs.has(`${index}:${i}`)
  ).length;

  return (
    <article className="main" key={index}>
      <div className="step-heading">
        <span className="step-index-badge">
          Step {index + 1} / {total}
        </span>
        <h2>{step.name}</h2>
        {diffCount > 0 && (
          <span className="step-diff-progress">
            {viewedCount} / {diffCount} diffs viewed
          </span>
        )}
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
            <DiffBlock
              item={item}
              isViewed={viewedDiffs.has(`${index}:${i}`)}
              onToggleViewed={() => onToggleDiffViewed(`${index}:${i}`)}
              githubStatus={githubStatus}
              comments={comments}
              onCommentPosted={onCommentPosted}
            />
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
