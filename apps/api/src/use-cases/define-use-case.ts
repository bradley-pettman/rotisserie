import z from 'zod'

type Inner<Args extends [z.ZodType, ...z.ZodType[]], Output extends z.ZodType> = z.core.$InferInnerFunctionTypeAsync<
  z.ZodTuple<Args, null>,
  Output
>

type Outer<Args extends [z.ZodType, ...z.ZodType[]], Output extends z.ZodType> = z.core.$InferOuterFunctionTypeAsync<
  z.ZodTuple<Args, null>,
  Output
>

export function defineUseCase<Input extends z.ZodObject, Output extends z.ZodType, Actor extends z.ZodObject>(definition: {
  actor: Actor
  input: Input
  output: Output
  implementation: Inner<[Input, Actor], Output>
}): Outer<[Input, Actor], Output> & { actor: Actor; input: Input; output: Output }

export function defineUseCase<Input extends z.ZodObject, Output extends z.ZodType>(definition: {
  input: Input
  output: Output
  implementation: Inner<[Input], Output>
}): Outer<[Input], Output> & { input: Input; output: Output }

export function defineUseCase(definition: {
  actor?: z.ZodObject
  input: z.ZodObject
  output: z.ZodType
  implementation: (...args: any[]) => Promise<unknown>
}) {
  const args = definition.actor === undefined ? z.tuple([definition.input]) : z.tuple([definition.input, definition.actor])
  const useCase = z.function({ input: args, output: definition.output }).implementAsync(definition.implementation)
  return Object.assign(useCase, { actor: definition.actor, input: definition.input, output: definition.output })
}
