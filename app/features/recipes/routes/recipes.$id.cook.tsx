import { useState } from "react";
import { useLoaderData, Link } from "react-router";
import type { Route } from "./+types/recipes.$id.cook";
import { getRecipeById } from "../queries/recipes";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";

export async function loader({ params }: Route.LoaderArgs) {
  const recipe = await getRecipeById(params.id);

  if (!recipe) {
    throw new Response("Recipe not found", { status: 404 });
  }

  // Parse instructions into steps (split by newlines or numbered items)
  const steps = recipe.instructions
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => s.replace(/^\d+[\.\)]\s*/, "")); // Remove leading numbers

  return { recipe, steps };
}

export default function CookingModePage() {
  const { recipe, steps } = useLoaderData<typeof loader>();
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [showIngredients, setShowIngredients] = useState(false);

  const toggleStepComplete = (index: number) => {
    const updated = new Set(completedSteps);
    if (updated.has(index)) {
      updated.delete(index);
    } else {
      updated.add(index);
    }
    setCompletedSteps(updated);
  };

  const goToNextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const goToPrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 p-4 flex justify-between items-center">
        <Link to={`/recipes/${recipe.id}`} className="text-gray-300 hover:text-white">
          ← Exit Cooking Mode
        </Link>
        <h1 className="text-xl font-bold">{recipe.name}</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowIngredients(!showIngredients)}
          className="text-black"
        >
          {showIngredients ? "Hide" : "Show"} Ingredients
        </Button>
      </div>

      {/* Ingredients Panel */}
      {showIngredients && (
        <div className="bg-gray-800 border-t border-gray-700 p-4">
          <h2 className="text-lg font-semibold mb-2">Ingredients</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            {recipe.ingredients.map((ing) => (
              <div key={ing.id} className="flex justify-between">
                <span>{ing.name}</span>
                <span className="text-gray-400">
                  {ing.quantity && `${ing.quantity}`}
                  {ing.unit && ` ${ing.unit}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content - Current Step */}
      <div className="flex-1 p-8">
        <div className="max-w-2xl mx-auto">
          {/* Progress */}
          <div className="mb-8">
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>Step {currentStep + 1} of {steps.length}</span>
              <span>{completedSteps.size} completed</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Current Step */}
          <Card className="bg-gray-800 border-gray-700 mb-8">
            <CardContent className="p-8">
              <p className="text-2xl md:text-3xl leading-relaxed">
                {steps[currentStep]}
              </p>
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex justify-between items-center gap-4">
            <Button
              variant="outline"
              size="lg"
              onClick={goToPrevStep}
              disabled={currentStep === 0}
              className="text-black"
            >
              ← Previous
            </Button>

            <Button
              variant={completedSteps.has(currentStep) ? "secondary" : "default"}
              size="lg"
              onClick={() => toggleStepComplete(currentStep)}
            >
              {completedSteps.has(currentStep) ? "✓ Done" : "Mark Done"}
            </Button>

            <Button
              variant="outline"
              size="lg"
              onClick={goToNextStep}
              disabled={currentStep === steps.length - 1}
              className="text-black"
            >
              Next →
            </Button>
          </div>
        </div>
      </div>

      {/* Step Overview */}
      <div className="bg-gray-800 border-t border-gray-700 p-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-sm font-semibold mb-2 text-gray-400">All Steps</h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {steps.map((step, index) => (
              <button
                key={index}
                onClick={() => setCurrentStep(index)}
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors
                  ${index === currentStep
                    ? "bg-blue-600 text-white"
                    : completedSteps.has(index)
                    ? "bg-green-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
              >
                {completedSteps.has(index) ? "✓" : index + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
