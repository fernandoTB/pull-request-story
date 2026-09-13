import React, { useEffect, useState } from "react";

const MARKERS = { add: "+", del: "-", normal: " " };

function sideOf(line) {
  return line.type === "del" ? "LEFT" : "RIGHT";
}

function lineNumberOf(line) {
  return line.type === "del" ? line.oldLine : line.newLine;
}

function rangeLabelOf(c) {
  if (!c.startLine || c.startLine === c.line) return `Commented on line ${c.line}`;
  const start = Math.min(c.startLine, c.line);
  const end = Math.max(c.startLine, c.line);
  return `Commented on lines ${start}-${end}`;
}

function CommentIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className="comment-thread-icon"
    >
      <path d="M2 2.5A1.5 1.5 0 0 1 3.5 1h9A1.5 1.5 0 0 1 14 2.5v6A1.5 1.5 0 0 1 12.5 10H8.06l-2.83 2.83A.5.5 0 0 1 4.4 12.5V10H3.5A1.5 1.5 0 0 1 2 8.5v-6Z" />
    </svg>
  );
}

function CommentThread({ comments, collapsed, onToggleCollapse }) {
  return (
    <tr className="comment-thread-row">
      <td colSpan={4}>
        <div className="comment-thread">
          <button
            type="button"
            className="comment-thread-toggle"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
          >
            <CommentIcon />
            <span>
              {comments.length} comment{comments.length > 1 ? "s" : ""}
            </span>
            <span className="comment-thread-chevron">{collapsed ? "▸" : "▾"}</span>
          </button>
          {!collapsed &&
            comments.map((c) => (
              <div className={`comment-thread-item${c.outdated ? " outdated" : ""}`} key={c.id}>
                <div className="comment-thread-range">{rangeLabelOf(c)}</div>
                <div className="comment-thread-body">{c.body}</div>
                <div className="comment-thread-footer">
                  <span className="comment-thread-author">{c.user}</span>
                  {c.outdated && (
                    <span
                      className="comment-thread-tag"
                      title="The code around this comment has changed since it was posted"
                    >
                      outdated
                    </span>
                  )}
                  <a
                    className="comment-thread-link"
                    href={c.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on GitHub
                  </a>
                </div>
              </div>
            ))}
        </div>
      </td>
    </tr>
  );
}

function CommentComposer({ onSubmit, onCancel }) {
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    if (!body.trim() || posting) return;
    setPosting(true);
    setError(null);
    try {
      await onSubmit(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setPosting(false);
    }
  }

  return (
    <tr className="comment-composer-row">
      <td colSpan={4}>
        <div className="comment-composer">
          <textarea
            autoFocus
            placeholder="Leave a comment on this line - it posts straight to the GitHub PR."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancel();
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
            }}
            disabled={posting}
          />
          {error && <div className="comment-composer-error">{error}</div>}
          <div className="comment-composer-actions">
            <button type="button" className="nav-btn" onClick={onCancel} disabled={posting}>
              Cancel
            </button>
            <button
              type="button"
              className="comment-submit-btn"
              onClick={submit}
              disabled={posting || !body.trim()}
            >
              {posting ? "Commenting…" : "Comment on GitHub"}
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function DiffBlock({
  item,
  isViewed,
  onToggleViewed,
  githubStatus,
  comments,
  onCommentPosted,
}) {
  const { path, range, caption, kind, file, hunks } = item;
  const [collapsed, setCollapsed] = useState(false);
  const [selection, setSelection] = useState(null); // { anchor, start, end }
  const [dragging, setDragging] = useState(false);
  const [collapsedThreads, setCollapsedThreads] = useState(() => new Set());

  function toggleThreadCollapsed(flatIndex) {
    setCollapsedThreads((prev) => {
      const next = new Set(prev);
      next.has(flatIndex) ? next.delete(flatIndex) : next.add(flatIndex);
      return next;
    });
  }

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

  const canComment = kind === "diff" && !!githubStatus?.enabled;

  // Flatten hunks into one line list (skipping hunk-header separator rows)
  // so a selection can be tracked as a simple [start, end] index range.
  const rows = [];
  const flatLines = [];
  for (const hunk of hunks) {
    rows.push({ kind: "hunk-header", header: hunk.header });
    for (const line of hunk.lines) {
      rows.push({ kind: "line", line, flatIndex: flatLines.length });
      flatLines.push(line);
    }
  }

  function extendSelection(anchor, flatIndex) {
    setSelection((prev) => {
      const anchorIdx = prev?.anchor ?? anchor;
      if (sideOf(flatLines[anchorIdx]) !== sideOf(flatLines[flatIndex])) return prev;
      return {
        anchor: anchorIdx,
        start: Math.min(anchorIdx, flatIndex),
        end: Math.max(anchorIdx, flatIndex),
      };
    });
  }

  // Click a line to select it; drag (mousedown + move over other rows) to
  // select a range, or shift-click a second line to extend without
  // dragging. Both are constrained to one side (LEFT/RIGHT) at a time,
  // since that's what GitHub's own multi-line comment API expects.
  function handleMouseDown(flatIndex, e) {
    if (!canComment) return;
    e.preventDefault(); // avoid native text selection while dragging
    if (e.shiftKey && selection) {
      extendSelection(selection.anchor, flatIndex);
      return;
    }
    setSelection({ anchor: flatIndex, start: flatIndex, end: flatIndex });
    setDragging(true);
  }

  function handleMouseEnter(flatIndex) {
    if (!dragging) return;
    extendSelection(selection?.anchor ?? flatIndex, flatIndex);
  }

  useEffect(() => {
    if (!dragging) return;
    function onMouseUp() {
      setDragging(false);
    }
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [dragging]);

  async function submitComment(body) {
    const startLine = flatLines[selection.start];
    const endLine = flatLines[selection.end];
    const payload = {
      path,
      body,
      line: lineNumberOf(endLine),
      side: sideOf(endLine),
    };
    if (selection.start !== selection.end) {
      payload.startLine = lineNumberOf(startLine);
      payload.startSide = sideOf(startLine);
    }
    const res = await fetch("/api/comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to post comment.");
    // The composer collapses into the newly posted comment itself (added
    // to the shared, persistent comments list) - same as GitHub's own UI,
    // and unlike a transient "posted!" toast, it's still there later.
    onCommentPosted(data);
    setSelection(null);
  }

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
            <table
              className={`diff-table${canComment ? " diff-table-commentable" : ""}${
                dragging ? " diff-table-dragging" : ""
              }`}
            >
              <tbody>
                {rows.map((row, i) => {
                  if (row.kind === "hunk-header") {
                    return (
                      <tr className="diff-hunk-header" key={i}>
                        <td colSpan={4}>{row.header}</td>
                      </tr>
                    );
                  }
                  const { line, flatIndex } = row;
                  const isSelected =
                    !!selection && flatIndex >= selection.start && flatIndex <= selection.end;
                  const lineNum = lineNumberOf(line);
                  const side = sideOf(line);
                  const isCommented = (comments ?? []).some((c) => {
                    if (c.path !== path || c.side !== side) return false;
                    const start = Math.min(c.startLine ?? c.line, c.line);
                    const end = Math.max(c.startLine ?? c.line, c.line);
                    return lineNum >= start && lineNum <= end;
                  });
                  const cls = [
                    line.type === "add" ? "diff-line-add" : "",
                    line.type === "del" ? "diff-line-del" : "",
                    isSelected ? "diff-line-selected" : "",
                    isCommented ? "diff-line-commented" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const lineComments = (comments ?? [])
                    .filter((c) => c.path === path && c.line === lineNum && c.side === side)
                    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                  return (
                    <React.Fragment key={i}>
                      <tr
                        className={cls}
                        onMouseDown={canComment ? (e) => handleMouseDown(flatIndex, e) : undefined}
                        onMouseEnter={canComment ? () => handleMouseEnter(flatIndex) : undefined}
                      >
                        <td className="diff-line-num">{line.oldLine ?? ""}</td>
                        <td className="diff-line-num">{line.newLine ?? ""}</td>
                        <td className="diff-line-marker">{MARKERS[line.type] ?? " "}</td>
                        <td className="diff-line-content">{line.content}</td>
                      </tr>
                      {lineComments.length > 0 && (
                        <CommentThread
                          comments={lineComments}
                          collapsed={collapsedThreads.has(flatIndex)}
                          onToggleCollapse={() => toggleThreadCollapsed(flatIndex)}
                        />
                      )}
                      {isSelected && flatIndex === selection.end && !dragging && (
                        <CommentComposer
                          onSubmit={submitComment}
                          onCancel={() => setSelection(null)}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
