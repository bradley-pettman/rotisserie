export class UnauthenticatedError extends Error {
  constructor(message = 'Sign in to continue') {
    super(message)
    this.name = 'UnauthenticatedError'
  }
}

export class NoHouseholdError extends Error {
  constructor(message = 'Create or join a household first') {
    super(message)
    this.name = 'NoHouseholdError'
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Not allowed') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}
