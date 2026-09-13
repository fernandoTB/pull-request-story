import React from "react";

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

export default function DiffBlock({ item }) {
  const { path, range, caption, kind, file, hunks } = item;
  const rangeLabel = range
    ? range.start === range.end
      ? `#L${range.start}`
      : `#L${range.start}-L${range.end}`
    : "";

  return (
    <div className="diff-block">
      <div className="diff-block-header">
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
      </div>
      {caption && <div className="diff-caption">{caption}</div>}
      {hunks.length === 0 ? (
        <div className="empty-diff">
          Couldn't resolve this reference against the current base/head - the
          lines may have moved or the file may not exist at these refs.
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
    </div>
  );
}
