import React, { useEffect, useState } from "react";

const MARKERS = { add: "+", del: "-", normal: " " };

function sideOf(line) {
  return line.type === "del" ? "LEFT" : "RIGHT";
}

function lineNumberOf(line) {
  return line.type === "del" ? line.oldLine : line.newLine;
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

function CommentPosted({ url, onDismiss }) {
  return (
    <tr className="comment-composer-row">
      <td colSpan={4}>
        <div className="comment-posted">
          Comment posted.{" "}
          <a href={url} target="_blank" rel="noreferrer">
            View on GitHub
          </a>
          <button type="button" className="comment-dismiss-btn" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function DiffBlock({ item, isViewed, onToggleViewed, githubStatus }) {
  const { path, range, caption, kind, file, hunks } = item;
  const [collapsed, setCollapsed] = useState(false);
  const [selection, setSelection] = useState(null); // { anchor, start, end }
  const [dragging, setDragging] = useState(false);
  const [postedUrl, setPostedUrl] = useState(null);

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
    setPostedUrl(null);
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
    setPostedUrl(data.url);
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
                  const cls = [
                    line.type === "add" ? "diff-line-add" : "",
                    line.type === "del" ? "diff-line-del" : "",
                    isSelected ? "diff-line-selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
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
                      {isSelected && flatIndex === selection.end && !dragging && !postedUrl && (
                        <CommentComposer
                          onSubmit={submitComment}
                          onCancel={() => setSelection(null)}
                        />
                      )}
                      {isSelected && flatIndex === selection.end && !dragging && postedUrl && (
                        <CommentPosted
                          url={postedUrl}
                          onDismiss={() => {
                            setPostedUrl(null);
                            setSelection(null);
                          }}
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
