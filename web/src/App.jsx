import React, { useEffect, useMemo, useState, useCallback } from "react";
import Stepper from "./components/Stepper.jsx";
import StepPanel from "./components/StepPanel.jsx";

function storageKey(story) {
  return `pr-story:reviewed:${story.title ?? "untitled"}:${story.base}...${story.head}`;
}

function loadReviewed(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export default function App() {
  const [story, setStory] = useState(null);
  const [error, setError] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [reviewed, setReviewed] = useState(new Set());

  const fetchStory = useCallback(() => {
    fetch("/api/story")
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((data) => {
        setStory(data);
        setReviewed(loadReviewed(storageKey(data)));
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    fetchStory();
  }, [fetchStory]);

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

  const toggleReviewed = useCallback(() => {
    if (!story) return;
    setReviewed((prev) => {
      const next = new Set(prev);
      next.has(activeIndex) ? next.delete(activeIndex) : next.add(activeIndex);
      try {
        localStorage.setItem(storageKey(story), JSON.stringify([...next]));
      } catch {
        // best-effort persistence only
      }
      return next;
    });
  }, [story, activeIndex]);

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
      </header>
      <div className="layout">
        <Stepper
          steps={story.steps}
          activeIndex={activeIndex}
          reviewed={reviewed}
          onSelect={setActiveIndex}
        />
        <StepPanel
          step={step}
          index={activeIndex}
          total={story.steps.length}
          isReviewed={reviewed.has(activeIndex)}
          onToggleReviewed={toggleReviewed}
          onPrev={() => setActiveIndex((i) => Math.max(i - 1, 0))}
          onNext={() =>
            setActiveIndex((i) => Math.min(i + 1, story.steps.length - 1))
          }
        />
      </div>
    </div>
  );
}
