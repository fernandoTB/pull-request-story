import React from "react";

export default function Stepper({ steps, activeIndex, reviewed, onSelect }) {
  return (
    <nav className="stepper" aria-label="PR steps">
      {steps.map((step, i) => {
        const isActive = i === activeIndex;
        const isDone = reviewed.has(i);
        return (
          <button
            key={i}
            className={`step-item${isActive ? " active" : ""}${isDone ? " done" : ""}`}
            onClick={() => onSelect(i)}
          >
            {i < steps.length - 1 && <span className="step-connector" />}
            <span className="step-marker">{isDone ? "✓" : i + 1}</span>
            <span className="step-item-body">
              <div className="step-item-name">{step.name}</div>
              <div className="step-item-meta">
                {step.files.length} file{step.files.length === 1 ? "" : "s"}
              </div>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
