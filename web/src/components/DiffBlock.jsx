import React, { useEffect, useState } from "react";

const MARKERS = { add: "+", del: "-", normal: " " };

function DiffLine({ line }) {
  const cls =
    line.type === "add" ? "diff-line-add" : line.type === "del" ? "diff-line-del" : "";
  return (
    <tr className={cls}>
      <td className="diff-line-num">{line.oldLine ?? ""}</td>
      <td className="diff-line-num">{line.newLine ?? ""}</td>
      <td className="diff-line-marker">{MARKERS[line.type] ?? " "}</td>
      <td className="diff-line-content">{line.content}</td>
    </tr>
  );
}

export default function DiffBlock({ item, isViewed, onToggleViewed }) {
  const { path, range, caption, kind, file, hunks } = item;
  const [collapsed, setCollapsed] = useState(false);

  // Marking a diff viewed collapses it, mirroring GitHub's "Viewed"
  // checkbox; un-checking it does not force it back open.
  useEffect(() => {
    if (isViewed) setCollapsed(true);
  }, [isViewed]);

  const rangeLabel = range
    ? range.start === range.end
      ? `#L${range.start}`
      : `#L${range.start}-L${range.end}`
    : "";

  return (
    <div className={`diff-block${isViewed ? " diff-block-viewed" : ""}`}>
      <div className="diff-block-header">
        <button
          type="button"
          className="diff-collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand diff" : "Collapse diff"}
        >
          {collapsed ? "▸" : "▾"}
        </button>
        <span className="diff-block-path">
          {path}
          {rangeLabel}
        </span>
        {kind === "diff" && (
          <>
            <span className="diff-stat-add">+{file.additions ?? 0}</span>
            <span className="diff-stat-del">-{file.deletions ?? 0}</span>
            {file.isNew && <span className="diff-badge">new file</span>}
            {file.isDeleted && <span className="diff-badge">deleted</span>}
            {file.isRenamed && (
              <span className="diff-badge">
                renamed from {file.from}
              </span>
            )}
          </>
        )}
        {kind === "context" && <span className="diff-badge">unchanged, for context</span>}
        {kind === "empty" && <span className="diff-badge">not found</span>}
        <label className="diff-viewed-toggle">
          <input type="checkbox" checked={!!isViewed} onChange={onToggleViewed} />
          Viewed
        </label>
      </div>
      {!collapsed && (
        <>
          {caption && <div className="diff-caption">{caption}</div>}
          {hunks.length === 0 ? (
            <div className="empty-diff">
              Couldn't resolve this reference against the current base/head -
              the lines may have moved or the file may not exist at these
              refs.
            </div>
          ) : (
            <table className="diff-table">
              <tbody>
                {hunks.map((hunk, i) => (
                  <React.Fragment key={i}>
                    {kind === "diff" && (
                      <tr className="diff-hunk-header">
                        <td colSpan={4}>{hunk.header}</td>
                      </tr>
                    )}
                    {hunk.lines.map((line, j) => (
                      <DiffLine line={line} key={j} />
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
