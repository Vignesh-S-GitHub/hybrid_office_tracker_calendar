import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function Disclosure({
  title,
  children,
  className = "",
  defaultOpen = false,
  level = 2,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  level?: 2 | 3;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const Heading = level === 3 ? "h3" : "h2";
  return (
    <section className={`disclosure ${className}`}>
      <Heading className="disclosure-heading">
        <button
          className="disclosure-toggle"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
        >
          <span>{title}</span>
          <ChevronDown size={18} aria-hidden="true" />
        </button>
      </Heading>
      <div id={id} className="disclosure-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
