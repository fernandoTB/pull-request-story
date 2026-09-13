import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Stepper from "./components/Stepper.jsx";
import StepPanel from "./components/StepPanel.jsx";

const SIDEBAR_WIDTH_KEY = "pr-story:sidebar-width";
const DEFAULT_SIDEBAR_WIDTH = 300;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 560;

function clampSidebarWidth(width) {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

function loadSidebarWidth() {
  try {
    const raw = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return raw ? clampSidebarWidth(raw) : DEFAULT_SIDEBAR_WIDTH;
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

function storageKey(story, kind) {
  return `pr-story:${kind}:${story.title ?? "untitled"}:${story.base}...${story.head}`;
}

function loadSet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveSet(key, set) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // best-effort persistence only
  }
}

export default function App() {
  const [story, setStory] = useState(null);
  const [error, setError] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [reviewed, setReviewed] = useState(new Set());
  const [viewedDiffs, setViewedDiffs] = useState(new Set());
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);
  const [resizingSidebar, setResizingSidebar] = useState(false);
  const [githubStatus, setGithubStatus] = useState(null);
  const layoutRef = useRef(null);

  const fetchStory = useCallback(() => {
    fetch("/api/story")
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((data) => {
        setStory(data);
        setReviewed(loadSet(storageKey(data, "reviewed")));
        setViewedDiffs(loadSet(storageKey(data, "viewed-diffs")));
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    fetchStory();
  }, [fetchStory]);

  useEffect(() => {
    fetch("/api/github-status")
      .then((r) => r.json())
      .then(setGithubStatus)
      .catch(() => setGithubStatus({ enabled: false, reason: "failed to load status" }));
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (!story) return;
      if (e.key === "ArrowRight" || e.key === "j") {
        setActiveIndex((i) => Math.min(i + 1, story.steps.length - 1));
      } else if (e.key === "ArrowLeft" || e.key === "k") {
        setActiveIndex((i) => Math.max(i - 1, 0));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [story]);

  const startSidebarResize = useCallback((e) => {
    e.preventDefault();
    setResizingSidebar(true);
  }, []);

  useEffect(() => {
    if (!resizingSidebar) return;

    function onMove(e) {
      const left = layoutRef.current?.getBoundingClientRect().left ?? 0;
      setSidebarWidth(clampSidebarWidth(e.clientX - left));
    }
    function onUp() {
      setResizingSidebar(false);
      setSidebarWidth((width) => {
        try {
          localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
        } catch {
          // best-effort persistence only
        }
        return width;
      });
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizingSidebar]);

  const toggleReviewed = useCallback(() => {
    if (!story) return;
    setReviewed((prev) => {
      const next = new Set(prev);
      next.has(activeIndex) ? next.delete(activeIndex) : next.add(activeIndex);
      saveSet(storageKey(story, "reviewed"), next);
      return next;
    });
  }, [story, activeIndex]);

  const toggleDiffViewed = useCallback(
    (diffKey) => {
      if (!story) return;
      setViewedDiffs((prev) => {
        const next = new Set(prev);
        next.has(diffKey) ? next.delete(diffKey) : next.add(diffKey);
        saveSet(storageKey(story, "viewed-diffs"), next);
        return next;
      });
    },
    [story]
  );

  const progress = useMemo(() => {
    if (!story) return null;
    return `${reviewed.size} / ${story.steps.length} reviewed`;
  }, [story, reviewed]);

  if (error) {
    return (
      <div className="center-state">
        Failed to load story: {error}
      </div>
    );
  }

  if (!story) {
    return <div className="center-state">Resolving story against git history…</div>;
  }

  const step = story.steps[activeIndex];

  return (
    <div className="app">
      <header className="app-header">
        <h1>{story.title ?? "Pull request story"}</h1>
        <span className="ref-range">
          {story.base}...{story.head}
        </span>
        <span className="progress-pill">{progress}</span>
        {githubStatus && (
          <span
            className={`github-status${githubStatus.enabled ? " enabled" : ""}`}
            title={githubStatus.enabled ? undefined : githubStatus.reason}
          >
            {githubStatus.enabled
              ? `comments → ${githubStatus.owner}/${githubStatus.repo}#${githubStatus.pr}`
              : "GitHub comments disabled"}
          </span>
        )}
      </header>
      <div className={`layout${resizingSidebar ? " sidebar-resizing" : ""}`} ref={layoutRef}>
        <div className="stepper-wrap" style={{ width: sidebarWidth }}>
          <Stepper
            steps={story.steps}
            activeIndex={activeIndex}
            reviewed={reviewed}
            onSelect={setActiveIndex}
          />
          <div
            className={`sidebar-resize-handle${resizingSidebar ? " active" : ""}`}
            onMouseDown={startSidebarResize}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
          />
        </div>
        <StepPanel
          step={step}
          index={activeIndex}
          total={story.steps.length}
          isReviewed={reviewed.has(activeIndex)}
          onToggleReviewed={toggleReviewed}
          viewedDiffs={viewedDiffs}
          onToggleDiffViewed={toggleDiffViewed}
          githubStatus={githubStatus}
          onPrev={() => setActiveIndex((i) => Math.max(i - 1, 0))}
          onNext={() =>
            setActiveIndex((i) => Math.min(i + 1, story.steps.length - 1))
          }
        />
      </div>
    </div>
  );
}
