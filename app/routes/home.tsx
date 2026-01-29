import { Link } from "react-router";
import { Button } from "~/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-2">Rotisserie</h1>
      <p className="text-gray-600 mb-8">Plan meals. Shop smarter. Cook. Repeat.</p>

      <div className="flex gap-4">
        <Link to="/recipes">
          <Button size="lg">View Recipes</Button>
        </Link>
        <Link to="/recipes/new">
          <Button size="lg" variant="outline">Add Recipe</Button>
        </Link>
      </div>
    </div>
  );
}
