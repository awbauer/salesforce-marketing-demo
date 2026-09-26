import { Markdown } from "../Markdown";
import { GLOSSARY, LEARN_PARTS } from "./content";

// Scroll only the Learn view's own container; scrollIntoView would also scroll the page.
function jumpTo(id: string) {
  const target = document.getElementById(`learn-${id}`);
  const container = target?.closest<HTMLElement>(".learn-view");
  if (!target || !container) return;
  const offset = target.getBoundingClientRect().top - container.getBoundingClientRect().top;
  container.scrollTo({ top: container.scrollTop + offset - 8, behavior: "smooth" });
  target.focus({ preventScroll: true });
}

export function LearnView({ onClose }: { onClose: () => void }) {
  return (
    <section className="evaluations-view learn-view" aria-labelledby="learn-title">
      <div className="section-header">
        <div>
          <p className="kicker">Guide</p>
          <h2 id="learn-title">Learn: context, GraphRAG, and how this demo works</h2>
        </div>
        <button type="button" className="text-button evaluations-back" onClick={onClose}>
          Back to workspace
        </button>
      </div>
      <div className="learn-layout">
        <nav className="learn-toc" aria-label="Learn contents">
          <ol>
            {LEARN_PARTS.map((part) => (
              <li key={part.id}>
                <button type="button" onClick={() => jumpTo(part.id)}>
                  {part.title}
                </button>
                <ol>
                  {part.sections.map((section) => (
                    <li key={section.id}>
                      <button type="button" onClick={() => jumpTo(section.id)}>
                        {section.title}
                      </button>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => jumpTo("glossary")}>
                Glossary
              </button>
            </li>
          </ol>
        </nav>
        <div className="evaluations-body learn-body">
          {LEARN_PARTS.map((part) => (
            <section
              key={part.id}
              id={`learn-${part.id}`}
              className="learn-part"
              aria-labelledby={`learn-${part.id}-title`}
            >
              <h3 id={`learn-${part.id}-title`}>{part.title}</h3>
              <Markdown text={part.intro} />
              {part.sections.map((section) => (
                <article
                  key={section.id}
                  id={`learn-${section.id}`}
                  className="evaluation-card learn-section"
                  tabIndex={-1}
                  aria-labelledby={`learn-${section.id}-title`}
                >
                  <h4 id={`learn-${section.id}-title`}>{section.title}</h4>
                  <p className="learn-summary">{section.summary}</p>
                  <Markdown text={section.body} />
                  {section.inDemo && (
                    <div className="learn-in-demo">
                      <h5>In this demo</h5>
                      <ul>
                        {section.inDemo.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="learn-resources">
                    <h5>Learn more</h5>
                    <ul>
                      {section.resources.map((resource) => (
                        <li key={resource.url}>
                          <span className="learn-kind">{resource.kind}</span>
                          <a href={resource.url} target="_blank" rel="noopener noreferrer">
                            {resource.label}
                            <span className="sr-only"> (opens in a new tab)</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </section>
          ))}
          <section
            id="learn-glossary"
            className="evaluation-card"
            aria-labelledby="learn-glossary-title"
          >
            <h4 id="learn-glossary-title">Glossary</h4>
            <dl className="evaluation-definitions">
              {GLOSSARY.map((entry) => (
                <div key={entry.term}>
                  <dt>{entry.term}</dt>
                  <dd>{entry.definition}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </section>
  );
}
