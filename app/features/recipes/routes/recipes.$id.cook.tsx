import { useState } from "react";
import { useLoaderData, Link } from "react-router";
import type { Route } from "./+types/recipes.$id.cook";
import { getRecipeById } from "../queries/recipes";
import { ChevronLeft, ChevronRight, Check, ChefHat, Clock, Users, X } from "lucide-react";

export async function loader({ params }: Route.LoaderArgs) {
  const recipe = await getRecipeById(params.id);

  if (!recipe) {
    throw new Response("Recipe not found", { status: 404 });
  }

  const steps = recipe.instructions
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => s.replace(/^\d+[\.\)]\s*/, ""));

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

  const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);

  return (
    <div className="cooking-mode min-h-screen bg-[oklch(0.15_0.03_50)] text-[oklch(0.95_0.01_85)]">
      {/* Subtle texture overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Header */}
      <header className="relative bg-[oklch(0.12_0.02_50)] border-b border-[oklch(0.3_0.04_60)]">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link
            to={`/recipes/${recipe.id}`}
            className="flex items-center gap-2 text-gold-light hover:text-gold transition-colors group"
          >
            <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-medium">Exit</span>
          </Link>

          <div className="flex items-center gap-3">
            <ChefHat className="w-6 h-6 text-gold" />
            <h1 className="text-lg md:text-xl font-semibold tracking-tight">{recipe.name}</h1>
          </div>

          <button
            onClick={() => setShowIngredients(!showIngredients)}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-all ${
              showIngredients
                ? "bg-gold text-brown"
                : "bg-[oklch(0.25_0.03_55)] text-gold-light hover:bg-[oklch(0.3_0.03_55)] border border-[oklch(0.4_0.04_60)]"
            }`}
          >
            Ingredients
          </button>
        </div>

        {/* Recipe meta */}
        <div className="max-w-5xl mx-auto px-4 pb-4 flex gap-6 text-sm text-gold/70">
          {totalTime > 0 && (
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {totalTime} min
            </span>
          )}
          {recipe.servings && (
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              {recipe.servings} servings
            </span>
          )}
        </div>
      </header>

      {/* Ingredients Panel - Slide down animation */}
      <div className={`overflow-hidden transition-all duration-300 ease-out ${showIngredients ? "max-h-96" : "max-h-0"}`}>
        <div className="relative bg-[oklch(0.18_0.025_52)] border-b border-[oklch(0.3_0.04_60)]">
          <div className="max-w-5xl mx-auto px-4 py-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gold-light">Ingredients</h2>
              <button
                onClick={() => setShowIngredients(false)}
                className="p-1 text-gold/60 hover:text-gold-light transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {recipe.ingredients.map((ing) => (
                <div
                  key={ing.id}
                  className="flex justify-between items-center py-2 px-3 rounded-lg bg-[oklch(0.12_0.02_50)] border border-[oklch(0.25_0.03_55)]"
                >
                  <span className="text-cream">{ing.name}</span>
                  <span className="text-gold/70 text-sm font-medium">
                    {ing.quantity && `${ing.quantity}`}
                    {ing.unit && ` ${ing.unit}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative max-w-4xl mx-auto px-4 py-8 md:py-12">
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-3">
            <span className="text-gold font-medium">
              Step {currentStep + 1} <span className="text-brown-light">of {steps.length}</span>
            </span>
            <span className="text-gold/50 text-sm">
              {completedSteps.size} / {steps.length} complete
            </span>
          </div>
          <div className="h-1.5 bg-[oklch(0.2_0.02_50)] rounded-full overflow-hidden border border-[oklch(0.3_0.03_55)]">
            <div
              className="h-full bg-gradient-to-r from-gold to-gold-light transition-all duration-500 ease-out rounded-full"
              style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Current Step Card */}
        <div
          className={`relative rounded-2xl border transition-all duration-300 ${
            completedSteps.has(currentStep)
              ? "bg-[oklch(0.22_0.04_140)] border-[oklch(0.5_0.12_145)] shadow-lg shadow-[oklch(0.5_0.12_145)]/10"
              : "bg-[oklch(0.2_0.025_55)] border-[oklch(0.35_0.04_60)]"
          }`}
        >
          {completedSteps.has(currentStep) && (
            <div className="absolute top-4 right-4 w-8 h-8 bg-[oklch(0.55_0.15_145)] rounded-full flex items-center justify-center shadow-lg shadow-[oklch(0.55_0.15_145)]/30">
              <Check className="w-5 h-5 text-white" />
            </div>
          )}
          <div className="p-8 md:p-12">
            <p className="text-2xl md:text-3xl lg:text-4xl leading-relaxed font-light text-cream/95">
              {steps[currentStep]}
            </p>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center mt-8 gap-4">
          <button
            onClick={goToPrevStep}
            disabled={currentStep === 0}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-[oklch(0.22_0.025_55)] text-gold-light hover:bg-[oklch(0.28_0.03_55)] border border-[oklch(0.35_0.04_60)]"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="hidden sm:inline">Previous</span>
          </button>

          <button
            onClick={() => toggleStepComplete(currentStep)}
            className={`flex items-center gap-2 px-8 py-3 rounded-xl font-semibold transition-all ${
              completedSteps.has(currentStep)
                ? "bg-[oklch(0.55_0.15_145)] text-white hover:bg-[oklch(0.6_0.15_145)] shadow-lg shadow-[oklch(0.55_0.15_145)]/30"
                : "bg-gradient-to-r from-gold to-gold-light text-brown hover:from-gold-light hover:to-gold shadow-lg shadow-gold/30"
            }`}
          >
            {completedSteps.has(currentStep) ? (
              <>
                <Check className="w-5 h-5" />
                Done
              </>
            ) : (
              "Mark Done"
            )}
          </button>

          <button
            onClick={goToNextStep}
            disabled={currentStep === steps.length - 1}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-[oklch(0.22_0.025_55)] text-gold-light hover:bg-[oklch(0.28_0.03_55)] border border-[oklch(0.35_0.04_60)]"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </main>

      {/* Step Overview - Fixed at bottom */}
      <footer className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[oklch(0.12_0.02_50)] via-[oklch(0.12_0.02_50)]/95 to-transparent pt-8 pb-4">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
            {steps.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentStep(index)}
                className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-200 ${
                  index === currentStep
                    ? "bg-gradient-to-br from-gold to-gold-light text-brown scale-110 shadow-lg shadow-gold/40"
                    : completedSteps.has(index)
                    ? "bg-[oklch(0.55_0.15_145)] text-white"
                    : "bg-[oklch(0.22_0.025_55)] text-gold/70 hover:bg-[oklch(0.28_0.03_55)] border border-[oklch(0.35_0.04_60)]"
                }`}
              >
                {completedSteps.has(index) ? <Check className="w-4 h-4" /> : index + 1}
              </button>
            ))}
          </div>
        </div>
      </footer>

      {/* Spacer for fixed footer */}
      <div className="h-24" />
    </div>
  );
}
