import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Rotisserie" },
    { name: "description", content: "Plan meals. Shop smarter. Cook. Repeat." },
  ];
}

export default function Home() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-blue-600">Rotisserie</h1>
      <p className="mt-2 text-gray-600">Plan meals. Shop smarter. Cook. Repeat.</p>
    </div>
  );
}
