import { ArrowRight } from "lucide-react";
import { Link } from "react-router";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";

const OPTIONS = [
  {
    key: "A",
    to: "/design/a",
    name: "Rail & Drawer",
    tagline: "A labelled sidebar, one content column, and a drawer for everything secondary.",
    best: "Reading and planning without losing your place",
    cost: "Only one recipe visible at a time",
    notes: [
      "Recipe detail opens in a right-hand drawer over the list; the list keeps its scroll and filters.",
      "The drawer lives in the URL (?recipe=…), so it is linkable and Back closes it.",
      "The recipe editor is a real page — too many fields to fit a drawer honestly.",
    ],
  },
  {
    key: "B",
    to: "/design/b",
    name: "Three-Pane Workbench",
    tagline: "An icon rail, a permanent list pane, and a detail pane that is always on screen.",
    best: "Comparing and triaging a large library fast",
    cost: "Three columns get tight on a laptop; detail is narrower",
    notes: [
      "No drawer needed for reading — detail is always visible beside the list.",
      "Drawers are reserved for writing: log a cook, assign a meal.",
      "Arrow keys move through the list; the detail pane follows.",
    ],
  },
  {
    key: "C",
    to: "/design/c",
    name: "Today First",
    tagline: "The app opens on tonight's dinner, not on a list. ⌘K goes anywhere.",
    best: "The daily question — what are we eating?",
    cost: "Library work takes one more hop",
    notes: [
      "Home is a Today surface: tonight's meal, the rest of the week, what needs using.",
      "Navigation is reorganised around time rather than around objects.",
      "Recipes open in a drawer from anywhere, including the command palette.",
    ],
  },
];

export default function DesignIndex() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <div className="mx-auto max-w-5xl px-8 py-14">
        <Badge variant="outline" className="mb-4 font-normal">
          Design proposal
        </Badge>
        <h1 className="text-4xl font-semibold tracking-tight">Three ways to rebuild the UI</h1>
        <p className="text-muted-foreground mt-3 max-w-2xl text-base leading-relaxed">
          All three share the same shell DNA — a persistent left sidebar, a main
          surface, and drawers instead of modals. They differ in what the app
          opens on, and in how much lives beside the content versus over it.
          Every screen below is running on the real data.
        </p>

        <div className="mt-10 space-y-4">
          {OPTIONS.map((option) => (
            <Link
              key={option.key}
              to={option.to}
              className="group border-border hover:border-primary/60 block rounded-xl border p-6 transition-colors"
            >
              <div className="flex items-start gap-5">
                <span className="bg-secondary text-secondary-foreground flex size-10 shrink-0 items-center justify-center rounded-lg text-lg font-semibold">
                  {option.key}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold">{option.name}</h2>
                    <ArrowRight className="text-muted-foreground size-4 transition-transform group-hover:translate-x-1" />
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm">{option.tagline}</p>

                  <ul className="mt-4 space-y-1.5">
                    {option.notes.map((note) => (
                      <li key={note} className="text-muted-foreground flex gap-2 text-sm">
                        <span className="text-primary mt-[0.45rem] size-1 shrink-0 rounded-full bg-current" />
                        {note}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                    <span>
                      <span className="text-muted-foreground">Best at: </span>
                      {option.best}
                    </span>
                    <span>
                      <span className="text-muted-foreground">Trade-off: </span>
                      {option.cost}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-10 border-t pt-6">
          <Button asChild variant="ghost" className="gap-2">
            <Link to="/recipes">
              View the current UI for comparison
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
