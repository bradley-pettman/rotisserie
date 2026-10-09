import z from 'zod'

export function defineUseCase<Input extends z.ZodObject, Output extends z.ZodType>(definition: {
  input: Input
  output: Output
  implementation: z.core.$InferInnerFunctionTypeAsync<z.ZodTuple<[Input], null>, Output>
}) {
  const useCase = z
    .function({ input: z.tuple([definition.input]), output: definition.output })
    .implementAsync(definition.implementation)
  return Object.assign(useCase, { input: definition.input, output: definition.output })
}
